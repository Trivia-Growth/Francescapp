import { describe, expect, it } from 'vitest';
import { localizarPendencias, validarSecoesAnamnese, type SecaoAnamnese } from '../src/anamnese.ts';

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

describe('validação de entrada da anamnese', () => {
  const secao = {
    id: 'secao',
    camposEsperados: ['a', 'b', 'c', 'd'],
    respostas: [
      { campo: 'a', estado: 'informado', valor: 'relato', fonte: 'família', data: '2026-11-04' },
      { campo: 'b', estado: 'desconhecido', fonte: 'família', data: '2026-11-04' },
      { campo: 'c', estado: 'nao_se_aplica', fonte: 'equipe', data: '2026-11-04' },
      { campo: 'd', estado: 'pendente' },
    ],
  };
  it('aceita os quatro estados e preserva proveniência na entrada validada', () => {
    const validada = validarSecoesAnamnese([secao]);
    expect(validada).toEqual([secao]);
    expect(localizarPendencias(validada)).toEqual([
      { secao: 'secao', camposAusentes: [], camposPendentes: ['d'] },
    ]);
  });
  it.each([
    null,
    [{ ...secao, respostas: [...secao.respostas, secao.respostas[0]] }],
    [{ ...secao, camposEsperados: ['a', 'a'] }],
    [secao, secao],
    [{ ...secao, respostas: [{ campo: 'a', estado: 'outro' }] }],
    [{ ...secao, respostas: [{ campo: '', estado: 'pendente' }] }],
    [
      {
        ...secao,
        respostas: [
          { campo: 'a', estado: 'informado', valor: '', fonte: 'família', data: '2026-11-04' },
        ],
      },
    ],
    [
      {
        ...secao,
        respostas: [{ campo: 'a', estado: 'desconhecido', fonte: ' ', data: '2026-11-04' }],
      },
    ],
    [
      {
        ...secao,
        respostas: [{ campo: 'a', estado: 'nao_se_aplica', fonte: 'equipe', data: '2026-02-30' }],
      },
    ],
  ])('rejeita formato, duplicidade ou proveniência inválidos', (entrada) => {
    expect(() => validarSecoesAnamnese(entrada)).toThrow('Anamnese inválida.');
  });
});
