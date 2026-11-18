import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import { disponibilidadeTarefaCuidadoSchema } from '../../../packages/contracts/src/tarefa-cuidado-http.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporTarefaCuidadoNativo } from './compor-tarefa-cuidado-nativo.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Capability informativa. O caminho interno de leitura reusa Auth, assinatura e RPC
 * vigente, com autorização por caso e auditoria, sem carregar tarefas. */
export async function consultarDisponibilidadeTarefaCuidado(
  request: Request,
  dependencias: Parameters<typeof comporTarefaCuidadoNativo>[2],
  flags: () => Promise<boolean>,
): Promise<Response> {
  const erro = (codigo: CodigoErro, requestId = crypto.randomUUID()) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  const url = new URL(request.url);
  const caminho = /^\/api\/pacientes\/([^/]+)\/tarefas\/disponibilidade$/.exec(url.pathname);
  if (!caminho || request.method !== 'GET') return erro('nao_encontrado');
  const paciente = uuidSchema.safeParse(caminho[1]);
  if (!paciente.success || url.search || url.hash) return erro('entrada_invalida');
  if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
    return erro('nao_autenticado');
  try {
    const resultado = await comporTarefaCuidadoNativo(
      request,
      {
        operacao: 'ler',
        paciente_id: paciente.data,
        autorizacao_somente: true,
      },
      dependencias,
    );
    if (!resultado.ok) {
      const codigo = codigosErro.find((item) => item === resultado.erro.codigo);
      return erro(codigo ?? 'servico_indisponivel', resultado.request_id);
    }
    if (!Array.isArray(resultado.dados) || resultado.dados.length !== 0)
      return erro('servico_indisponivel', resultado.request_id);
    const dados = disponibilidadeTarefaCuidadoSchema.parse({ escrita_disponivel: await flags() });
    if (request.signal.aborted) return erro('servico_indisponivel', resultado.request_id);
    return Response.json({ dados, request_id: resultado.request_id }, { headers });
  } catch {
    return erro('servico_indisponivel');
  }
}
