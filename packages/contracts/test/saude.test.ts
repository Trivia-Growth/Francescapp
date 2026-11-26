import { describe, expect, it } from 'vitest';
import { salvarSaudeSchema, validarRegistrosSaude } from '../src/saude.ts';

const base = {
  id: 'r1',
  tipo: 'diagnostico',
  descricao: 'Hipótese levantada na avaliação.',
  origem: 'Dra. Fictícia',
  natureza: 'profissional',
  data: '2026-03-02',
  situacao: 'hipotese',
};

describe('registros de saúde (FR-004)', () => {
  it('preserva origem, natureza e situação informadas', () => {
    const relato = {
      ...base,
      id: 'r2',
      natureza: 'relato_leigo',
      situacao: 'confirmado',
      origem: 'Filha do paciente',
    };
    expect(validarRegistrosSaude([base, relato])).toEqual([base, relato]);
  });

  it('recusa valores fora do vocabulário do domínio', () => {
    for (const invalido of [
      { ...base, natureza: 'inventada' },
      { ...base, situacao: 'talvez' },
      { ...base, tipo: 'anotacao' },
    ])
      expect(() => validarRegistrosSaude([invalido])).toThrow();
  });

  it('recusa campo desconhecido, id repetido e data inexistente', () => {
    expect(() => validarRegistrosSaude([{ ...base, confirmado_por: 'x' }])).toThrow();
    expect(() => validarRegistrosSaude([base, { ...base }])).toThrow();
    expect(() => validarRegistrosSaude([{ ...base, data: '2026-02-30' }])).toThrow();
    expect(() => validarRegistrosSaude([{ ...base, data: '02/03/2026' }])).toThrow();
  });

  it('exige descrição e origem não vazias', () => {
    expect(() => validarRegistrosSaude([{ ...base, descricao: '   ' }])).toThrow();
    expect(() => validarRegistrosSaude([{ ...base, origem: '' }])).toThrow();
  });

  it('limita o volume por paciente', () => {
    const muitos = Array.from({ length: 201 }, (_, indice) => ({ ...base, id: `r${indice}` }));
    expect(() => validarRegistrosSaude(muitos)).toThrow();
    expect(validarRegistrosSaude(muitos.slice(0, 200))).toHaveLength(200);
  });

  it('recusa versão esperada negativa na fronteira HTTP', () => {
    expect(salvarSaudeSchema.safeParse({ versao_esperada: 0, registros: [base] }).success).toBe(
      true,
    );
    expect(salvarSaudeSchema.safeParse({ versao_esperada: -1, registros: [base] }).success).toBe(
      false,
    );
    expect(
      salvarSaudeSchema.safeParse({ versao_esperada: 0, registros: [base], extra: 1 }).success,
    ).toBe(false);
  });
});
