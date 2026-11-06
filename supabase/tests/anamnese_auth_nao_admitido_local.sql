\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112121000_anamnese_auditoria_obrigatoria.sql
-- Reproduz migrador não-superuser com ADMIN, mas sem SET prévio.
create role ffcm_anamnese_auth_migrador_fixture nologin nosuperuser nocreaterole;
grant usage,create on schema api to ffcm_anamnese_auth_migrador_fixture with grant option;
grant usage on schema auditoria, auth_privado to ffcm_anamnese_auth_migrador_fixture;
grant execute on function auth_privado.uid() to ffcm_anamnese_auth_migrador_fixture;
grant ffcmapp_anamnese_owner to ffcm_anamnese_auth_migrador_fixture with admin true, inherit false, set false;
grant ffcm_anamnese_auth_migrador_fixture to current_user with inherit false, set true;
alter table auditoria.evento owner to ffcm_anamnese_auth_migrador_fixture;
create temp table anamnese_auth_acl_antes as select proowner,proacl from pg_proc where oid='api.anamnese_operacao_privada(jsonb)'::regprocedure;
create temp table anamnese_auth_membership_antes as
 select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members
 where member='ffcm_anamnese_auth_migrador_fixture'::regrole and roleid='ffcmapp_anamnese_owner'::regrole;
create temp table anamnese_auth_schema_antes as select nspacl from pg_namespace where nspname='api';
do $$ begin if pg_has_role('ffcm_anamnese_auth_migrador_fixture','ffcmapp_anamnese_owner','SET') then raise exception 'FIXTURE_SET_INESPERADO'; end if; end $$;
set role ffcm_anamnese_auth_migrador_fixture;
\ir ../migrations/20261112190000_anamnese_auditoria_auth_nao_admitido.sql
reset role;
do $$ begin
 if pg_has_role('ffcm_anamnese_auth_migrador_fixture','ffcmapp_anamnese_owner','SET')
  or exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_anamnese_auth_migrador_fixture'::regrole and roleid='ffcmapp_anamnese_owner'::regrole except select * from anamnese_auth_membership_antes)
   union all (select * from anamnese_auth_membership_antes except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where member='ffcm_anamnese_auth_migrador_fixture'::regrole and roleid='ffcmapp_anamnese_owner'::regrole))
  or exists(select 1 from pg_namespace n cross join anamnese_auth_schema_antes a where n.nspname='api' and n.nspacl is distinct from a.nspacl)
  or exists(select 1 from pg_proc p cross join anamnese_auth_acl_antes a where p.oid='api.anamnese_operacao_privada(jsonb)'::regprocedure and (p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl)) then raise exception 'PRIVILEGIOS_ALTERADOS'; end if;
end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
do $$
#variable_conflict use_variable
declare acao text; req uuid; e jsonb; r jsonb;
begin
 foreach acao in array array['api.ler_anamnese','api.gravar_anamnese'] loop
  req:=gen_random_uuid();
  e:=jsonb_build_object('request_id',req,'paciente_id',gen_random_uuid(),'registro_id',gen_random_uuid(),'versao_esperada',0);
  r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,acao,auth.uid(),(auth.jwt()->>'session_id')::uuid));
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'NEGATIVA_INVALIDA: %',acao; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and resultado='negado' and auditoria.evento.acao=acao) then raise exception 'AUDITORIA_AUSENTE: %',acao; end if;
 end loop;
 if exists(select 1 from public.usuario where id=auth.uid()) then raise exception 'PERFIL_INVENTADO'; end if;
 begin
  execute 'set local role ffcmapp_anamnese_owner';
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),gen_random_uuid(),'api.ler_anamnese','paciente','negado',gen_random_uuid());
  raise exception 'ATOR_FALSIFICADO';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 begin
  execute 'set local role ffcmapp_anamnese_owner';
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),auth.uid(),'api.ler_anamnese','paciente','permitido',gen_random_uuid());
  raise exception 'RESULTADO_FALSIFICADO';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;

-- Policy anterior admitia ator_usuario_id; a restritiva impede acrescentar ator_auth_id.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
do $$ begin
 begin
  execute 'set local role ffcmapp_anamnese_owner';
  insert into auditoria.evento(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,resultado,request_id)
   values(gen_random_uuid(),auth.uid(),'10000000-0000-4000-8000-000000000099','api.ler_anamnese','paciente','negado',gen_random_uuid());
  raise exception 'ATOR_DUPLO_ACEITO';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
