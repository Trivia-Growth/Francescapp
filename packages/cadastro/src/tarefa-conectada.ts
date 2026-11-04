import { validarTarefaPlano, type TarefaPlano } from './tarefa-plano.ts';

export type PrioridadeTarefa = 'baixa' | 'media' | 'alta';
export type TarefaConectada = Omit<TarefaPlano, 'prioridade'> & {
  prioridade: PrioridadeTarefa;
};

/** Validação de FR-017; não concede acesso nem substitui autorização no banco. */
export function validarTarefaConectada(
  entrada: unknown,
): { valido: true; tarefa: TarefaConectada } | { valido: false } {
  const resultado = validarTarefaPlano(entrada);
  if (!resultado.valido) return resultado;
  const prioridade = resultado.tarefa.prioridade;
  if (prioridade !== 'baixa' && prioridade !== 'media' && prioridade !== 'alta') {
    return { valido: false };
  }
  return { valido: true, tarefa: { ...resultado.tarefa, prioridade } };
}
