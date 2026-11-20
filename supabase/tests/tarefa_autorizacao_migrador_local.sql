\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Preserva owner/ACL/assinaturas/memberships/verificador.
begin;
create role ffcm_tarefa_autorizacao_com_set_fixture nologin nosuperuser nocreaterole;
grant usage,create on schema api to ffcm_tarefa_autorizacao_com_set_fixture with grant option;
grant ffcmapp_tarefa_owner to ffcm_tarefa_autorizacao_com_set_fixture with admin true,inherit false,set true;
grant ffcm_tarefa_autorizacao_com_set_fixture to current_user with inherit false,set true;
grant create on schema api to ffcmapp_tarefa_owner;
create temp table tarefa_autorizacao_membership_antes as select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole);
create temp table tarefa_autorizacao_schema_antes as select nspacl from pg_namespace where nspname='api';
create temp table tarefa_autorizacao_funcoes_antes as select oid,proowner,proacl,proconfig,prosecdef,prorettype,proargtypes from pg_proc where oid in ('api.tarefa_cuidado_operacao_privada(jsonb)'::regprocedure,'api.tarefa_cuidado_privado(jsonb)'::regprocedure,'api.ler_tarefas_cuidado_privado(jsonb)'::regprocedure);
set role ffcm_tarefa_autorizacao_com_set_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'FIXTURE_SUPERUSER'; end if; end $$;
\ir ../migrations/20261125110000_tarefa_autorizacao_somente.sql
reset role;
do $$ begin
 if pg_has_role('ffcm_tarefa_autorizacao_com_set_fixture','ffcmapp_tarefa_owner','SET') is distinct from true
  or exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole) except select * from tarefa_autorizacao_membership_antes)
    union all(select * from tarefa_autorizacao_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole)))
  or exists(select 1 from pg_namespace n cross join tarefa_autorizacao_schema_antes a where n.nspname='api' and n.nspacl is distinct from a.nspacl)
  or exists(select 1 from pg_proc p join tarefa_autorizacao_funcoes_antes a on a.oid=p.oid where p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl or p.proconfig is distinct from a.proconfig or p.prosecdef is distinct from a.prosecdef or p.prorettype is distinct from a.prorettype or p.proargtypes is distinct from a.proargtypes) then raise exception 'CAPABILITY_ALTEROU_PRIVILEGIOS_OU_ASSINATURA'; end if;
end $$;
rollback;

begin;
create role ffcm_tarefa_autorizacao_sem_set_fixture nologin nosuperuser nocreaterole;
grant usage,create on schema api to ffcm_tarefa_autorizacao_sem_set_fixture with grant option;
grant ffcmapp_tarefa_owner to ffcm_tarefa_autorizacao_sem_set_fixture with admin true,inherit false,set false;
grant ffcm_tarefa_autorizacao_sem_set_fixture to current_user with inherit false,set true;
create temp table tarefa_autorizacao_membership_antes as select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole);
create temp table tarefa_autorizacao_schema_antes as select nspacl from pg_namespace where nspname='api';
create temp table tarefa_autorizacao_funcoes_antes as select oid,proowner,proacl,proconfig,prosecdef,prorettype,proargtypes from pg_proc where oid in ('api.tarefa_cuidado_operacao_privada(jsonb)'::regprocedure,'api.tarefa_cuidado_privado(jsonb)'::regprocedure,'api.ler_tarefas_cuidado_privado(jsonb)'::regprocedure);
set role ffcm_tarefa_autorizacao_sem_set_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'FIXTURE_SUPERUSER'; end if; end $$;
\ir ../migrations/20261125110000_tarefa_autorizacao_somente.sql
reset role;
do $$ begin
 if pg_has_role('ffcm_tarefa_autorizacao_sem_set_fixture','ffcmapp_tarefa_owner','SET') is distinct from false
  or exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole) except select * from tarefa_autorizacao_membership_antes)
    union all(select * from tarefa_autorizacao_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole)))
  or exists(select 1 from pg_namespace n cross join tarefa_autorizacao_schema_antes a where n.nspname='api' and n.nspacl is distinct from a.nspacl)
  or exists(select 1 from pg_proc p join tarefa_autorizacao_funcoes_antes a on a.oid=p.oid where p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl or p.proconfig is distinct from a.proconfig or p.prosecdef is distinct from a.prosecdef or p.prorettype is distinct from a.prorettype or p.proargtypes is distinct from a.proargtypes) then raise exception 'CAPABILITY_ALTEROU_PRIVILEGIOS_OU_ASSINATURA'; end if;
end $$;
rollback;
