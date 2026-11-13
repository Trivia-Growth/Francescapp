import { afterEach, describe, expect, it, vi } from 'vitest';

import { causaDaFalha, registrarFalhaOperacional } from './falha-operacional.ts';

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
});
