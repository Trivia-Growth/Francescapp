\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql

-- Preparação administrativa somente na fixture descartável.
create role migrador_carteira_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role consumidor_carteira_fixture nologin;
grant execute on function api.listar_pacientes(jsonb) to consumidor_carteira_fixture with grant option;
create temporary table estado_wrapper as
 select oid, proowner, proacl from pg_proc where oid='api.listar_pacientes(jsonb)'::regprocedure;

-- A autorização é pré-requisito externo; não pode ser concedida pelo migrador.
grant ffcmapp_api_carteira_owner to migrador_carteira_fixture;
grant create on schema api to ffcmapp_api_carteira_owner;
set role migrador_carteira_fixture;
set role ffcmapp_api_carteira_owner;
\ir ../drafts/20261106210000_auditoria_atestado_carteira_experimento.sql
reset role;

do $$ begin
 if not exists (select 1 from pg_proc p join estado_wrapper e on p.oid=e.oid
  where p.proowner=e.proowner and p.proacl is not distinct from e.proacl) then
  raise exception 'OID, owner ou grants da função mudaram';
 end if;
 if not exists(select 1 from pg_proc where oid='api.listar_pacientes(jsonb)'::regprocedure
  and prosrc like '%when insufficient_privilege%') then
  raise exception 'draft não aplicado';
 end if;
end $$;
-- Fixture começou sem essas concessões; nunca aplicar revogação cega em ambiente real.
revoke create on schema api from ffcmapp_api_carteira_owner;
revoke ffcmapp_api_carteira_owner from migrador_carteira_fixture;
do $$ begin
 if has_schema_privilege('ffcmapp_api_carteira_owner','api','CREATE')
  or pg_has_role('migrador_carteira_fixture','ffcmapp_api_carteira_owner','MEMBER') then
  raise exception 'privilégio temporário permaneceu';
 end if;
end $$;
