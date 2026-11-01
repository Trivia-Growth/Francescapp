import { describe, expect, it, vi } from 'vitest';
import * as nucleo from '../sessao/nucleo.ts';
import { SignJWT } from 'jose';
import type { Pool } from 'pg';
import { criarExecutorAdmissaoPostgres } from './admissao-postgres.ts';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const request = '33333333-3333-4333-8333-333333333333';
const chave = new Uint8Array(32).fill(9);
const configuracaoJwt = {
  issuer: 'https://ficticio.supabase.co/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: chave,
};
const pedido = {
  identidade: { usuario_id: usuario, session_id: sessao, metodo: 'tecnica' as const },
  request_id: request,
  credencial_refresh: {
    formato: 1 as const,
    key_id: 'v1',
    nonce: 'YQ',
    ciphertext: 'YQ',
    tag: 'YQ',
  },
};

describe('admissão PostgreSQL restrita, ainda não integrada', () => {
  it('encerra validação demorada e nunca conecta mesmo quando ela responde tarde', async () => {
    vi.useFakeTimers();
    let terminar: ((valor: { usuarioId: string; sessionId: string }) => void) | undefined;
    const validacao = vi.spyOn(nucleo, 'validarJwtDeSessao').mockImplementation(
      () =>
        new Promise((resolve) => {
          terminar = resolve;
        }),
    );
    let conectou = false;
    const pool = {
      options: { connectionTimeoutMillis: 5000, query_timeout: 15000 },
      connect: async () => {
        conectou = true;
        throw new Error();
      },
    } as unknown as Pool;
    try {
      const resultado = criarExecutorAdmissaoPostgres(
        pool,
        configuracaoJwt,
      )({ jwt: 'token-ficticio', pedido, provaHash: 'A'.repeat(43) }).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(5001);
      const falha = await resultado;
      expect(falha).toBeInstanceOf(Error);
      expect((falha as Error).message).toBe('Admissão indisponível.');
      terminar?.({ usuarioId: usuario, sessionId: sessao });
      await Promise.resolve();
      await Promise.resolve();
      expect(conectou).toBe(false);
    } finally {
      validacao.mockRestore();
      vi.useRealTimers();
    }
  });
  it('descarta conexão e não expõe erros ou credenciais quando o commit é incerto', async () => {
    let destruido = false;
    const pool = {
      options: { connectionTimeoutMillis: 5000, query_timeout: 15000 },
      connect: async () => ({
        query: async (sql: string) => {
          if (sql === 'COMMIT') throw new Error('segredo-ficticio');
          return {
            rows: sql.startsWith('select ')
              ? [
                  {
                    resultado: {
                      ok: false,
                      request_id: request,
                      erro: { codigo: 'sem_permissao' },
                    },
                  },
                ]
              : [],
          };
        },
        release: (valor: boolean) => {
          destruido = valor;
        },
      }),
    } as unknown as Pool;
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(configuracaoJwt.issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    await expect(
      criarExecutorAdmissaoPostgres(
        pool,
        configuracaoJwt,
      )({ jwt, pedido, provaHash: 'A'.repeat(43) }),
    ).rejects.toThrow('Admissão indisponível.');
    expect(destruido).toBe(true);
  });
  it('valida JWT e identidade antes de usar função fixa sob papel dedicado', async () => {
    const chamadas: string[] = [];
    let descartado: boolean | undefined;
    const pool = {
      options: { connectionTimeoutMillis: 5000, query_timeout: 15000 },
      connect: async () => ({
        query: async (sql: string) => {
          chamadas.push(sql);
          return {
            rows: sql.startsWith('select ')
              ? [
                  {
                    resultado: {
                      ok: false,
                      request_id: request,
                      erro: { codigo: 'sem_permissao' },
                    },
                  },
                ]
              : [],
          };
        },
        release: (v: boolean) => {
          descartado = v;
        },
      }),
    } as unknown as Pool;
    const executor = criarExecutorAdmissaoPostgres(pool, configuracaoJwt);
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(configuracaoJwt.issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    await expect(executor({ jwt, pedido, provaHash: 'A'.repeat(43) })).resolves.toMatchObject({
      ok: false,
    });
    expect(chamadas).toEqual([
      'BEGIN',
      "SET LOCAL statement_timeout = '10s'",
      'SET LOCAL ROLE ffcmapp_admissao_executor',
      'select identidade.admitir_tecnica_com_prova($1::jsonb, $2::bytea) as resultado',
      'COMMIT',
    ]);
    expect(descartado).toBe(false);
    await expect(
      executor({
        jwt,
        pedido: { ...pedido, identidade: { ...pedido.identidade, usuario_id: sessao } },
        provaHash: 'A'.repeat(43),
      }),
    ).rejects.toThrow();
    expect(chamadas).toHaveLength(5);
  });
});
