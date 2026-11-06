\set ON_ERROR_STOP on
-- Executar exclusivamente em cluster local descartável criado para esta prova.
do $$ begin
 if current_database()<>'barreira_cadastro_fixture' or inet_server_addr() is not null
 or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-barreira[.][A-Za-z0-9]+$'
 or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'cluster descartável obrigatório'; end if;
end $$;
\ir ../drafts/20261106000000_barreira_cadastro_nativa_fixture.sql
create extension dblink;
insert into barreira_cadastro_fixture.ator(id) values ('a1000000-0000-4000-8000-000000000001');
create function pg_temp.esperar(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz:=clock_timestamp()+interval '5 seconds'; begin loop
 perform pg_stat_clear_snapshot();
 if exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
 if clock_timestamp()>prazo then raise exception 'lock não observado'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),current_user));
select pid as backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
select dblink_exec('outra','set statement_timeout=10000');
-- Barreira vazia vence reserva em trânsito.
begin;
do $$ begin if barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',1,null,'c1000000-0000-4000-8000-000000000001')<>'vazia' then raise exception 'barreira'; end if; end $$;
select dblink_send_query('outra',$$select barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000001',1,'b1000000-0000-4000-8000-000000000001')$$);
select pg_temp.esperar(:backend);
commit;
do $$ declare x text; begin select resultado into x from dblink_get_result('outra') as t(resultado text); if x<>'epoca_antiga' then raise exception 'reserva tardia: %',x; end if; end $$;
select * from dblink_get_result('outra') as t(resultado text);
-- Reserva confirmada mesmo se resposta for perdida; cancelamento vence criação atrasada.
do $$ begin if barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000001',2,'b1000000-0000-4000-8000-000000000002')<>'aberta' then raise exception 'reserva'; end if; end $$;
begin;
do $$ begin if barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',2,'b1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002')<>'cancelada' then raise exception 'cancelamento'; end if; end $$;
select dblink_send_query('outra',$$select barreira_cadastro_fixture.criar('a1000000-0000-4000-8000-000000000001',2,'b1000000-0000-4000-8000-000000000002')$$);
select pg_temp.esperar(:backend);
commit;
do $$ declare x text; begin select resultado into x from dblink_get_result('outra') as t(resultado text); if x<>'negada' or exists(select 1 from barreira_cadastro_fixture.efeito) then raise exception 'criação tardia'; end if; end $$;
select * from dblink_get_result('outra') as t(resultado text);
-- Criação vence encerramento; resposta perdida é recuperada pelo recibo.
do $$ begin if barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000001',3,'b1000000-0000-4000-8000-000000000003')<>'aberta' then raise exception 'abertura negada'; end if; end $$;
begin;
do $$ begin if barreira_cadastro_fixture.criar('a1000000-0000-4000-8000-000000000001',3,'b1000000-0000-4000-8000-000000000003')<>'confirmada' then raise exception 'criação negada'; end if; end $$;
select dblink_send_query('outra',$$select barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',3,'b1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003')$$);
select pg_temp.esperar(:backend);
commit;
do $$ declare x text; begin select resultado into x from dblink_get_result('outra') as t(resultado text); if x<>'confirmada' then raise exception 'resultado perdido'; end if; end $$;
select * from dblink_get_result('outra') as t(resultado text);
do $$ begin if barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000001',4,'b1000000-0000-4000-8000-000000000004')<>'aberta' then raise exception 'abertura seguinte negada'; end if; end $$;
do $$ begin
 if barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',3,'b1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003')<>'confirmada'
 or (select atual from barreira_cadastro_fixture.ator limit 1)<>'b1000000-0000-4000-8000-000000000004' then raise exception 'recibo alterou operação seguinte'; end if;
end $$;
-- Abertura vence barreira vazia, que deve conflitar sem cancelar a reserva.
do $$ begin if barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',4,'b1000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000004')<>'cancelada' then raise exception 'preparo'; end if; end $$;
begin;
do $$ begin if barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000001',5,'b1000000-0000-4000-8000-000000000005')<>'aberta' then raise exception 'reserva'; end if; end $$;
select dblink_send_query('outra',$$select barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',5,null,'c1000000-0000-4000-8000-000000000005')$$);
select pg_temp.esperar(:backend);
commit;
do $$ declare x text; begin
 select resultado into x from dblink_get_result('outra') as t(resultado text);
 if x<>'conflito' or not exists(select 1 from barreira_cadastro_fixture.ator a join barreira_cadastro_fixture.reserva r on r.id=a.atual where a.epoca=5 and r.id='b1000000-0000-4000-8000-000000000005' and r.estado='aberta') then raise exception 'barreira apagou reserva'; end if;
end $$;
select * from dblink_get_result('outra') as t(resultado text);
-- Colisão de reserva entre atores: vencedor permanece, outro ator não muda.
do $$ declare id_recuperado uuid; begin
 select atual into id_recuperado from barreira_cadastro_fixture.ator where id='a1000000-0000-4000-8000-000000000001' and epoca=5;
 if id_recuperado is distinct from 'b1000000-0000-4000-8000-000000000005'::uuid or barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',5,id_recuperado,'c1000000-0000-4000-8000-000000000006')<>'cancelada' then raise exception 'reserva não recuperada e encerrada'; end if;
end $$;
insert into barreira_cadastro_fixture.ator(id) values ('a1000000-0000-4000-8000-000000000002');
begin;
do $$ begin if barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000001',6,'b1000000-0000-4000-8000-000000000006')<>'aberta' then raise exception 'preparo colisão'; end if; end $$;
select dblink_send_query('outra',$$select barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000002',1,'b1000000-0000-4000-8000-000000000006')$$);
select pg_temp.esperar(:backend);
commit;
do $$ declare x text; begin
 select resultado into x from dblink_get_result('outra') as t(resultado text);
 if x<>'id_reutilizado' or not exists(select 1 from barreira_cadastro_fixture.ator where id='a1000000-0000-4000-8000-000000000001' and epoca=6 and atual='b1000000-0000-4000-8000-000000000006') or not exists(select 1 from barreira_cadastro_fixture.ator where id='a1000000-0000-4000-8000-000000000002' and epoca=1 and atual is null) then raise exception 'colisão de reserva'; end if;
end $$;
select * from dblink_get_result('outra') as t(resultado text);
-- Colisão de recibo não deve deixar cancelamento nem avanço parcial.
do $$ begin
 if barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000002',1,'b1000000-0000-4000-8000-000000000007')<>'aberta' then raise exception 'preparo'; end if;
 if barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000002',1,'b1000000-0000-4000-8000-000000000007','c1000000-0000-4000-8000-000000000006')<>'id_reutilizado' then raise exception 'colisão recibo'; end if;
 if not exists(select 1 from barreira_cadastro_fixture.ator a join barreira_cadastro_fixture.reserva r on r.id=a.atual where a.id='a1000000-0000-4000-8000-000000000002' and a.epoca=1 and r.estado='aberta') or (select count(*) from barreira_cadastro_fixture.efeito)<>1 or not exists(select 1 from barreira_cadastro_fixture.efeito where reserva='b1000000-0000-4000-8000-000000000003') then raise exception 'estado alterado ou efeito incorreto'; end if;
 if barreira_cadastro_fixture.reservar('a1000000-0000-4000-8000-000000000001',3,'b1000000-0000-4000-8000-000000000003')<>'confirmada' then raise exception 'histórico não recuperado'; end if;
end $$;
create function barreira_cadastro_fixture.tentar_colisao() returns text language plpgsql as $$
begin
 return barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000002',1,'b1000000-0000-4000-8000-000000000007','c1000000-0000-4000-8000-000000000007');
exception when unique_violation then return 'colisao_revertida';
end $$;
begin;
do $$ begin if barreira_cadastro_fixture.encerrar('a1000000-0000-4000-8000-000000000001',6,'b1000000-0000-4000-8000-000000000006','c1000000-0000-4000-8000-000000000007')<>'cancelada' then raise exception 'primeiro recibo'; end if; end $$;
select dblink_send_query('outra',$$select barreira_cadastro_fixture.tentar_colisao()$$);
select pg_temp.esperar(:backend);
commit;
do $$ declare x text; begin
 select resultado into x from dblink_get_result('outra') as t(resultado text);
 if x<>'colisao_revertida' or not exists(select 1 from barreira_cadastro_fixture.ator a join barreira_cadastro_fixture.reserva r on r.id=a.atual where a.id='a1000000-0000-4000-8000-000000000002' and a.epoca=1 and r.estado='aberta') or not exists(select 1 from barreira_cadastro_fixture.recibo where id='c1000000-0000-4000-8000-000000000007' and ator='a1000000-0000-4000-8000-000000000001' and resultado='cancelada') or not exists(select 1 from barreira_cadastro_fixture.ator a join barreira_cadastro_fixture.reserva r on r.ator=a.id where a.id='a1000000-0000-4000-8000-000000000001' and a.epoca=7 and a.atual is null and r.id='b1000000-0000-4000-8000-000000000006' and r.estado='cancelada') then raise exception 'rollback da colisão falhou'; end if;
end $$;
select * from dblink_get_result('outra') as t(resultado text);
select dblink_disconnect('outra');
