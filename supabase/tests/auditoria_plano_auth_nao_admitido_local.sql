\set ON_ERROR_STOP on
\ir plano_cuidado_paginacao_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112122000_plano_auditoria_obrigatoria.sql
create temp table plano_acl_antes as select proowner,proacl from pg_proc where oid='api.plano_cuidado_operacao_privada(jsonb)'::regprocedure;
\ir ../migrations/20261112200000_auditoria_plano_auth_nao_admitido.sql
create function public.suprimir_plano_auth_fixture() returns trigger language plpgsql as $$ begin return null; end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
do $$
declare acao_teste text; req uuid; t jsonb; r jsonb;
begin
 foreach acao_teste in array array['api.ler_plano_cuidado','api.ler_historico_objetivo_cuidado','api.gravar_objetivo_cuidado'] loop
  req:=gen_random_uuid();
  t:=public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),acao_teste,auth.uid(),(auth.jwt()->>'session_id')::uuid);
  r:=api.plano_cuidado_privado(t);
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'NEGATIVA_INVALIDA: %',acao_teste; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and resultado='negado' and auditoria.evento.acao=acao_teste) then raise exception 'AUDITORIA_AUSENTE: %',acao_teste; end if;
 end loop;
 create trigger suprimir_plano_auth before insert on auditoria.evento for each row execute function public.suprimir_plano_auth_fixture();
 begin
  perform api.plano_cuidado_privado(t);
  raise exception 'SUPRESSAO_ACEITA';
 exception when no_data_found then
  if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
 end;
 drop trigger suprimir_plano_auth on auditoria.evento;
 if exists(select 1 from public.usuario where id=auth.uid()) then raise exception 'PERFIL_INVENTADO'; end if;
 execute 'set local role ffcmapp_plano_owner';
 begin
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),gen_random_uuid(),'api.ler_plano_cuidado','paciente','negado',gen_random_uuid());
  raise exception 'ATOR_FALSIFICADO';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
do $$ begin
 if exists(select 1 from pg_proc p cross join plano_acl_antes a where p.oid='api.plano_cuidado_operacao_privada(jsonb)'::regprocedure and (p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl)) then raise exception 'OWNER_OU_ACL_ALTERADOS'; end if;
 execute 'set local role ffcmapp_plano_owner';
 begin
  insert into auditoria.evento(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,resultado,request_id)
   values(gen_random_uuid(),auth.uid(),'10000000-0000-4000-8000-000000000099','api.ler_plano_cuidado','paciente','negado',gen_random_uuid());
  raise exception 'ATOR_DUPLO_ACEITO';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
