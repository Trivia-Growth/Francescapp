-- Verifica expiração durante espera; assinatura e bloqueio Auth são fictícios.
\set ON_ERROR_STOP on
\ir cadastro_composicao_local.sql
update identidade.sessao set revogada_em=null;
update auth.sessions set not_after=clock_timestamp()+interval '2 seconds';
select dblink_connect('expiracao',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),current_user));
select dblink_exec('expiracao', $$set teste.ator='10000000-0000-4000-8000-000000000002'$$);
select dblink_exec('expiracao', $$set teste.jwt='{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]} ' $$);
select pid as backend_expiracao from dblink('expiracao','select pg_backend_pid()') as x(pid integer) \gset
begin;
select 1 from operacao.barreira_cadastro where ator_usuario_id=auth.uid() for update;
select dblink_send_query('expiracao', $$select operacao.cadastro_composicao_privada(operacao.assinar_fixture(operacao.transporte_fixture('api.consultar_barreira_cadastro')))$$);
select pg_temp.esperar_bloqueio(:backend_expiracao);
select pg_sleep(2.1);
commit;
do $$
declare resposta jsonb; negada boolean:=false;
begin
 begin
  select x into resposta from dblink_get_result('expiracao') as t(x jsonb);
 exception when sqlstate 'PZ001' then
  if sqlerrm is distinct from 'EXPIRACAO_INTERNA' then raise; end if;
  negada:=true;
 end;
 if not negada then raise exception 'SESSAO_EXPIRADA_ACEITA: %',resposta; end if;
end $$;
update auth.sessions set not_after=clock_timestamp()+interval '2 seconds';
create function auditoria.suprimir_fixture() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger suprimir_auditoria before insert on auditoria.evento for each row execute function auditoria.suprimir_fixture();
create function operacao.criacao_expirada_fixture() returns jsonb language plpgsql as $$
declare e jsonb; p uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
begin
 e:=jsonb_build_object('request_id',req,'paciente_id',p,'reserva_id','20000000-0000-4000-8000-000000000010','geracao_reserva',1,'auditoria_id',gen_random_uuid(),'chave_idempotencia','teste-expiracao','digest_idempotencia',repeat('a',43),
  'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',p::text,'campo','nome','formato',1)),
  'atestado',jsonb_build_object('usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',req,'operacao','api.criar_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','mac','valido'));
 return operacao.criar_paciente_privado(jsonb_build_object('entrada',e,'entrada_canonica','{}','dados_canonicos','{}'));
end $$;
select dblink_connect('auditoria',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),current_user));
select dblink_exec('auditoria', $$set teste.ator='10000000-0000-4000-8000-000000000002'$$);
select dblink_exec('auditoria', $$set teste.jwt='{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}'$$);
select pid as backend_auditoria from dblink('auditoria','select pg_backend_pid()') as x(pid integer) \gset
begin;
select 1 from operacao.barreira_cadastro where ator_usuario_id=auth.uid() for update;
select dblink_send_query('auditoria','select operacao.criacao_expirada_fixture()');
select pg_temp.esperar_bloqueio(:backend_auditoria);
select pg_sleep(2.1);
commit;
do $$
declare falhou boolean:=false;
begin
 begin
  perform x from dblink_get_result('auditoria') as t(x jsonb);
 exception when no_data_found then
  if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
  falhou:=true;
 end;
 if not falhou then raise exception 'AUDITORIA_SUPRIMIDA_ACEITA'; end if;
end $$;
select dblink_disconnect('auditoria');
select dblink_disconnect('expiracao');
drop trigger suprimir_auditoria on auditoria.evento;
delete from auth.sessions;
do $$
declare t jsonb; r jsonb;
begin
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.consultar_barreira_cadastro'));
 r:=operacao.cadastro_composicao_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or not exists(
  select 1 from auditoria.evento where request_id=(t#>>'{entrada,request_id}')::uuid and resultado='negado'
 ) then raise exception 'SESSAO_AUSENTE_NAO_AUDITADA'; end if;
end $$;
