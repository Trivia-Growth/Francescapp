-- Somente cluster descartável sem rede; dados, claims e chaves fictícios.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_carteira_fixture' or inet_server_addr() is not null
    or coalesce(current_setting('ffcm_fixture.token_servidor',true),'') = ''
    or current_setting('ffcm_fixture.token_servidor',true) is distinct from current_setting('ffcm_fixture.token_esperado',true)
    or current_setting('unix_socket_directories') is distinct from current_setting('ffcm_fixture.socket_esperado',true)
    or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado',true) then
   raise exception 'fixture exige cluster descartável exclusivo via socket';
 end if;
end $$;
create extension dblink;
insert into auth.users(id) values ('61000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values ('61000000-0000-4000-8000-000000000002','profissional');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('62000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-profissional','profissional','google_workspace','vinculada','61000000-0000-4000-8000-000000000002','fixture-profissional','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
values('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000002',1,'google_workspace');
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
values('63000000-0000-4000-8000-000000000002','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.prova_saida_fixture values('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002',1,decode(repeat('02',32),'hex'));
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
('66000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','61000000-0000-4000-8000-000000000001');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
('67000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
create function pg_temp.assinar_carteira(e jsonb) returns jsonb language plpgsql as $$
declare entrada text := e::text; dados jsonb; texto text; mac text;
begin
 dados := jsonb_build_object('key_id','v1','usuario_id',auth.uid(), 'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao','api.listar_pacientes','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '30 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto := dados::text;
 mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('07',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
create function pg_temp.espera_bloqueio(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz := clock_timestamp()+interval '3 seconds';
begin
 loop
  perform pg_stat_clear_snapshot();
  if exists(select 1 from pg_stat_activity a where a.pid=p_pid and a.wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(a.pid))) then return; end if;
  if clock_timestamp()>=prazo then raise exception 'espera por bloqueio não observada'; end if;
  perform pg_sleep(0.02);
 end loop;
end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_exec('outra','set statement_timeout=30000');
select dblink_exec('outra','set lock_timeout=10000');
select pid as backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000002',false);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000002',false);
select dblink_exec('outra', $$set ffcm_fixture.usuario='61000000-0000-4000-8000-000000000002'$$);
select dblink_exec('outra', $$set ffcm_fixture.sessao='63000000-0000-4000-8000-000000000002'$$);

-- Revogação primeiro: leitura aguarda e não revela o paciente após commit.
select pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000011","limite":20}')::text as transporte \gset
select dblink_exec('outra','set role ffcm_carteira_executor_fixture');
begin;
update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id='67000000-0000-4000-8000-000000000001';
select dblink_send_query('outra',format('select experimento_atestado.listar_carteira_fixture(%L::jsonb,1,decode(repeat(''02'',32),''hex''))', :'transporte'));
select pg_temp.espera_bloqueio(:backend);
commit;
do $$ declare r jsonb; begin
 select resultado into r from dblink_get_result('outra') as x(resultado jsonb);
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r #> '{dados,itens}')<>0 then raise exception 'revogação anterior revelou paciente'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado jsonb);
select dblink_exec('outra','reset role');

-- Nova concessão fictícia: leitura primeiro mantém lock até commit.
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
('67000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
select pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000012","limite":20}')::text as transporte \gset
begin;
set local role ffcm_carteira_executor_fixture;
select experimento_atestado.listar_carteira_fixture(:'transporte'::jsonb,1,decode(repeat('02',32),'hex')) as resultado \gset
reset role;
select set_config('ffcm_fixture.resultado',:'resultado',true) as resultado_guardado \gset
do $$ declare r jsonb:=current_setting('ffcm_fixture.resultado')::jsonb; begin
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r #> '{dados,itens}')<>1 then raise exception 'leitura anterior não recebeu paciente'; end if;
end $$;
select dblink_send_query('outra', $$update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id='67000000-0000-4000-8000-000000000002' returning id$$);
select pg_temp.espera_bloqueio(:backend);
commit;
do $$ declare id uuid; begin
 select resultado into id from dblink_get_result('outra') as x(resultado uuid);
 if id is distinct from '67000000-0000-4000-8000-000000000002'::uuid then raise exception 'revogação posterior não concluída'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado uuid);
select dblink_disconnect('outra');
