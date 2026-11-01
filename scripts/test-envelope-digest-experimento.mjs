import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('digest de credencial no PostgreSQL descartável', () => {
  const dir = mkdtempSync('/tmp/ffcm-digest.');
  const data = join(dir, 'data');
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', PGHOST: dir, PGPORT: '55331', PGDATABASE: 'postgres' };
  let inicializado = false;
  const executar = (comando, argumentos) => {
    const resultado = spawnSync(comando, argumentos, { env, encoding: 'utf8', timeout: 20000 });
    assert.equal(resultado.status, 0, `${comando}: ${resultado.stderr}`);
  };
  try {
    executar('initdb', ['-D', data, '-A', 'trust', '--no-instructions']);
    inicializado = true;
    executar('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-o', `-c listen_addresses='' -k ${dir} -p 55331`, 'start']);
    executar('createdb', ['ffcm_digest_teste_local']);
    env.PGDATABASE = 'ffcm_digest_teste_local';
    executar('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/tests/fundacao_envelope_digest_experimento.sql']);
  } finally {
    if (inicializado) spawnSync('pg_ctl', ['-D', data, 'stop', '-m', 'fast'], { env, timeout: 20000 });
    const estado = inicializado ? spawnSync('pg_ctl', ['-D', data, 'status'], { env, timeout: 20000 }) : null;
    if (estado?.status === 3) rmSync(dir, { recursive: true, force: true });
  }
});
