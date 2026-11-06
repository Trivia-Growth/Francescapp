-- Auth e assinatura são fixtures; exercita wrapper e composição reais.
\set ON_ERROR_STOP on
\ir wrappers_privados_local.sql
update identidade.sessao set revogada_em=null;
update auth.sessions set not_after=clock_timestamp()+interval '2 seconds';
select dblink_connect('wrapper_expiracao',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),current_user));
select dblink_exec('wrapper_expiracao', $$set teste.ator='10000000-0000-4000-8000-000000000002'$$);
select dblink_exec('wrapper_expiracao', $$set teste.jwt='{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}'$$);
select pid as backend_wrapper from dblink('wrapper_expiracao','select pg_backend_pid()') as x(pid integer) \gset
begin;
select 1 from operacao.barreira_cadastro where ator_usuario_id='10000000-0000-4000-8000-000000000002' for update;
select dblink_send_query('wrapper_expiracao', $$select api.cadastro_composicao(operacao.assinar_fixture(jsonb_set(operacao.transporte_fixture('api.consultar_barreira_cadastro'),'{entrada,request_id}','"10000000-0000-4000-8000-000000000099"')))$$);
select pg_temp.esperar_bloqueio(:backend_wrapper);
select pg_sleep(2.1);
commit;
do $$
declare resposta jsonb;
begin
 select x into resposta from dblink_get_result('wrapper_expiracao') as t(x jsonb);
 if resposta is distinct from '{"ok":false,"erro":{"codigo":"sem_permissao"},"request_id":"10000000-0000-4000-8000-000000000099"}'::jsonb then raise exception 'RESPOSTA_INDEVIDA: %', resposta; end if;
 if (select count(*) from auditoria.evento where request_id='10000000-0000-4000-8000-000000000099' and resultado='negado' and acao='api.consultar_barreira_cadastro' and objeto_id is null) <> 1 then raise exception 'NEGATIVA_NAO_AUDITADA'; end if;
end $$;
select dblink_disconnect('wrapper_expiracao');

-- Suprimir a inserção da negativa deve falhar fechado.
update auth.sessions set not_after=clock_timestamp()+interval '2 seconds';
create function auditoria.suprimir_wrapper_fixture() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger suprimir_wrapper before insert on auditoria.evento for each row execute function auditoria.suprimir_wrapper_fixture();
select dblink_connect('wrapper_falha',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),current_user));
select dblink_exec('wrapper_falha', $$set teste.ator='10000000-0000-4000-8000-000000000002'$$);
select dblink_exec('wrapper_falha', $$set teste.jwt='{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}'$$);
select pid as backend_falha from dblink('wrapper_falha','select pg_backend_pid()') as x(pid integer) \gset
begin;
select 1 from operacao.barreira_cadastro where ator_usuario_id='10000000-0000-4000-8000-000000000002' for update;
select dblink_send_query('wrapper_falha', $$select api.cadastro_composicao(operacao.assinar_fixture(jsonb_set(operacao.transporte_fixture('api.consultar_barreira_cadastro'),'{entrada,request_id}','"10000000-0000-4000-8000-000000000098"')))$$);
select pg_temp.esperar_bloqueio(:backend_falha);
select pg_sleep(2.1);
commit;
do $$
declare falhou boolean:=false;
begin
 begin
  perform x from dblink_get_result('wrapper_falha') as t(x jsonb);
 exception when no_data_found then
  if sqlerrm is distinct from 'AUDITORIA_NAO_INSERIDA' then raise; end if;
  falhou:=true;
 end;
 if not falhou or exists(select 1 from auditoria.evento where request_id='10000000-0000-4000-8000-000000000098') then raise exception 'FALHA_AUDITORIA_ACEITA'; end if;
end $$;
select dblink_disconnect('wrapper_falha');
drop trigger suprimir_wrapper on auditoria.evento;
