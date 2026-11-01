import { describe, expect, it } from 'vitest';

import {
  consultaReconciliacaoCadastroSchema,
  estadoReconciliacaoCadastroSchema,
  paginaReconciliacaoCadastroSchema,
} from '../src/reconciliacao-cadastro.js';

describe('estado interno de reconciliação de cadastro', () => {
  it('aceita paginação sem aceitar identidade ou dados pessoais como filtro', () => {
    expect(consultaReconciliacaoCadastroSchema.safeParse({ limite: 25 }).success).toBe(true);
    expect(
      consultaReconciliacaoCadastroSchema.safeParse({
        limite: 25,
        usuario_id: '10000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
    expect(consultaReconciliacaoCadastroSchema.safeParse({ limite: 101 }).success).toBe(false);
  });
  it('aceita página de operações opacas e não converte página vazia em falha', () => {
    expect(
      paginaReconciliacaoCadastroSchema.safeParse({ itens: [], proximo_cursor: null }).success,
    ).toBe(true);
    expect(
      paginaReconciliacaoCadastroSchema.safeParse({
        itens: [
          {
            operacao_id: '10000000-0000-4000-8000-000000000001',
            situacao: { estado: 'indeterminado' },
          },
        ],
        proximo_cursor: null,
      }).success,
    ).toBe(true);
    expect(
      paginaReconciliacaoCadastroSchema.safeParse({
        itens: [
          {
            operacao_id: '10000000-0000-4000-8000-000000000001',
            situacao: { estado: 'indeterminado', nome: 'Fictício' },
          },
        ],
        proximo_cursor: null,
      }).success,
    ).toBe(false);
  });
  it('representa confirmação com referência e versão, sem nome ou conteúdo clínico', () => {
    const confirmado = {
      estado: 'confirmado',
      resultado_id: '10000000-0000-4000-8000-000000000001',
      resultado_versao: 1,
    };
    expect(estadoReconciliacaoCadastroSchema.safeParse(confirmado).success).toBe(true);
    expect(
      estadoReconciliacaoCadastroSchema.safeParse({ ...confirmado, nome: 'Pessoa fictícia' })
        .success,
    ).toBe(false);
    expect(
      estadoReconciliacaoCadastroSchema.safeParse({ ...confirmado, anotacao: 'Conteúdo fictício' })
        .success,
    ).toBe(false);
    expect(
      estadoReconciliacaoCadastroSchema.safeParse({ ...confirmado, resultado_id: undefined })
        .success,
    ).toBe(false);
    expect(
      estadoReconciliacaoCadastroSchema.safeParse({ ...confirmado, resultado_versao: 0 }).success,
    ).toBe(false);
  });
  it('distingue pendente e indeterminado, sem inferir falha da ausência', () => {
    expect(estadoReconciliacaoCadastroSchema.safeParse({ estado: 'pendente' }).success).toBe(true);
    expect(estadoReconciliacaoCadastroSchema.safeParse({ estado: 'indeterminado' }).success).toBe(
      true,
    );
    expect(estadoReconciliacaoCadastroSchema.safeParse({ estado: 'falhou' }).success).toBe(false);
    expect(
      estadoReconciliacaoCadastroSchema.safeParse({
        estado: 'indeterminado',
        usuario_id: '10000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
  });
});
