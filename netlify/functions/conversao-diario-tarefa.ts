import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaConversaoDiarioNativa } from './_shared/conversao-diario-entrada-nativa.ts';
export const config = { path: '/api/pacientes/:paciente_id/diario/:origem_id/conversao-tarefa' };
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;
/** Cinco interruptores administrados; desativados não conferem autorização. */
export default async function conversaoDiarioTarefa(request: Request): Promise<Response> {
  const falha = (codigo: 'servico_indisponivel' | 'configuracao_indisponivel') =>
    Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    return falha('configuracao_indisponivel');
  }
  const dependenciasAtuais = dependencias;
  try {
    const chaves = [
      'ffcm.diario.ativo',
      'ffcm.tarefas.ativas',
      'ffcm.tarefas.escrita_ativa',
      'ffcm.tarefas.barreira_ativa',
      'ffcm.diario.conversao_tarefa_ativa',
    ];
    const estados = await Promise.all(
      chaves.map((chave) => servicoAtivo(dependenciasAtuais.pool, chave, false)),
    );
    if (!estados.every(Boolean)) return falha('servico_indisponivel');
  } catch {
    return falha('servico_indisponivel');
  }
  return criarEntradaConversaoDiarioNativa(dependenciasAtuais).atender(request);
}
