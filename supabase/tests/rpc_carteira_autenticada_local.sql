\set ON_ERROR_STOP on
\ir cadastro_conta_tecnica_local.sql
\ir ../migrations/20261110130000_carteira_tecnica_nativa.sql
\ir ../migrations/20261110160000_rpc_carteira_autenticada.sql
update identidade.sessao set encerrada_em=null where usuario_id=auth.uid();
do $$
declare t jsonb; r jsonb; n integer;
begin
 if not has_function_privilege('authenticated','api.listar_pacientes(jsonb)','execute')
  or has_function_privilege('anon','api.listar_pacientes(jsonb)','execute')
  or has_function_privilege('service_role','api.listar_pacientes(jsonb)','execute')
  or has_function_privilege('authenticated','identidade.listar_carteira_privada(jsonb)','execute')
  or has_table_privilege('authenticated','cadastro.paciente','select') then
  raise exception 'PRIVILEGIOS_INDEVIDOS';
 end if;
 t:=pg_temp.assinar(jsonb_build_object('request_id',gen_random_uuid(),'limite',10),'api.listar_pacientes',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 execute 'set local role authenticated';
 r:=api.listar_pacientes(t);
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'LISTA_AUTORIZADA'; end if;
 begin perform api.listar_pacientes(jsonb_set(t,'{entrada,limite}','11')); raise exception 'ADULTERACAO_ACEITA'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 update identidade.sessao set encerrada_em=clock_timestamp() where usuario_id=auth.uid();
 execute 'set local role authenticated';
 r:=api.listar_pacientes(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO_IGNORADA'; end if;
 execute 'reset role';
 select count(*) into n from auditoria.evento where request_id=(t#>>'{entrada,request_id}')::uuid and resultado in ('permitido','negado');
 if n<>2 then raise exception 'AUDITORIA_AUSENTE'; end if;
end $$;
