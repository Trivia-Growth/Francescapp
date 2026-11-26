\set ON_ERROR_STOP on
\ir consulta_paciente_familiar_auditoria_local.sql
\ir ../drafts/corrigir_auditoria_carteira_familiar.sql
\ir ../drafts/corrigir_auditoria_sessao_familiar.sql
grant execute on function api.listar_pacientes_familiar_privado(uuid,integer,uuid) to authenticated;
do $$
declare r jsonb; req uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"password"}]}',true);
 execute 'set local role authenticated';
 r:=api.listar_pacientes_familiar_privado(req,10,null);
 execute 'reset role';
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'CARTEIRA_NEGADA %',r; end if;
 r:=identidade.sessao_familiar_privada(gen_random_uuid(),false);
 if r is null then raise exception 'SESSAO_NEGADA'; end if;
 create trigger suprimir_familiar before insert on auditoria.evento for each row execute function auditoria.suprimir_consulta_familiar_fixture();
 begin
  execute 'set local role authenticated';
  perform api.listar_pacientes_familiar_privado(gen_random_uuid(),10,null);
  raise exception 'CARTEIRA_SEM_AUDITORIA';
 exception when no_data_found then if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 execute 'reset role';
 begin
  perform identidade.sessao_familiar_privada(gen_random_uuid(),false);
  raise exception 'SESSAO_SEM_AUDITORIA';
 exception when no_data_found then if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 drop trigger suprimir_familiar on auditoria.evento;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000002';
 execute 'set local role authenticated';
 r:=api.listar_pacientes_familiar_privado(gen_random_uuid(),10,null);
 execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_REVOGADA_ACEITA'; end if;
 if identidade.sessao_familiar_privada(gen_random_uuid(),false) is not null then raise exception 'SESSAO_REVOGADA_ACEITA'; end if;
end $$;
