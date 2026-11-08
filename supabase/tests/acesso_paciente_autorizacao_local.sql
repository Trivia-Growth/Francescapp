\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
\ir ../migrations/20261112110000_corrigir_aad_auditoria_acesso.sql
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
 acesso uuid := gen_random_uuid(); outro_acesso uuid := gen_random_uuid(); e jsonb; e2 jsonb; r jsonb;
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
 e:=(e - 'usuario_id') || jsonb_build_object('request_id',gen_random_uuid(),'auditoria_id',gen_random_uuid(),'chave_idempotencia','revogar-fixture','versao_esperada',1,
 'motivo_auditoria',jsonb_build_object('formato',1,'key_id','auditoria','nonce',repeat('b',16),'ciphertext','Yg','tag',repeat('b',22)));
 r:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.revogar_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.acesso_paciente where id=acesso and revogada_em is not null) then raise exception 'REVOGACAO_FALHOU: %',r; end if;
 if not exists(select 1 from auditoria.evento where id=(e->>'auditoria_id')::uuid and motivo_cifrado=e->'motivo_auditoria') then raise exception 'MOTIVO_AUDITORIA_INCORRETO'; end if;
 r:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.revogar_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' or (select versao from cadastro.acesso_paciente where id=acesso) <> 2 then raise exception 'REPLAY_FALHOU: %',r; end if;
 e2:=(e - 'versao_esperada' - 'motivo_auditoria') || jsonb_build_object('request_id',gen_random_uuid(),'auditoria_id',gen_random_uuid(),'acesso_id',outro_acesso,'usuario_id',profissional,'chave_idempotencia','outro-acesso');
 r:=api.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(e2,'api.conceder_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'OUTRO_ACESSO_FALHOU: %',r; end if;
 e2:=(e2 - 'usuario_id') || jsonb_build_object('request_id',gen_random_uuid(),'auditoria_id',e->>'auditoria_id','chave_idempotencia','revogacao-falha','versao_esperada',1,'motivo_auditoria',e->'motivo_auditoria');
 begin
  perform api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e2,'api.revogar_acesso_paciente',ator,sessao));
  raise exception 'AUDITORIA_DUPLICADA_ACEITA';
 exception when unique_violation then null;
 end;
 if not exists(select 1 from cadastro.acesso_paciente where id=outro_acesso and revogada_em is null and versao=1)
  or exists(select 1 from operacao.requisicao where ator_usuario_id=ator and operacao='api.revogar_acesso_paciente' and chave_idempotencia='revogacao-falha') then
  raise exception 'ROLLBACK_INCOMPLETO';
 end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.revogar_acesso_paciente',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ACEITA'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id','20000000-0000-4000-8000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(e,'api.revogar_acesso_paciente',profissional,'20000000-0000-4000-8000-000000000002'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
end $$;
