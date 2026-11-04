import { describe, expect, it } from 'vitest';
import { objetivoSchema, revisarObjetivo, type VersaoObjetivo } from '../src/plano-cuidado.ts';

const objetivo = {
  descricao: 'Retomar atividade de rotina',
  area: 'rotina',
  responsavel: 'Profissional',
  situacaoInicial: 'Ainda não realizada',
  observacaoProgresso: 'Frequência informada',
  dataRevisao: '2026-12-01',
  estado: 'proposto',
} as const;

describe('objetivos do plano de cuidado', () => {
  it('aceita os seis estados e rejeita estado desconhecido', () => {
    for (const estado of [
      'proposto',
      'em andamento',
      'atingido',
      'pausado',
      'revisar',
      'encerrado',
    ])
      expect(objetivoSchema.safeParse({ ...objetivo, estado }).success).toBe(true);
    expect(objetivoSchema.safeParse({ ...objetivo, estado: 'outro' }).success).toBe(false);
    expect(objetivoSchema.safeParse({ ...objetivo, dataRevisao: '2026-02-30' }).success).toBe(
      false,
    );
  });
  it('preserva versão anterior e recusa revisão concorrente', () => {
    const historico: VersaoObjetivo[] = [
      { versao: 1, objetivo, motivo: 'Criação', responsavel: 'Profissional', data: '2026-11-04' },
    ];
    const revisao = {
      objetivo: { ...objetivo, estado: 'em andamento' },
      motivo: 'Início',
    };
    const metadados = { responsavel: 'Profissional', data: '2026-11-05' };
    const resultado = revisarObjetivo(historico, 1, revisao, metadados);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error('Revisão inesperadamente recusada');
    expect(resultado.versoes).toHaveLength(2);
    expect(resultado.versoes[0]).toEqual(historico[0]);
    expect(resultado.versoes[1]?.objetivo.estado).toBe('em andamento');
    expect(revisarObjetivo(resultado.versoes, 1, revisao, metadados)).toEqual({
      ok: false,
      erro: 'conflito',
    });
    expect(historico).toHaveLength(1);
    const primeira = historico[0];
    if (!primeira) throw new Error('Histórico vazio');
    primeira.objetivo = { ...objetivo, descricao: 'Alteração externa' };
    expect(resultado.versoes[0]?.objetivo.descricao).toBe('Retomar atividade de rotina');
    expect(resultado.versoes[1]).toMatchObject(metadados);
    expect(() =>
      revisarObjetivo(historico, 1, { ...revisao, data: '2020-01-01' }, metadados),
    ).toThrow();
  });
});
