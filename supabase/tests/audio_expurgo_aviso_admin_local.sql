\set ON_ERROR_STOP on
\ir segredos_integracoes_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261119120000_audio_transcricao_privado.sql
\ir ../migrations/20261119130000_audio_transcricao_operacoes_privadas.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261125030000_audio_expurgo_privado.sql
-- Migrador sem superuser: herda propriedade dos objetos da fixture, nunca SUPERUSER.
-- ADMIN OPTION sem SET prévio e concedente distinto deve sobreviver ao grant temporário.
create role audio_aviso_migrador_fixture nologin nosuperuser createrole;
grant usage on schema identidade,cadastro,operacao,api,public to audio_aviso_migrador_fixture;
do $$ declare dono text; begin
 for dono in select distinct r.rolname from pg_roles r where r.oid in (
  select relowner from pg_class where oid in ('operacao.audio_expurgo_execucao'::regclass,
   'identidade.configuracao_sistema'::regclass)
  union select nspowner from pg_namespace where nspname='api'
 ) loop
  execute format('grant %I to audio_aviso_migrador_fixture with inherit true, set false',dono);
 end loop;
end $$;
grant ffcmapp_segredos_integracoes_owner to audio_aviso_migrador_fixture with admin true, inherit false, set false;
begin;
create temp table audio_aviso_acl_anterior as
 select 'membership' tipo,to_jsonb(m) dados from pg_auth_members m where roleid='ffcmapp_segredos_integracoes_owner'::regrole
 union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api';
grant select on audio_aviso_acl_anterior to audio_aviso_migrador_fixture;
set role audio_aviso_migrador_fixture;
\ir ../migrations/20261125070000_audio_expurgo_aviso_admin.sql
do $$ begin
 if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER'; end if;
 if exists(
  (select * from audio_aviso_acl_anterior except
   (select 'membership',to_jsonb(m) from pg_auth_members m where roleid='ffcmapp_segredos_integracoes_owner'::regrole
    union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api'))
  union all
  ((select 'membership',to_jsonb(m) from pg_auth_members m where roleid='ffcmapp_segredos_integracoes_owner'::regrole
    union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api')
   except select * from audio_aviso_acl_anterior)
 ) then raise exception 'ACL_PREEXISTENTE_ALTERADA'; end if;
end $$;
reset role;
rollback;

begin;
grant ffcmapp_segredos_integracoes_owner to audio_aviso_migrador_fixture with admin true, inherit true, set true;
grant create on schema api to ffcmapp_segredos_integracoes_owner;
create temp table audio_aviso_acl_anterior as
 select 'membership' tipo,to_jsonb(m) dados from pg_auth_members m where roleid='ffcmapp_segredos_integracoes_owner'::regrole
 union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api';
grant select on audio_aviso_acl_anterior to audio_aviso_migrador_fixture;
set role audio_aviso_migrador_fixture;
\ir ../migrations/20261125070000_audio_expurgo_aviso_admin.sql
do $$ begin
 if exists(
  (select * from audio_aviso_acl_anterior except
   (select 'membership',to_jsonb(m) from pg_auth_members m where roleid='ffcmapp_segredos_integracoes_owner'::regrole
    union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api'))
  union all
  ((select 'membership',to_jsonb(m) from pg_auth_members m where roleid='ffcmapp_segredos_integracoes_owner'::regrole
    union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api')
   except select * from audio_aviso_acl_anterior)
 ) then raise exception 'ACL_PREEXISTENTE_ALTERADA'; end if;
end $$;
reset role;
rollback;
\ir ../migrations/20261125070000_audio_expurgo_aviso_admin.sql

-- Só recibos fictícios. Esta prova nunca executa limpeza.
update identidade.sessao set revogada_em=null, revogada_por_usuario_id=null,motivo_revogacao_cifrado=null
where session_id='20000000-0000-4000-8000-000000000001';
insert into operacao.audio_expurgo_execucao(id,apagados,falhas) values(gen_random_uuid(),0,2);
do $$
#variable_conflict use_variable
declare ator uuid := '10000000-0000-4000-8000-000000000001'; sessao uuid := '20000000-0000-4000-8000-000000000001'; alvo uuid; r jsonb; papel text;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r := api.consultar_expurgo_audio(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.consultar_expurgo_audio',ator,sessao));
 if r->>'ok' <> 'true' or r#>>'{dados,ativo}' <> 'false' or r#>>'{dados,ultima_execucao,falhas}' <> '2' then raise exception 'ADMIN_SEM_AVISO'; end if;
 if r#>'{dados,ultima_execucao,id}' is not null then raise exception 'RECIBO_EXPOS_ID'; end if;
 foreach alvo in array array['10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid] loop
  sessao := replace(alvo::text,'10000000-','20000000-')::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',alvo,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  r := api.consultar_expurgo_audio(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.consultar_expurgo_audio',alvo,sessao));
  if r#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'PERFIL_LEU_AVISO'; end if;
 end loop;
 sessao := '20000000-0000-4000-8000-000000000001';
 update identidade.sessao set revogada_em=clock_timestamp(), revogada_por_usuario_id=ator,
 motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb where session_id=sessao;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r := api.consultar_expurgo_audio(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.consultar_expurgo_audio',ator,sessao));
 if r#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'ADMIN_REVOGADO_LEU'; end if;
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(papel,'operacao.audio_expurgo_execucao','select') then raise exception 'RECIBO_DIRETO'; end if;
 end loop;
end $$;
set role authenticated;
do $$ begin
 begin perform api.consultar_expurgo_audio('{}'); raise exception 'SEM_ATESTADO'; exception when insufficient_privilege then null; end;
 begin perform * from operacao.audio_expurgo_execucao; raise exception 'DIRETO'; exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo AUDIO_EXPURGO_AVISO_ADMIN_OK
