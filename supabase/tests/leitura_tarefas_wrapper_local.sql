\set ON_ERROR_STOP on
\ir tarefa_rls_local.sql
\ir ../drafts/wrapper_leitura_tarefas_cuidado.sql
 do $$ begin if has_function_privilege('authenticated','api.ler_tarefas_cuidado_privado(jsonb)','execute') or has_function_privilege('anon','api.ler_tarefas_cuidado_privado(jsonb)','execute') or has_function_privilege('service_role','api.ler_tarefas_cuidado_privado(jsonb)','execute') then raise exception 'WRAPPER_ABERTO'; end if; end $$;
set role ffcmapp_tarefa_owner;
grant execute on function api.ler_tarefas_cuidado_privado(jsonb) to authenticated;
reset role;
do $$ declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; entrada jsonb; t jsonb; r jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente); t:=public.assinar_anamnese_fixture(entrada,'api.ler_tarefas_cuidado',ator,sessao);
 execute 'set local role authenticated'; r:=api.ler_tarefas_cuidado_privado(t);
 if r->>'ok' is distinct from 'true' or jsonb_typeof(r->'dados') is distinct from 'array' then raise exception 'LEITURA_NEGADA'; end if;
 begin perform api.tarefa_cuidado_privado(t); raise exception 'WRAPPER_ESCRITA_EXPOSTO'; exception when insufficient_privilege then null; end;
 t:=public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao);
 begin perform api.ler_tarefas_cuidado_privado(t); raise exception 'ESCRITA_ACEITA'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000002'); t:=public.assinar_anamnese_fixture(entrada,'api.ler_tarefas_cuidado',ator,sessao);
 execute 'set local role authenticated'; r:=api.ler_tarefas_cuidado_privado(t); execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'OUTRO_PACIENTE_ACEITO'; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where id='91000000-0000-4000-8000-000000000001';
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente); t:=public.assinar_anamnese_fixture(entrada,'api.ler_tarefas_cuidado',ator,sessao);
 execute 'set local role authenticated'; r:=api.ler_tarefas_cuidado_privado(t); execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'VINCULO_REVOGADO_ACEITO'; end if;
end $$;
