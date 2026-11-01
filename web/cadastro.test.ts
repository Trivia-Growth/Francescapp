import { describe, expect, it } from 'vitest';
import { lerCadastro } from './cadastro.js';

describe('cadastro mínimo pelo contrato vigente', () => {
  it('aceita somente nome e omite opcionais vazios', () => {
    expect(
      lerCadastro({ nome: ' Paciente Fictício ', nomePreferencia: '  ', nascimento: '' }),
    ).toMatchObject({ success: true, data: { nome: 'Paciente Fictício' } });
    const resultado = lerCadastro({
      nome: 'Paciente Fictício',
      nomePreferencia: '',
      nascimento: '',
    });
    if (resultado.success) expect(Object.keys(resultado.data)).toEqual(['nome']);
  });

  it('recusa nome formado apenas por espaços', () => {
    expect(lerCadastro({ nome: '   ', nomePreferencia: '', nascimento: '' }).success).toBe(false);
  });

  it('recusa nome maior que o limite do contrato', () => {
    expect(
      lerCadastro({ nome: 'X'.repeat(201), nomePreferencia: '', nascimento: '' }).success,
    ).toBe(false);
  });

  it('valida opcionais sem transformar ausência em null', () => {
    expect(
      lerCadastro({
        nome: 'Paciente Fictício',
        nomePreferencia: ' Nome Fictício ',
        nascimento: '2000-02-29',
      }),
    ).toMatchObject({
      success: true,
      data: {
        nome: 'Paciente Fictício',
        nome_preferencia: 'Nome Fictício',
        data_nascimento: '2000-02-29',
      },
    });
    expect(
      lerCadastro({ nome: 'Paciente Fictício', nomePreferencia: '', nascimento: '2001-02-29' })
        .success,
    ).toBe(false);
  });
});
