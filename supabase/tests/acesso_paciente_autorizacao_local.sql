\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
set role authenticated;
do $$ begin
 begin
  perform api.conceder_acesso_paciente_privado('{}'::jsonb);
  raise exception 'RPC_DIRETA_ACEITA';
 exception when insufficient_privilege then null;
 end;
 begin
  perform 1 from cadastro.acesso_paciente limit 1;
  raise exception 'TABELA_DIRETA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$
#variable_conflict use_variable
declare
 ator uuid := '10000000-0000-4000-8000-000000000001';
 sessao uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 paciente uuid := '40000000-0000-4000-8000-000000000001';
 acesso uuid := gen_random_uuid(); e jsonb; r jsonb;
begin
 if has_function_privilege('authenticated','api.conceder_acesso_paciente_privado(jsonb)','execute')
  or has_function_privilege('authenticated','api.revogar_acesso_paciente_privado(jsonb)','execute')
  or has_table_privilege('authenticated','cadastro.acesso_paciente','insert') then
  raise exception 'ACESSO_DIRETO_INDEVIDO';
 end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'acesso_id',acesso,'usuario_id',profissional,'auditoria_id',gen_random_uuid(),
 'chave_idempotencia','acesso-fixture','digest_idempotencia',repeat('a',43),
 'motivo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)));
 r:=api.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.conceder_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'ADMIN_NEGADO: %',r; end if;
 e:=(e - 'usuario_id') || jsonb_build_object('request_id',gen_random_uuid(),'auditoria_id',gen_random_uuid(),'chave_idempotencia','revogar-fixture','versao_esperada',1);
 r:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.revogar_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.acesso_paciente where id=acesso and revogada_em is not null) then raise exception 'REVOGACAO_FALHOU: %',r; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.revogar_acesso_paciente',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ACEITA'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id','20000000-0000-4000-8000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.revogar_acesso_paciente',profissional,'20000000-0000-4000-8000-000000000002'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
end $$;
