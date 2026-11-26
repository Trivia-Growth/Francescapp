\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role;
create schema auth; create schema auth_privado; create schema operacao; create schema cadastro; create schema auditoria;
create table public.usuario(id uuid primary key);
create table cadastro.paciente(id uuid primary key);
create table auditoria.evento(id uuid primary key,ator_usuario_id uuid,acao text,tipo_objeto text,objeto_id uuid,resultado text,request_id uuid);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.ator',true),'')::uuid $$;
create function auth_privado.uid() returns uuid language sql stable as $$ select auth.uid() $$;
\ir ../migrations/20261106140000_criar_paciente_privado.sql
\ir ../migrations/20261106160000_reconciliar_cadastro.sql
insert into public.usuario values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
select set_config('teste.ator','10000000-0000-4000-8000-000000000001',false);
do $$
declare a uuid:='10000000-0000-4000-8000-000000000001'; r uuid:='20000000-0000-4000-8000-000000000001'; c uuid:='30000000-0000-4000-8000-000000000001'; q uuid:='40000000-0000-4000-8000-000000000001'; x jsonb;
begin
 if has_function_privilege('authenticated','operacao.consultar_barreira_cadastro_privado(uuid)','execute') or has_function_privilege('service_role','operacao.reconhecer_barreira_cadastro_privado(uuid,uuid)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
 x:=operacao.consultar_barreira_cadastro_privado(q);
 if x->>'epoca' is distinct from '1' then raise exception 'ESTADO_INICIAL'; end if;
 if operacao.reservar_cadastro_privado(a,1,r)<>'aberta' then raise exception 'RESERVA'; end if;
 x:=operacao.consultar_barreira_cadastro_privado(q);
 if x#>>'{reserva,id}' is distinct from r::text then raise exception 'RESERVA_NAO_RECUPERADA'; end if;
 if operacao.encerrar_cadastro_privado(a,1,r,c)<>'cancelada' then raise exception 'ENCERRAMENTO'; end if;
 x:=operacao.consultar_barreira_cadastro_privado(q);
 if x#>>'{resultado_pendente,recibo_id}' is distinct from c::text or x#>>'{resultado_pendente,resultado}' is distinct from 'cancelada' then raise exception 'RESULTADO_NAO_RECUPERADO'; end if;
 perform set_config('teste.ator','10000000-0000-4000-8000-000000000002',false);
 if operacao.reconhecer_barreira_cadastro_privado(c,q) is distinct from 'conflito' or operacao.consultar_barreira_cadastro_privado(q)->'resultado_pendente' is distinct from 'null'::jsonb then raise exception 'VAZAMENTO_OUTRO_ATOR'; end if;
 perform set_config('teste.ator',a::text,false);
 if operacao.reconhecer_barreira_cadastro_privado(c,q)<>'reconhecido' or operacao.reconhecer_barreira_cadastro_privado(c,q)<>'reconhecido' then raise exception 'RECONHECIMENTO'; end if;
 if operacao.reservar_cadastro_privado(a,2,'20000000-0000-4000-8000-000000000002')<>'aberta' then raise exception 'BLOQUEIO_NAO_LIBERADO'; end if;
 if operacao.reconhecer_barreira_cadastro_privado(c,q)<>'reconhecido' or (select reserva_atual from operacao.barreira_cadastro where ator_usuario_id=a) is distinct from '20000000-0000-4000-8000-000000000002'::uuid then raise exception 'RETRY_ALTEROU_RESERVA_NOVA'; end if;
end $$;
create extension dblink;
create function pg_temp.esperar_bloqueio(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz:=clock_timestamp()+interval '5 seconds'; begin loop
 perform pg_stat_clear_snapshot();
 if exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
 if clock_timestamp()>prazo then raise exception 'BLOQUEIO_NAO_OBSERVADO'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
insert into public.usuario values ('10000000-0000-4000-8000-000000000003');
select set_config('teste.ator','10000000-0000-4000-8000-000000000003',false);
select dblink_connect('outra',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),current_user));
select dblink_exec('outra', $$set teste.ator='10000000-0000-4000-8000-000000000003'$$);
select dblink_exec('outra','set statement_timeout=10000');
select pid as backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
-- Primeira reserva ainda não confirmada: consulta não pode retornar barreira vazia.
begin;
do $$ begin if operacao.reservar_cadastro_privado(auth.uid(),1,'20000000-0000-4000-8000-000000000004')<>'aberta' then raise exception 'RESERVA_INICIAL'; end if; end $$;
select dblink_send_query('outra',$$select operacao.consultar_barreira_cadastro_privado('40000000-0000-4000-8000-000000000001')$$);
select pg_temp.esperar_bloqueio(:backend);
commit;
do $$ declare x jsonb; begin
 select resultado into x from dblink_get_result('outra') as t(resultado jsonb);
 if x#>>'{reserva,id}' is distinct from '20000000-0000-4000-8000-000000000004' then raise exception 'CONSULTA_PREMATURA'; end if;
end $$;
select * from dblink_get_result('outra') as t(resultado jsonb);
-- Reconhecimento e nova reserva são serializados pela mesma linha.
select operacao.encerrar_cadastro_privado(auth.uid(),1,'20000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004');
-- Fixture reproduz somente guarda de barreira da criação, não a função de produção.
create table operacao.efeito_fixture(id uuid primary key);
create function operacao.criar_atrasado_fixture(p_reserva uuid,p_epoca bigint) returns text language plpgsql as $$
declare b operacao.barreira_cadastro; r operacao.reserva_cadastro; begin
 select * into b from operacao.barreira_cadastro where ator_usuario_id=auth.uid() for update;
 select * into r from operacao.reserva_cadastro where id=p_reserva and ator_usuario_id=auth.uid() and epoca=p_epoca for update;
 if not found or b.epoca is distinct from p_epoca or b.reserva_atual is distinct from p_reserva or b.resultado_pendente is not null or r.estado not in ('aberta','confirmada') then return 'negada'; end if;
 insert into operacao.efeito_fixture values(p_reserva);
 return 'criada';
end $$;
begin;
do $$ begin if operacao.reconhecer_barreira_cadastro_privado('30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001')<>'reconhecido' then raise exception 'RECONHECIMENTO_CONCORRENTE'; end if; end $$;
select dblink_send_query('outra',$$select operacao.criar_atrasado_fixture('20000000-0000-4000-8000-000000000004',1)$$);
select pg_temp.esperar_bloqueio(:backend);
commit;
do $$ declare x text; begin
 select resultado into x from dblink_get_result('outra') as t(resultado text);
 if x is distinct from 'negada' or exists(select 1 from operacao.efeito_fixture) then raise exception 'CRIACAO_ATRASADA'; end if;
end $$;
select * from dblink_get_result('outra') as t(resultado text);
-- Outra transação mantém o bloqueio até reconhecimento confirmado.
begin;
do $$ begin if operacao.reconhecer_barreira_cadastro_privado('30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001')<>'reconhecido' then raise exception 'RETRY_CONCORRENTE'; end if; end $$;
select dblink_send_query('outra',$$select operacao.reservar_cadastro_privado(auth.uid(),2,'20000000-0000-4000-8000-000000000005')$$);
select pg_temp.esperar_bloqueio(:backend);
commit;
do $$ declare x text; begin
 select resultado into x from dblink_get_result('outra') as t(resultado text);
 if x is distinct from 'aberta' then raise exception 'NOVA_RESERVA_NAO_ABERTA'; end if;
 if exists(select 1 from operacao.barreira_cadastro b join operacao.reserva_cadastro r on r.id=b.reserva_atual where b.ator_usuario_id=auth.uid() and b.epoca=1 and r.id='20000000-0000-4000-8000-000000000004' and r.estado='aberta') then raise exception 'GUARDA_CRIACAO_ATRASADA'; end if;
end $$;
select * from dblink_get_result('outra') as t(resultado text);
select dblink_disconnect('outra');
-- Simula criação confirmada; criação real e autorização de sessão são testadas separadamente.
insert into cadastro.paciente values ('50000000-0000-4000-8000-000000000001');
select set_config('teste.ator','10000000-0000-4000-8000-000000000002',false);
do $$ declare a uuid:=auth.uid(); r uuid:='20000000-0000-4000-8000-000000000003'; c uuid:='30000000-0000-4000-8000-000000000003'; q uuid:='40000000-0000-4000-8000-000000000001'; x jsonb; begin
 if operacao.reservar_cadastro_privado(a,1,r)<>'aberta' then raise exception 'RESERVA_CONFIRMADA'; end if;
 update operacao.reserva_cadastro set estado='confirmada',chave_idempotencia='chave',digest_idempotencia='digest',paciente_id='50000000-0000-4000-8000-000000000001' where id=r;
 if operacao.encerrar_cadastro_privado(a,1,r,c)<>'confirmada' then raise exception 'ENCERRAMENTO_CONFIRMADO'; end if;
 x:=operacao.consultar_barreira_cadastro_privado(q);
 if x#>>'{resultado_pendente,paciente_id}' is distinct from '50000000-0000-4000-8000-000000000001' or x#>>'{resultado_pendente,resultado}' is distinct from 'confirmada' then raise exception 'PACIENTE_NAO_RECUPERADO'; end if;
end $$;
-- Falha de auditoria também reverte a criação da primeira barreira na consulta.
insert into public.usuario values ('10000000-0000-4000-8000-000000000004');
select set_config('teste.ator','10000000-0000-4000-8000-000000000004',false);
alter table auditoria.evento add constraint falhar_consulta check (acao <> 'api.consultar_barreira_cadastro') not valid;
do $$ begin
 begin
  perform operacao.consultar_barreira_cadastro_privado('40000000-0000-4000-8000-000000000001');
  raise exception 'AUDITORIA_CONSULTA_NAO_FALHOU';
 exception when check_violation then null; end;
 if exists(select 1 from operacao.barreira_cadastro where ator_usuario_id=auth.uid()) then raise exception 'BARREIRA_NAO_REVERTIDA'; end if;
end $$;
select set_config('teste.ator','10000000-0000-4000-8000-000000000001',false);
-- Falha de auditoria deve reverter a liberação do bloqueio.
select operacao.encerrar_cadastro_privado('10000000-0000-4000-8000-000000000001',2,'20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');
alter table auditoria.evento add constraint falhar_auditoria check (acao <> 'api.reconhecer_barreira_cadastro') not valid;
do $$ begin
 begin
  perform operacao.reconhecer_barreira_cadastro_privado('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001');
  raise exception 'AUDITORIA_NAO_FALHOU';
 exception when check_violation then null; end;
 if (select resultado_pendente from operacao.barreira_cadastro where ator_usuario_id=auth.uid()) is distinct from '30000000-0000-4000-8000-000000000002'::uuid then raise exception 'ROLLBACK_FALHOU'; end if;
end $$;
