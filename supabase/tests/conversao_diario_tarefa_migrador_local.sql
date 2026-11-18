\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. DDL completo sob NOSUPER/NOBYPASS; alterações de owner
-- são apenas setup transacional da fixture descartável, revertidas por rollback.
begin;
create role ffcm_conversao_migrador_com_set_fixture nologin nosuperuser createrole noinherit nobypassrls;
grant ffcm_conversao_migrador_com_set_fixture to current_user with inherit false,set true;
grant ffcmapp_tarefa_owner,ffcmapp_diario_owner,ffcmapp_atestado_verificador_owner to ffcm_conversao_migrador_com_set_fixture with admin true,inherit false,set true;
grant usage,create on schema public,api,identidade,cadastro,operacao,auditoria,auth_privado,bloqueios_auth to ffcm_conversao_migrador_com_set_fixture with grant option;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcm_conversao_migrador_com_set_fixture with grant option;
do $$ declare t record; begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','identidade','cadastro','operacao','auditoria') and c.relkind in ('r','p') loop execute format('alter table %I.%I owner to ffcm_conversao_migrador_com_set_fixture',t.nspname,t.relname); end loop;
end $$;
create temp table conversao_membership_antes as select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_diario_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole);
create temp table conversao_schema_antes as select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api';
create temp table conversao_funcoes_antes as select oid,proowner,proconfig,prosecdef,prorettype,proargtypes from pg_proc where oid in ('api.ler_tarefas_cuidado_privado(jsonb)'::regprocedure,'api.tarefa_cuidado_privado(jsonb)'::regprocedure,'api.diario_privado(jsonb)'::regprocedure,'identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)'::regprocedure);
create temp table conversao_acl_antes as select p.oid,a.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in(select oid from conversao_funcoes_antes);
set role ffcm_conversao_migrador_com_set_fixture;
do $$ begin if (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_PRIVILEGIADO_FIXTURE'; end if; end $$;
\ir ../migrations/20261125120000_conversao_diario_tarefa_atomica.sql
reset role;
do $$ begin
 if exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_diario_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole) except select * from conversao_membership_antes)
  union all(select * from conversao_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_diario_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole)))
  or exists(select * from conversao_schema_antes except select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api')
  or exists(select 1 from pg_proc p join conversao_funcoes_antes a on a.oid=p.oid where p.proowner is distinct from a.proowner or p.proconfig is distinct from a.proconfig or p.prosecdef is distinct from a.prosecdef or p.prorettype is distinct from a.prorettype or p.proargtypes is distinct from a.proargtypes)
  or exists((select p.oid,a.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in(select oid from conversao_funcoes_antes) and a.grantee<>'ffcmapp_conversao_diario_tarefa_owner'::regrole except select * from conversao_acl_antes)
   union all(select * from conversao_acl_antes except select p.oid,a.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in(select oid from conversao_funcoes_antes) and a.grantee<>'ffcmapp_conversao_diario_tarefa_owner'::regrole))
  or has_schema_privilege('ffcmapp_conversao_diario_tarefa_owner','api','CREATE') then raise exception 'CONVERSAO_ALTEROU_PRIVILEGIO_PREEXISTENTE'; end if;
end $$;
rollback;

begin;
create role ffcm_conversao_migrador_sem_set_fixture nologin nosuperuser createrole noinherit nobypassrls;
grant ffcm_conversao_migrador_sem_set_fixture to current_user with inherit false,set true;
grant ffcmapp_tarefa_owner,ffcmapp_diario_owner,ffcmapp_atestado_verificador_owner to ffcm_conversao_migrador_sem_set_fixture with admin true,inherit false,set false;
grant usage,create on schema public,api,identidade,cadastro,operacao,auditoria,auth_privado,bloqueios_auth to ffcm_conversao_migrador_sem_set_fixture with grant option;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcm_conversao_migrador_sem_set_fixture with grant option;
do $$ declare t record; begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','identidade','cadastro','operacao','auditoria') and c.relkind in ('r','p') loop execute format('alter table %I.%I owner to ffcm_conversao_migrador_sem_set_fixture',t.nspname,t.relname); end loop;
end $$;
create temp table conversao_membership_antes as select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_diario_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole);
create temp table conversao_schema_antes as select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api';
create temp table conversao_funcoes_antes as select oid,proowner,proconfig,prosecdef,prorettype,proargtypes from pg_proc where oid in ('api.ler_tarefas_cuidado_privado(jsonb)'::regprocedure,'api.tarefa_cuidado_privado(jsonb)'::regprocedure,'api.diario_privado(jsonb)'::regprocedure,'identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)'::regprocedure);
create temp table conversao_acl_antes as select p.oid,a.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in(select oid from conversao_funcoes_antes);
set role ffcm_conversao_migrador_sem_set_fixture;
do $$ begin if (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_PRIVILEGIADO_FIXTURE'; end if; end $$;
\ir ../migrations/20261125120000_conversao_diario_tarefa_atomica.sql
reset role;
do $$ begin
 if exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_diario_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole) except select * from conversao_membership_antes)
  union all(select * from conversao_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid in ('ffcmapp_tarefa_owner'::regrole,'ffcmapp_diario_owner'::regrole,'ffcmapp_atestado_verificador_owner'::regrole)))
  or exists(select * from conversao_schema_antes except select a.* from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api')
  or exists(select 1 from pg_proc p join conversao_funcoes_antes a on a.oid=p.oid where p.proowner is distinct from a.proowner or p.proconfig is distinct from a.proconfig or p.prosecdef is distinct from a.prosecdef or p.prorettype is distinct from a.prorettype or p.proargtypes is distinct from a.proargtypes)
  or exists((select p.oid,a.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in(select oid from conversao_funcoes_antes) and a.grantee<>'ffcmapp_conversao_diario_tarefa_owner'::regrole except select * from conversao_acl_antes)
   union all(select * from conversao_acl_antes except select p.oid,a.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in(select oid from conversao_funcoes_antes) and a.grantee<>'ffcmapp_conversao_diario_tarefa_owner'::regrole))
  or has_schema_privilege('ffcmapp_conversao_diario_tarefa_owner','api','CREATE') then raise exception 'CONVERSAO_ALTEROU_PRIVILEGIO_PREEXISTENTE'; end if;
end $$;
rollback;
