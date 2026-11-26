import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  causaDaFalha,
  registrarFalhaDeResposta,
  registrarFalhaOperacional,
} from './falha-operacional.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rastro de falha operacional', () => {
  it('reduz erro de banco ao código, que é o que diagnostica', () => {
    expect(causaDaFalha({ code: '42501', message: 'permission denied for table paciente' })).toBe(
      'banco_42501',
    );
    expect(causaDaFalha({ code: 'PGRST202', message: 'Could not find the function' })).toBe(
      'banco_PGRST202',
    );
  });

  it('distingue cancelamento de falha real, para não caçar defeito onde não há', () => {
    expect(causaDaFalha({ name: 'AbortError' })).toBe('cancelado');
    expect(causaDaFalha(new Error('Pedido cancelado.'))).toBe('cancelado');
    expect(causaDaFalha(new TypeError('x'))).toBe('excecao_TypeError');
    expect(causaDaFalha(undefined)).toBe('desconhecida');
    expect(causaDaFalha('texto solto')).toBe('desconhecida');
  });

  /** O motivo de existir deste módulo: o código público continua opaco, mas o servidor
   * precisa registrar o bastante para alguém achar a causa — sem descrever o esquema. */
  it('nunca repassa mensagem, detalhe, dica ou pilha do banco', () => {
    const vazamentos = [
      'permission denied for table cadastro.paciente',
      'relation "identidade.sessao" does not exist',
      'Perhaps you meant to reference the column "paciente.nome"',
    ];
    for (const texto of vazamentos) {
      const causa = causaDaFalha({
        code: '42501',
        message: texto,
        details: texto,
        hint: texto,
        stack: texto,
      });
      expect(causa).toBe('banco_42501');
      expect(causa).not.toContain('paciente');
      expect(causa).not.toContain('identidade');
      expect(causa).not.toContain(' ');
    }
  });

  it('recusa código malformado em vez de repassá-lo como identificador', () => {
    expect(causaDaFalha({ code: 'permission denied for table x' })).toBe('desconhecida');
    expect(causaDaFalha({ code: 'x'.repeat(40) })).toBe('desconhecida');
  });

  it('registra evento, rota, etapa, causa e o request_id que a resposta devolve', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    registrarFalhaOperacional({
      rota: 'pendencias',
      etapa: 'autorizacao',
      request_id: '11111111-1111-4111-8111-111111111111',
      causa: 'banco_42501',
    });
    expect(espiao).toHaveBeenCalledWith({
      evento: 'falha_operacional',
      rota: 'pendencias',
      etapa: 'autorizacao',
      causa: 'banco_42501',
      request_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('devolve o mesmo request_id que registra, senão o log não liga na resposta', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    const devolvido = registrarFalhaDeResposta('configuracao-sistema', new TypeError('x'));
    expect(espiao).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: 'falha_operacional',
        rota: 'configuracao-sistema',
        etapa: 'resposta',
        causa: 'excecao_TypeError',
        request_id: devolvido,
      }),
    );
    expect(devolvido).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('não vaza o que o erro de contrato carrega ao falhar na montagem da resposta', () => {
    // O caso real de 13/11/2026: `z.array(...).parse()` lança um ZodError cuja mensagem lista
    // caminho e valor recusado de cada item — aqui, chaves e valores do catálogo inteiro.
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    const zodLike = Object.assign(
      new Error('[{"path":["valor"],"received":"conteudo-sensivel"}]'),
      {
        name: 'ZodError',
        issues: [{ path: ['valor'], message: 'Too small' }],
      },
    );
    registrarFalhaDeResposta('configuracao-sistema', zodLike);
    const registrado = JSON.stringify(espiao.mock.calls.at(0));
    expect(registrado).toContain('excecao_ZodError');
    expect(registrado).not.toContain('conteudo-sensivel');
    expect(registrado).not.toContain('Too small');
  });
});
