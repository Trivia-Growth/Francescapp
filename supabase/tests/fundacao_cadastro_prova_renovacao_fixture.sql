-- Prova isolada de composição: usa helper real de autorização, mas substitui
-- operação de cadastro e auditoria por doubles; não prova DTO, gateway ou Vault.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() <> 'postgres' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') not like '/tmp/ffcm-admissao.%' then
   raise exception 'somente cluster temporário isolado desta execução';
 end if;
end $$;
create schema saida_fixture;
create schema experimento_atestado;
create role ffcm_saida_runtime nologin;
create table identidade.prova_saida_fixture(session_id uuid primary key, usuario_id uuid not null, geracao bigint not null, verificador bytea not null);
create table experimento_atestado.efeito_fixture(id integer);
create function experimento_atestado.criar_paciente(jsonb) returns jsonb language plpgsql as $$
begin insert into experimento_atestado.efeito_fixture values(1); return '{"ok":true}'::jsonb; end $$;
create function experimento_atestado.auditar_negacao_confiavel(jsonb) returns void language sql as $$ select $$;
create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('ffcm_fixture.usuario',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('session_id',current_setting('ffcm_fixture.sessao',true)) $$;
\ir ../drafts/20261102140000_renovacao_prova_integrada_experimento.sql
\ir ../drafts/20261102150000_autorizacao_renovacao_experimento.sql
\ir ../drafts/20261102160000_cadastro_prova_renovacao_experimento.sql
insert into auth.users(id) values('51000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values('51000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('52000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-prova-cadastro','administrador','google_workspace','vinculada','51000000-0000-4000-8000-000000000001','fixture-prova-cadastro','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values('53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',1,'tecnica');
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope) values('53000000-0000-4000-8000-000000000001','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.prova_saida_fixture values('53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
do $$
declare t jsonb := '{"entrada":{"request_id":"54000000-0000-4000-8000-000000000001"}}';
begin
  perform set_config('ffcm_fixture.usuario','51000000-0000-4000-8000-000000000001',true);
  perform set_config('ffcm_fixture.sessao','53000000-0000-4000-8000-000000000001',true);
  if experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('01',32),'hex'))->>'ok' <> 'true' then raise exception 'prova vigente negada'; end if;
  if experimento_atestado.criar_paciente_com_prova_fixture(t,2,decode(repeat('01',32),'hex'))->>'ok' <> 'false'
   or experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('02',32),'hex'))->>'ok' <> 'false' then raise exception 'prova errada aceita'; end if;
  update identidade.credencial_sessao set estado='em_troca' where session_id='53000000-0000-4000-8000-000000000001';
  if experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('01',32),'hex'))->>'ok' <> 'false' then raise exception 'troca concorrente aceita'; end if;
  update identidade.credencial_sessao set estado='disponivel',geracao=2 where session_id='53000000-0000-4000-8000-000000000001';
  update identidade.prova_saida_fixture set geracao=2,verificador=decode(repeat('02',32),'hex') where session_id='53000000-0000-4000-8000-000000000001';
  if experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('01',32),'hex'))->>'ok' <> 'false' then raise exception 'prova anterior aceita após rotação'; end if;
  perform set_config('ffcm_fixture.usuario','51000000-0000-4000-8000-000000000002',true);
  if experimento_atestado.criar_paciente_com_prova_fixture(t,2,decode(repeat('02',32),'hex'))->>'ok' <> 'false' then raise exception 'outra identidade aceita'; end if;
  perform set_config('ffcm_fixture.usuario','51000000-0000-4000-8000-000000000001',true);
  update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='51000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where session_id='53000000-0000-4000-8000-000000000001';
  if experimento_atestado.criar_paciente_com_prova_fixture(t,2,decode(repeat('02',32),'hex'))->>'ok' <> 'false' then raise exception 'sessão revogada aceita'; end if;
  if (select count(*) from experimento_atestado.efeito_fixture) <> 1 then raise exception 'efeito indevido'; end if;
end $$;
rollback;
