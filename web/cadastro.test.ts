import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerCadastro } from './cadastro.js';
import type { ContatoDigitado } from './campos-caso-novo.js';
import { ID_RESPONSAVEL } from './teste-caso-novo.js';

type Campos = Parameters<typeof lerCadastro>[0];

const completo = (): Campos => ({
  nome: 'Paciente Fictício',
  nomePreferencia: 'Pac',
  nascimento: '2000-02-29',
  contatos: [{ tipo: 'email', valor: 'contato@exemplo.test' }],
  situacao: 'ativo',
  responsavelId: ID_RESPONSAVEL,
});

/** Campos do contrato que o resultado recusou, sem repetições. */
const recusados = (campos: Campos) => {
  const resultado = lerCadastro(campos);
  return resultado.success ? [] : [...new Set(resultado.error.issues.map((item) => item.path[0]))];
};

const contatos = (quantidade: number): ContatoDigitado[] =>
  Array.from({ length: quantidade }, (_, indice) => ({
    tipo: 'email',
    valor: `contato${indice}@exemplo.test`,
  }));

afterEach(() => vi.useRealTimers());

describe('cadastro de caso novo pelo contrato vigente', () => {
  it('aceita o cadastro completo, aplica trim ao texto e não acrescenta valores padrão', () => {
    const resultado = lerCadastro({
      nome: ' Paciente Fictício ',
      nomePreferencia: '  Pac  ',
      nascimento: '2000-02-29',
      contatos: [
        { tipo: 'email', valor: ' contato@exemplo.test ' },
        { tipo: 'telefone', valor: ' +55 11 90000-0000 ' },
      ],
      situacao: 'entrada',
      responsavelId: ID_RESPONSAVEL,
    });
    expect(resultado).toMatchObject({
      success: true,
      data: {
        nome: 'Paciente Fictício',
        nome_preferencia: 'Pac',
        data_nascimento: '2000-02-29',
        contatos: [
          { tipo: 'email', valor: 'contato@exemplo.test' },
          { tipo: 'telefone', valor: '+55 11 90000-0000' },
        ],
        situacao: 'entrada',
        responsavel_id: ID_RESPONSAVEL,
      },
    });
    if (resultado.success)
      expect(Object.keys(resultado.data).sort()).toEqual([
        'contatos',
        'data_nascimento',
        'nome',
        'nome_preferencia',
        'responsavel_id',
        'situacao',
      ]);
  });

  it.each<[string, Partial<Campos>]>([
    ['nome', { nome: '' }],
    ['nome_preferencia', { nomePreferencia: '' }],
    ['data_nascimento', { nascimento: '' }],
    ['contatos', { contatos: [] }],
    ['situacao', { situacao: undefined }],
    ['responsavel_id', { responsavelId: undefined }],
  ])('recusa o cadastro sem %s, e só por esse campo', (campo, ausente) => {
    expect(recusados({ ...completo(), ...ausente })).toEqual([campo]);
  });

  it('trata campo de texto só com espaços como ausente', () => {
    expect(recusados({ ...completo(), nome: '   ' })).toEqual(['nome']);
    expect(recusados({ ...completo(), nomePreferencia: '   ' })).toEqual(['nome_preferencia']);
  });

  it('recusa nome e nome de preferência maiores que o limite do contrato', () => {
    expect(recusados({ ...completo(), nome: 'X'.repeat(201) })).toEqual(['nome']);
    expect(recusados({ ...completo(), nomePreferencia: 'X'.repeat(201) })).toEqual([
      'nome_preferencia',
    ]);
  });

  it('recusa data inexistente e aceita 29 de fevereiro de ano bissexto', () => {
    expect(recusados({ ...completo(), nascimento: '2001-02-29' })).toEqual(['data_nascimento']);
    expect(recusados({ ...completo(), nascimento: '2000-02-29' })).toEqual([]);
  });

  it('recusa data de nascimento futura e aceita a de hoje', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    expect(recusados({ ...completo(), nascimento: '2026-11-11' })).toEqual(['data_nascimento']);
    expect(recusados({ ...completo(), nascimento: '2026-11-10' })).toEqual([]);
  });

  it('aceita de 1 a 10 contatos e recusa 11', () => {
    expect(recusados({ ...completo(), contatos: contatos(1) })).toEqual([]);
    expect(recusados({ ...completo(), contatos: contatos(10) })).toEqual([]);
    expect(recusados({ ...completo(), contatos: contatos(11) })).toEqual(['contatos']);
  });

  it.each([
    ['e-mail sem domínio', { tipo: 'email', valor: 'contato@' }],
    ['e-mail com texto solto', { tipo: 'email', valor: 'sem arroba' }],
    ['telefone com letras', { tipo: 'telefone', valor: '11 9999-abcd' }],
    ['telefone curto demais', { tipo: 'telefone', valor: '123456' }],
    ['telefone digitado como e-mail', { tipo: 'email', valor: '11999990000' }],
  ] as const)('recusa contato inválido: %s', (_descricao, contato) => {
    expect(recusados({ ...completo(), contatos: [...contatos(1), contato] })).toEqual(['contatos']);
  });

  it('recusa situação fora da lista e responsável que não é identificador', () => {
    expect(recusados({ ...completo(), situacao: 'inventada' })).toEqual(['situacao']);
    expect(recusados({ ...completo(), responsavelId: 'ana' })).toEqual(['responsavel_id']);
  });
});
