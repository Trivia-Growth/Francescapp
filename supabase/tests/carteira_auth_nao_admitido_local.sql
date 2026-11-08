\set ON_ERROR_STOP on
-- Cadeia real e Auth/Vault fictícios em PostgreSQL descartável.
\ir rpc_carteira_autenticada_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
do $$
declare t jsonb; r jsonb; req uuid:=gen_random_uuid();
begin
 t:=pg_temp.assinar(jsonb_build_object('request_id',req,'limite',10),'api.listar_pacientes',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 execute 'set local role authenticated';
 r:=api.listar_pacientes(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'IDENTIDADE_NAO_ADMITIDA_ACEITA'; end if;
 execute 'reset role';
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and operador_restrito is null and resultado='negado') then raise exception 'NEGATIVA_NAO_AUDITADA'; end if;
 if exists(select 1 from public.usuario where id=auth.uid()) then raise exception 'PERFIL_INVENTADO'; end if;
 begin
  execute 'set local role ffcmapp_carteira_owner';
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values (gen_random_uuid(),gen_random_uuid(),'api.listar_pacientes','carteira','negado',gen_random_uuid());
  raise exception 'IDENTIDADE_DE_TERCEIRO_ACEITA';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
-- Depois da migration, ator admitido continua autorizado e sua trilha anterior permanece.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"password"}]}',false);
update identidade.sessao set encerrada_em=null where usuario_id=auth.uid();
do $$
declare t jsonb; r jsonb; req uuid:=gen_random_uuid();
begin
 if not has_function_privilege('authenticated','api.listar_pacientes(jsonb)','execute')
  or has_function_privilege('anon','api.listar_pacientes(jsonb)','execute')
  or has_function_privilege('authenticated','identidade.listar_carteira_privada(jsonb)','execute')
  or has_table_privilege('authenticated','cadastro.paciente','select') then raise exception 'GRANTS_ALTERADOS'; end if;
 t:=pg_temp.assinar(jsonb_build_object('request_id',req,'limite',10),'api.listar_pacientes',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 execute 'set local role authenticated';
 r:=api.listar_pacientes(t);
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'ADMINISTRADOR_NEGADO'; end if;
 execute 'reset role';
 if not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=auth.uid() and ator_auth_id is null and resultado='permitido') then raise exception 'AUDITORIA_ANTERIOR_ALTERADA'; end if;
 create trigger falha_auditoria before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
 begin
  execute 'set local role authenticated';
  perform api.listar_pacientes(t);
  raise exception 'LISTA_ENTREGUE_SEM_AUDITORIA';
 exception when raise_exception then
  if sqlerrm <> 'AUDITORIA_FIXTURE' then raise; end if;
 end;
 execute 'reset role';
 drop trigger falha_auditoria on auditoria.evento;
end $$;
