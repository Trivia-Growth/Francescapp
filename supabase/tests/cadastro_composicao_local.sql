\set ON_ERROR_STOP on
\ir criar_paciente_privado_local.sql
\ir ../migrations/20261106160000_reconciliar_cadastro.sql
\ir ../migrations/20261106170000_cadastro_composicao.sql
update identidade.sessao set revogada_em=null;
create function operacao.transporte_fixture(acao text, epoca bigint default null, reserva uuid default null, comando uuid default null) returns jsonb language sql as $$
 select jsonb_build_object('entrada',jsonb_strip_nulls(jsonb_build_object('request_id',gen_random_uuid(),'operacao',acao,'epoca',epoca,'reserva_id',reserva,'comando_id',comando)), 'entrada_canonica','{}','dados_canonicos','{}')
$$;
create function operacao.assinar_fixture(t jsonb) returns jsonb language plpgsql as $$
begin
 return jsonb_set(t,'{entrada,atestado}',jsonb_build_object('usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',t#>>'{entrada,request_id}','operacao',t#>>'{entrada,operacao}','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','mac','valido'));
end $$;
-- A segunda conexão espera na barreira até o atestado expirar.
update identidade.sessao set revogada_em=null;
create extension dblink;
create function operacao.reserva_expirada_fixture() returns text language plpgsql as $$
declare t jsonb;
begin
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.reservar_cadastro',2, '20000000-0000-4000-8000-000000000099'));
 t:=jsonb_set(t,'{entrada,atestado,expira_em}',to_jsonb(clock_timestamp()+interval '1 second'));
 begin
  perform operacao.cadastro_composicao_privada(t);
  return 'aceita';
 exception when sqlstate 'PZ001' then
  if sqlerrm is distinct from 'EXPIRACAO_INTERNA' then raise; end if;
  return 'negada';
 end;
end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),current_user));
select dblink_exec('outra', $$set teste.ator='10000000-0000-4000-8000-000000000002'$$);
select dblink_exec('outra', $$set teste.jwt='{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}'$$);
select pid as backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
create function pg_temp.esperar_bloqueio(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz:=clock_timestamp()+interval '5 seconds'; begin loop
 perform pg_stat_clear_snapshot();
 exit when exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid)));
 if clock_timestamp()>prazo then raise exception 'BLOQUEIO_NAO_OBSERVADO'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
begin;
select 1 from operacao.barreira_cadastro where ator_usuario_id=auth.uid() for update;
select dblink_send_query('outra','select operacao.reserva_expirada_fixture()');
select pg_temp.esperar_bloqueio(:backend);
select pg_sleep(1.2);
commit;
do $$ declare resultado text; begin
 select x into resultado from dblink_get_result('outra') as t(x text);
 if resultado is distinct from 'negada' or exists(select 1 from operacao.reserva_cadastro where id='20000000-0000-4000-8000-000000000099') then raise exception 'ATESTADO_EXPIRADO_ACEITO'; end if;
end $$;
select dblink_disconnect('outra');
do $$
#variable_conflict use_variable
declare t jsonb; x jsonb; e jsonb; paciente uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); recibo uuid:=gen_random_uuid();
begin
 if has_function_privilege('authenticated','operacao.cadastro_composicao_privada(jsonb)','execute') or has_function_privilege('service_role','operacao.cadastro_composicao_privada(jsonb)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
 -- Encerra resultado da fixture anterior para iniciar nova época.
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.encerrar_cadastro',1,'20000000-0000-4000-8000-000000000010',recibo));
 x:=operacao.cadastro_composicao_privada(t);
 if x#>>'{dados,estado}' is distinct from 'confirmada' then raise exception 'ENCERRAMENTO: %',x; end if;
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.reconhecer_barreira_cadastro',null,null,recibo));
 if operacao.cadastro_composicao_privada(t)#>>'{dados,estado}' is distinct from 'reconhecido' then raise exception 'RECONHECIMENTO'; end if;
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.reservar_cadastro',2,reserva));
 update public.usuario set perfil='profissional' where id=auth.uid();
 if operacao.cadastro_composicao_privada(t)#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
 update public.usuario set perfil='familia' where id=auth.uid();
 if operacao.cadastro_composicao_privada(t)#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_ACEITA'; end if;
 update public.usuario set perfil='administrador' where id=auth.uid();
 create trigger falha before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
 begin
  perform operacao.cadastro_composicao_privada(t);
  raise exception 'AUDITORIA_IGNORADA';
 exception when raise_exception then if sqlerrm <> 'AUDITORIA_FIXTURE' then raise; end if; end;
 drop trigger falha on auditoria.evento;
 if exists(select 1 from operacao.reserva_cadastro where id=reserva) then raise exception 'RESERVA_NAO_REVERTIDA'; end if;
 if operacao.cadastro_composicao_privada(t)#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA'; end if;
 -- Repetição simula resposta perdida da reserva.
 if operacao.cadastro_composicao_privada(t)#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'REPETICAO_RESERVA'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'reserva_id',reserva,'geracao_reserva',2,'auditoria_id',gen_random_uuid(),'chave_idempotencia','nova-chave','digest_idempotencia',repeat('a',43),
  'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1)));
 e:=e||jsonb_build_object('atestado',jsonb_build_object('usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao','api.criar_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','mac','valido'));
 t:=jsonb_build_object('entrada',e,'entrada_canonica','{}','dados_canonicos','{}');
 if operacao.criar_paciente_privado(t)->>'ok' is distinct from 'true' then raise exception 'CRIACAO'; end if;
 if operacao.criar_paciente_privado(t)->>'ok' is distinct from 'true' then raise exception 'REPETICAO_CRIACAO'; end if;
 x:=operacao.cadastro_composicao_privada(operacao.assinar_fixture(operacao.transporte_fixture('api.consultar_barreira_cadastro')));
 if x#>>'{dados,reserva,estado}' is distinct from 'confirmada' or (select count(*) from cadastro.paciente where id=paciente)<>1 then raise exception 'RECONCILIACAO'; end if;
 update identidade.sessao set revogada_em=clock_timestamp();
 if operacao.cadastro_composicao_privada(operacao.assinar_fixture(operacao.transporte_fixture('api.consultar_barreira_cadastro')))#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO'; end if;
end $$;
