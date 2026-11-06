\set ON_ERROR_STOP on
\ir plano_cuidado_paginacao_local.sql
create role ffcm_migrador_auditoria_plano_fixture nologin nosuperuser nocreaterole;
grant usage,create on schema api to ffcm_migrador_auditoria_plano_fixture with grant option;
grant ffcmapp_plano_owner to ffcm_migrador_auditoria_plano_fixture with inherit false, set true;
grant ffcm_migrador_auditoria_plano_fixture to current_user with inherit false, set true;
do $$ begin if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api' and a.grantee='ffcmapp_plano_owner'::regrole and a.privilege_type='CREATE') then raise exception 'FIXTURE_CREATE_EXISTENTE'; end if; end $$;
create temp table auditoria_owner_acl_antes as select proowner,proacl from pg_proc where oid='api.plano_cuidado_operacao_privada(jsonb)'::regprocedure;
set role ffcm_migrador_auditoria_plano_fixture;
\ir ../migrations/20261112122000_plano_auditoria_obrigatoria.sql
reset role;
do $$ begin
 if not pg_has_role('ffcm_migrador_auditoria_plano_fixture','ffcmapp_plano_owner','SET')
  or exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='api' and a.grantee='ffcmapp_plano_owner'::regrole and a.privilege_type='CREATE') then raise exception 'PRIVILEGIO_ALTERADO'; end if;
end $$;
do $$ begin if exists(select 1 from pg_proc p cross join auditoria_owner_acl_antes a where p.oid='api.plano_cuidado_operacao_privada(jsonb)'::regprocedure and (p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl)) then raise exception 'OWNER_OU_ACL_ALTERADOS'; end if; end $$;
update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000002';
create function public.suprimir_auditoria_plano_fixture() returns trigger language plpgsql as $$
begin if current_setting('fixture.suprimir_auditoria',true)='sim' then return null; end if; return new; end $$;
create trigger suprimir_auditoria_plano before insert on auditoria.evento for each row execute function public.suprimir_auditoria_plano_fixture();
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; objetivo uuid; registro uuid:=gen_random_uuid(); versao integer; e jsonb;
begin
 select o.id into objetivo from cadastro.objetivo_cuidado o where o.paciente_id=paciente limit 1;
 select max(v.versao) into versao from cadastro.objetivo_cuidado_versao v where v.objetivo_id=objetivo;
 if objetivo is null or versao is null then raise exception 'FIXTURE_SEM_OBJETIVO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 perform set_config('fixture.suprimir_auditoria','sim',true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'cursor',null,'limite',1);
 begin
  perform api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
  raise exception 'LEITURA_SEM_AUDITORIA_ACEITA';
 exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao_esperada',versao,
  'chave_idempotencia','plano-supressao-fixture','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao',versao+1,'campo','conteudo','formato',1));
 begin
  perform api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
  raise exception 'ESCRITA_SEM_AUDITORIA_ACEITA';
 exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 if exists(select 1 from cadastro.objetivo_cuidado_versao where id=registro) or exists(select 1 from operacao.requisicao where chave_idempotencia='plano-supressao-fixture') then raise exception 'ROLLBACK_INCOMPLETO'; end if;
end $$;
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; objetivo uuid; registro uuid:=gen_random_uuid(); versao integer; req uuid:=gen_random_uuid(); e jsonb; r jsonb;
begin
 select o.id into objetivo from cadastro.objetivo_cuidado o where o.paciente_id=paciente limit 1;
 select max(v.versao) into versao from cadastro.objetivo_cuidado_versao v where v.objetivo_id=objetivo;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'cursor',null,'limite',1);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'LEITURA_NEGADA'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao_esperada',versao,
  'chave_idempotencia','plano-sucesso-auditoria-fixture','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao',versao+1,'campo','conteudo','formato',1));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.objetivo_cuidado_versao where id=registro) then raise exception 'ESCRITA_NEGADA'; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'cursor',null,'limite',1);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'SESSAO_ENCERRADA_ACEITA'; end if;
end $$;
