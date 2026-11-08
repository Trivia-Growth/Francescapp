import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaTarefaCuidadoNativa } from './_shared/entrada-tarefa-cuidado-nativa.ts';

export const config = { path: '/api/pacientes/:paciente_id/tarefas' };
let entrada: ReturnType<typeof criarEntradaTarefaCuidadoNativa> | undefined;

export default async function tarefasCuidado(request: Request): Promise<Response> {
  if (process.env.FFCM_TAREFAS_ATIVADAS !== 'true') return falha('servico_indisponivel');
  if (
    request.method === 'POST' &&
    (process.env.FFCM_TAREFAS_ESCRITA_ATIVADA !== 'true' ||
      process.env.FFCM_BARREIRA_TAREFA_ATIVADA !== 'true')
  )
    return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaTarefaCuidadoNativa(configurarDependenciasNativas(process.env));
  } catch {
    return falha('configuracao_indisponivel');
  }
  return request.method === 'POST' ? entrada.atenderCriacao(request) : entrada.atender(request);
}

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
