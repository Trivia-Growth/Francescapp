-- SOMENTE cluster descartável: o owner da função é superusuário fixture.
-- Não prova least privilege do owner nem serve como grant de produção.
\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null or s !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$' or current_setting('data_directory')<>s||'/data' then raise exception 'cluster descartável obrigatório'; end if;
end $$;
\ir ../drafts/20261104180000_google_primeiro_vinculo_experimento.sql
\ir ../drafts/20261104210000_google_admissao_prova_experimento.sql
\ir ../drafts/20261104220000_google_primeiro_com_prova_experimento.sql
\ir ../drafts/20261104230000_google_selecao_admissao_experimento.sql
alter function identidade.google_selecionar_admissao_fixture(jsonb,bytea) security definer;
create role ffcmapp_google_executor_fixture nologin nosuperuser nocreatedb nocreaterole nobypassrls;
create role ffcm_google_test_login login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant ffcmapp_google_executor_fixture to ffcm_google_test_login;
grant usage on schema identidade to ffcmapp_google_executor_fixture;
grant execute on function identidade.google_selecionar_admissao_fixture(jsonb,bytea) to ffcmapp_google_executor_fixture;
insert into auth.users values ('51000000-0000-4000-8000-000000000001'),('51000000-0000-4000-8000-000000000002');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values
('52000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','email_fixture','profissional','google_workspace','pendente','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
('55000000-0000-4000-8000-000000000001',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
('55000000-0000-4000-8000-000000000002',repeat('b',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
