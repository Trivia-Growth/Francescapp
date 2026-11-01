import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { criarExecutorCofrePostgres } from './cofre-vault-postgres.ts';

describe('executor PostgreSQL do cofre', () => {
  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'recusa pool sem prazo de conexão válido: %s',
    (prazo) => {
      const pool = {
        options: { connectionTimeoutMillis: prazo, query_timeout: 15000 },
      } as unknown as Pool;
      expect(() => criarExecutorCofrePostgres(pool)).toThrow('Chave criptográfica indisponível.');
    },
  );
  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'recusa pool sem prazo de consulta válido: %s',
    (prazo) => {
      const pool = {
        options: { connectionTimeoutMillis: 2000, query_timeout: prazo },
      } as unknown as Pool;
      expect(() => criarExecutorCofrePostgres(pool)).toThrow('Chave criptográfica indisponível.');
    },
  );
  it('rejeita referência inválida antes de conectar', async () => {
    let conectou = false;
    const pool = {
      options: { connectionTimeoutMillis: 2000, query_timeout: 15000 },
      connect: async () => {
        conectou = true;
        throw new Error();
      },
    } as unknown as Pool;
    await expect(
      criarExecutorCofrePostgres(pool).executar('identidade.ler_chave_cifra_vault', {
        p_referencia: '../outra',
      }),
    ).rejects.toThrow('Chave criptográfica indisponível.');
    expect(conectou).toBe(false);
  });
  it.each(['SET LOCAL ROLE ffcmapp_vault_executor', 'COMMIT'])(
    'descarta conexão quando %s falha',
    async (comando) => {
      let descartada: boolean | undefined;
      const pool = {
        options: { connectionTimeoutMillis: 2000, query_timeout: 15000 },
        connect: async () => ({
          query: async (sql: string) => {
            if (sql === comando) throw new Error('erro fictício');
            return { rows: sql.startsWith('select identidade.') ? [{ chave: 'ficticio' }] : [] };
          },
          release: (destruir: boolean) => {
            descartada = destruir;
          },
        }),
      } as unknown as Pool;
      await expect(
        criarExecutorCofrePostgres(pool).executar('identidade.ler_chave_cifra_vault', {
          p_referencia: 'ffcmapp.cifra.teste',
        }),
      ).rejects.toThrow('Chave criptográfica indisponível.');
      expect(descartada).toBe(true);
    },
  );
  it('executa somente leitura de referência parametrizada sob papel restrito', async () => {
    const consultas: Array<{ sql: string; parametros?: unknown[] }> = [];
    let descartada: boolean | undefined;
    const pool = {
      options: { connectionTimeoutMillis: 2000, query_timeout: 15000 },
      connect: async () => ({
        query: async (sql: string, parametros?: unknown[]) => {
          consultas.push({ sql, parametros });
          return {
            rows: sql.startsWith('select identidade.') ? [{ chave: 'material-ficticio' }] : [],
          };
        },
        release: (destruir: boolean) => {
          descartada = destruir;
        },
      }),
    } as unknown as Pool;
    const executor = criarExecutorCofrePostgres(pool);
    await expect(
      executor.executar('identidade.ler_chave_cifra_vault', {
        p_referencia: 'ffcmapp.cifra.teste',
      }),
    ).resolves.toBe('material-ficticio');
    expect(consultas.map(({ sql }) => sql)).toEqual([
      'BEGIN',
      "SET LOCAL statement_timeout = '10s'",
      'SET LOCAL ROLE ffcmapp_vault_executor',
      'select identidade.ler_chave_cifra_vault($1::text) as chave',
      'COMMIT',
    ]);
    expect(consultas[3]?.parametros).toEqual(['ffcmapp.cifra.teste']);
    expect(descartada).toBe(false);
  });
  it('sanitiza falha de consulta e descarta conexão com transação incerta', async () => {
    let descartada: boolean | undefined;
    const pool = {
      options: { connectionTimeoutMillis: 2000, query_timeout: 15000 },
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.startsWith('select identidade.')) throw new Error('segredo-ficticio');
          return { rows: [] };
        },
        release: (destruir: boolean) => {
          descartada = destruir;
        },
      }),
    } as unknown as Pool;
    const executor = criarExecutorCofrePostgres(pool);
    await expect(
      executor.executar('identidade.ler_chave_cifra_vault', {
        p_referencia: 'ffcmapp.cifra.teste',
      }),
    ).rejects.toThrow(/^Chave criptográfica indisponível\.$/);
    expect(descartada).toBe(true);
  });
});
