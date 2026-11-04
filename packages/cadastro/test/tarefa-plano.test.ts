import { describe, expect, it } from 'vitest';
import { validarTarefaPlano } from '../src/tarefa-plano';

const tarefa = {
  responsavel: 'Profissional',
  prazo: '2026-12-01',
  prioridade: 'definida pela equipe',
};

describe('tarefa do plano', () => {
  it('aceita os estados previstos e preserva os dados', () => {
    for (const estado of ['pendente', 'em_andamento', 'cancelada']) {
      expect(validarTarefaPlano({ ...tarefa, estado })).toEqual({
        valido: true,
        tarefa: { ...tarefa, estado },
      });
    }
    expect(
      validarTarefaPlano({ ...tarefa, estado: 'concluida', acaoRealizada: 'Contato realizado' }),
    ).toEqual({
      valido: true,
      tarefa: { ...tarefa, estado: 'concluida', acaoRealizada: 'Contato realizado' },
    });
    expect(
      validarTarefaPlano({ ...tarefa, estado: 'concluida', justificativa: 'Não foi necessário' })
        .valido,
    ).toBe(true);
  });

  it('recusa conclusão sem ação ou justificativa preenchida', () => {
    expect(validarTarefaPlano({ ...tarefa, estado: 'concluida' }).valido).toBe(false);
    expect(
      validarTarefaPlano({
        ...tarefa,
        estado: 'concluida',
        acaoRealizada: '  ',
        justificativa: ' ',
      }).valido,
    ).toBe(false);
  });

  it('recusa dados obrigatórios ausentes, vazios ou inválidos', () => {
    for (const entrada of [
      null,
      {},
      { ...tarefa, responsavel: ' ', estado: 'pendente' },
      { ...tarefa, prazo: '', estado: 'pendente' },
      { ...tarefa, prioridade: 1, estado: 'pendente' },
      { ...tarefa, estado: 'outro' },
    ]) {
      expect(validarTarefaPlano(entrada).valido).toBe(false);
    }
  });
});
