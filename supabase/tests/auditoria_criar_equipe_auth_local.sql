\set ON_ERROR_STOP on
\ir replay_concessao_equipe_versionado_local.sql
-- Fixture de cadeia anterior não aplica a migration de auditoria Auth compartilhada.
alter table auditoria.evento add column ator_auth_id uuid;
alter table auditoria.evento drop constraint evento_ator_ou_operador_chk;
alter table auditoria.evento add constraint evento_ator_ou_operador_chk check (num_nonnulls(ator_usuario_id,operador_restrito,ator_auth_id)=1);
\ir ../migrations/20261112330000_auditoria_criar_equipe_auth.sql
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000099'; sessao uuid:='20000000-0000-4000-8000-000000000099'; req uuid:=gen_random_uuid(); alvo uuid:=gen_random_uuid(); e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 e:=jsonb_build_object('request_id',req,'concessao_id',alvo,'auditoria_id',gen_random_uuid());
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'NEGATIVA_AUSENTE'; end if;
 if (select count(*) from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and acao='api.criar_concessao_equipe' and objeto_id=alvo and resultado='negado')<>1 then raise exception 'AUDITORIA_AUTH_AUSENTE'; end if;
 if has_function_privilege('authenticated','api.criar_concessao_equipe_privado(jsonb)','execute') or has_function_privilege('anon','api.criar_concessao_equipe_privado(jsonb)','execute') then raise exception 'WRAPPER_EXPOSTO'; end if;
end $$;

-- A policy não aceita atribuição a outro Auth, sucesso ou Auth com perfil.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000099'; perfil uuid:='10000000-0000-4000-8000-000000000003'; negada boolean;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator)::text,true);
 perform set_config('role','ffcmapp_criar_equipe_owner',true);
 negada:=false;
 begin
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),perfil,'api.criar_concessao_equipe','concessao_equipe',gen_random_uuid(),'negado',gen_random_uuid());
 exception when insufficient_privilege then negada:=true; end;
 if not negada then raise exception 'AUDITORIA_ATOR_FORJADO_ACEITA'; end if;
 negada:=false;
 begin
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',gen_random_uuid(),'permitido',gen_random_uuid());
 exception when insufficient_privilege then negada:=true; end;
 if not negada then raise exception 'AUDITORIA_AUTH_PERMITIDA_ACEITA'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',perfil)::text,true);
 negada:=false;
 begin
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),perfil,'api.criar_concessao_equipe','concessao_equipe',gen_random_uuid(),'negado',gen_random_uuid());
 exception when insufficient_privilege then negada:=true; end;
 if not negada then raise exception 'AUDITORIA_AUTH_COM_PERFIL_ACEITA'; end if;
 perform set_config('role','none',true);
end $$;
