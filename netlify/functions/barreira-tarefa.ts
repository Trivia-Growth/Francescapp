import { contratosBarreiraTarefaHttp } from '../../packages/contracts/src/barreira-tarefa-cuidado-servidor.ts';
import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { comporBarreiraTarefaNativa } from './_shared/compor-barreira-tarefa-nativa.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';

export const config = {
  path: [
    '/api/tarefas/barreira',
    '/api/tarefas/barreira/reservar',
    '/api/tarefas/barreira/encerrar',
    '/api/tarefas/barreira/reconhecer',
  ],
};
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function barreiraTarefa(request: Request): Promise<Response> {
  const falha = (
    codigo: 'servico_indisponivel' | 'configuracao_indisponivel' | 'nao_encontrado',
    status: number,
  ) =>
    Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  const rota = Object.entries(contratosBarreiraTarefaHttp).find(
    ([, contrato]) =>
      contrato.metodo === request.method && contrato.caminho === new URL(request.url).pathname,
  )?.[0] as keyof typeof contratosBarreiraTarefaHttp | undefined;
  if (!rota) return falha('nao_encontrado', 404);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    return falha('configuracao_indisponivel', 503);
  }
  // Três interruptores administrados pela tela, com as variáveis de ambiente como padrão quando
  // o banco não responde. Não são autorização.
  const [tarefas, escrita, barreira] = await Promise.all([
    servicoAtivo(
      dependencias.pool,
      'ffcm.tarefas.ativas',
      process.env.FFCM_TAREFAS_ATIVADAS === 'true',
    ),
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
  if (!tarefas || !escrita || !barreira) return falha('servico_indisponivel', 503);
  return comporBarreiraTarefaNativa(request, rota, dependencias);
}
