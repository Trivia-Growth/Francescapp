-- Apenas clone descartável dedicado. Commits incluem roles e eventos fictícios.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'ffcm_operador_race_20261029_01' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
   or current_setting('data_directory') <> current_setting('unix_socket_directories') || '/data' then
   raise exception 'clone local descartável obrigatório';
 end if;
end $$;
\ir ../drafts/20261102190000_operador_auditoria_experimento.sql
create extension dblink;
create role ffcm_operador_race_fixture login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema auditoria to ffcm_operador_race_fixture;
grant insert(id,operador_restrito,acao,tipo_objeto,resultado,request_id) on auditoria.evento to ffcm_operador_race_fixture;
insert into auditoria.operador_fixture(codigo,papel_oid,ativo) values('race_fixture','ffcm_operador_race_fixture'::regrole::oid,true);
create function auditoria.inserir_operador_race_fixture(p_id uuid) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
 insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
 values(p_id,'race_fixture','teste','fixture','permitido',gen_random_uuid());
 return true;
exception when insufficient_privilege then
 if sqlerrm<>'OPERADOR_NAO_AUTORIZADO' then raise; end if;
 return false;
end $$;
revoke all on function auditoria.inserir_operador_race_fixture(uuid) from public,anon,authenticated;
grant execute on function auditoria.inserir_operador_race_fixture(uuid) to ffcm_operador_race_fixture;
create function pg_temp.espera_lock(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz:=clock_timestamp()+interval '3 seconds'; begin loop
 perform pg_stat_clear_snapshot();
 if exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
 if clock_timestamp()>=prazo then raise exception 'bloqueio não observado'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select pid as ffcm_backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
select dblink_exec('outra','set statement_timeout=30000');
select dblink_exec('outra','set lock_timeout=10000');
select dblink_exec('outra','set session authorization ffcm_operador_race_fixture');
-- Desativação primeiro: inserção espera e depois nega.
begin;
update auditoria.operador_fixture set ativo=false where codigo='race_fixture';
select dblink_send_query('outra',$$select auditoria.inserir_operador_race_fixture('91000000-0000-4000-8000-000000000021')$$);
select pg_temp.espera_lock(:ffcm_backend);
commit;
do $$ declare r boolean; begin
 select resultado into r from dblink_get_result('outra') as x(resultado boolean);
 if r is distinct from false or exists(select 1 from auditoria.evento where id='91000000-0000-4000-8000-000000000021') then raise exception 'evento admitido após desativação'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado boolean);
select dblink_exec('outra','reset session authorization');
-- Reativação exclusiva da fixture, em clone descartável, entre cenários.
update auditoria.operador_fixture set ativo=true where codigo='race_fixture';
-- Inserção primeiro: desativação espera o commit, não altera o evento passado.
begin;
set local session authorization ffcm_operador_race_fixture;
select auditoria.inserir_operador_race_fixture('91000000-0000-4000-8000-000000000022');
reset session authorization;
select dblink_send_query('outra',$$update auditoria.operador_fixture set ativo=false where codigo='race_fixture' returning ativo$$);
select pg_temp.espera_lock(:ffcm_backend);
commit;
do $$ declare r boolean; begin
 select resultado into r from dblink_get_result('outra') as x(resultado boolean);
 if r is distinct from false or not exists(select 1 from auditoria.evento where id='91000000-0000-4000-8000-000000000022' and operador_restrito='race_fixture') then raise exception 'sequência inserção-desativação incorreta'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado boolean);
select dblink_disconnect('outra');
