import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('revogação com prova em PostgreSQL descartável', () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'ffcm-saida.'));
  const dados = join(diretorio, 'data');
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    LC_ALL: 'C',
    TMPDIR: tmpdir(),
    PGHOST: diretorio,
    PGPORT: '55331',
    PGDATABASE: 'postgres',
  };
  let inicializado = false;
  const executar = (comando, argumentos) => {
    const resultado = spawnSync(comando, argumentos, { env, encoding: 'utf8', timeout: 20_000 });
    assert.equal(resultado.status, 0, `${comando} falhou: ${resultado.stderr}`);
  };
  try {
    executar('initdb', ['-D', dados, '-A', 'trust', '--no-instructions']);
    inicializado = true;
    executar('pg_ctl', [
      '-D',
      dados,
      '-l',
      join(diretorio, 'log'),
      '-o',
      `-c listen_addresses='' -k ${diretorio} -p 55331`,
      'start',
    ]);
    executar('createdb', ['ffcm_saida_teste_local']);
    env.PGDATABASE = 'ffcm_saida_teste_local';
    executar('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/tests/fundacao_saida_prova_experimento.sql',
    ]);
    executar('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/tests/fundacao_saida_concorrente_experimento.sql',
    ]);
    executar('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/tests/fundacao_renovacao_prova_integrada_experimento.sql',
    ]);
    executar('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/tests/fundacao_autorizacao_renovacao_experimento.sql',
    ]);
    executar('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/tests/fundacao_adapter_renovacao_fixture.sql',
    ]);
    env.FFCM_PG_FIXTURE = '1';
    executar('pnpm', [
      'exec',
      'vitest',
      'run',
      'scripts/test-persistencia-postgres-experimento.test.ts',
    ]);
  } finally {
    if (inicializado)
      spawnSync('pg_ctl', ['-D', dados, 'stop', '-m', 'fast'], { env, timeout: 20_000 });
    const estado = inicializado
      ? spawnSync('pg_ctl', ['-D', dados, 'status'], { env, timeout: 20_000 })
      : null;
    if (estado?.status === 3) rmSync(diretorio, { recursive: true, force: true });
  }
});
