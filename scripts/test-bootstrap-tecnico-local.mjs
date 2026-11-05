import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('bootstrap técnico restringe operador, alvo, repetição e auditoria', () => {
  const dir = mkdtempSync('/tmp/ffcm-boot.');
  const data = join(dir, 'data');
  const env = {
    PATH: process.env.PATH,
    PGHOST: dir,
    PGPORT: '55391',
    PGDATABASE: 'postgres',
    LC_ALL: 'C',
  };
  const run = (cmd, args, input) => {
    const r = spawnSync(cmd, args, { env, input, encoding: 'utf8' });
    assert.equal(
      r.status,
      0,
      `${cmd}: ${r.stderr} ${cmd === 'pg_ctl' ? readFileSync(join(dir, 'log'), 'utf8') : ''}`,
    );
    return r.stdout;
  };
  const sql = (input) => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], input);
  let started = false;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '--no-instructions']);
    run('pg_ctl', [
      '-D',
      data,
      '-l',
      join(dir, 'log'),
      '-o',
      `-c listen_addresses='' -k ${dir} -p 55391`,
      'start',
    ]);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role; create role operador_fixture login; create role outro_fixture login;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('51000000-0000-4000-8000-000000000001');`);
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql',
    ]);
    sql(
      'alter table public.usuario enable row level security; alter table identidade.concessao_equipe enable row level security; alter table identidade.excecao_tecnica enable row level security; alter table auditoria.evento enable row level security;',
    );
    sql(
      readFileSync('supabase/migrations/20261110120000_admissao_tecnica_nativa.sql', 'utf8').split(
        'grant select (usuario_id',
      )[0],
    );
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261110170000_operador_tecnico.sql',
    ]);
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261110180000_bootstrap_tecnico.sql',
    ]);
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/drafts/20261112100000_operador_servico_temporario.sql',
    ]);
    sql(`insert into identidade.bootstrap_tecnico_controle(projeto_ref) values ('fixture');
      insert into auditoria.operador_tecnico(codigo,papel_oid,papel_nome,ativo,tipo,expira_em) values ('op_0123456789abcdef0123456789abcdef', 'operador_fixture'::regrole::oid, 'operador_fixture', true, 'servico_teste', clock_timestamp() + interval '1 hour');
      grant usage on schema identidade to operador_fixture;
      grant execute on function identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid) to operador_fixture;
      grant usage on schema identidade to outro_fixture;
      grant execute on function identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid) to outro_fixture;
      set session authorization outro_fixture;
      do $$ begin
        begin perform identidade.bootstrap_tecnico('fixture',gen_random_uuid(),gen_random_uuid(),'{}','h','{}',gen_random_uuid()); raise exception 'outro login aceito'; exception when insufficient_privilege then null; end;
      end $$;
      reset session authorization;
      set session authorization operador_fixture;
      do $$ declare e jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'; r text;
      begin
        begin perform identidade.bootstrap_tecnico('outro','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid()); raise exception 'alvo aceito'; exception when invalid_parameter_value then null; end;
        begin perform identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid()); raise exception 'UUID ausente aceito'; exception when foreign_key_violation then null; end;
        r := identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid());
        if r <> 'inicializado' then raise exception 'falhou'; end if;
        r := identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid());
        if r <> 'ja_inicializado' then raise exception 'repetição falhou'; end if;
        begin perform identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000001',gen_random_uuid(),e,'h',e,gen_random_uuid()); raise exception 'divergência aceita'; exception when invalid_parameter_value then null; end;
      end $$;
      reset session authorization;
      do $$ begin
        if (select count(*) from auditoria.evento where operador_restrito='op_0123456789abcdef0123456789abcdef' and acao='bootstrap.tecnico') <> 2 then raise exception 'auditoria inválida'; end if;
        if has_function_privilege('anon','identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid)','execute') or has_function_privilege('service_role','identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid)','execute') then raise exception 'bootstrap exposto'; end if;
      end $$;
      update auditoria.operador_tecnico set expira_em=clock_timestamp() - interval '1 second';
      set session authorization operador_fixture;
      do $$ begin
        begin perform identidade.bootstrap_tecnico('fixture',gen_random_uuid(),gen_random_uuid(),'{}','h','{}',gen_random_uuid()); raise exception 'operador expirado aceito'; exception when insufficient_privilege then null; end;
      end $$;
      reset session authorization;
      update auditoria.operador_tecnico set ativo=false, expira_em=clock_timestamp() + interval '1 hour';
      set session authorization operador_fixture;
      do $$ begin
        begin perform identidade.bootstrap_tecnico('fixture',gen_random_uuid(),gen_random_uuid(),'{}','h','{}',gen_random_uuid()); raise exception 'operador inativo aceito'; exception when insufficient_privilege then null; end;
      end $$;`);
  } finally {
    if (started) spawnSync('pg_ctl', ['-D', data, 'stop', '-m', 'fast'], { env });
    rmSync(dir, { recursive: true, force: true });
  }
});
