import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaTarefaCuidadoNativa } from './_shared/entrada-tarefa-cuidado-nativa.ts';

export const config = { path: '/api/pacientes/:paciente_id/tarefas' };
let entrada: ReturnType<typeof criarEntradaTarefaCuidadoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function tarefasCuidado(request: Request): Promise<Response> {
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaTarefaCuidadoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Três interruptores administrados pela tela, cada um com a variável de ambiente como padrão
  // quando o banco não responde. Nenhum é autorização: a rota segue validando sessão, concessão
  // e atestado no banco. A conferência antes de gravar faz parte do fluxo de criação — sem ela a
  // criação fica indisponível, como já era.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.tarefas.ativas',
      process.env.FFCM_TAREFAS_ATIVADAS === 'true',
    ))
  )
    return falha('servico_indisponivel');
  if (request.method === 'POST') {
    const [escrita, barreira] = await Promise.all([
      servicoAtivo(
        dependencias.pool,
        'ffcm.tarefas.escrita_ativa',
        process.env.FFCM_TAREFAS_ESCRITA_ATIVADA === 'true',
      ),
      servicoAtivo(
        dependencias.pool,
        'ffcm.tarefas.barreira_ativa',
        process.env.FFCM_BARREIRA_TAREFA_ATIVADA === 'true',
      ),
    ]);
    if (!escrita || !barreira) return falha('servico_indisponivel');
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
