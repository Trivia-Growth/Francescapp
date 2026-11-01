-- SOMENTE CLUSTER DESCARTÁVEL: cria fixtures e papéis; não usar em runtime.
\set ON_ERROR_STOP on
do $$
declare socket_dir text := current_setting('unix_socket_directories');
begin
  if current_database() <> 'ffcm_admissao_teste_local'
    or inet_server_addr() is not null
    or socket_dir !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
    or current_setting('data_directory') <> socket_dir || '/data' then
    raise exception 'Fixture exige cluster descartável dedicado';
  end if;
end $$;
\ir fundacao_admissao_prova_compartilhada_experimento.sql
create table identidade.prova_saida_fixture(session_id uuid primary key references identidade.sessao(session_id),usuario_id uuid not null references public.usuario(id),geracao bigint not null,verificador bytea not null);
\ir ../drafts/20261104140000_admissao_prova_compartilhada_experimento.sql
\ir ../drafts/20261104160000_admissao_geracao_inicial_experimento.sql
\ir ../drafts/20261104150000_admissao_owner_experimento.sql
create role ffcmapp_admissao_executor nologin nosuperuser nocreatedb nocreaterole nobypassrls;
create role ffcm_admissao_test_login login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_admissao_executor to ffcm_admissao_test_login;
grant usage on schema identidade to ffcmapp_admissao_executor;
grant execute on function identidade.admitir_tecnica_com_prova(jsonb,bytea) to ffcmapp_admissao_executor;
insert into auth.users values('41000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values('41000000-0000-4000-8000-000000000002','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-2','administrador','google_workspace','vinculada','41000000-0000-4000-8000-000000000002','fixture-2','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values('41000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
