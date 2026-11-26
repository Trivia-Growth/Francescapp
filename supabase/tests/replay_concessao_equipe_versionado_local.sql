\set ON_ERROR_STOP on
\ir criar_concessao_equipe_privado_local.sql
-- A migration inteira falha em transação com recibos legados presentes.
\set ON_ERROR_STOP off
begin;
\ir ../migrations/20261112320000_replay_concessao_equipe_versionado.sql
\if :ERROR
\else
  \echo migration aceitou recibos legados
  \quit 1
\endif
rollback;
\set ON_ERROR_STOP on
do $$ begin
 if position('candidatos_idempotencia' in pg_get_functiondef('operacao.criar_concessao_equipe_privado(jsonb)'::regprocedure)) > 0 then
  raise exception 'MIGRATION_LEGADA_MUTOU_FUNCAO';
 end if;
end $$;
delete from operacao.requisicao where operacao='api.criar_concessao_equipe';
\ir ../migrations/20261112320000_replay_concessao_equipe_versionado.sql
update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id='10000000-0000-4000-8000-000000000001';
do $$
declare
 ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 id_antigo uuid:=gen_random_uuid(); id_novo uuid:=gen_random_uuid(); e jsonb; r jsonb;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
 antigo jsonb; novo jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 antigo:=jsonb_build_object('concessao_id',id_antigo,'digest_idempotencia',repeat('a',43));
 novo:=jsonb_build_object('concessao_id',id_novo,'digest_idempotencia',repeat('b',43));
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',id_antigo,'email',envelope,'email_hmac',repeat('q',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','rotacao-fixture','digest_idempotencia',repeat('a',43),'versao_idempotencia','v1','candidatos_idempotencia',jsonb_build_object('v1',antigo));
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'CRIACAO_FALHOU %',r; end if;
 e:=e || jsonb_build_object('concessao_id',id_novo,'digest_idempotencia',repeat('b',43),'versao_idempotencia','v2','candidatos_idempotencia',jsonb_build_object('v1',antigo,'v2',novo));
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,concessao_id}' is distinct from id_antigo::text then raise exception 'REPLAY_ROTACAO_FALHOU %',r; end if;
 e:=jsonb_set(e,'{candidatos_idempotencia,v1,digest_idempotencia}',to_jsonb(repeat('c',43)));
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'COMANDO_ALTERADO_ACEITO %',r; end if;
 e:=jsonb_set(e,'{candidatos_idempotencia}',jsonb_build_object('v2',novo));
 begin
  perform api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
  raise exception 'VERSAO_AUSENTE_ACEITA';
 exception when sqlstate 'PZ001' then null;
 end;
end $$;

-- Durante rotação, segunda versão espera recibo da primeira e devolve mesmo UUID.
do $$
declare
 conexao text:=format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user);
 claims text:='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}';
 id_antigo uuid:=gen_random_uuid(); id_novo uuid:=gen_random_uuid(); e jsonb; e_novo jsonb; r jsonb; comando text;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
 antigo jsonb; novo jsonb;
begin
 antigo:=jsonb_build_object('concessao_id',id_antigo,'digest_idempotencia',repeat('a',43));
 novo:=jsonb_build_object('concessao_id',id_novo,'digest_idempotencia',repeat('b',43));
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',id_antigo,'email',envelope,'email_hmac',repeat('r',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','rotacao-concorrente','digest_idempotencia',repeat('a',43),'versao_idempotencia','v1','candidatos_idempotencia',jsonb_build_object('v1',antigo));
 e_novo:=e || jsonb_build_object('concessao_id',id_novo,'digest_idempotencia',repeat('b',43),'versao_idempotencia','v2','candidatos_idempotencia',jsonb_build_object('v1',antigo,'v2',novo));
 perform dblink_connect('rotacao_a',conexao); perform dblink_connect('rotacao_b',conexao);
 perform dblink_exec('rotacao_a',format('set request.jwt.claims = %L',claims)); perform dblink_exec('rotacao_b',format('set request.jwt.claims = %L',claims));
 perform dblink_exec('rotacao_a','begin');
 comando:=format('select api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(%L::jsonb,%L,%L::uuid,%L::uuid))',e,'api.criar_concessao_equipe','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 select resultado into r from dblink('rotacao_a',comando) as t(resultado jsonb);
 if r->>'ok' is distinct from 'true' then raise exception 'CRIACAO_CONCORRENTE_FALHOU %',r; end if;
 comando:=format('select api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(%L::jsonb,%L,%L::uuid,%L::uuid))',e_novo,'api.criar_concessao_equipe','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 perform dblink_send_query('rotacao_b',comando); perform pg_sleep(0.1);
 if dblink_is_busy('rotacao_b')<>1 then raise exception 'ROTACAO_NAO_AGUARDOU'; end if;
 perform dblink_exec('rotacao_a','commit');
 select resultado into r from dblink_get_result('rotacao_b') as t(resultado jsonb);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,concessao_id}' is distinct from id_antigo::text then raise exception 'ROTACAO_CONCORRENTE_FALHOU %',r; end if;
 perform resultado from dblink_get_result('rotacao_b') as t(resultado jsonb);
 perform dblink_disconnect('rotacao_a'); perform dblink_disconnect('rotacao_b');
end $$;
