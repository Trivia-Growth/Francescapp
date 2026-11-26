-- DF-021: apenas fixtures fictícias em PostgreSQL descartável.
\set ON_ERROR_STOP on
\ir acompanhamento_caso_local.sql
\ir ../migrations/20261118100000_habilitacao_plano_crise_concessao.sql
\ir ../migrations/20261118110000_plano_crise_versoes_privadas.sql
\ir ../migrations/20261118120000_plano_crise_operacoes_privadas.sql
\ir ../migrations/20261118130000_grant_plano_crise_teste.sql
-- Migrador sem superuser: herda propriedade dos objetos da fixture, nunca SUPERUSER.
-- ADMIN OPTION sem SET prévio e concedente distinto deve sobreviver ao grant temporário.
create role crise_migrador_fixture nologin nosuperuser createrole;
grant usage on schema identidade,cadastro,operacao,api,public to crise_migrador_fixture;
do $$ declare dono text; begin
 for dono in select distinct r.rolname from pg_roles r where r.oid in (
  select relowner from pg_class where oid in ('identidade.concessao_equipe'::regclass,
   'cadastro.plano_crise_aprovacao'::regclass,'cadastro.acompanhamento_caso'::regclass)
  union select nspowner from pg_namespace where nspname='api'
  union select proowner from pg_proc where oid='operacao.habilitacao_plano_crise_privada(jsonb)'::regprocedure
 ) loop
  execute format('grant %I to crise_migrador_fixture with inherit true, set false',dono);
 end loop;
end $$;
grant ffcmapp_plano_crise_owner to crise_migrador_fixture with admin true, inherit false, set false;
begin;
set role crise_migrador_fixture;
\ir ../migrations/20261125040000_plano_crise_case_manager_atual.sql
do $$ begin
 if pg_has_role(current_user,'ffcmapp_plano_crise_owner','SET') then raise exception 'SET_TEMPORARIO_RESTANTE'; end if;
 if exists(select 1 from pg_auth_members where roleid='ffcmapp_plano_crise_owner'::regrole
  and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'GRANT_TEMPORARIO_RESTANTE'; end if;
 if not exists(select 1 from pg_auth_members where roleid='ffcmapp_plano_crise_owner'::regrole
  and member=current_user::regrole and grantor='cadeia_fixture'::regrole and admin_option and not set_option and not inherit_option)
 then raise exception 'MEMBERSHIP_ORIGINAL_ALTERADA'; end if;
 if exists(select 1 from pg_namespace n cross join lateral aclexplode(n.nspacl) a
  where n.nspname='api' and a.grantee='ffcmapp_plano_crise_owner'::regrole and a.privilege_type='CREATE')
 then raise exception 'CREATE_TEMPORARIO_RESTANTE'; end if;
end $$;
reset role;
rollback;

begin;
grant ffcmapp_plano_crise_owner to crise_migrador_fixture with admin true, inherit true, set true;
grant create on schema api to ffcmapp_plano_crise_owner;
create temp table crise_acl_anterior as
 select 'membership' tipo,to_jsonb(m) dados from pg_auth_members m where roleid='ffcmapp_plano_crise_owner'::regrole
 union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api';
set role crise_migrador_fixture;
\ir ../migrations/20261125040000_plano_crise_case_manager_atual.sql
do $$ begin
 if exists(
  (select * from crise_acl_anterior except
   (select 'membership',to_jsonb(m) from pg_auth_members m where roleid='ffcmapp_plano_crise_owner'::regrole
    union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api'))
  union all
  ((select 'membership',to_jsonb(m) from pg_auth_members m where roleid='ffcmapp_plano_crise_owner'::regrole
    union all select 'schema',jsonb_build_object('acl',nspacl) from pg_namespace where nspname='api')
   except select * from crise_acl_anterior)
 ) then raise exception 'ACL_PREEXISTENTE_ALTERADA'; end if;
end $$;
reset role;
rollback;
\ir ../migrations/20261125040000_plano_crise_case_manager_atual.sql

-- Toda aprovação cruza wrapper como authenticated: não depende de esconder controle.
create function public.aprovar_crise_caso_fixture(ator uuid, sessao uuid, paciente uuid, chave text)
returns jsonb language plpgsql as $$
declare t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,
  'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),
  'paciente_id',paciente,'registro_id',v.id,'versao',v.versao,'chave_idempotencia',chave,
  'digest_idempotencia',repeat('c',43)),'api.aprovar_plano_crise',ator,sessao)
 into t from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 execute 'set local role authenticated';
 r:=api.plano_crise_operacao_privada(t);
 execute 'reset role';
 return r;
end $$;

do $$
#variable_conflict use_variable
declare
 admin uuid:='10000000-0000-4000-8000-000000000001'; sa uuid:='20000000-0000-4000-8000-000000000001';
 prof uuid:='10000000-0000-4000-8000-000000000002'; sp uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; reg uuid:=gen_random_uuid(); r jsonb; c uuid; ator uuid;
begin
 -- Plano fictício, mesmo envelope/AAD validado pelos testes originais de FR-020.
 insert into cadastro.plano_crise_versao(id,paciente_id,versao,conteudo_cifrado,criado_por_usuario_id)
 values(reg,paciente,1,jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),prof);
 -- Administrador administra habilitação de ambos os perfis pelo wrapper real.
 foreach ator in array array[admin,prof] loop
  select id into c from identidade.concessao_equipe where usuario_id=ator;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',sa,
   'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  r:=api.habilitacao_plano_crise_privado(public.assinar_anamnese_fixture(jsonb_build_object(
   'request_id',gen_random_uuid(),'concessao_id',c,'habilitado',true,'versao_esperada',0,
   'chave_idempotencia',ator::text,'digest_idempotencia',repeat('h',43),'auditoria_id',gen_random_uuid()),
   'api.gravar_habilitacao_plano_crise',admin,sa));
  if r->>'ok' is distinct from 'true' then raise exception 'HABILITACAO: %',r; end if;
 end loop;
 -- Designar admin usa operação real e não permite que profissional habilitado de outro caso aprove.
 r:=public.editar_fixture(admin,sa,paciente,'crise-resp-admin',jsonb_build_object('responsavel_id',admin));
 if r->>'ok' is distinct from 'true' then raise exception 'DESIGNACAO_ADMIN: %',r; end if;
 r:=public.aprovar_crise_caso_fixture(prof,sp,paciente,'outro-responsavel');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'OUTRO_CASO_APROVOU: %',r; end if;
 -- Mesmo papel interno não contorna RLS inserindo carimbo sem ser responsável.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',prof,'session_id',sp,
  'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 begin
  execute 'set local role ffcmapp_plano_crise_owner';
  insert into cadastro.plano_crise_aprovacao(id,registro_id,paciente_id,aprovador_usuario_id,concessao_id)
  values(gen_random_uuid(),reg,paciente,prof,'30000000-0000-4000-8000-000000000002');
  raise exception 'RLS_CONTORNADA';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 -- Liderança atual sem habilitação não basta nem para Administrador.
 update identidade.concessao_equipe set habilitado_plano_crise=false where usuario_id=admin;
 r:=public.aprovar_crise_caso_fixture(admin,sa,paciente,'admin-sem-habilitacao');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ADMIN_SEM_MARCA: %',r; end if;
 update identidade.concessao_equipe set habilitado_plano_crise=true where usuario_id=admin;
 -- Admin habilitado e case manager atual aprova; coordenação não cria quarto perfil.
 r:=public.aprovar_crise_caso_fixture(admin,sa,paciente,'admin-case-manager');
 if r->>'ok' is distinct from 'true' then raise exception 'ADMIN_CASE_MANAGER: %',r; end if;
 -- Troca de titular revoga imediatamente o antigo, inclusive replay da mesma chave.
 r:=public.editar_fixture(admin,sa,paciente,'crise-resp-prof',jsonb_build_object('responsavel_id',prof));
 if r->>'ok' is distinct from 'true' then raise exception 'DESIGNACAO_PROF: %',r; end if;
 r:=public.aprovar_crise_caso_fixture(admin,sa,paciente,'admin-case-manager');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_RESP_ANTIGO: %',r; end if;
 r:=public.aprovar_crise_caso_fixture(prof,sp,paciente,'prof-case-manager');
 if r->>'ok' is distinct from 'true' then raise exception 'PROF_CASE_MANAGER: %',r; end if;
 -- Família nunca aprova, mesmo se identidade anterior tinha marca e permanece responsável.
 update public.usuario set perfil='familia' where id=prof;
 r:=public.aprovar_crise_caso_fixture(prof,sp,paciente,'familia');
 update public.usuario set perfil='profissional' where id=prof;
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_APROVOU: %',r; end if;
 -- Revogação de habilitação e sessão impedem replay sem reescrever carimbos antigos.
 update identidade.concessao_equipe set habilitado_plano_crise=false where usuario_id=prof;
 r:=public.aprovar_crise_caso_fixture(prof,sp,paciente,'prof-case-manager');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'DESABILITADO_APROVOU: %',r; end if;
 update identidade.concessao_equipe set habilitado_plano_crise=true where usuario_id=prof;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sp;
 r:=public.aprovar_crise_caso_fixture(prof,sp,paciente,'prof-case-manager');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_REVOGADA_APROVOU: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sp;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),
  revogada_por_usuario_id=admin,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=prof;
 r:=public.aprovar_crise_caso_fixture(prof,sp,paciente,'prof-case-manager');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA_APROVOU: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,
  revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=prof;
 if (select count(*) from cadastro.plano_crise_aprovacao where registro_id=reg)<>2 then raise exception 'CARIMBOS_PERDIDOS'; end if;
 -- Sem responsável atual é recusa conservadora. Registro anterior não restaura alçada.
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values('a0000000-0000-4000-8000-000000000099',admin,'api.editar_paciente','paciente',paciente,'permitido',gen_random_uuid());
 insert into cadastro.acompanhamento_caso(id,paciente_id,versao,situacao,responsavel_usuario_id,auditoria_id,ator_usuario_id)
 select gen_random_uuid(),paciente,max(versao)+1,'ativo',null,'a0000000-0000-4000-8000-000000000099',admin
 from cadastro.acompanhamento_caso where paciente_id=paciente;
 r:=public.aprovar_crise_caso_fixture(prof,sp,paciente,'sem-responsavel');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SEM_RESPONSAVEL_APROVOU: %',r; end if;
 begin
  execute 'set local role authenticated';
  insert into cadastro.plano_crise_aprovacao(id,registro_id,paciente_id,aprovador_usuario_id,concessao_id)
  values(gen_random_uuid(),reg,paciente,prof,'30000000-0000-4000-8000-000000000002');
  raise exception 'ACESSO_DIRETO_ACEITO';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
end $$;
