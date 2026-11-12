import type { Pool, PoolClient } from 'pg';

/** Leitura de segredo de integração externa guardado no Supabase Vault (FR-010: a chave do
 * provedor de transcrição).
 *
 * Mesma cadeia de papéis do cofre de cifra: o papel LOGIN do pool não enxerga o segredo, só
 * pode `SET LOCAL ROLE` para um executor sem login que tem EXECUTE apenas nesta função.
 * Ver `20261119100000_vault_segredo_integracao.sql`.
 *
 * O valor NUNCA é registrado, devolvido ao navegador ou incluído em erro. Falha de leitura
 * falha fechada: sem segredo não há chamada ao provedor, e o serviço fica indisponível. */

/** Não inclui referência nem causa para não expor a topologia do cofre. */
export class ErroSegredoIndisponivel extends Error {
  constructor() {
    super('Credencial de integração indisponível.');
    this.name = 'ErroSegredoIndisponivel';
  }
}

const referenciaValida = /^ffcmapp\.integracao\.[a-z0-9][a-z0-9_-]{0,63}$/;

export async function lerSegredoIntegracao(pool: Pool, referencia: string): Promise<string> {
  if (typeof referencia !== 'string' || !referenciaValida.test(referencia)) {
    throw new ErroSegredoIndisponivel();
  }
  let cliente: PoolClient | undefined;
  let destruir = true;
  try {
    cliente = await pool.connect();
    await cliente.query('BEGIN');
    await cliente.query("SET LOCAL statement_timeout = '3s'");
    await cliente.query('SET LOCAL ROLE ffcmapp_segredo_integracao_executor');
    const resultado = await cliente.query(
      'select identidade.ler_segredo_integracao_vault($1::text) as segredo',
      [referencia],
    );
    await cliente.query('COMMIT');
    destruir = false;
    const segredo: unknown = resultado.rows[0]?.segredo;
    if (
      resultado.rows.length !== 1 ||
      typeof segredo !== 'string' ||
      segredo.length < 8 ||
      // Teto maior desde `20261120100000`: a credencial do Google Drive é um JSON de conta de
      // serviço (~2 KiB), não um token curto. O banco já validou a forma esperada para a
      // referência; aqui só sobra a defesa contra um valor absurdo.
      segredo.length > 8192
    )
      throw new ErroSegredoIndisponivel();
    return segredo;
  } catch {
    throw new ErroSegredoIndisponivel();
  } finally {
    cliente?.release(destruir);
  }
}
