import {
  respostaBarreiraEquipeSchema,
  contratosBarreiraEquipeHttp,
} from '../../../packages/contracts/src/barreira-equipe-servidor.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  uuidSchema,
  type CodigoErro,
  type ResultadoAtestacao,
} from '../../../packages/contracts/src/index.ts';
import { prepararBarreiraEquipeNativa } from './equipe-barreira-nativa.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'entrada_invalida' | 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Operacao = keyof typeof contratosBarreiraEquipeHttp;

/** Composição isolada; origem, identidade e acesso ao banco exigem portas reais. */
export async function processarBarreiraEquipeNativa(
  request: Request,
  operacao: Operacao,
  portas: {
    autorizar(request: Request): Promise<Autorizacao>;
    revalidar(request: Request): Promise<Autorizacao>;
    validarOrigem(request: Request): Promise<boolean>;
    metadados(requestId: string): {
      key_id: string;
      emitido_em: string;
      expira_em: string;
      request_id: string;
    };
    atestador: {
      atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
    };
    executar(
      request: Request,
      transporte: Awaited<ReturnType<typeof prepararBarreiraEquipeNativa>>,
    ): Promise<unknown>;
  },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (codigo: CodigoErro) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  const mutacao = operacao !== 'consultar';
  let iniciada = false;
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(cancelar, 15_000);
  const noPrazo = async <T>(acao: () => Promise<T>): Promise<T> => {
    if (controle.signal.aborted) throw new Error();
    let abortar!: () => void;
    const cancelamento = new Promise<never>((_, rejeitar) => {
      abortar = () => rejeitar(new Error());
      controle.signal.addEventListener('abort', abortar, { once: true });
    });
    try {
      const resultado = await Promise.race([acao(), cancelamento]);
      if (controle.signal.aborted) throw new Error();
      return resultado;
    } finally {
      controle.signal.removeEventListener('abort', abortar);
    }
  };
  try {
    const contrato = contratosBarreiraEquipeHttp[operacao];
    if (!contrato) return erro('entrada_invalida');
    const url = new URL(request.url);
    if (
      request.method !== contrato.metodo ||
      url.pathname !== contrato.caminho ||
      url.search ||
      url.hash
    )
      return erro('entrada_invalida');
    const cabecalhos = mutacao
      ? { 'x-sessao': request.headers.get('x-sessao'), origin: request.headers.get('origin') }
      : { 'x-sessao': request.headers.get('x-sessao') };
    if (!contrato.cabecalhos.safeParse(cabecalhos).success) return erro('entrada_invalida');
    let corpo: unknown = {};
    if (mutacao) {
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        return erro('entrada_invalida');
      if (!(await noPrazo(() => portas.validarOrigem(request)))) return erro('sem_permissao');
      const leitor = request.body.getReader();
      const cancelarLeitor = () => {
        void leitor.cancel().catch(() => {});
      };
      controle.signal.addEventListener('abort', cancelarLeitor, { once: true });
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        while (true) {
          const parte = await noPrazo(() => leitor.read());
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 16_384) {
            cancelarLeitor();
            return erro('entrada_invalida');
          }
          partes.push(parte.value);
        }
      } finally {
        controle.signal.removeEventListener('abort', cancelarLeitor);
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.length;
      }
      try {
        corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch {
        return erro('entrada_invalida');
      }
    } else if (request.body) return erro('entrada_invalida');
    const entrada = contrato.entrada.safeParse(corpo);
    if (!entrada.success) return erro('entrada_invalida');
    const autorizacao = await noPrazo(() => portas.autorizar(request));
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    const identidade = {
      usuario_id: uuidSchema.parse(autorizacao.identidade.usuario_id).toLowerCase(),
      session_id: uuidSchema.parse(autorizacao.identidade.session_id).toLowerCase(),
    };
    if (request.headers.get('x-sessao')?.toLowerCase() !== identidade.session_id)
      return erro('nao_autenticado');
    const nomes = {
      consultar: 'api.consultar_barreira_concessao_equipe',
      reservar: 'api.reservar_concessao_equipe',
      encerrar: 'api.encerrar_concessao_equipe',
      reconhecer: 'api.reconhecer_barreira_concessao_equipe',
    } as const;
    const transporte = await noPrazo(() =>
      prepararBarreiraEquipeNativa(
        request,
        identidade,
        { ...entrada.data, operacao: nomes[operacao] },
        { metadados: portas.metadados(requestId), atestador: portas.atestador },
      ),
    );
    if (transporte.p_transporte.entrada.request_id !== requestId) throw new Error();
    const atual = await noPrazo(() => portas.revalidar(request));
    if (atual.estado !== 'autorizado') return erro(atual.estado);
    if (
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro('nao_autenticado');
    const resposta = await noPrazo(() => {
      iniciada = mutacao;
      return portas.executar(request, transporte);
    });
    const resultado = respostaBarreiraEquipeSchema.parse(resposta);
    if (resultado.request_id.toLowerCase() !== requestId) throw new Error();
    if (!resultado.ok) return erro('sem_permissao');
    const saida = contrato.saida.parse({ dados: resultado.dados, request_id: requestId });
    const final = await noPrazo(() => portas.revalidar(request));
    if (
      final.estado !== 'autorizado' ||
      final.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      final.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(mutacao ? 'pendencia_externa' : 'nao_autenticado');
    return Response.json(saida, { headers });
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
