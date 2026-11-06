import {
  contratosRotas,
  uuidSchema,
  type ResultadoAtestacao,
} from '../../../packages/contracts/src/index.ts';
import { prepararCarteiraExperimental } from '../../../packages/cadastro/src/preparar-carteira-experimental.ts';

/** Preparação interna, sem rota ou execução de RPC. A identidade deve vir de
 * autorizarOperacaoNativa; o banco ainda deve autorizar e auditar a operação. */
export async function prepararCarteiraNativa(
  request: Request,
  identidade: { usuario_id: string; session_id: string },
  dependencias: {
    metadados: { key_id: string; emitido_em: string; expira_em: string; request_id: string };
    atestador: {
      atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
    };
    abrirCursor(cursor: string, vinculo: { usuarioId: string; sessaoId: string }): Promise<string>;
  },
) {
  try {
    const url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      url.pathname !== contratosRotas.listarPacientes.caminho ||
      url.hash
    )
      throw new Error();
    const consulta: Record<string, unknown> = {};
    for (const [chave, valor] of url.searchParams) {
      if ((chave !== 'cursor' && chave !== 'limite') || Object.hasOwn(consulta, chave))
        throw new Error();
      consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
    }
    const validada = contratosRotas.listarPacientes.entrada.parse(consulta);
    const usuarioId = uuidSchema.parse(identidade.usuario_id).toLowerCase();
    const sessaoId = uuidSchema.parse(identidade.session_id).toLowerCase();
    if (request.headers.get('x-sessao')?.toLowerCase() !== sessaoId) throw new Error();
    const cursor =
      validada.cursor === undefined
        ? undefined
        : await dependencias.abrirCursor(validada.cursor, { usuarioId, sessaoId });
    return await prepararCarteiraExperimental(
      {
        contexto: { ...dependencias.metadados, usuario_id: usuarioId, session_id: sessaoId },
        consulta: { limite: validada.limite, ...(cursor === undefined ? {} : { cursor }) },
      },
      dependencias.atestador,
    );
  } catch {
    throw new Error('Não foi possível preparar a carteira.');
  }
}
