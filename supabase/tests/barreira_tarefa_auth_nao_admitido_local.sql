\set ON_ERROR_STOP on
\ir auditoria_tarefas_auth_nao_admitido_local.sql
\ir ../drafts/barreira_tarefa_cuidado_incompleta.sql
-- Substituir a RPC não pode perder a auditoria da identidade Auth sem perfil.
do $$
declare ator uuid := '10000000-0000-4000-8000-000000000099'; sessao uuid := '20000000-0000-4000-8000-000000000099'; req uuid := gen_random_uuid(); t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 t:=public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',gen_random_uuid()),'api.ler_tarefas_cuidado',ator,sessao);
 execute 'set local role authenticated'; r:=api.ler_tarefas_cuidado_privado(t); execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') then raise exception 'AUDITORIA_AUTH_PERDIDA'; end if;
end $$;
