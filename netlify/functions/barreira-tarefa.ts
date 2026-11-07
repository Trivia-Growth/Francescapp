import { contratosBarreiraTarefaHttp } from '../../packages/contracts/src/barreira-tarefa-cuidado-servidor.ts';
import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { comporBarreiraTarefaNativa } from './_shared/compor-barreira-tarefa-nativa.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

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
  if (
    process.env.FFCM_TAREFAS_ATIVADAS !== 'true' ||
    process.env.FFCM_TAREFAS_ESCRITA_ATIVADA !== 'true' ||
    process.env.FFCM_BARREIRA_TAREFA_ATIVADA !== 'true'
  )
    return falha('servico_indisponivel', 503);
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
  return comporBarreiraTarefaNativa(request, rota, dependencias);
}
