import { describe, expect, it } from 'vitest';
import { criarPoolCofre } from './pool-cofre.ts';

const configuracao = {
  host: 'db.exemplo.test',
  porta: 6543,
  banco: 'postgres',
  usuario: 'executor_ficticio',
  senha: 'senha-ficticia',
  certificadoCa: '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----',
};

describe('pool dedicado ao cofre', () => {
  it('exige TLS com certificado e endereço de servidor verificável', async () => {
    const pool = criarPoolCofre(configuracao);
    try {
      expect(pool.options.ssl).toEqual({
        ca: configuracao.certificadoCa,
        rejectUnauthorized: true,
      });
      expect(pool.options.host).toBe(configuracao.host);
      expect(pool.options.connectionTimeoutMillis).toBeGreaterThan(0);
      expect(pool.options.query_timeout).toBe(15000);
      expect(pool.options.max).toBe(1);
      expect(pool.options.connectionString).toBeUndefined();
    } finally {
      await pool.end();
    }
  });
  it('aceita nome DNS absoluto', async () => {
    const pool = criarPoolCofre({ ...configuracao, host: 'localhost.' });
    await pool.end();
  });
  it.each([
    { host: '127.0.0.1' },
    { host: '/tmp/socket' },
    { host: 'https://exemplo.test' },
    { host: 'exemplo.test?sslmode=disable' },
    { certificadoCa: '' },
    { senha: '' },
    { usuario: 'postgres' },
    { porta: 0 },
  ])('recusa configuração inválida sem mostrar seus valores: %o', (alteracao) => {
    expect(() => criarPoolCofre({ ...configuracao, ...alteracao })).toThrow(
      /^Chave criptográfica indisponível\.$/,
    );
  });
});
