import type { Pool, PoolClient } from 'pg';
import type { RepositorioDesafiosGoogle } from './desafio-google.ts';

/** Não conectado: pool, grants, isolamento e ausência de logs exigem revisão S-02. */
export function criarRepositorioDesafiosPostgresExperimental(
  pool: Pool,
): RepositorioDesafiosGoogle {
  for (const prazo of [pool.options?.connectionTimeoutMillis, pool.options?.query_timeout]) {
    if (typeof prazo !== 'number' || !Number.isSafeInteger(prazo) || prazo <= 0 || prazo > 10_000)
      throw new Error('Desafio indisponível.');
  }
  async function executar(id: string, hash: string, expira?: number): Promise<boolean> {
    let cliente: PoolClient | undefined;
    let destruir = true;
    try {
      if (
        typeof id !== 'string' ||
        typeof hash !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ||
        !/^[0-9a-f]{64}$/.test(hash)
      )
        throw new Error();
      if (
        expira !== undefined &&
        (!Number.isSafeInteger(expira) || expira < 0 || expira > 8_640_000_000_000_000)
      )
        throw new Error();
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      const resultado =
        expira === undefined
          ? await cliente.query(
              'select identidade.consumir_desafio_google($1::uuid, $2::text) as consumido',
              [id, hash],
            )
          : await cliente.query(
              'select identidade.registrar_desafio_google($1::uuid, $2::text, $3::timestamptz)',
              [id, hash, new Date(expira).toISOString()],
            );
      if (
        resultado.rows.length !== 1 ||
        (expira === undefined && typeof resultado.rows[0]?.consumido !== 'boolean')
      )
        throw new Error();
      const consumido = expira === undefined ? (resultado.rows[0].consumido as boolean) : true;
      const confirmacao = await cliente.query('COMMIT');
      if (confirmacao.command !== 'COMMIT') throw new Error();
      destruir = false;
      return consumido;
    } catch {
      throw new Error('Desafio indisponível.');
    } finally {
      cliente?.release(destruir);
    }
  }
  return Object.freeze({
    async registrar(id: string, hash: string, expiraEm: number) {
      if (typeof expiraEm !== 'number') throw new Error('Desafio indisponível.');
      await executar(id, hash, expiraEm);
    },
    async consumir(id: string, hash: string, _agora: number) {
      return executar(id, hash);
    },
  });
}
