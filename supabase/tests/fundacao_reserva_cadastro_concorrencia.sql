-- Somente clone dedicado; as transações gravam apenas fixtures e fazem COMMIT.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'ffcm_reserva_race_20261031_01' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
   or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone local obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
create extension dblink;
insert into reserva_fixture.ator(id) values('a1000000-0000-4000-8000-000000000001');
select reserva_fixture.abrir('a1000000-0000-4000-8000-000000000001',1,'a2000000-0000-4000-8000-000000000001');
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
-- Fechamento vence; tentativa atrasada deve esperar e não produzir efeito.
begin;
do $$ begin if reserva_fixture.fechar('a1000000-0000-4000-8000-000000000001',1,'a2000000-0000-4000-8000-000000000001')<>'cancelada' then raise exception 'fechamento negado'; end if; end $$;
select dblink_send_query('outra',$$select reserva_fixture.confirmar('a1000000-0000-4000-8000-000000000001',1,'a2000000-0000-4000-8000-000000000001')$$);
select pg_temp.espera_lock(:ffcm_backend);
commit;
do $$ declare r boolean; begin
 select resultado into r from dblink_get_result('outra') as x(resultado boolean);
 if r is distinct from false or exists(select 1 from reserva_fixture.efeito) then raise exception 'efeito após cancelamento'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado boolean);
-- Confirmação vence; fechamento observa resultado e não cancela efeito.
select reserva_fixture.abrir('a1000000-0000-4000-8000-000000000001',2,'a2000000-0000-4000-8000-000000000002');
begin;
do $$ begin if reserva_fixture.confirmar('a1000000-0000-4000-8000-000000000001',2,'a2000000-0000-4000-8000-000000000002') is not true then raise exception 'efeito negado'; end if; end $$;
select dblink_send_query('outra',$$select reserva_fixture.fechar('a1000000-0000-4000-8000-000000000001',2,'a2000000-0000-4000-8000-000000000002')$$);
select pg_temp.espera_lock(:ffcm_backend);
commit;
do $$ declare r text; begin
 select resultado into r from dblink_get_result('outra') as x(resultado text);
 if r is distinct from 'confirmada' or (select count(*) from reserva_fixture.efeito)<>1 then raise exception 'fechamento não reconheceu efeito'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado text);
-- Uma tentativa de reserva da geração antiga que aguarda o fechamento é negada.
select reserva_fixture.abrir('a1000000-0000-4000-8000-000000000001',3,'a2000000-0000-4000-8000-000000000003');
begin;
do $$ begin if reserva_fixture.fechar('a1000000-0000-4000-8000-000000000001',3,'a2000000-0000-4000-8000-000000000003')<>'cancelada' then raise exception 'fechamento negado'; end if; end $$;
select dblink_send_query('outra',$$select reserva_fixture.abrir('a1000000-0000-4000-8000-000000000001',3,'a2000000-0000-4000-8000-000000000004')$$);
select pg_temp.espera_lock(:ffcm_backend);
commit;
do $$ declare r text; begin
 select resultado into r from dblink_get_result('outra') as x(resultado text);
 if r is distinct from 'geracao_antiga' or exists(select 1 from reserva_fixture.reserva where id='a2000000-0000-4000-8000-000000000004') then raise exception 'reserva antiga foi aceita'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado text);
-- Atores diferentes não compartilham lock de ator: a PK também deve cercar
-- uma colisão simultânea de UUID sem escapar com erro ou abrir duas reservas.
insert into reserva_fixture.ator(id) values('a1000000-0000-4000-8000-000000000002');
begin;
do $$ begin
 if reserva_fixture.abrir('a1000000-0000-4000-8000-000000000001',4,'a2000000-0000-4000-8000-000000000005')<>'aberta' then raise exception 'primeira reserva negada'; end if;
end $$;
select dblink_send_query('outra',$$select reserva_fixture.abrir('a1000000-0000-4000-8000-000000000002',1,'a2000000-0000-4000-8000-000000000005')$$);
select pg_temp.espera_lock(:ffcm_backend);
commit;
do $$ declare r text; begin
 select resultado into r from dblink_get_result('outra') as x(resultado text);
 if r is distinct from 'id_reutilizado' or (select count(*) from reserva_fixture.reserva where id='a2000000-0000-4000-8000-000000000005')<>1
   or (select atual from reserva_fixture.ator where id='a1000000-0000-4000-8000-000000000002') is not null then
   raise exception 'colisão entre atores não foi rejeitada com segurança';
 end if;
end $$;
select * from dblink_get_result('outra') as x(resultado text);
select dblink_disconnect('outra');
