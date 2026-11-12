import { processarCarteiraExperimental } from '../../../packages/cadastro/src/carteira-experimental.ts';
import {
  contratosRotas,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type AdaptadorCifra,
  type CodigoErro,
  type ResultadoAtestacao,
} from '../../../packages/contracts/src/index.ts';
import { prepararCarteiraNativa } from './carteira-nativa.ts';
import { lerConsultaCarteira } from './consulta-carteira.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'entrada_invalida' | 'nao_autenticado' | 'servico_indisponivel' };

/** Composição interna: nenhuma porta possui implementação de produção implícita.
 * A execução deve preservar a identidade autenticada e autorizar/auditar no banco. */
async function executarCarteiraNativa(
  request: Request,
  portas: {
    autorizar(request: Request): Promise<Autorizacao>;
    revalidar(request: Request): Promise<Autorizacao>;
    metadados(requestId: string): {
      key_id: string;
      emitido_em: string;
      expira_em: string;
      request_id: string;
    };
    atestador: {
      atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
    };
    cursor: {
      abrir(cursor: string, vinculo: { usuarioId: string; sessaoId: string }): Promise<string>;
      emitir(cursor: string, vinculo: { usuarioId: string; sessaoId: string }): Promise<string>;
    };
    executar(
      request: Request,
      entrada: Awaited<ReturnType<typeof prepararCarteiraNativa>>,
    ): Promise<unknown>;
    cifra: Pick<AdaptadorCifra, 'decifrar'>;
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
  const verificarCancelamento = () => {
    if (request.signal.aborted) throw new Error('Pedido cancelado.');
  };
  try {
    verificarCancelamento();
    const autorizacao = await portas.autorizar(request);
    verificarCancelamento();
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    const identidadeInicial = { ...autorizacao.identidade };
    if (
      request.headers.get('x-sessao')?.toLowerCase() !== identidadeInicial.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    const url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      url.pathname !== contratosRotas.listarPacientes.caminho ||
      url.hash
    )
      return erro('entrada_invalida');
    // Mesma leitura que a preparação do atestado usa, para que não exista versão da
    // consulta que foi validada aqui e outra que foi assinada lá.
    if (!lerConsultaCarteira(url)) return erro('entrada_invalida');
    let entrada: Awaited<ReturnType<typeof prepararCarteiraNativa>>;
    try {
      entrada = await prepararCarteiraNativa(request, identidadeInicial, {
        metadados: portas.metadados(requestId),
        atestador: {
          async atestarEntrada(dados, consulta) {
            verificarCancelamento();
            const resultado = await portas.atestador.atestarEntrada(dados, consulta);
            verificarCancelamento();
            return resultado;
          },
        },
        async abrirCursor(cursor, vinculo) {
          verificarCancelamento();
          const resultado = await portas.cursor.abrir(cursor, vinculo);
          verificarCancelamento();
          return resultado;
        },
      });
    } catch {
      // Preparação não distingue entrada inválida de falha de infraestrutura.
      return erro('servico_indisponivel');
    }
    verificarCancelamento();
    if (entrada.p_entrada.entrada.request_id !== requestId) return erro('servico_indisponivel');
    const resposta = await portas.executar(request, entrada);
    verificarCancelamento();
    const pagina = await processarCarteiraExperimental(
      resposta,
      {
        requestId,
        limite: entrada.p_entrada.entrada.limite,
        signal: request.signal,
        situacaoPermitida: true,
      },
      portas.cifra,
    );
    verificarCancelamento();
    if (!pagina.ok) return erro(pagina.erro.codigo);
    const vinculo = {
      usuarioId: identidadeInicial.usuario_id,
      sessaoId: identidadeInicial.session_id,
    };
    const dados = contratosRotas.listarPacientes.saida.parse({
      ...pagina.dados,
      proximo_cursor:
        pagina.dados.proximo_cursor === null
          ? null
          : await portas.cursor.emitir(pagina.dados.proximo_cursor, vinculo),
    });
    verificarCancelamento();
    const atual = await portas.revalidar(request);
    verificarCancelamento();
    if (atual.estado !== 'autorizado') return erro(atual.estado);
    if (
      atual.identidade.usuario_id.toLowerCase() !== identidadeInicial.usuario_id.toLowerCase() ||
      atual.identidade.session_id.toLowerCase() !== identidadeInicial.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    return Response.json({ dados, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel');
  }
}

/** Limita a espera HTTP. Abortar o sinal não garante cancelamento da operação remota. */
export async function consultarCarteiraNativa(
  request: Request,
  portas: Parameters<typeof executarCarteiraNativa>[1],
): Promise<Response> {
  const controle = new AbortController();
  let concluirInterrupcao: () => void = () => {};
  const interrupcao = new Promise<Response>((resolve) => {
    concluirInterrupcao = () => {
      controle.abort();
      resolve(
        Response.json(criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()), {
          status: 503,
          headers: {
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
          },
        }),
      );
    };
  });
  const prazo = setTimeout(concluirInterrupcao, 10_000);
  request.signal.addEventListener('abort', concluirInterrupcao, { once: true });
  if (request.signal.aborted) concluirInterrupcao();
  try {
    return await Promise.race([
      executarCarteiraNativa(new Request(request, { signal: controle.signal }), portas),
      interrupcao,
    ]);
  } finally {
    clearTimeout(prazo);
    request.signal.removeEventListener('abort', concluirInterrupcao);
  }
}
