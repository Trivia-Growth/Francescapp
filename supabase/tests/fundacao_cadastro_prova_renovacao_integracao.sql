-- Banco PostgreSQL local descartável, nunca projeto Supabase. Cadastro e guarda
-- são os rascunhos reais; Auth, chave de atestado e JWT são fixtures.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() not in ('postgres','ffcm_carteira_fixture') or inet_server_addr() is not null
   or current_setting('unix_socket_directories') not like '/tmp/ffcm-admissao.%'
   or (current_database() = 'ffcm_carteira_fixture' and (
     coalesce(current_setting('ffcm_fixture.token_servidor',true),'') = ''
     or current_setting('ffcm_fixture.token_servidor',true) is distinct from current_setting('ffcm_fixture.token_esperado',true)
     or current_setting('unix_socket_directories') is distinct from current_setting('ffcm_fixture.socket_esperado',true)
     or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado',true))) then
   raise exception 'cluster local descartável obrigatório';
 end if;
end $$;
create schema saida_fixture;
create schema experimento_atestado;
create schema extensions;
create extension pgcrypto with schema extensions;
create role ffcm_saida_runtime nologin;
create table identidade.prova_saida_fixture(session_id uuid primary key, usuario_id uuid not null, geracao bigint not null, verificador bytea not null);
create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('ffcm_fixture.usuario',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('session_id',current_setting('ffcm_fixture.sessao',true)) $$;
create function experimento_atestado.ler_chave_interna(text) returns bytea language sql as $$ select decode(repeat('07',32),'hex') $$;
create function experimento_atestado.prazo_maximo_teste() returns interval language sql as $$ select interval '60 seconds' $$;
\ir ../drafts/20261101100000_atestado_jcs_experimento.sql
\ir ../drafts/20261101110000_atestado_chave_interna_experimento.sql
\ir ../drafts/20261101120000_atestado_autoridade_experimento.sql
\ir ../drafts/20261101130000_cadastro_paciente_experimento.sql
\ir ../drafts/20261102140000_renovacao_prova_integrada_experimento.sql
\ir ../drafts/20261102150000_autorizacao_renovacao_experimento.sql
\ir ../drafts/20261102160000_cadastro_prova_renovacao_experimento.sql
insert into auth.users(id) values('61000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values('61000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('62000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-cadastro-integrado','administrador','google_workspace','vinculada','61000000-0000-4000-8000-000000000001','fixture-cadastro-integrado','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',1,'tecnica');
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope) values('63000000-0000-4000-8000-000000000001','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.prova_saida_fixture values('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
create function experimento_atestado.assinar_fixture(e jsonb) returns jsonb language plpgsql as $$
declare entrada text := e::text; dados jsonb; texto text; mac text;
begin
 dados := jsonb_build_object('key_id','v1','usuario_id','61000000-0000-4000-8000-000000000001',
   'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id',
   'operacao','api.criar_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '30 seconds',
   'digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto := dados::text;
 mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('07',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
\if :{?ffcm_fixture_concorrente}
commit;
\else
do $$
declare e jsonb := '{"request_id":"64000000-0000-4000-8000-000000000001","auditoria_id":"65000000-0000-4000-8000-000000000001","paciente_id":"66000000-0000-4000-8000-000000000001","chave_idempotencia":"fixture-idempotencia","digest_idempotencia":"digest-fixture","nome":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"nome":{"tabela":"cadastro.paciente","registro_id":"66000000-0000-4000-8000-000000000001","campo":"nome","formato":1}}}'; t jsonb; r jsonb;
begin
 perform set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
 perform set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',true);
 t := experimento_atestado.assinar_fixture(e);
 r := experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('02',32),'hex'));
 if r->>'ok' is distinct from 'false' or exists(select 1 from cadastro.paciente) or exists(select 1 from operacao.requisicao) then raise exception 'prova errada produziu cadastro'; end if;
 e := jsonb_set(jsonb_set(e,'{request_id}','"64000000-0000-4000-8000-000000000002"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000002"');
 t := experimento_atestado.assinar_fixture(e);
 r := experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.paciente where id='66000000-0000-4000-8000-000000000001') or not exists(select 1 from operacao.requisicao where estado='concluida') or not exists(select 1 from auditoria.evento where resultado='permitido') then raise exception 'cadastro válido sem efeito completo'; end if;
 e := jsonb_set(jsonb_set(e,'{request_id}','"64000000-0000-4000-8000-000000000004"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000004"');
 t := experimento_atestado.assinar_fixture(e);
 update identidade.credencial_sessao set estado='em_troca' where session_id='63000000-0000-4000-8000-000000000001';
 if experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('01',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'cadastro permitido durante troca'; end if;
 update identidade.credencial_sessao set estado='disponivel',geracao=2 where session_id='63000000-0000-4000-8000-000000000001';
 update identidade.prova_saida_fixture set geracao=2,verificador=decode(repeat('03',32),'hex') where session_id='63000000-0000-4000-8000-000000000001';
 if experimento_atestado.criar_paciente_com_prova_fixture(t,1,decode(repeat('01',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'cadastro permitido com prova anterior'; end if;
 if (select count(*) from cadastro.paciente) <> 1 or (select count(*) from operacao.requisicao) <> 1 then raise exception 'negação alterou cadastro ou ledger'; end if;
end $$;
create function pg_temp.rejeitar_evento() returns trigger language plpgsql as $$ begin raise exception 'falha-auditoria-fixture'; end $$;
create trigger falhar_evento before insert on auditoria.evento for each row execute function pg_temp.rejeitar_evento();
do $$
declare e jsonb := '{"request_id":"64000000-0000-4000-8000-000000000003","auditoria_id":"65000000-0000-4000-8000-000000000003","paciente_id":"66000000-0000-4000-8000-000000000002","chave_idempotencia":"fixture-outra-idempotencia","digest_idempotencia":"digest-outro","nome":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"nome":{"tabela":"cadastro.paciente","registro_id":"66000000-0000-4000-8000-000000000002","campo":"nome","formato":1}}}';
begin
 begin
   perform experimento_atestado.criar_paciente_com_prova_fixture(experimento_atestado.assinar_fixture(e),2,decode(repeat('03',32),'hex'));
   raise exception 'falha de auditoria ignorada';
 exception when raise_exception then
   if sqlerrm <> 'falha-auditoria-fixture' then raise; end if;
 end;
 if exists(select 1 from cadastro.paciente where id='66000000-0000-4000-8000-000000000002') or exists(select 1 from operacao.requisicao where chave_idempotencia='fixture-outra-idempotencia') then raise exception 'falha de auditoria deixou paciente ou ledger'; end if;
end $$;
rollback;
\endif
