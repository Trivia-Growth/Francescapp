\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
create role ffcm_migrador_auditoria_anamnese_fixture nologin nosuperuser nocreaterole;
grant usage,create on schema api to ffcm_migrador_auditoria_anamnese_fixture with grant option;
grant ffcmapp_anamnese_owner to ffcm_migrador_auditoria_anamnese_fixture with inherit false, set true;
grant ffcm_migrador_auditoria_anamnese_fixture to current_user with inherit false, set true;
grant create on schema api to ffcmapp_anamnese_owner;
create temp table auditoria_owner_acl_antes as select proowner,proacl from pg_proc where oid='api.anamnese_operacao_privada(jsonb)'::regprocedure;
set role ffcm_migrador_auditoria_anamnese_fixture;
\ir ../migrations/20261112121000_anamnese_auditoria_obrigatoria.sql
reset role;
do $$ begin
 if not pg_has_role('ffcm_migrador_auditoria_anamnese_fixture','ffcmapp_anamnese_owner','SET')
  or not exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api' and a.grantee='ffcmapp_anamnese_owner'::regrole and a.privilege_type='CREATE') then raise exception 'PRIVILEGIO_PREEXISTENTE_PERDIDO'; end if;
end $$;
-- ADMIN sem SET simula o migrador real; a associação temporária deve desaparecer.
create role ffcm_anamnese_sem_set_fixture nologin nosuperuser nocreaterole;
grant usage,create on schema api to ffcm_anamnese_sem_set_fixture with grant option;
grant ffcmapp_anamnese_owner to ffcm_anamnese_sem_set_fixture with admin true, inherit false, set false;
grant ffcm_anamnese_sem_set_fixture to current_user with inherit false, set true;
create temp table anamnese_membership_antes as
 select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members
 where member='ffcm_anamnese_sem_set_fixture'::regrole and roleid='ffcmapp_anamnese_owner'::regrole;
create temp table anamnese_schema_antes as select nspacl from pg_namespace where nspname='api';
do $$ begin if pg_has_role('ffcm_anamnese_sem_set_fixture','ffcmapp_anamnese_owner','SET') then raise exception 'FIXTURE_SET_INESPERADO'; end if; end $$;
set role ffcm_anamnese_sem_set_fixture;
\ir ../migrations/20261112121000_anamnese_auditoria_obrigatoria.sql
reset role;
do $$ begin
 if pg_has_role('ffcm_anamnese_sem_set_fixture','ffcmapp_anamnese_owner','SET')
  or exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_anamnese_sem_set_fixture'::regrole and roleid='ffcmapp_anamnese_owner'::regrole except select * from anamnese_membership_antes)
   union all (select * from anamnese_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_anamnese_sem_set_fixture'::regrole and roleid='ffcmapp_anamnese_owner'::regrole))
  or exists(select 1 from pg_namespace n cross join anamnese_schema_antes a where n.nspname='api' and n.nspacl is distinct from a.nspacl) then raise exception 'PRIVILEGIO_SEM_SET_ALTERADO'; end if;
end $$;
do $$ begin if exists(select 1 from pg_proc p cross join auditoria_owner_acl_antes a where p.oid='api.anamnese_operacao_privada(jsonb)'::regprocedure and (p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl)) then raise exception 'OWNER_OU_ACL_ALTERADOS'; end if; end $$;
create function public.suprimir_auditoria_obrigatoria_fixture() returns trigger language plpgsql as $$
begin if current_setting('fixture.suprimir_auditoria',true)='sim' then return null; end if; return new; end $$;
create trigger suprimir_auditoria_obrigatoria before insert on auditoria.evento for each row execute function public.suprimir_auditoria_obrigatoria_fixture();
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000002'; e jsonb; registro uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 perform set_config('fixture.suprimir_auditoria','sim',true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 begin
  perform api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao));
  raise exception 'LEITURA_SEM_AUDITORIA_ACEITA';
 exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 begin
  perform public.gravar_anamnese_fixture('supressao-auditoria',registro);
  raise exception 'ESCRITA_SEM_AUDITORIA_ACEITA';
 exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 if exists(select 1 from cadastro.anamnese_versao where id=registro) or exists(select 1 from operacao.requisicao where chave_idempotencia='supressao-auditoria') then raise exception 'ROLLBACK_INCOMPLETO'; end if;
end $$;

do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000002'; registro uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=public.gravar_anamnese_fixture('sucesso-auditoria-fixture',registro);
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.anamnese_versao where id=registro) then raise exception 'ESCRITA_NEGADA'; end if;
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
 r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'LEITURA_NEGADA'; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 e:=jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid()));
 r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'SESSAO_ENCERRADA_ACEITA'; end if;
end $$;
