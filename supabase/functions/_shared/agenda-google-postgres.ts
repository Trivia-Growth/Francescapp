import type { Pool, PoolClient } from 'pg';

/** Canal privado. O transporte deve conter atestado emitido após validar JWT,
 * sessão e prova OAuth; o banco valida assinatura, operação e digest do valor.
 * Exige papel executor, TLS e política de logs comprovados antes da ativação. */
export function criarExecutorAgendaPostgres(pool: Pool) {
  const prazo = pool.options?.connectionTimeoutMillis;
  const consulta = pool.options?.query_timeout;
  if (
    !Number.isSafeInteger(prazo) ||
    !prazo ||
    prazo < 0 ||
    !Number.isSafeInteger(consulta) ||
    !consulta ||
    consulta < 0
  )
    throw new Error('Conexão indisponível.');
  return async (transporte: Record<string, unknown>, valor: string | null): Promise<unknown> => {
    let cliente: PoolClient | undefined;
    let destruir = true;
    try {
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      await cliente.query('SET LOCAL ROLE ffcmapp_agenda_google_executor');
      const resposta = await cliente.query(
        'select identidade.agenda_google_operacao_privada($1::jsonb,$2::text) as resultado',
        [JSON.stringify(transporte), valor],
      );
      if (resposta.rows.length !== 1) throw new Error();
      await cliente.query('COMMIT');
      destruir = false;
      return resposta.rows[0].resultado;
    } catch {
      throw new Error('Conexão indisponível.');
    } finally {
      cliente?.release(destruir);
    }
  };
}
