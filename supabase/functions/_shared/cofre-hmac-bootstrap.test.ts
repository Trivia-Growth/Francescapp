import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { carregarChaveHmacBootstrap } from './cofre-hmac-bootstrap.ts';

const ssl = {
  rejectUnauthorized: true,
  ca: '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----',
};
const chave = btoa('a'.repeat(32));

function simularPool(valor: unknown, falhar?: string) {
  const consultas: string[] = [];
  let descartada: boolean | undefined;
  const pool = {
    options: { connectionTimeoutMillis: 5000, query_timeout: 15000, ssl },
    connect: async () => ({
      query: async (sql: string) => {
        consultas.push(sql);
        if (sql === falhar) throw new Error('segredo fictício');
        return { rows: sql.startsWith('select ') ? [{ chave: valor }] : [] };
      },
      release: (destruir: boolean) => {
        descartada = destruir;
      },
    }),
  } as unknown as Pool;
  return { pool, consultas, descartada: () => descartada };
}

describe('bootstrap HMAC PostgreSQL', () => {
  it('lê chave sob papel restrito em transação curta', async () => {
    const exemplo = simularPool(chave);
    expect(await carregarChaveHmacBootstrap(exemplo.pool)).toEqual(new Uint8Array(32).fill(97));
    expect(exemplo.consultas).toEqual([
      'BEGIN',
      "SET LOCAL statement_timeout = '10s'",
      'SET LOCAL ROLE ffcmapp_bootstrap_hmac_executor',
      'select identidade.ler_chave_hmac_email_bootstrap() as chave',
      'COMMIT',
    ]);
    expect(exemplo.descartada()).toBe(false);
  });
  it.each([undefined, 'inválida', btoa('a'.repeat(31))])('recusa chave inválida', async (valor) => {
    const exemplo = simularPool(valor);
    await expect(carregarChaveHmacBootstrap(exemplo.pool)).rejects.toThrow(
      'Chave criptográfica indisponível.',
    );
    expect(exemplo.descartada()).toBe(true);
  });
  it.each(['SET LOCAL ROLE ffcmapp_bootstrap_hmac_executor', 'COMMIT'])(
    'sanitiza falha e descarta conexão',
    async (sql) => {
      const exemplo = simularPool(chave, sql);
      await expect(carregarChaveHmacBootstrap(exemplo.pool)).rejects.toThrow(
        /^Chave criptográfica indisponível\.$/,
      );
      expect(exemplo.descartada()).toBe(true);
    },
  );
  it('recusa pool sem TLS verificado antes de conectar', async () => {
    const exemplo = simularPool(chave);
    exemplo.pool.options.ssl = false;
    await expect(carregarChaveHmacBootstrap(exemplo.pool)).rejects.toThrow(
      'Chave criptográfica indisponível.',
    );
    expect(exemplo.consultas).toEqual([]);
  });
  it.each(['connectionString', 'stream', 'checkServerIdentity', 'servername'])(
    'recusa opção %s que pode alterar a conexão TLS',
    async (opcao) => {
      const exemplo = simularPool(chave);
      if (opcao === 'connectionString' || opcao === 'stream') {
        Object.assign(exemplo.pool.options, { [opcao]: 'valor' });
      } else {
        exemplo.pool.options.ssl = { ...ssl, [opcao]: () => undefined };
      }
      await expect(carregarChaveHmacBootstrap(exemplo.pool)).rejects.toThrow(
        'Chave criptográfica indisponível.',
      );
      expect(exemplo.consultas).toEqual([]);
    },
  );
});
