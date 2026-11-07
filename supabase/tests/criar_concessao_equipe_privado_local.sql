\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261112310000_criar_concessao_equipe_privado.sql

insert into auth.users values ('10000000-0000-4000-8000-000000000003');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000003','familia');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',null);

do $$
declare
 ator uuid := '10000000-0000-4000-8000-000000000001';
 sessao uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 concessao_teste uuid := gen_random_uuid(); e jsonb; r jsonb;
 envelope jsonb := jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 if has_function_privilege('authenticated','api.criar_concessao_equipe_privado(jsonb)','execute') or has_function_privilege('anon','api.criar_concessao_equipe_privado(jsonb)','execute') or has_function_privilege('service_role','api.criar_concessao_equipe_privado(jsonb)','execute') or has_function_privilege('authenticated','operacao.criar_concessao_equipe_privado(jsonb)','execute') or has_function_privilege('anon','operacao.criar_concessao_equipe_privado(jsonb)','execute') or has_function_privilege('service_role','operacao.criar_concessao_equipe_privado(jsonb)','execute') then raise exception 'EXECUCAO_DIRETA_PERMITIDA'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',concessao_teste,'email',envelope,'email_hmac',repeat('z',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','concessao-fixture','digest_idempotencia',repeat('a',43));
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'pendente' then raise exception 'ADMIN_NEGADO: %',r; end if;
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' or (select count(*) from identidade.concessao_equipe where id=concessao_teste) <> 1 then raise exception 'REPLAY_FALHOU: %',r; end if;
 -- Alteração legítima posterior deve aparecer no replay, sem nova criação.
 update identidade.concessao_equipe set perfil='administrador',versao=2 where id=concessao_teste;
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{dados,perfil}' is distinct from 'administrador' or r#>>'{dados,versao}' is distinct from '2' then raise exception 'PROJECAO_DESATUALIZADA: %',r; end if;
 -- Administrador vigente recebe estado revogado atual, sem recriar concessão.
 update identidade.concessao_equipe set estado='revogada',versao=3,revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=envelope where id=concessao_teste;
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{dados,estado}' is distinct from 'revogada' or r#>>'{dados,versao}' is distinct from '3' then raise exception 'PROJECAO_REVOGADA_INCORRETA: %',r; end if;
 -- Falha de auditoria reverte concessão e reserva de idempotência.
 declare
  nova uuid:=gen_random_uuid(); evento_existente uuid; tentativa jsonb;
 begin
  select id into evento_existente from auditoria.evento limit 1;
  tentativa:=e || jsonb_build_object('concessao_id',nova,'email_hmac',repeat('y',43),
   'chave_idempotencia','auditoria-falha','auditoria_id',evento_existente);
  begin
   perform api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(tentativa,'api.criar_concessao_equipe',ator,sessao));
   raise exception 'AUDITORIA_FALHA_ACEITA';
  exception when unique_violation then null;
  end;
  if exists(select 1 from identidade.concessao_equipe where id=nova)
   or exists(select 1 from operacao.requisicao where chave_idempotencia='auditoria-falha') then
   raise exception 'AUDITORIA_FALHA_DEIXOU_EFEITOS';
  end if;
 end;
 -- Revogação da concessão do ator bloqueia replay e novo resultado.
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=envelope where usuario_id=ator;
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'REPLAY_ATOR_REVOGADO: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 -- Sessão revogada nunca recupera o DTO, mesmo com chave idempotente válida.
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000001';
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'REPLAY_SESSAO_REVOGADA: %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id','20000000-0000-4000-8000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',profissional,'20000000-0000-4000-8000-000000000002'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000003','session_id','20000000-0000-4000-8000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_ACEITA'; end if;
end $$;

-- Duas transações disputam a mesma chave: a segunda espera o commit e faz replay.
create extension if not exists dblink;
update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000001';
do $$
declare
 conexao text:=format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user);
 claims text:='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}';
 e jsonb; comando text; r jsonb;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',gen_random_uuid(),'email',envelope,'email_hmac',repeat('x',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','concorrencia-fixture','digest_idempotencia',repeat('c',43));
 comando:=format('select api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(%L::jsonb,%L,%L::uuid,%L::uuid))',e,'api.criar_concessao_equipe','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 perform dblink_connect('concessao_a',conexao); perform dblink_connect('concessao_b',conexao);
 perform dblink_exec('concessao_a',format('set request.jwt.claims = %L',claims));
 perform dblink_exec('concessao_b',format('set request.jwt.claims = %L',claims));
 perform dblink_exec('concessao_a','begin');
 select resultado into r from dblink('concessao_a',comando) as t(resultado jsonb);
 if r->>'ok' is distinct from 'true' then raise exception 'PRIMEIRA_CRIACAO_FALHOU: %',r; end if;
 perform dblink_send_query('concessao_b',comando);
 perform pg_sleep(0.1);
 if dblink_is_busy('concessao_b')<>1 then raise exception 'SEGUNDA_TRANSACAO_NAO_AGUARDOU'; end if;
 perform dblink_exec('concessao_a','commit');
 select resultado into r from dblink_get_result('concessao_b') as t(resultado jsonb);
 if r->>'ok' is distinct from 'true' or (select count(*) from identidade.concessao_equipe where id=(e->>'concessao_id')::uuid)<>1
  or (select count(*) from operacao.requisicao where chave_idempotencia='concorrencia-fixture')<>1 then
  raise exception 'CONCORRENCIA_INVALIDA: %',r;
 end if;
 perform resultado from dblink_get_result('concessao_b') as t(resultado jsonb);
 -- Mesmo e-mail, chaves distintas: apenas uma concessão vigente.
 e:=e || jsonb_build_object('concessao_id',gen_random_uuid(),'email_hmac',repeat('w',43),'chave_idempotencia','email-a','auditoria_id',gen_random_uuid());
 comando:=format('select api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(%L::jsonb,%L,%L::uuid,%L::uuid))',e,'api.criar_concessao_equipe','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 perform dblink_exec('concessao_a','begin');
 select resultado into r from dblink('concessao_a',comando) as t(resultado jsonb);
 if r->>'ok' is distinct from 'true' then raise exception 'EMAIL_PRIMEIRO_FALHOU: %',r; end if;
 e:=e || jsonb_build_object('concessao_id',gen_random_uuid(),'chave_idempotencia','email-b','auditoria_id',gen_random_uuid());
 comando:=format('select api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(%L::jsonb,%L,%L::uuid,%L::uuid))',e,'api.criar_concessao_equipe','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 perform dblink_send_query('concessao_b',comando); perform pg_sleep(0.1);
 if dblink_is_busy('concessao_b')<>1 then raise exception 'EMAIL_NAO_AGUARDOU'; end if;
 perform dblink_exec('concessao_a','commit');
 select resultado into r from dblink_get_result('concessao_b') as t(resultado jsonb);
 if r#>>'{erro,codigo}' is distinct from 'conflito' or (select count(*) from identidade.concessao_equipe where email_hmac=repeat('w',43) and estado<>'revogada')<>1 then raise exception 'EMAIL_CONCORRENTE_INVALIDO: %',r; end if;
 perform resultado from dblink_get_result('concessao_b') as t(resultado jsonb);
 -- Revogação confirmada antes da autorização impede criação atrasada.
 perform dblink_exec('concessao_a','begin');
 perform dblink_exec('concessao_a',$q$update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=usuario_id,motivo_revogacao_cifrado=motivo_cifrado where usuario_id='10000000-0000-4000-8000-000000000001'$q$);
 e:=e || jsonb_build_object('concessao_id',gen_random_uuid(),'email_hmac',repeat('v',43),'chave_idempotencia','revogacao-concorrente','auditoria_id',gen_random_uuid());
 comando:=format('select api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(%L::jsonb,%L,%L::uuid,%L::uuid))',e,'api.criar_concessao_equipe','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 perform dblink_send_query('concessao_b',comando); perform pg_sleep(0.1);
 if dblink_is_busy('concessao_b')<>1 then raise exception 'REVOGACAO_NAO_AGUARDOU'; end if;
 perform dblink_exec('concessao_a','commit');
 select resultado into r from dblink_get_result('concessao_b') as t(resultado jsonb);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or exists(select 1 from identidade.concessao_equipe where id=(e->>'concessao_id')::uuid) then raise exception 'REVOGACAO_CONCORRENTE_INVALIDA: %',r; end if;
 perform dblink_disconnect('concessao_a'); perform dblink_disconnect('concessao_b');
end $$;
