\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../drafts/criar_concessao_equipe_privado.sql

do $$
declare
 ator uuid := '10000000-0000-4000-8000-000000000001';
 sessao uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 concessao_teste uuid := gen_random_uuid(); e jsonb; r jsonb;
 envelope jsonb := jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 if has_function_privilege('authenticated','operacao.criar_concessao_equipe_privado(jsonb)','execute') then raise exception 'EXECUCAO_DIRETA_PERMITIDA'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',concessao_teste,'email',envelope,'email_hmac',repeat('z',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','concessao-fixture','digest_idempotencia',repeat('a',43));
 r:=operacao.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'pendente' then raise exception 'ADMIN_NEGADO: %',r; end if;
 r:=operacao.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' or (select count(*) from identidade.concessao_equipe where id=concessao_teste) <> 1 then raise exception 'REPLAY_FALHOU: %',r; end if;
 -- Alteração legítima posterior deve aparecer no replay, sem nova criação.
 update identidade.concessao_equipe set perfil='administrador',versao=2 where id=concessao_teste;
 r:=operacao.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{dados,perfil}' is distinct from 'administrador' or r#>>'{dados,versao}' is distinct from '2' then raise exception 'PROJECAO_DESATUALIZADA: %',r; end if;
 -- Administrador vigente recebe estado revogado atual, sem recriar concessão.
 update identidade.concessao_equipe set estado='revogada',versao=3,revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=envelope where id=concessao_teste;
 r:=operacao.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{dados,estado}' is distinct from 'revogada' or r#>>'{dados,versao}' is distinct from '3' then raise exception 'PROJECAO_REVOGADA_INCORRETA: %',r; end if;
 -- Sessão revogada nunca recupera o DTO, mesmo com chave idempotente válida.
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000001';
 r:=operacao.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'REPLAY_SESSAO_REVOGADA: %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id','20000000-0000-4000-8000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=operacao.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',profissional,'20000000-0000-4000-8000-000000000002'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
end $$;
