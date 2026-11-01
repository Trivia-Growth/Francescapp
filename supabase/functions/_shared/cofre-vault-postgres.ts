import type { Pool, PoolClient } from 'pg';
import { ErroCofreIndisponivel, type ExecutorCofreInterno } from './cofre-vault.ts';

/** Adapter não conectado. O pool deve usar identidade restrita e TLS verificado;
 * sua configuração e a cadeia de papéis exigem revisão S-02 antes de uso. */
export function criarExecutorCofrePostgres(pool: Pool): ExecutorCofreInterno {
  const prazo = pool.options?.connectionTimeoutMillis;
  const prazoConsulta = pool.options?.query_timeout;
  if (
    typeof prazo !== 'number' ||
    !Number.isSafeInteger(prazo) ||
    prazo <= 0 ||
    typeof prazoConsulta !== 'number' ||
    !Number.isSafeInteger(prazoConsulta) ||
    prazoConsulta <= 0
  ) {
    throw new ErroCofreIndisponivel();
  }
  return {
    async executar(nome, argumentos) {
      let cliente: PoolClient | undefined;
      let destruir = true;
      try {
        if (
          nome !== 'identidade.ler_chave_cifra_vault' ||
          typeof argumentos.p_referencia !== 'string' ||
          !/^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/.test(argumentos.p_referencia)
        )
          throw new Error();
        cliente = await pool.connect();
        await cliente.query('BEGIN');
        await cliente.query("SET LOCAL statement_timeout = '10s'");
        await cliente.query('SET LOCAL ROLE ffcmapp_vault_executor');
        const resultado = await cliente.query(
          'select identidade.ler_chave_cifra_vault($1::text) as chave',
          [argumentos.p_referencia],
        );
        if (resultado.rows.length !== 1 || typeof resultado.rows[0].chave !== 'string')
          throw new Error();
        await cliente.query('COMMIT');
        destruir = false;
        return resultado.rows[0].chave;
      } catch {
        throw new ErroCofreIndisponivel();
      } finally {
        cliente?.release(destruir);
      }
    },
  };
}
