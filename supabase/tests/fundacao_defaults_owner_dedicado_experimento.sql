-- Experimento: somente banco criado para este teste. Não altera migrations,
-- ownership existente, defaults de postgres, runtime ou projeto Supabase.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() <> 'ffcm_owner_fixture' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') not like '/tmp/ffcm-admissao.%' then
   raise exception 'cluster e banco descartáveis obrigatórios';
 end if;
end $$;
create schema d06_owner_identidade;
create schema d06_owner_cadastro;
-- USAGE local fictício garante que a negativa teste EXECUTE, não só schema.
grant usage on schema d06_owner_identidade,d06_owner_cadastro to anon,authenticated;
create function d06_owner_identidade.preexistente() returns boolean language sql as $$ select true $$;
revoke all on function d06_owner_identidade.preexistente() from public,anon,authenticated;
create temp table d06_estado_inicial as
 select (select proacl from pg_proc where oid='d06_owner_identidade.preexistente()'::regprocedure) as acl_existente,
 (select defaclacl from pg_default_acl where defaclrole=current_user::regrole and defaclnamespace=0 and defaclobjtype='f') as default_executor;

create role d06_owner_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage, create on schema d06_owner_identidade,d06_owner_cadastro to d06_owner_fixture;
set local role d06_owner_fixture;
-- Global para o owner dedicado, não para postgres nem outros proprietários.
alter default privileges revoke execute on functions from public;
create function d06_owner_identidade.nova() returns boolean language sql security definer set search_path=pg_catalog as $$ select true $$;
create function d06_owner_cadastro.nova() returns boolean language sql security definer set search_path=pg_catalog as $$ select true $$;
reset role;
revoke create on schema d06_owner_identidade,d06_owner_cadastro from d06_owner_fixture;

do $$
declare func regprocedure;
begin
 if exists(select 1 from pg_roles where rolname='d06_owner_fixture' and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolbypassrls)) then raise exception 'owner excessivamente privilegiado'; end if;
 if has_schema_privilege('d06_owner_fixture','d06_owner_identidade','create') or has_schema_privilege('d06_owner_fixture','d06_owner_cadastro','create') then raise exception 'CREATE permanente'; end if;
 foreach func in array array['d06_owner_identidade.nova()'::regprocedure,'d06_owner_cadastro.nova()'::regprocedure] loop
   if (select proowner from pg_proc where oid=func) <> 'd06_owner_fixture'::regrole
     or has_function_privilege('anon',func,'execute') or has_function_privilege('authenticated',func,'execute')
     or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=func and a.grantee=0 and a.privilege_type='EXECUTE') then
     raise exception 'função futura acessível ou owner incorreto';
   end if;
 end loop;
 if (select proacl from pg_proc where oid='d06_owner_identidade.preexistente()'::regprocedure) is distinct from (select acl_existente from d06_estado_inicial)
   or (select defaclacl from pg_default_acl where defaclrole=current_user::regrole and defaclnamespace=0 and defaclobjtype='f') is distinct from (select default_executor from d06_estado_inicial) then
   raise exception 'objeto existente ou default do executor alterado';
 end if;
end $$;
set local role anon;
do $$ begin
 begin perform d06_owner_identidade.nova(); raise exception 'anon executou função';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform d06_owner_cadastro.nova(); raise exception 'authenticated executou função';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
