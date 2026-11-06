import { describe, expect, it } from 'vitest';
import { relatoTextualSchema } from '../src/relato-textual.ts';

describe('preparação local de relato textual', () => {
  it('aceita data e descrição e preserva campos opcionais', () => {
    const minimo = { dataAcontecimento: '2026-11-04', descricao: 'Acontecimento fictício' };
    expect(relatoTextualSchema.parse(minimo)).toEqual(minimo);
    const completo = {
      ...minimo,
      categoria: 'rotina',
      contexto: 'em casa',
      acaoTomada: 'conversou',
      solicitacaoRetorno: true,
    };
    expect(relatoTextualSchema.parse(completo)).toEqual(completo);
  });

  it('rejeita dados obrigatórios ausentes ou inválidos e campos de autoridade', () => {
    for (const valor of [
      { descricao: 'texto' },
      { dataAcontecimento: '2026-11-04' },
      { dataAcontecimento: '2026-11-04', descricao: '   ' },
      { dataAcontecimento: '2026-02-30', descricao: 'texto' },
      { dataAcontecimento: '2026-11-04', descricao: 'texto', audiencia: 'todos' },
    ])
      expect(relatoTextualSchema.safeParse(valor).success).toBe(false);
  });
});
