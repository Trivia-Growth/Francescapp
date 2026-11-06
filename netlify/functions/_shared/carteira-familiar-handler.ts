import { processarCarteiraExperimental } from '../../../packages/cadastro/src/carteira-experimental.ts';
import {
  contratosRotas,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type AdaptadorCifra,
  type CodigoErro,
} from '../../../packages/contracts/src/index.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'entrada_invalida' | 'nao_autenticado' | 'servico_indisponivel' };

/** Preparação server-only. A consulta deve autorizar vínculos e auditar no banco;
 * não publicar antes de comprovar privilégios, revogação e integração real. */
export async function consultarCarteiraFamiliar(
  request: Request,
  portas: {
    autorizar(): Promise<Autorizacao>;
    consultar(entrada: { limite: number; cursor?: string; request_id: string }): Promise<unknown>;
    cursor: {
      abrir(cursor: string, vinculo: { usuarioId: string; sessaoId: string }): Promise<string>;
      emitir(cursor: string, vinculo: { usuarioId: string; sessaoId: string }): Promise<string>;
    };
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
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/api/familiar/pacientes' || url.hash)
      return erro('entrada_invalida');
    const consulta: Record<string, unknown> = {};
    for (const [chave, valor] of url.searchParams) {
      if ((chave !== 'cursor' && chave !== 'limite') || Object.hasOwn(consulta, chave))
        return erro('entrada_invalida');
      consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
    }
    const validada = contratosRotas.listarPacientes.entrada.safeParse(consulta);
    if (!validada.success) return erro('entrada_invalida');
    const inicial = await portas.autorizar();
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    if (
      request.signal.aborted ||
      request.headers.get('x-sessao')?.toLowerCase() !== inicial.identidade.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    const vinculo = {
      usuarioId: inicial.identidade.usuario_id,
      sessaoId: inicial.identidade.session_id,
    };
    let cursor: string | undefined;
    if (validada.data.cursor !== undefined) {
      try {
        cursor = await portas.cursor.abrir(validada.data.cursor, vinculo);
      } catch {
        return erro('entrada_invalida');
      }
    }
    const resposta = await portas.consultar({
      limite: validada.data.limite,
      ...(cursor === undefined ? {} : { cursor }),
      request_id: requestId,
    });
    const pagina = await processarCarteiraExperimental(
      resposta,
      { requestId, limite: validada.data.limite, signal: request.signal },
      portas.cifra,
    );
    if (!pagina.ok) return erro(pagina.erro.codigo);
    const dados = contratosRotas.listarPacientes.saida.parse({
      ...pagina.dados,
      proximo_cursor:
        pagina.dados.proximo_cursor === null
          ? null
          : await portas.cursor.emitir(pagina.dados.proximo_cursor, vinculo),
    });
    const atual = await portas.autorizar();
    if (atual.estado !== 'autorizado') return erro(atual.estado);
    if (
      request.signal.aborted ||
      atual.identidade.usuario_id.toLowerCase() !== inicial.identidade.usuario_id.toLowerCase() ||
      atual.identidade.session_id.toLowerCase() !== inicial.identidade.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    return Response.json({ dados, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel');
  }
}
