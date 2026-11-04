// Provisão inicial, somente após autorização operacional específica. Não ativa leitores.
import pg from 'pg';

const referencia = /^[a-z0-9]{20}$/;
const nomes = [
  'ffcmapp.cifra.pii-v1',
  'ffcmapp.cifra.hmac-v1',
  'ffcmapp.hmac.email.v1',
  'ffcmapp.atestado.v1',
];

export async function prepararVault(entrada) {
  const { projetoRef, projetoRefConfirmado, token, conexao, confirmacao } = entrada;
  if (
    !referencia.test(projetoRef ?? '') ||
    projetoRef !== projetoRefConfirmado ||
    typeof token !== 'string' ||
    !token.trim() ||
    !conexao ||
    conexao.host !== `db.${projetoRef}.supabase.co` ||
    conexao.porta !== 5432 ||
    conexao.banco !== 'postgres' ||
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(conexao.usuario ?? '') ||
    typeof conexao.senha !== 'string' ||
    !conexao.senha ||
    typeof conexao.certificadoCa !== 'string' ||
    !/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----\s*$/.test(
      conexao.certificadoCa,
    )
  )
    throw new Error();
  const projeto = await fetch(`https://api.supabase.com/v1/projects/${projetoRef}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'error',
  });
  if (!projeto.ok || (await projeto.json()).ref !== projetoRef) throw new Error();
  if (confirmacao === undefined)
    return 'Prévia: projeto confirmado; nenhuma conexão SQL realizada.';
  if (confirmacao !== `PROVISIONAR VAULT ${projetoRef}`) throw new Error();
  const pool = new pg.Pool({
    host: conexao.host,
    port: conexao.porta,
    database: conexao.banco,
    user: conexao.usuario,
    password: conexao.senha,
    ssl: { ca: conexao.certificadoCa, rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  });
  try {
    const cliente = await pool.connect();
    let destruir = true;
    try {
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      await cliente.query("SELECT pg_advisory_xact_lock(hashtext('ffcmapp.provisao.vault.v1'))");
      const existentes = await cliente.query(
        'SELECT count(*)::integer AS total FROM vault.secrets WHERE name = ANY($1::text[])',
        [nomes],
      );
      if (existentes.rows[0]?.total !== 0) throw new Error();
      // Valores gerados no servidor dentro da transação; nenhuma chave trafega para o cliente.
      await cliente.query(`DO $provisao$ BEGIN
        PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'ffcmapp.cifra.pii-v1');
        PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'ffcmapp.cifra.hmac-v1');
        PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'ffcmapp.hmac.email.v1');
        PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'ffcmapp.atestado.v1');
      END $provisao$`);
      const criados = await cliente.query(
        'SELECT count(*)::integer AS total FROM vault.secrets WHERE name = ANY($1::text[])',
        [nomes],
      );
      if (criados.rows[0]?.total !== nomes.length) throw new Error();
      await cliente.query('COMMIT');
      destruir = false;
      return 'Segredos criados no Vault. Leitores e configuração permanecem pendentes.';
    } finally {
      cliente.release(destruir);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    if (process.argv.length !== 2) throw new Error();
    let texto = '';
    for await (const parte of process.stdin) {
      texto += parte;
      if (texto.length > 32768) throw new Error();
    }
    process.stdout.write(`${await prepararVault(JSON.parse(texto))}\n`);
  } catch {
    process.stderr.write('Provisão recusada ou indisponível; confira o estado antes de repetir.\n');
    process.exitCode = 1;
  }
}
