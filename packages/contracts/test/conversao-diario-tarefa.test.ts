import { expect, it } from 'vitest';
import {
  converterDiarioTarefaSchema,
  reciboConversaoDiarioTarefaSchema,
} from '../src/conversao-diario-tarefa.ts';
const id = '11111111-1111-4111-8111-111111111111';
const entrada = {
  origem_versao: 1,
  tarefa_id: id,
  reserva_id: id,
  geracao_reserva: 1,
  motivo: 'Motivo fictício',
  data_atencao: '2026-11-18',
  encaminhamento: 'Encaminhamento fictício',
  responsavel: 'Pessoa fictícia',
  prazo: '2026-11-19',
  prioridade: 'media',
  area: 'Área fictícia',
};
it('exige todos os campos humanos e rejeita autoridade/conteúdo de origem forjados', () => {
  expect(converterDiarioTarefaSchema.safeParse(entrada).success).toBe(true);
  for (const campo of [
    'motivo',
    'data_atencao',
    'encaminhamento',
    'responsavel',
    'prazo',
    'prioridade',
    'area',
  ]) {
    expect(converterDiarioTarefaSchema.safeParse({ ...entrada, [campo]: undefined }).success).toBe(
      false,
    );
  }
  for (const campo of [
    'ator_usuario_id',
    'registrado_em',
    'conteudo_origem',
    'audiencia',
    'responde_registro_id',
  ]) {
    expect(converterDiarioTarefaSchema.safeParse({ ...entrada, [campo]: id }).success).toBe(false);
  }
});
it('recibo não aceita envelopes ou texto clínico', () => {
  const recibo = {
    conversao_id: id,
    paciente_id: id,
    origem_id: id,
    origem_versao: 1,
    tarefa_id: id,
    evolucao_id: id,
    ator_usuario_id: id,
    registrado_em: '2026-11-18T12:00:00Z',
  };
  expect(reciboConversaoDiarioTarefaSchema.safeParse(recibo).success).toBe(true);
  expect(
    reciboConversaoDiarioTarefaSchema.safeParse({ ...recibo, conteudo: 'Não devolver' }).success,
  ).toBe(false);
});
