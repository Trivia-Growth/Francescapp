-- Somente clone temporário EXCLUSIVO do cluster local; este teste confirma dados.
-- A remoção de ffcm_contato_race_20261029_01 após desconectar apaga só essa fixture.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_contato_race_20261029_01' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
   or current_setting('data_directory') <> current_setting('unix_socket_directories') || '/data' then
   raise exception 'clone local descartável obrigatório';
 end if;
end $$;
\ir ../drafts/20261102120000_saida_prova_experimento.sql
create extension dblink;
insert into auth.users(id) values('81000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values('81000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('82000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-contato-race','administrador','google_workspace','vinculada','81000000-0000-4000-8000-000000000001','fixture-contato-race','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values('86000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','81000000-0000-4000-8000-000000000001');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select id,'81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',1,'tecnica'
from (values ('83000000-0000-4000-8000-000000000001'::uuid),('83000000-0000-4000-8000-000000000002'::uuid)) x(id);
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
select id,'disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb
from (values ('83000000-0000-4000-8000-000000000001'::uuid),('83000000-0000-4000-8000-000000000002'::uuid)) x(id);
insert into identidade.prova_saida_fixture(session_id,usuario_id,geracao,verificador)
select id,'81000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex')
from (values ('83000000-0000-4000-8000-000000000001'::uuid),('83000000-0000-4000-8000-000000000002'::uuid)) x(id);
create function experimento_atestado.assinar_contato_race(e jsonb) returns jsonb language plpgsql as $$
declare entrada text:=e::text; dados jsonb; texto text; mac text;
begin
 dados:=jsonb_build_object('key_id','v1','usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao','api.criar_contato_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '45 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=dados::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('07',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
create function pg_temp.espera_bloqueio(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz:=clock_timestamp()+interval '3 seconds';
begin loop
 perform pg_stat_clear_snapshot();
 if exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
 if clock_timestamp()>=prazo then raise exception 'bloqueio esperado não observado'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select pid as ffcm_backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
select dblink_exec('outra','set statement_timeout=30000');
select dblink_exec('outra','set lock_timeout=10000');
select dblink_exec('outra',$$set ffcm_fixture.usuario='81000000-0000-4000-8000-000000000001'$$);
select dblink_exec('outra',$$set ffcm_fixture.sessao='83000000-0000-4000-8000-000000000001'$$);
select dblink_exec('outra',$$set request.jwt.claim.sub='81000000-0000-4000-8000-000000000001'$$);
select dblink_exec('outra',$$set request.jwt.claims='{"session_id":"83000000-0000-4000-8000-000000000001"}'$$);
select dblink_exec('outra',$$create temp table ffcm_contato_transporte as select experimento_atestado.assinar_contato_race('{"request_id":"84000000-0000-4000-8000-000000000001","auditoria_id":"85000000-0000-4000-8000-000000000001","paciente_id":"86000000-0000-4000-8000-000000000001","contato_id":"87000000-0000-4000-8000-000000000001","chave_idempotencia":"fixture-race-contato-um","digest_idempotencia":"digest-um","tipo":"email","valor":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"tabela":"cadastro.contato_paciente","registro_id":"87000000-0000-4000-8000-000000000001","campo":"valor","formato":1}}'::jsonb) as transporte$$);
do $$ begin
 if not (select valido from dblink('outra',$q$select experimento_atestado.verificar_criar_contato_fixture(transporte) and saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) from ffcm_contato_transporte$q$) as x(valido boolean)) then
   raise exception 'controle positivo prévio do atestado e identidade falhou';
 end if;
end $$;

-- Revogação primeiro: a segunda transação tem atestado válido antes do lock.
begin;
do $$ begin
 if saida_fixture.revogar('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','88000000-0000-4000-8000-000000000001') is distinct from true then raise exception 'saída recusada'; end if;
end $$;
select dblink_send_query('outra',$$select experimento_atestado.criar_contato_com_prova_fixture(transporte,1,decode(repeat('01',32),'hex')) from ffcm_contato_transporte$$);
select pg_temp.espera_bloqueio(:ffcm_backend);
commit;
do $$ declare r jsonb; begin
 select resultado into r from dblink_get_result('outra') as x(resultado jsonb);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados'
   or exists(select 1 from cadastro.contato_paciente where id='87000000-0000-4000-8000-000000000001')
   or exists(select 1 from operacao.requisicao where chave_idempotencia='fixture-race-contato-um')
   or not exists(select 1 from auditoria.evento where request_id='88000000-0000-4000-8000-000000000001' and acao='sessao.sair' and resultado='permitido')
   or not exists(select 1 from auditoria.evento where request_id='84000000-0000-4000-8000-000000000001' and acao='api.criar_contato_paciente' and resultado='negado')
 then raise exception 'saída primeiro resultou em efeito inválido'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado jsonb);
do $$ begin
 if not (select valida from dblink('outra',$q$select (transporte->'entrada'->'atestado'->>'expira_em')::timestamptz>clock_timestamp() from ffcm_contato_transporte$q$) as x(valida boolean)) then
  raise exception 'atestado expirou: teste não distingue expiração de revogação';
 end if;
end $$;

-- Contato primeiro: saída aguarda o commit e não desfaz escrita auditada.
select set_config('ffcm_fixture.usuario','81000000-0000-4000-8000-000000000001',false);
select set_config('ffcm_fixture.sessao','83000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"session_id":"83000000-0000-4000-8000-000000000002"}',false);
begin;
do $$ declare r jsonb; t jsonb; begin
 t:=experimento_atestado.assinar_contato_race('{"request_id":"84000000-0000-4000-8000-000000000002","auditoria_id":"85000000-0000-4000-8000-000000000002","paciente_id":"86000000-0000-4000-8000-000000000001","contato_id":"87000000-0000-4000-8000-000000000002","chave_idempotencia":"fixture-race-contato-dois","digest_idempotencia":"digest-dois","tipo":"email","valor":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"tabela":"cadastro.contato_paciente","registro_id":"87000000-0000-4000-8000-000000000002","campo":"valor","formato":1}}'::jsonb);
 if experimento_atestado.verificar_criar_contato_fixture(t) is not true or saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) is not true then raise exception 'controle positivo prévio falhou'; end if;
 r:=experimento_atestado.criar_contato_com_prova_fixture(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' then raise exception 'criação negada antes da saída'; end if;
end $$;
select dblink_send_query('outra',$$select saida_fixture.revogar('83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','88000000-0000-4000-8000-000000000002')$$);
select pg_temp.espera_bloqueio(:ffcm_backend);
commit;
do $$ declare r boolean; begin
 select resultado into r from dblink_get_result('outra') as x(resultado boolean);
 if r is distinct from true
   or not exists(select 1 from cadastro.contato_paciente where id='87000000-0000-4000-8000-000000000002' and paciente_id='86000000-0000-4000-8000-000000000001')
   or not exists(select 1 from operacao.requisicao where chave_idempotencia='fixture-race-contato-dois' and estado='concluida' and resultado_id='87000000-0000-4000-8000-000000000002')
   or not exists(select 1 from auditoria.evento where request_id='84000000-0000-4000-8000-000000000002' and acao='api.criar_contato_paciente' and resultado='permitido')
   or not exists(select 1 from auditoria.evento where request_id='88000000-0000-4000-8000-000000000002' and acao='sessao.sair' and resultado='permitido')
 then raise exception 'criação antes da saída resultou em efeito inválido'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado boolean);
select dblink_disconnect('outra');
