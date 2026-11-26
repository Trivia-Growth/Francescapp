\set ON_ERROR_STOP on
\ir tarefa_rls_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112270000_auditoria_tarefas_auth_nao_admitido.sql
\ir ../migrations/20261112300000_barreira_tarefa_cuidado_privada.sql
create function public.suprimir_auditoria_tarefa_fixture() returns trigger language plpgsql as $$ begin
 if current_setting('fixture.tarefa_suprimir',true)='sim' then return null; end if; return new; end $$;
create trigger tarefa_auditoria_suprimida before insert on auditoria.evento for each row execute function public.suprimir_auditoria_tarefa_fixture();
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; tarefa uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid(); entrada jsonb; resposta jsonb; v integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 for v in 0..1 loop
  reserva:=gen_random_uuid(); registro:=gen_random_uuid();
  if operacao.reservar_tarefa_cuidado_privado(ator,v+1,reserva,paciente,tarefa,v)<>'aberta' then raise exception 'RESERVA_FALHOU'; end if;
  entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao_esperada',v,'reserva_id',reserva,'geracao_reserva',v+1,'chave_idempotencia','barreira-tarefa-'||v,'digest_idempotencia',repeat('a',43),'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao',v+1,'campo','conteudo','formato',1));
  perform set_config('fixture.tarefa_suprimir','sim',true);
  begin
   perform api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
   raise exception 'AUDITORIA_SUPRIMIDA_ACEITA';
  exception when no_data_found then if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
  if exists(select 1 from cadastro.tarefa_cuidado_versao where id=registro) or (select estado from operacao.reserva_tarefa_cuidado where id=reserva)<>'aberta' then raise exception 'ROLLBACK_FALHOU'; end if;
  perform set_config('fixture.tarefa_suprimir','nao',true);
  resposta:=api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
  if resposta->>'ok'<>'true' or (resposta#>>'{dados,versao}')::integer<>v+1 then raise exception 'ESCRITA_FALHOU'; end if;
  resposta:=api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
  if resposta->>'ok'<>'true' or (resposta#>>'{dados,versao}')::integer<>v+1 then raise exception 'REPLAY_FALHOU'; end if;
  if operacao.encerrar_tarefa_cuidado_privado(ator,v+1,reserva,gen_random_uuid())<>'confirmada' then raise exception 'ENCERRAMENTO_FALHOU'; end if;
  begin
   perform api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
   raise exception 'TARDIA_ACEITA';
  exception when insufficient_privilege then if sqlerrm<>'RESERVA_INVALIDA' then raise; end if; end;
  update operacao.barreira_tarefa_cuidado set resultado_pendente=null where ator_usuario_id=ator;
 end loop;
 reserva:=gen_random_uuid(); registro:=gen_random_uuid();
 if operacao.reservar_tarefa_cuidado_privado(ator,3,reserva,paciente,tarefa,2)<>'aberta' then raise exception 'RESERVA_TARDIA_FALHOU'; end if;
 entrada:=entrada || jsonb_build_object('request_id',gen_random_uuid(),'registro_id',registro,'versao_esperada',2,'reserva_id',reserva,'geracao_reserva',3,'chave_idempotencia','barreira-tarefa-tardia','aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao',3,'campo','conteudo','formato',1));
 if operacao.encerrar_tarefa_cuidado_privado(ator,3,reserva,gen_random_uuid())<>'cancelada' then raise exception 'CANCELAMENTO_FALHOU'; end if;
 begin
  perform api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
  raise exception 'ESCRITA_APOS_CANCELAMENTO_ACEITA';
 exception when insufficient_privilege then if sqlerrm<>'RESERVA_INVALIDA' then raise; end if; end;
 if exists(select 1 from cadastro.tarefa_cuidado_versao where id=registro) then raise exception 'VERSAO_TARDIA_EXISTE'; end if;
end $$;

-- Owner restrito exerce composição; aplicação continua sem EXECUTE.

do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; entrada jsonb; resposta jsonb; reserva_teste uuid:=gen_random_uuid(); recibo_teste uuid:=gen_random_uuid();
begin
 if has_function_privilege('authenticated','api.tarefa_barreira_composicao(jsonb)','EXECUTE') or has_function_privilege('service_role','api.tarefa_barreira_composicao(jsonb)','EXECUTE') then raise exception 'GRANT_EXTERNO_INDEVIDO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_tarefa_cuidado');
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.consultar_barreira_tarefa_cuidado',ator,sessao));
 if resposta->>'ok'<>'true' then raise exception 'COMPOSICAO_FALHOU: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_tarefa_cuidado','comando_id',resposta#>>'{dados,resultado_pendente,recibo_id}');
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reconhecer_barreira_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}'<>'reconhecido' then raise exception 'RECONHECIMENTO_FALHOU: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',4,'reserva_id',reserva_teste,'paciente_id',paciente,'tarefa_id',gen_random_uuid(),'versao_esperada',0);
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}'<>'aberta' then raise exception 'RESERVA_COMPOSICAO_FALHOU: %',resposta; end if;
 entrada:=entrada || jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',gen_random_uuid());
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'PACIENTE_SEM_VINCULO_ACEITO: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_tarefa_cuidado','epoca',4,'reserva_id',reserva_teste,'comando_id',recibo_teste);
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_tarefa_cuidado'),'api.consultar_barreira_tarefa_cuidado',ator,sessao));
 if resposta#>>'{erro,codigo}'<>'sem_permissao' or resposta ? 'dados' then raise exception 'CONSULTA_RESERVA_REVOGADA_ACEITA: %',resposta; end if;
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.encerrar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{erro,codigo}'<>'sem_permissao' or (select estado from operacao.reserva_tarefa_cuidado where id=reserva_teste)<>'aberta' then raise exception 'ENCERRAMENTO_APOS_REVOGACAO_ACEITO: %',resposta; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=paciente and usuario_id=ator;
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.encerrar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}'<>'cancelada' then raise exception 'ENCERRAMENTO_FALHOU: %',resposta; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.encerrar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'REPLAY_APOS_REVOGACAO_ACEITO: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_tarefa_cuidado');
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.consultar_barreira_tarefa_cuidado',ator,sessao));
 if resposta#>>'{erro,codigo}'<>'sem_permissao' or resposta ? 'dados' then raise exception 'CONSULTA_APOS_REVOGACAO_ACEITA: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_tarefa_cuidado','comando_id',recibo_teste);
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reconhecer_barreira_tarefa_cuidado',ator,sessao));
 if resposta#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'RECONHECIMENTO_APOS_REVOGACAO_ACEITO: %',resposta; end if;
 if (select resultado_pendente from operacao.barreira_tarefa_cuidado where ator_usuario_id=ator) is distinct from recibo_teste then raise exception 'REVOGACAO_ALTEROU_BARREIRA'; end if;
end $$;

-- Reserva via composição e escrita via RPC SECURITY DEFINER com owner restrito.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; tarefa uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); recibo uuid:=gen_random_uuid(); entrada jsonb; gravacao jsonb; resposta jsonb;
begin
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='api.tarefa_cuidado_operacao_privada(jsonb)'::regprocedure and r.rolname='ffcmapp_tarefa_owner' and p.prosecdef and not r.rolsuper and not r.rolbypassrls) then raise exception 'OWNER_ESCRITA_INSEGURO'; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=paciente and usuario_id=ator;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_tarefa_cuidado');
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.consultar_barreira_tarefa_cuidado',ator,sessao));
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_tarefa_cuidado','comando_id',resposta#>>'{dados,resultado_pendente,recibo_id}');
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reconhecer_barreira_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}' is distinct from 'reconhecido' then raise exception 'RECONHECIMENTO_PREVIO_FALHOU: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',5,'reserva_id',reserva,'paciente_id',paciente,'tarefa_id',tarefa,'versao_esperada',0);
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_INTEGRADA_FALHOU: %',resposta; end if;
 gravacao:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao_esperada',0,'reserva_id',reserva,'geracao_reserva',5,'chave_idempotencia','integrada-restrita','digest_idempotencia',repeat('a',43),'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao',1,'campo','conteudo','formato',1));
 resposta:=api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(gravacao,'api.gravar_tarefa_cuidado',ator,sessao));
 if resposta->>'ok' is distinct from 'true' or resposta#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'ESCRITA_RESTRITA_FALHOU: %',resposta; end if;
 resposta:=api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(gravacao,'api.gravar_tarefa_cuidado',ator,sessao));
 if resposta->>'ok' is distinct from 'true' or resposta#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'REPLAY_RESTRITO_FALHOU: %',resposta; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 resposta:=api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(gravacao,'api.gravar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ESCRITA_REVOGADA_ACEITA: %',resposta; end if;
 if (select count(*) from cadastro.tarefa_cuidado_versao where tarefa_id=tarefa)<>1 then raise exception 'REPLAY_DUPLICOU_VERSAO'; end if;
end $$;

-- Revogação ainda não confirmada bloqueia consulta; após commit, não entrega dados.
create extension if not exists dblink;
do $$
declare conexao text:=format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user); resposta jsonb;
begin
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where id='91000000-0000-4000-8000-000000000001';
 -- Esta fixture depende de sessões separadas verem o vínculo restaurado no commit.
end $$;
select dblink_connect('revogacao',format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_connect('consulta',format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_exec('revogacao','begin');
select dblink_exec('revogacao',$q$update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where id='91000000-0000-4000-8000-000000000001'$q$);
select dblink_send_query('consulta',$q$
 with claims as materialized (select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false)),
 entrada as materialized (select jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_tarefa_cuidado') e from claims)
 select api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(e,'api.consultar_barreira_tarefa_cuidado','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002')) from entrada
$q$);
select pg_sleep(0.2);
do $$ begin if dblink_is_busy('consulta')<>1 then raise exception 'CONSULTA_NAO_AGUARDOU_REVOGACAO'; end if; end $$;
select dblink_exec('revogacao','commit');
do $$ declare resposta jsonb; begin
 select resultado into resposta from dblink_get_result('consulta') as t(resultado jsonb);
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' or resposta ? 'dados' then raise exception 'CONSULTA_CONCORRENTE_REVOGADA_ACEITA: %',resposta; end if;
end $$;
select dblink_disconnect('consulta');
select dblink_disconnect('revogacao');

-- Escrita mantém barreira até commit; encerramento concorrente observa confirmação.
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where id='91000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; entrada jsonb; resposta jsonb; recibo uuid:=gen_random_uuid();
begin
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_tarefa_cuidado','epoca',5,'reserva_id',(select reserva_atual from operacao.barreira_tarefa_cuidado where ator_usuario_id=ator),'comando_id',recibo);
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.encerrar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}' is distinct from 'confirmada' then raise exception 'ENCERRAMENTO_PREVIO_FALHOU: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_tarefa_cuidado','comando_id',recibo);
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reconhecer_barreira_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}' is distinct from 'reconhecido' then raise exception 'RECONHECIMENTO_PREVIO_FALHOU: %',resposta; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',6,'reserva_id','92000000-0000-4000-8000-000000000001','paciente_id','40000000-0000-4000-8000-000000000001','tarefa_id','93000000-0000-4000-8000-000000000001','versao_esperada',0);
 resposta:=api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado',ator,sessao));
 if resposta#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_CONCORRENTE_FALHOU: %',resposta; end if;
end $$;
select dblink_connect('escrita',format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_connect('encerramento',format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_exec('escrita','begin');
select dblink_exec('escrita',$q$set "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]} '$q$);
do $$ declare resposta jsonb; begin
 select resultado into resposta from dblink('escrita',$q$
  with entrada as (select jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','tarefa_id','93000000-0000-4000-8000-000000000001','registro_id','94000000-0000-4000-8000-000000000001','versao_esperada',0,'reserva_id','92000000-0000-4000-8000-000000000001','geracao_reserva',6,'chave_idempotencia','concorrencia-escrita','digest_idempotencia',repeat('a',43),'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id','40000000-0000-4000-8000-000000000001','tarefa_id','93000000-0000-4000-8000-000000000001','registro_id','94000000-0000-4000-8000-000000000001','versao',1,'campo','conteudo','formato',1)) e)
  select api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_tarefa_cuidado','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002')) from entrada
 $q$) as t(resultado jsonb);
 if resposta->>'ok' is distinct from 'true' then raise exception 'ESCRITA_CONCORRENTE_FALHOU: %',resposta; end if;
end $$;
select dblink_send_query('encerramento',$q$
 with claims as materialized (select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false)),
 entrada as materialized (select jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_tarefa_cuidado','epoca',6,'reserva_id','92000000-0000-4000-8000-000000000001','comando_id','95000000-0000-4000-8000-000000000001') e from claims)
 select api.tarefa_barreira_composicao(public.assinar_anamnese_fixture(e,'api.encerrar_tarefa_cuidado','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002')) from entrada
$q$);
select pg_sleep(0.2);
do $$ begin if dblink_is_busy('encerramento')<>1 then raise exception 'ENCERRAMENTO_NAO_AGUARDOU_ESCRITA'; end if; end $$;
select dblink_exec('escrita','commit');
do $$ declare resposta jsonb; begin
 select resultado into resposta from dblink_get_result('encerramento') as t(resultado jsonb);
 if resposta#>>'{dados,estado}' is distinct from 'confirmada' then raise exception 'ENCERRAMENTO_CONCORRENTE_FALHOU: %',resposta; end if;
 if (select count(*) from cadastro.tarefa_cuidado_versao where tarefa_id='93000000-0000-4000-8000-000000000001')<>1 then raise exception 'ESCRITA_CONCORRENTE_NAO_PERSISTIU'; end if;
end $$;
select dblink_disconnect('encerramento');
select dblink_disconnect('escrita');
