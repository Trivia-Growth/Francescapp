import type { Pool, PoolClient } from 'pg';
import { ErroCofreIndisponivel } from './cofre-vault.ts';

/** Exclusivo do servidor. Use pool criado por criarPoolCofre; não concede privilégios. */
export async function carregarChaveHmacBootstrap(pool: Pool): Promise<Uint8Array> {
  const { connectionTimeoutMillis, query_timeout, ssl, connectionString, stream } = pool.options;
  if (
    !Number.isSafeInteger(connectionTimeoutMillis) ||
    (connectionTimeoutMillis ?? 0) <= 0 ||
    !Number.isSafeInteger(query_timeout) ||
    (query_timeout ?? 0) <= 0 ||
    connectionString !== undefined ||
    stream !== undefined ||
    typeof ssl !== 'object' ||
    ssl === null ||
    Object.keys(ssl).some((opcao) => opcao !== 'ca' && opcao !== 'rejectUnauthorized') ||
    ssl.rejectUnauthorized !== true ||
    typeof ssl.ca !== 'string' ||
    !/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----\s*$/.test(ssl.ca)
  )
    throw new ErroCofreIndisponivel();

  let cliente: PoolClient | undefined;
  let destruir = true;
  try {
    cliente = await pool.connect();
    await cliente.query('BEGIN');
    await cliente.query("SET LOCAL statement_timeout = '10s'");
    await cliente.query('SET LOCAL ROLE ffcmapp_bootstrap_hmac_executor');
    // A função valida e resolve a referência configurada no banco, sem entrada externa.
    const resultado = await cliente.query(
      'select identidade.ler_chave_hmac_email_bootstrap() as chave',
    );
    const valor: unknown = resultado.rows.length === 1 ? resultado.rows[0].chave : undefined;
    if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) throw new Error();
    const binario = atob(valor);
    if (binario.length !== 32 || btoa(binario) !== valor) throw new Error();
    const chave = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
    await cliente.query('COMMIT');
    destruir = false;
    return chave;
  } catch {
    throw new ErroCofreIndisponivel();
  } finally {
    cliente?.release(destruir);
  }
}
