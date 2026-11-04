// Preparação operacional: entrada por stdin privado; não registra credenciais.
// O código identifica o cadastro, não comprova a identidade humana do operador.
import { randomBytes, X509Certificate } from 'node:crypto';
import pg from 'pg';

async function executar(entrada) {
  const { projetoRef, projetoRefConfirmado, conexao, senhaOperador, confirmacao } = entrada;
  if (
    !/^[a-z0-9]{20}$/.test(projetoRef ?? '') ||
    projetoRef !== projetoRefConfirmado ||
    confirmacao !== `PROVISIONAR OPERADOR ${projetoRef}` ||
    !conexao ||
    !Number.isInteger(conexao.porta) ||
    conexao.porta < 1 ||
    conexao.porta > 65535 ||
    !/^[a-zA-Z0-9_-]{1,63}$/.test(conexao.banco ?? '') ||
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(conexao.usuario ?? '') ||
    typeof conexao.senha !== 'string' ||
    !conexao.senha ||
    typeof conexao.certificadoCa !== 'string' ||
    !/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----\s*$/.test(
      conexao.certificadoCa,
    ) ||
    typeof senhaOperador !== 'string' ||
    senhaOperador.length < 32 ||
    senhaOperador.length > 256 ||
    senhaOperador.includes('\0')
  )
    throw new Error();
  const direto = conexao.host === `db.${projetoRef}.supabase.co`;
  const pooler =
    /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(conexao.host ?? '') &&
    conexao.usuario.endsWith(`.${projetoRef}`);
  if (!direto && !pooler) throw new Error();

  // URL oficial configurada pelo painel Supabase; HTTPS valida origem independentemente da CA informada.
  const respostaCa = await fetch(
    'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',
    {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!respostaCa.ok) throw new Error();
  const caOficial = await respostaCa.text();
  if (
    caOficial.length > 16384 ||
    new X509Certificate(caOficial).fingerprint256 !==
      new X509Certificate(conexao.certificadoCa).fingerprint256
  )
    throw new Error();

  const sufixo = randomBytes(16).toString('hex');
  const papel = `ffcmapp_op_${sufixo}`;
  const codigo = `op_${sufixo}`;
  // Identificadores aparecem antes do commit para permitir reconciliação se a resposta se perder.
  process.stdout.write(
    'Controles não comprovam ausência em logs externos ou canais não consultáveis.\n',
  );
  process.stdout.write(
    `Cadastro ${codigo}; login ${papel}. Confirme o vínculo humano em registro externo controlado.\n`,
  );
  const cliente = new pg.Client({
    host: conexao.host,
    port: conexao.porta,
    database: conexao.banco,
    user: conexao.usuario,
    password: conexao.senha,
    ssl: { ca: caOficial, rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
  });
  let commitEnviado = false;
  try {
    await cliente.connect();
    await cliente.query('BEGIN');
    await cliente.query('SET LOCAL standard_conforming_strings = on');
    await cliente.query("SET LOCAL log_statement = 'none'");
    await cliente.query("SET LOCAL log_min_error_statement = 'panic'");
    await cliente.query('SET LOCAL log_min_duration_statement = -1');
    await cliente.query("SET LOCAL log_duration = 'off'");
    await cliente.query('SET LOCAL log_parameter_max_length = 0');
    await cliente.query('SET LOCAL log_parameter_max_length_on_error = 0');
    await cliente.query("SET LOCAL pg_stat_statements.track = 'none'");
    const controles =
      await cliente.query(`select current_setting('standard_conforming_strings') as strings,
      current_setting('log_statement') as statement,
      current_setting('log_min_error_statement') as error_statement,
      current_setting('log_min_duration_statement') as duration_statement,
      current_setting('log_duration') as duration,
      current_setting('log_parameter_max_length') as parameter_length,
      current_setting('log_parameter_max_length_on_error') as parameter_error,
      current_setting('pg_stat_statements.track') as track,
      current_setting('pgaudit.log', true) as pgaudit_log,
      current_setting('shared_preload_libraries') as preload,
      exists(select 1 from pg_catalog.pg_extension where extname = 'pgaudit') as pgaudit_instalado`);
    const c = controles.rows[0];
    if (
      controles.rows.length !== 1 ||
      c.strings !== 'on' ||
      c.statement !== 'none' ||
      c.error_statement !== 'panic' ||
      c.duration_statement !== '-1' ||
      c.duration !== 'off' ||
      c.parameter_length !== '0' ||
      c.parameter_error !== '0' ||
      c.track !== 'none' ||
      c.pgaudit_instalado ||
      c.pgaudit_log !== null ||
      /pgaudit/i.test(c.preload)
    )
      throw new Error();
    // CREATE ROLE exige literal; o valor só é enviado após conferência dos controles nesta transação.
    const literal = `'${senhaOperador.replaceAll("'", "''")}'`;
    await cliente.query(
      `CREATE ROLE "${papel}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal}`,
    );
    const cadastro = await cliente.query(
      `INSERT INTO auditoria.operador_tecnico (codigo,papel_oid,papel_nome,ativo)
      SELECT $1, oid, rolname, false FROM pg_catalog.pg_roles WHERE rolname = $2`,
      [codigo, papel],
    );
    if (cadastro.rowCount !== 1) throw new Error();
    commitEnviado = true;
    await cliente.query('COMMIT');
    process.stdout.write(
      'Cadastro inativo confirmado. Nenhuma permissão de bootstrap ou Vault foi concedida.\n',
    );
  } catch {
    if (!commitEnviado) await cliente.query('ROLLBACK').catch(() => {});
    process.stderr.write(
      commitEnviado
        ? 'Resultado do commit incerto. Confira o catálogo antes de repetir ou conceder acesso.\n'
        : 'Provisionamento recusado ou indisponível. Confira o estado antes de repetir.\n',
    );
    process.exitCode = 1;
  } finally {
    await cliente.end().catch(() => {});
  }
}

try {
  if (process.argv.length !== 2 || process.stdin.isTTY) throw new Error();
  let texto = '';
  for await (const parte of process.stdin) {
    texto += parte;
    if (texto.length > 32768) throw new Error();
  }
  await executar(JSON.parse(texto));
} catch {
  process.stderr.write('Entrada inválida ou indisponível.\n');
  process.exitCode = 1;
}
