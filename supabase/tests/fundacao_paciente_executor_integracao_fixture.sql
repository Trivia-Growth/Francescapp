-- Exclusivo para cluster descartável. Capacidade e claims não são reais.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'ffcm_reserva_paciente_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('unix_socket_directories') is distinct from current_setting('ffcm_fixture.socket_esperado',true)
  or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado',true)
  or current_setting('ffcm_fixture.token_servidor',true) is distinct from current_setting('ffcm_fixture.token_esperado',true)
 then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
\ir ../drafts/20261103100000_reserva_autorizada_experimento.sql
\ir ../drafts/20261103110000_reserva_capacidade_experimento.sql
\ir ../drafts/20261103120000_reserva_paciente_experimento.sql
\ir ../drafts/20261103140000_prova_owner_experimento.sql
\ir ../drafts/20261103150000_atestado_owner_experimento.sql
\ir ../drafts/20261103160000_autoridade_owner_experimento.sql
\ir ../drafts/20261103170000_cadastro_owner_experimento.sql
create role ffcm_paciente_executor_fixture nologin;
create role ffcm_paciente_login_fixture login noinherit nosuperuser nobypassrls;
grant ffcm_paciente_executor_fixture to ffcm_paciente_login_fixture;
grant usage on schema reserva_fixture to ffcm_paciente_executor_fixture;
grant execute on function reserva_fixture.criar_paciente_reservado_fixture(jsonb,bigint,bytea) to ffcm_paciente_executor_fixture;
insert into reserva_fixture.ator(id) values('61000000-0000-4000-8000-000000000001');
-- Somente simulação da forma de claims. Não autentica chamada SQL direta.
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
update identidade.prova_saida_fixture set verificador=extensions.digest(decode(repeat('00',32),'hex'),'sha256') where session_id='63000000-0000-4000-8000-000000000001';
begin;
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',true);
do $$ begin
 if reserva_fixture.vincular_capacidade_fixture(1,1,extensions.digest(decode(repeat('00',32),'hex'),'sha256')) is not true
   or reserva_fixture.abrir('61000000-0000-4000-8000-000000000001',1,'68000000-0000-4000-8000-000000000001') <> 'aberta'
 then raise exception 'reserva fixture não preparada'; end if;
end $$;
commit;
