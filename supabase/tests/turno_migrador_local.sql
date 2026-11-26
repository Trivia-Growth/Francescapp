\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Migração completa sob NOSUPERUSER/CREATEROLE.
-- Owners de tabelas são ajustados APENAS no banco descartável e revertidos por ROLLBACK.
-- Owners de turno são novos; membership preexistente relevante é do verificador.
begin;
create role ffcm_turno_migrador_com_set_fixture nologin nosuperuser createrole noinherit;
grant ffcm_turno_migrador_com_set_fixture to current_user with inherit false,set true;
grant ffcmapp_atestado_verificador_owner to ffcm_turno_migrador_com_set_fixture with admin true,inherit false,set true;
grant usage,create on schema public,api,identidade,cadastro,operacao,auditoria,auth_privado,bloqueios_auth to ffcm_turno_migrador_com_set_fixture with grant option;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.identidades(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcm_turno_migrador_com_set_fixture with grant option;
do $$ declare t record; begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','identidade','cadastro','operacao','auditoria') and c.relkind in ('r','p') loop
  execute format('alter table %I.%I owner to ffcm_turno_migrador_com_set_fixture',t.nspname,t.relname);
 end loop;
end $$;
create temp table turno_membership_antes as select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_turno_migrador_com_set_fixture'::regrole and roleid='ffcmapp_atestado_verificador_owner'::regrole;
create temp table turno_schema_antes as select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api';
set role ffcm_turno_migrador_com_set_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'FIXTURE_SUPERUSER'; end if; end $$;
\ir ../migrations/20261125080000_turno_execucao_privada.sql
reset role;
do $$ begin
 if pg_has_role('ffcm_turno_migrador_com_set_fixture','ffcmapp_atestado_verificador_owner','SET') is distinct from true
  or exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_turno_migrador_com_set_fixture'::regrole and roleid='ffcmapp_atestado_verificador_owner'::regrole except select * from turno_membership_antes)
    union all(select * from turno_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_turno_migrador_com_set_fixture'::regrole and roleid='ffcmapp_atestado_verificador_owner'::regrole))
  or exists(select * from turno_schema_antes except select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api')
  or not has_schema_privilege('ffcm_turno_migrador_com_set_fixture','api','CREATE') then raise exception 'PRIVILEGIO_PREEXISTENTE_ALTERADO'; end if;
end $$;
rollback;

begin;
create role ffcm_turno_migrador_sem_set_fixture nologin nosuperuser createrole noinherit;
grant ffcm_turno_migrador_sem_set_fixture to current_user with inherit false,set true;
grant ffcmapp_atestado_verificador_owner to ffcm_turno_migrador_sem_set_fixture with admin true,inherit false,set false;
grant usage,create on schema public,api,identidade,cadastro,operacao,auditoria,auth_privado,bloqueios_auth to ffcm_turno_migrador_sem_set_fixture with grant option;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.identidades(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcm_turno_migrador_sem_set_fixture with grant option;
do $$ declare t record; begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','identidade','cadastro','operacao','auditoria') and c.relkind in ('r','p') loop
  execute format('alter table %I.%I owner to ffcm_turno_migrador_sem_set_fixture',t.nspname,t.relname);
 end loop;
end $$;
create temp table turno_membership_antes as select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_turno_migrador_sem_set_fixture'::regrole and roleid='ffcmapp_atestado_verificador_owner'::regrole;
create temp table turno_schema_antes as select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api';
set role ffcm_turno_migrador_sem_set_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'FIXTURE_SUPERUSER'; end if; end $$;
\ir ../migrations/20261125080000_turno_execucao_privada.sql
reset role;
do $$ begin
 if pg_has_role('ffcm_turno_migrador_sem_set_fixture','ffcmapp_atestado_verificador_owner','SET') is distinct from false
  or exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_turno_migrador_sem_set_fixture'::regrole and roleid='ffcmapp_atestado_verificador_owner'::regrole except select * from turno_membership_antes)
    union all(select * from turno_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_turno_migrador_sem_set_fixture'::regrole and roleid='ffcmapp_atestado_verificador_owner'::regrole))
  or exists(select * from turno_schema_antes except select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api')
  or not has_schema_privilege('ffcm_turno_migrador_sem_set_fixture','api','CREATE') then raise exception 'PRIVILEGIO_PREEXISTENTE_ALTERADO'; end if;
end $$;
rollback;
