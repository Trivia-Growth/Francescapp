\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
create temp table acl_anamnese_antes as select proacl, proowner from pg_proc where oid='api.anamnese_privada(jsonb)'::regprocedure;
create role migrador_grant_anamnese_fixture nologin nosuperuser nocreaterole;
grant usage on schema api to migrador_grant_anamnese_fixture;
grant ffcmapp_anamnese_owner to migrador_grant_anamnese_fixture with inherit false, set true;
grant migrador_grant_anamnese_fixture to current_user with inherit false, set true;
set role migrador_grant_anamnese_fixture;
\ir ../drafts/20261112124000_grant_anamnese.sql
reset role;
do $$ begin
 if not has_function_privilege('authenticated','api.anamnese_privada(jsonb)','execute')
 or has_function_privilege('anon','api.anamnese_privada(jsonb)','execute')
 or has_function_privilege('service_role','api.anamnese_privada(jsonb)','execute')
 or not pg_has_role('migrador_grant_anamnese_fixture','ffcmapp_anamnese_owner','SET')
 then raise exception 'GRANT_OU_MEMBERSHIP_INCORRETO'; end if;
end $$;
set role migrador_grant_anamnese_fixture;
\ir ../drafts/rollback_grant_anamnese.sql
reset role;
do $$ begin
 if exists(select 1 from pg_proc p cross join acl_anamnese_antes a where p.oid='api.anamnese_privada(jsonb)'::regprocedure
  and (p.proacl is distinct from a.proacl or p.proowner is distinct from a.proowner))
 or has_function_privilege('authenticated','api.anamnese_privada(jsonb)','execute')
 or not pg_has_role('migrador_grant_anamnese_fixture','ffcmapp_anamnese_owner','SET')
 then raise exception 'ROLLBACK_OU_MEMBERSHIP_INCORRETO'; end if;
end $$;
