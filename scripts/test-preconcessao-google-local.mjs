import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('pré-concessão exige operador e registra auditoria atomicamente', () => {
  const dir = mkdtempSync('/tmp/ffcm-preconcessao.');
  const env = {
    PATH: process.env.PATH,
    PGHOST: dir,
    PGPORT: '55412',
    PGDATABASE: 'postgres',
    LC_ALL: 'C',
  };
  const run = (cmd, args, input) => {
    const r = spawnSync('rtk', ['proxy', cmd, ...args], { env, input, encoding: 'utf8' });
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
    return r.stdout;
  };
  const sql = (input) => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], input);
  const file = (path) => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path]);
  let started = false;
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-instructions']);
    run('pg_ctl', [
      '-D',
      join(dir, 'data'),
      '-l',
      join(dir, 'log'),
      '-o',
      `-c listen_addresses='' -k ${dir} -p 55412`,
      'start',
    ]);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role; create role operador_fixture login; create role outro_fixture login;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('51000000-0000-4000-8000-000000000001');`);
    file('supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql');
    sql(
      'alter table public.usuario enable row level security; alter table identidade.concessao_equipe enable row level security; alter table auditoria.evento enable row level security;',
    );
    sql(
      readFileSync('supabase/migrations/20261110120000_admissao_tecnica_nativa.sql', 'utf8').split(
        'grant select (usuario_id',
      )[0],
    );
    file('supabase/migrations/20261110170000_operador_tecnico.sql');
    file('supabase/migrations/20261110180000_bootstrap_tecnico.sql');
    sql(`alter table auditoria.operador_tecnico add column tipo text not null default 'individual', add column expira_em timestamptz, add column posse_ativa text;
      create table identidade.configuracao_auth_nativo(singleton boolean, dominio_workspace text, google_unico_oauth_confirmado boolean);
      alter table identidade.configuracao_auth_nativo enable row level security;
      insert into identidade.configuracao_auth_nativo values (true,'francescato.com.br',true);
      insert into auditoria.operador_tecnico(codigo,papel_oid,papel_nome,ativo,tipo,expira_em,posse_ativa) values ('op_0123456789abcdef0123456789abcdef','operador_fixture'::regrole::oid,'operador_fixture',true,'servico_teste',clock_timestamp() + interval '1 hour',repeat('a',64));
      insert into public.usuario(id,perfil) values ('51000000-0000-4000-8000-000000000001','administrador');
      insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,motivo_cifrado,vinculada_em) values ('52000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','bootstrap','administrador','tecnica','vinculada','51000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp() + interval '1 second');
      insert into identidade.bootstrap_tecnico_controle(unico,projeto_ref,usuario_id,concessao_id) values (true,'drdpuxcllpymtoskmuqv','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001');`);
    file('supabase/drafts/20261116100000_preconcessao_google_teste.sql');
    file('supabase/drafts/20261116120000_preconcessao_request_unico.sql');
    sql(`insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id) values (gen_random_uuid(),'op_0123456789abcdef0123456789abcdef','preconcessao_teste.autorizada','operacao','permitido','54000000-0000-4000-8000-000000000002');
      create function auditoria.fixture_falhar() returns trigger language plpgsql as $$ begin raise exception 'FALHA_AUDITORIA'; end $$;
      create trigger fixture_falha before insert on auditoria.evento for each row execute function auditoria.fixture_falhar();
      grant usage on schema identidade to operador_fixture, outro_fixture;
      grant execute on function identidade.preconcessao_google_teste(text,uuid,jsonb,text,text,jsonb,uuid) to operador_fixture, outro_fixture;
      set session authorization outro_fixture;
      do $$ begin
        begin perform identidade.preconcessao_google_teste('drdpuxcllpymtoskmuqv',gen_random_uuid(),'{}','h','administrador','{}',gen_random_uuid()); raise exception 'operador não cadastrado aceito'; exception when insufficient_privilege then null; end;
      end $$;
      reset session authorization;
      set session authorization operador_fixture;
      do $$ begin
        begin perform identidade.preconcessao_google_teste('drdpuxcllpymtoskmuqv','53000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','falha-hmac','administrador','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','54000000-0000-4000-8000-000000000002'); raise exception 'falha de auditoria aceita'; exception when raise_exception then if SQLERRM <> 'FALHA_AUDITORIA' then raise; end if; end;
      end $$;
      reset session authorization;
      do $$ begin if exists (select 1 from identidade.concessao_equipe where id='53000000-0000-4000-8000-000000000002') then raise exception 'rollback ausente'; end if; end $$;
      drop trigger fixture_falha on auditoria.evento;
      insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id) values (gen_random_uuid(),'op_0123456789abcdef0123456789abcdef','preconcessao_teste.autorizada','operacao','permitido','54000000-0000-4000-8000-000000000001');
      set session authorization operador_fixture;
      select identidade.preconcessao_google_teste('drdpuxcllpymtoskmuqv','53000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','google-hmac','administrador','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','54000000-0000-4000-8000-000000000001');
      do $$ begin
        begin perform identidade.preconcessao_google_teste('drdpuxcllpymtoskmuqv',gen_random_uuid(),'{}','outro','administrador','{}','54000000-0000-4000-8000-000000000001'); raise exception 'request reutilizado'; exception when unique_violation then null; end;
        begin perform identidade.preconcessao_google_teste('drdpuxcllpymtoskmuqv',gen_random_uuid(),'{}','outro','administrador','{}',gen_random_uuid()); raise exception 'request não autorizado'; exception when insufficient_privilege then null; end;
      end $$;
      reset session authorization;
      do $$ begin
        if (select count(*) from identidade.concessao_equipe where id='53000000-0000-4000-8000-000000000001' and metodo='google_workspace' and estado='pendente') <> 1 or (select count(*) from auditoria.evento where objeto_id='53000000-0000-4000-8000-000000000001' and acao='teste.preconcessao_google' and operador_restrito='op_0123456789abcdef0123456789abcdef' and request_id='54000000-0000-4000-8000-000000000001') <> 1 then raise exception 'concessão ou auditoria ausente'; end if;
      end $$;`);
  } finally {
    if (started)
      spawnSync('rtk', ['proxy', 'pg_ctl', '-D', join(dir, 'data'), 'stop', '-m', 'fast'], { env });
    rmSync(dir, { recursive: true, force: true });
  }
});
