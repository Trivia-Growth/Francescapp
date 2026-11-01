import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('TLS do cofre em PostgreSQL descartável', () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'ffcm-tls.'));
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    LC_ALL: 'C',
    PGHOST: diretorio,
    PGDATABASE: 'postgres',
  };
  const servidores = [];
  const executar = (comando, argumentos) => {
    const resultado = spawnSync(comando, argumentos, { env, encoding: 'utf8', timeout: 60000 });
    assert.equal(resultado.status, 0, `${comando} falhou: ${resultado.stderr}`);
  };
  try {
    for (const [nome, porta, dns] of [
      ['valido', '55431', 'localhost.'],
      ['outro', '55432', 'outro.exemplo.test'],
    ]) {
      const dados = join(diretorio, `data-${nome}`);
      const certificado = join(diretorio, `${nome}.crt`);
      const chave = join(diretorio, `${nome}.key`);
      executar('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        chave,
        '-out',
        certificado,
        '-days',
        '1',
        '-subj',
        `/CN=${dns}`,
        '-addext',
        `subjectAltName=DNS:${dns}`,
      ]);
      executar('initdb', ['-D', dados, '-A', 'trust', '--no-instructions']);
      writeFileSync(
        join(dados, 'pg_hba.conf'),
        'local all all trust\nhostssl all all 127.0.0.1/32 scram-sha-256\nhostssl all all ::1/128 scram-sha-256\n',
      );
      servidores.push({ dados });
      executar('pg_ctl', [
        '-D',
        dados,
        '-l',
        join(diretorio, `${nome}.log`),
        '-o',
        `-c listen_addresses=localhost -c ssl=on -c ssl_cert_file=${certificado} -c ssl_key_file=${chave} -k ${diretorio} -p ${porta}`,
        'start',
      ]);
      env.PGPORT = porta;
      executar('createuser', ['ffcm_tls_teste']);
      executar('psql', [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        "alter role ffcm_tls_teste password 'senha-ficticia'",
      ]);
      if (nome === 'valido')
        executar('psql', [
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '-f',
          'supabase/tests/fundacao_tls_cofre_fixture.sql',
        ]);
    }
    env.FFCM_TLS_FIXTURE = '1';
    env.FFCM_TLS_CERT_VALIDO = join(diretorio, 'valido.crt');
    env.FFCM_TLS_CERT_OUTRO = join(diretorio, 'outro.crt');
    executar('pnpm', ['exec', 'vitest', 'run', 'scripts/test-tls-cofre.test.ts']);
    executar('deno', [
      'run',
      '--check',
      '--config',
      'supabase/functions/deno.json',
      '--frozen',
      '--allow-env',
      `--allow-read=${env.FFCM_TLS_CERT_VALIDO},${env.FFCM_TLS_CERT_OUTRO}`,
      '--allow-net=localhost.:55431,localhost.:55432,localhost.:55433,[::1]:55433',
      'scripts/test-tls-cofre-deno.ts',
    ]);
  } finally {
    for (const servidor of servidores) {
      spawnSync('pg_ctl', ['-D', servidor.dados, 'stop', '-m', 'fast'], { env, timeout: 20000 });
    }
    if (
      servidores.every(
        (servidor) =>
          spawnSync('pg_ctl', ['-D', servidor.dados, 'status'], { env, timeout: 20000 }).status ===
          3,
      )
    )
      rmSync(diretorio, { recursive: true, force: true });
  }
});
