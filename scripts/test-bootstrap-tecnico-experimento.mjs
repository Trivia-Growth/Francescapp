import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('recusa alvo remoto ou confirmação incorreta sem expor dados da entrada', () => {
  for (const entrada of [
    { socket: 'https://example.test', porta: 55329, confirmacao: 'CONFIRMO SOMENTE FIXTURE' },
    { socket: '/tmp/ffcm-bootstrap.ABCDEF', porta: 55329, confirmacao: 'senha-ficticia' },
  ]) {
    const resultado = spawnSync(process.execPath, ['scripts/bootstrap-tecnico-experimento.mjs'], {
      input: JSON.stringify(entrada),
      encoding: 'utf8',
    });
    assert.notEqual(resultado.status, 0);
    assert.doesNotMatch(resultado.stderr + resultado.stdout, /example\.test|senha-ficticia/);
    assert.match(resultado.stderr, /Bootstrap experimental recusado/);
  }
});

test('simula bootstrap no PostgreSQL descartável e reverte todos os efeitos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ffcm-bootstrap.'));
  const dados = join(dir, 'data');
  const porta = 55329;
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', TMPDIR: tmpdir(), LC_ALL: 'C' };
  Object.assign(env, { PGHOST: dir, PGPORT: String(porta), PGDATABASE: 'postgres' });
  let iniciado = false;
  let inicializado = false;
  const executar = (comando, argumentos, opcoes = {}) => {
    const resultado = spawnSync(comando, argumentos, { encoding: 'utf8', env, ...opcoes });
    assert.equal(resultado.status, 0, `${comando} falhou: ${resultado.stderr}`);
    return resultado;
  };
  try {
    executar('initdb', ['-D', dados, '-A', 'trust', '--no-instructions']);
    inicializado = true;
    const inicio = spawnSync(
      'pg_ctl',
      [
        '-D',
        dados,
        '-l',
        join(dir, 'log'),
        '-o',
        `-c listen_addresses='' -k ${dir} -p ${porta}`,
        'start',
      ],
      { env, encoding: 'utf8' },
    );
    assert.equal(
      inicio.status,
      0,
      `Falha ao iniciar PostgreSQL descartável: ${readFileSync(join(dir, 'log'), 'utf8')}`,
    );
    iniciado = true;
    executar('createdb', ['ffcm_bootstrap_teste_local']);
    env.PGDATABASE = 'ffcm_bootstrap_teste_local';
    executar('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], {
      input:
        "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('11111111-1111-4111-8111-111111111111');",
    });
    executar('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql',
    ]);
    executar('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/drafts/20261102100000_bootstrap_tecnico_experimento.sql',
    ]);
    executar('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], {
      input: "insert into identidade.bootstrap_experimento(projeto_ref) values ('ffcm-fixture');",
    });
    const snapshot = () =>
      executar('psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], {
        input: `select jsonb_build_object(
        'auth', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from auth.users t),
        'usuario', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from public.usuario t),
        'concessao', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from identidade.concessao_equipe t),
        'excecao', (select coalesce(jsonb_agg(to_jsonb(t) order by usuario_id), '[]'::jsonb) from identidade.excecao_tecnica t),
        'controle', (select coalesce(jsonb_agg(to_jsonb(t) order by unico), '[]'::jsonb) from identidade.bootstrap_experimento t),
        'auditoria', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) from auditoria.evento t));`,
      }).stdout.trim();
    const antes = snapshot();
    const entrada = JSON.stringify({ socket: dir, porta, confirmacao: 'CONFIRMO SOMENTE FIXTURE' });
    const primeira = executar(process.execPath, ['scripts/bootstrap-tecnico-experimento.mjs'], {
      input: entrada,
    });
    assert.match(primeira.stdout, /inicializado/);
    const repeticao = executar(process.execPath, ['scripts/bootstrap-tecnico-experimento.mjs'], {
      input: entrada,
    });
    assert.match(repeticao.stdout, /inicializado/);
    assert.equal(snapshot(), antes);
  } finally {
    if (iniciado) spawnSync('pg_ctl', ['-D', dados, 'stop', '-m', 'fast'], { env });
    const estado = inicializado ? spawnSync('pg_ctl', ['-D', dados, 'status'], { env }) : null;
    if (estado?.status === 3) rmSync(dir, { recursive: true, force: true });
  }
});
