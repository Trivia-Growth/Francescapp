import { executarCriacaoPacienteExperimental } from '../../../packages/cadastro/src/executor-paciente-experimental.ts';
import {
  cabecalhosMutacaoSchema,
  contratosRotas,
  criarErroPublicoSemCampos,
  statusErroHttp,
  uuidSchema,
  type CodigoErro,
} from '../../../packages/contracts/src/index.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'entrada_invalida' | 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Dependencias = Parameters<typeof executarCriacaoPacienteExperimental>[2];

/** Composição interna, ainda não ligada a uma rota. Reserva e RPC devem
 * comprovar autoridade transacional e idempotência no banco antes de S-02. */
export async function criarPacienteNativo(
  request: Request,
  portas: Omit<Dependencias, 'reserva' | 'rpc'> & {
    autorizar(request: Request): Promise<Autorizacao>;
    revalidar(request: Request): Promise<Autorizacao>;
    metadados(requestId: string): { key_id: string; emitido_em: string; expira_em: string };
    executar(
      request: Request,
      transporte: Parameters<Dependencias['rpc']['executar']>[0],
    ): Promise<unknown>;
  },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const erro = (codigo: CodigoErro) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  let iniciada = false;
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(() => controle.abort(), 15_000);
  const noPrazo = async <T>(operacao: () => Promise<T>): Promise<T> => {
    if (controle.signal.aborted) throw new Error();
    let abortar!: () => void;
    const prazo = new Promise<never>((_, rejeitar) => {
      abortar = () => rejeitar(new Error());
      controle.signal.addEventListener('abort', abortar, { once: true });
    });
    try {
      const resultado = await Promise.race([operacao(), prazo]);
      if (controle.signal.aborted) throw new Error();
      return resultado;
    } finally {
      controle.signal.removeEventListener('abort', abortar);
    }
  };
  try {
    const url = new URL(request.url);
    if (
      request.method !== 'POST' ||
      url.pathname !== contratosRotas.criarPaciente.caminho ||
      url.search ||
      url.hash ||
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json' ||
      !request.body
    )
      return erro('entrada_invalida');
    const cabecalhos = cabecalhosMutacaoSchema.safeParse({
      'x-chave-idempotencia': request.headers.get('x-chave-idempotencia'),
    });
    if (!cabecalhos.success) return erro('entrada_invalida');
    const leitor = request.body.getReader();
    controle.signal.addEventListener(
      'abort',
      () => {
        void leitor.cancel().catch(() => {});
      },
      { once: true },
    );
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      const parte = await noPrazo(() => leitor.read());
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 16_384) {
        void leitor.cancel().catch(() => {});
        return erro('entrada_invalida');
      }
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return erro('entrada_invalida');
    }
    const entrada = contratosRotas.criarPaciente.entrada.safeParse(corpo);
    if (!entrada.success) return erro('entrada_invalida');
    const autorizacao = await noPrazo(() => portas.autorizar(request));
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    const identidade = {
      usuario_id: uuidSchema.parse(autorizacao.identidade.usuario_id).toLowerCase(),
      session_id: uuidSchema.parse(autorizacao.identidade.session_id).toLowerCase(),
    };
    if (request.headers.get('x-sessao')?.toLowerCase() !== identidade.session_id)
      return erro('nao_autenticado');
    const resultado = await noPrazo(() =>
      executarCriacaoPacienteExperimental(
        { corpo: entrada.data.entrada, cabecalhos: cabecalhos.data },
        { ...portas.metadados(requestId), ...identidade, request_id: requestId },
        {
          ...portas,
          reserva: {
            reserva_id: entrada.data.reserva_id,
            geracao_reserva: entrada.data.geracao_reserva,
          },
          rpc: {
            executar: (transporte) => {
              if (controle.signal.aborted) throw new Error();
              iniciada = true;
              return portas.executar(request, transporte);
            },
          },
        },
      ),
    );
    if (!resultado.ok) return erro(resultado.erro.codigo);
    const atual = await noPrazo(() => portas.revalidar(request));
    if (
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro('pendencia_externa');
    const dados = contratosRotas.criarPaciente.saida.parse(resultado.dados);
    return Response.json({ dados, request_id: requestId }, { headers });
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
