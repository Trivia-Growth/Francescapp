-- Apenas clone descartável. Há COMMITs de dados fictícios para dblink.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'ffcm_desafio_owner_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
 if exists(select 1 from pg_roles where rolname in ('ffcm_desafio_owner_fixture','ffcm_desafio_executor_fixture')) then raise exception 'papel preexistente'; end if;
end $$;
\ir ../drafts/20261031120000_desafio_google.sql
\ir ../drafts/20261104200000_desafio_google_owner_fixture.sql
create extension dblink;
do $$ declare papel text; coluna text; begin
 foreach papel in array array['anon','authenticated','ffcm_desafio_executor_fixture'] loop
  if has_table_privilege(papel,'identidade.desafio_login','select,insert,update,delete')
   or pg_has_role(papel,'ffcm_desafio_owner_fixture','member') then raise exception 'acesso direto indevido'; end if;
  for coluna in select attname from pg_attribute where attrelid='identidade.desafio_login'::regclass and attnum>0 and not attisdropped loop
   if has_column_privilege(papel,'identidade.desafio_login',coluna,'select,insert,update,references') then raise exception 'acesso por coluna indevido'; end if;
  end loop;
 end loop;
 if exists(select 1 from pg_roles where rolname='ffcm_desafio_owner_fixture' and (rolcanlogin or rolsuper or rolbypassrls)) then raise exception 'owner privilegiado'; end if;
 if not has_function_privilege('ffcm_desafio_executor_fixture','identidade.registrar_desafio_google(uuid,text,timestamptz)','execute')
 or not has_function_privilege('ffcm_desafio_executor_fixture','identidade.consumir_desafio_google(uuid,text)','execute')
 or has_function_privilege('anon','identidade.registrar_desafio_google(uuid,text,timestamptz)','execute')
 or has_function_privilege('anon','identidade.consumir_desafio_google(uuid,text)','execute')
 or has_function_privilege('authenticated','identidade.registrar_desafio_google(uuid,text,timestamptz)','execute')
 or has_function_privilege('authenticated','identidade.consumir_desafio_google(uuid,text)','execute')
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='identidade'
   and has_function_privilege('ffcm_desafio_executor_fixture',p.oid,'execute')
   and p.oid not in ('identidade.registrar_desafio_google(uuid,text,timestamptz)'::regprocedure,'identidade.consumir_desafio_google(uuid,text)'::regprocedure)) then raise exception 'grants incorretos'; end if;
end $$;
set role ffcm_desafio_executor_fixture;
do $$ begin
 begin perform id from identidade.desafio_login; raise exception 'leitura direta aceita'; exception when insufficient_privilege then null; end;
 perform identidade.registrar_desafio_google('d1000000-0000-4000-8000-000000000001',repeat('a',64),clock_timestamp()+interval '1 minute');
 if identidade.consumir_desafio_google('d1000000-0000-4000-8000-000000000001',repeat('b',64)) is not false then raise exception 'hash incorreto aceito'; end if;
end $$;
reset role;
create function pg_temp.esperar_lock(pid_esperado integer) returns void language plpgsql as $$
declare limite timestamptz:=clock_timestamp()+interval '3 seconds'; begin loop
 perform pg_stat_clear_snapshot();
 if exists(select 1 from pg_stat_activity where pid=pid_esperado and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
 if clock_timestamp()>=limite then raise exception 'bloqueio não observado'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select pid as backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
select dblink_exec('outra','set statement_timeout=30000');
select dblink_exec('outra','set lock_timeout=10000');
select dblink_exec('outra','set role ffcm_desafio_executor_fixture');
begin;
set local role ffcm_desafio_executor_fixture;
do $$ begin if identidade.consumir_desafio_google('d1000000-0000-4000-8000-000000000001',repeat('a',64)) is not true then raise exception 'primeiro consumo negado'; end if; end $$;
reset role;
select dblink_send_query('outra',$$select identidade.consumir_desafio_google('d1000000-0000-4000-8000-000000000001',repeat('a',64))$$);
select pg_temp.esperar_lock(:backend);
commit;
do $$ declare r boolean; begin select resultado into r from dblink_get_result('outra') as x(resultado boolean); if r is distinct from false then raise exception 'consumo duplicado aceito'; end if; end $$;
select * from dblink_get_result('outra') as x(resultado boolean);
-- Simula policy permissiva futura coexistente: a restritiva deve prevalecer.
create policy desafio_fixture_ampla_teste on identidade.desafio_login for update to ffcm_desafio_owner_fixture using (true) with check (true);
set role ffcm_desafio_owner_fixture;
do $$ begin
 begin
  update identidade.desafio_login set consumido_em=null where id='d1000000-0000-4000-8000-000000000001';
  if found then raise exception 'desafio reaberto com policy ampla'; end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin if not exists(select 1 from identidade.desafio_login where id='d1000000-0000-4000-8000-000000000001' and consumido_em is not null) then raise exception 'consumo foi apagado'; end if; end $$;
select dblink_disconnect('outra');
