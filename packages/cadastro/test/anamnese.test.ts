import { describe, expect, it } from 'vitest';
import { localizarPendencias, type SecaoAnamnese } from '../src/anamnese.ts';

describe('anamnese gradual', () => {
  it('localiza campos ausentes e pendentes sem confundir desconhecido ou não aplicável', () => {
    const secoes: SecaoAnamnese[] = [
      {
        id: 'contexto',
        camposEsperados: ['a', 'b', 'c', 'd'],
        respostas: [
          {
            campo: 'a',
            estado: 'informado',
            valor: 'relato',
            fonte: 'família',
            data: '2026-11-04',
          },
          { campo: 'b', estado: 'desconhecido', fonte: 'família', data: '2026-11-04' },
          { campo: 'c', estado: 'pendente' },
        ],
      },
      {
        id: 'outra',
        camposEsperados: ['e'],
        respostas: [{ campo: 'e', estado: 'nao_se_aplica', fonte: 'equipe', data: '2026-11-04' }],
      },
    ];
    expect(localizarPendencias(secoes)).toEqual([
      { secao: 'contexto', camposAusentes: ['d'], camposPendentes: ['c'] },
    ]);
  });
});
