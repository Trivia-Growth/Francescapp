import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = mkdtempSync('/tmp/ffcm-curta.');
const data = join(dir, 'data');
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', PGHOST: dir, PGPORT: '55332', PGDATABASE: 'postgres' };
let iniciado = false;
const executar = (comando, args) => {
  const resultado = spawnSync('rtk', ['proxy', comando, ...args], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(resultado.status, 0, `${comando}: ${resultado.stderr}`);
};
try {
  executar('initdb', ['-D', data, '-A', 'trust', '--no-instructions']);
  iniciado = true;
  executar('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-o', `-c listen_addresses='' -k ${dir} -p 55332`, 'start']);
  executar('createdb', ['ffcm_curta_teste_local']);
  env.PGDATABASE = 'ffcm_curta_teste_local';
  executar('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/tests/fundacao_autorizacao_curta_experimento.sql']);
  env.FFCM_TESTE_CURTA = '1';
  executar('pnpm', ['exec', 'vitest', 'run', 'supabase/functions/_shared/autorizacao-curta-postgres.test.ts']);
  process.stdout.write('Experimento de autorização curta aprovado.\n');
} finally {
  if (iniciado) spawnSync('rtk', ['proxy', 'pg_ctl', '-D', data, 'stop', '-m', 'fast'], { env, timeout: 20000 });
  const estado = iniciado ? spawnSync('rtk', ['proxy', 'pg_ctl', '-D', data, 'status'], { env, timeout: 20000 }) : null;
  if (estado?.status === 3) rmSync(dir, { recursive: true, force: true });
}
