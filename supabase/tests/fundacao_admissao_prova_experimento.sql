-- Cluster local descartável. Auth, concessão e verificador são fixtures.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_admissao_teste_local' or inet_server_addr() is not null
    or current_setting('unix_socket_directories') not like '/tmp/ffcm-admissao.%' then
   raise exception 'Cluster local descartável obrigatório';
 end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
\ir ../drafts/20261029110000_sessao_renovacao_fencing.sql
\ir ../drafts/20261030120000_admissao_tecnica.sql
\ir ../drafts/20261101180000_admissao_prova_experimento.sql
insert into auth.users values ('41000000-0000-4000-8000-000000000001');
insert into auth.users values ('41000000-0000-4000-8000-000000000099');
insert into public.usuario(id,perfil) values ('41000000-0000-4000-8000-000000000001','administrador');
insert into public.usuario(id,perfil) values ('41000000-0000-4000-8000-000000000099','profissional');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('42000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture','administrador','google_workspace','vinculada','41000000-0000-4000-8000-000000000001','fixture','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values ('41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000001","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000001","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
 h bytea:=decode(repeat('ab',32),'hex'); r jsonb;
begin
 r:=identidade.admitir_tecnica_com_prova_fixture(e,h);
 if r ->> 'ok' is distinct from 'true' or not exists (select 1 from identidade.prova_sessao_fixture where session_id='43000000-0000-4000-8000-000000000001' and usuario_id='41000000-0000-4000-8000-000000000001' and geracao=1 and verificador=h)
    or not exists (select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000001')
    or not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000001' and resultado='permitido') then raise exception 'admissão parcial'; end if;
 r:=identidade.admitir_tecnica_com_prova_fixture(e,h);
 if r ->> 'ok' is distinct from 'false' then raise exception 'replay aceito'; end if;
 if has_function_privilege('public','identidade.admitir_tecnica_com_prova_fixture(jsonb,bytea)','execute')
    or has_function_privilege('anon','identidade.admitir_tecnica_com_prova_fixture(jsonb,bytea)','execute')
    or has_function_privilege('authenticated','identidade.admitir_tecnica_com_prova_fixture(jsonb,bytea)','execute') then raise exception 'execução pública'; end if;
 begin
   update identidade.prova_sessao_fixture set usuario_id='41000000-0000-4000-8000-000000000099'
   where session_id='43000000-0000-4000-8000-000000000001';
   raise exception 'par sessão/usuário divergente aceito';
 exception when foreign_key_violation then null; end;
end $$;
do $$
begin
 -- Apenas prova da capacidade do schema; não é RPC de renovação real.
 update identidade.prova_sessao_fixture set geracao=2,verificador=decode(repeat('cd',32),'hex')
 where session_id='43000000-0000-4000-8000-000000000001';
 if not exists (select 1 from identidade.prova_sessao_fixture p join identidade.sessao s using(session_id)
   where p.session_id='43000000-0000-4000-8000-000000000001' and p.usuario_id=s.usuario_id and p.geracao=2) then
   raise exception 'segunda geração não preservou vínculo';
 end if;
 begin
   update identidade.prova_sessao_fixture set geracao=0 where session_id='43000000-0000-4000-8000-000000000001';
   raise exception 'geração não positiva aceita';
 exception when check_violation then null; end;
end $$;
create function pg_temp.suprimir_auditoria() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger teste_suprimir_auditoria before insert on auditoria.evento for each row execute function pg_temp.suprimir_auditoria();
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000004","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000005","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
begin
 begin
   perform identidade.admitir_tecnica_com_prova_fixture(e,decode(repeat('ab',32),'hex'));
   raise exception 'admissão sem auditoria aceita';
 exception when sqlstate 'P0002' then
   if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
 end;
 if exists (select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000004')
    or exists (select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000004')
    or exists (select 1 from identidade.prova_sessao_fixture where session_id='43000000-0000-4000-8000-000000000004') then
   raise exception 'auditoria ausente deixou efeitos parciais';
 end if;
end $$;
drop trigger teste_suprimir_auditoria on auditoria.evento;
create function pg_temp.suprimir_prova() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger teste_suprimir_prova before insert on identidade.prova_sessao_fixture for each row execute function pg_temp.suprimir_prova();
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000002","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000002","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
begin
 begin
   perform identidade.admitir_tecnica_com_prova_fixture(e,decode(repeat('ab',32),'hex'));
   raise exception 'admissão sem prova aceita';
 exception when sqlstate 'P0002' then
   if sqlerrm <> 'PROVA_NAO_REGISTRADA' then raise; end if;
 end;
 if exists (select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000002')
    or exists (select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000002')
    or exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000002') then
   raise exception 'prova ausente deixou efeitos parciais';
 end if;
end $$;
drop trigger teste_suprimir_prova on identidade.prova_sessao_fixture;
update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='41000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where session_id='43000000-0000-4000-8000-000000000001';
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000001","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000003","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
begin
 if identidade.admitir_tecnica_com_prova_fixture(e,decode(repeat('ab',32),'hex')) ->> 'ok' is distinct from 'false' then raise exception 'tombstone reaberto'; end if;
 if not exists (select 1 from identidade.prova_sessao_fixture p join identidade.credencial_sessao c using(session_id)
   where p.session_id='43000000-0000-4000-8000-000000000001' and p.geracao=2
   and p.verificador=decode(repeat('cd',32),'hex') and c.envelope=e -> 'credencial_refresh') then
   raise exception 'replay alterou prova ou credencial do tombstone';
 end if;
end $$;
update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id='41000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id='42000000-0000-4000-8000-000000000001';
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000001","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000004","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
begin
 e:=jsonb_set(e,'{identidade,session_id}','"43000000-0000-4000-8000-000000000003"');
 if identidade.admitir_tecnica_com_prova_fixture(e,decode(repeat('ab',32),'hex')) ->> 'ok' is distinct from 'false' then raise exception 'concessão revogada admitida'; end if;
end $$;
