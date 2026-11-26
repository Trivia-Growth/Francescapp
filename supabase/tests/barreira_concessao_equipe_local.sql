\set ON_ERROR_STOP on
\ir auditoria_criar_equipe_auth_local.sql
\ir ../migrations/20261112350000_barreira_concessao_equipe_privada.sql
-- Primitivas isoladas: não demonstram autorização nem integração da RPC.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; outro uuid:='10000000-0000-4000-8000-000000000003'; reserva uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator)::text,true);
 if operacao.reservar_concessao_equipe_privado(ator,1,reserva)<>'aberta' then raise exception 'RESERVA'; end if;
 if operacao.reservar_concessao_equipe_privado(ator,1,gen_random_uuid())<>'bloqueada' then raise exception 'BLOQUEIO'; end if;
 if operacao.reservar_concessao_equipe_privado(outro,1,gen_random_uuid())<>'negada' then raise exception 'ATOR_FORJADO'; end if;
 if operacao.encerrar_concessao_equipe_privado(ator,1,reserva,comando)<>'cancelada' then raise exception 'CANCELAMENTO'; end if;
 if operacao.reservar_concessao_equipe_privado(ator,1,gen_random_uuid())<>'epoca_antiga' then raise exception 'EPOCA'; end if;
 if operacao.reservar_concessao_equipe_privado(ator,2,gen_random_uuid())<>'bloqueada' then raise exception 'RESULTADO_PENDENTE'; end if;
 if has_function_privilege('authenticated','operacao.reservar_concessao_equipe_privado(uuid,bigint,uuid)','execute') then raise exception 'GRANT'; end if;
end $$;

-- Exercita a escrita real via wrapper fechado sob owner restrito.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; reserva uuid:=gen_random_uuid(); alvo uuid:=gen_random_uuid(); e jsonb; r jsonb; recibo uuid:=gen_random_uuid();
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 -- A primeira prova deixou resultado pendente; isola esta sequência.
 delete from operacao.recibo_barreira_concessao_equipe;
 delete from operacao.reserva_concessao_equipe;
 delete from operacao.barreira_concessao_equipe;
 if operacao.reservar_concessao_equipe_privado(ator,1,reserva)<>'aberta' then raise exception 'PREPARO'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',alvo,'email',envelope,'email_hmac',repeat('z',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','barreira-equipe','digest_idempotencia',repeat('a',43),'versao_idempotencia','v1','candidatos_idempotencia',jsonb_build_object('v1',jsonb_build_object('concessao_id',alvo,'digest_idempotencia',repeat('a',43))),'reserva_id',reserva,'geracao_reserva',1);
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'CRIACAO %',r; end if;
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'REPLAY %',r; end if;
 if operacao.encerrar_concessao_equipe_privado(ator,1,reserva,recibo)<>'confirmada' then raise exception 'CONFIRMACAO'; end if;
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'PEDIDO_TARDIO %',r; end if;
end $$;

do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; prof uuid:='10000000-0000-4000-8000-000000000003'; sessao_familia uuid:='20000000-0000-4000-8000-000000000003'; e jsonb; r jsonb; recibo uuid; acao text:='api.consultar_barreira_concessao_equipe';
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao',acao);
 r:=api.equipe_barreira_composicao(public.assinar_anamnese_fixture(e,acao,ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,resultado_pendente,resultado}' is distinct from 'confirmada' then raise exception 'CONSULTA %',r; end if;
 recibo:=(r#>>'{dados,resultado_pendente,recibo_id}')::uuid;
 acao:='api.reconhecer_barreira_concessao_equipe'; e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao',acao,'comando_id',recibo);
 r:=api.equipe_barreira_composicao(public.assinar_anamnese_fixture(e,acao,ator,sessao));
 if r#>>'{dados,estado}' is distinct from 'reconhecido' then raise exception 'RECONHECIMENTO %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',prof,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 acao:='api.consultar_barreira_concessao_equipe'; e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao',acao);
 r:=api.equipe_barreira_composicao(public.assinar_anamnese_fixture(e,acao,prof,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA %',r; end if;
 if has_function_privilege('authenticated','api.equipe_barreira_composicao(jsonb)','execute') or has_function_privilege('anon','api.equipe_barreira_composicao(jsonb)','execute') then raise exception 'GRANT_EXTERNO'; end if;
end $$;

-- Replay recuperado após reconhecimento e nova reserva conserva a concessão original.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; reserva uuid:=gen_random_uuid(); recibo uuid:=gen_random_uuid(); alvo uuid; epoca bigint; e jsonb; r jsonb;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select resultado_id into alvo from operacao.requisicao where chave_idempotencia='barreira-equipe';
 select b.epoca into epoca from operacao.barreira_concessao_equipe b where ator_usuario_id=ator;
 if operacao.reservar_concessao_equipe_privado(ator,epoca,reserva)<>'aberta' then raise exception 'PREPARO_REPLAY'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',alvo,'email',envelope,'email_hmac',repeat('z',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','barreira-equipe','digest_idempotencia',repeat('a',43),'versao_idempotencia','v1','candidatos_idempotencia',jsonb_build_object('v1',jsonb_build_object('concessao_id',alvo,'digest_idempotencia',repeat('a',43))),'reserva_id',reserva,'geracao_reserva',epoca);
 r:=api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,concessao_id}' is distinct from alvo::text or (select estado from operacao.reserva_concessao_equipe where id=reserva)<>'confirmada' then raise exception 'REPLAY_NOVA_RESERVA %',r; end if;
 if operacao.encerrar_concessao_equipe_privado(ator,epoca,reserva,recibo)<>'confirmada' or operacao.reconhecer_barreira_concessao_equipe_privado(recibo,gen_random_uuid())<>'reconhecido' then raise exception 'RECONCILIACAO_REPLAY'; end if;
end $$;

-- Duas conexões: criação e encerramento nas duas ordens, com bloqueio observado.
do $$
declare conexao text:=format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user);
 claims text:='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}';
 ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; reserva uuid; alvo uuid; recibo uuid; epoca bigint; e jsonb; r jsonb; estado text; criar text; encerrar text; i integer;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 perform dblink_connect('be_a',conexao); perform dblink_connect('be_b',conexao);
 perform dblink_exec('be_a',format('set request.jwt.claims = %L',claims)); perform dblink_exec('be_b',format('set request.jwt.claims = %L',claims));
 for i in 1..2 loop
  reserva:=gen_random_uuid(); alvo:=gen_random_uuid(); recibo:=gen_random_uuid();
  select x into epoca from dblink('be_a',format('select epoca from operacao.barreira_concessao_equipe where ator_usuario_id=%L::uuid',ator)) as t(x bigint);
  select x into estado from dblink('be_a',format('select operacao.reservar_concessao_equipe_privado(%L::uuid,%s,%L::uuid)',ator,epoca,reserva)) as t(x text);
  if estado<>'aberta' then raise exception 'PREPARO_CONCORRENCIA %',estado; end if;
  e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',alvo,'email',envelope,'email_hmac',repeat(case when i=1 then 'k' else 'j' end,43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','barreira-corrida-'||i,'digest_idempotencia',repeat('a',43),'versao_idempotencia','v1','candidatos_idempotencia',jsonb_build_object('v1',jsonb_build_object('concessao_id',alvo,'digest_idempotencia',repeat('a',43))),'reserva_id',reserva,'geracao_reserva',epoca);
  criar:=format('select api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(%L::jsonb,%L,%L::uuid,%L::uuid))',e,'api.criar_concessao_equipe',ator,sessao);
  encerrar:=format('select operacao.encerrar_concessao_equipe_privado(%L::uuid,%s,%L::uuid,%L::uuid)',ator,epoca,reserva,recibo);
  perform dblink_exec('be_a','begin');
  if i=1 then
   select x into r from dblink('be_a',criar) as t(x jsonb);
   if r->>'ok' is distinct from 'true' then raise exception 'CRIACAO_CONCORRENTE %',r; end if;
   perform dblink_send_query('be_b',encerrar);
  else
   select x into estado from dblink('be_a',encerrar) as t(x text);
   if estado<>'cancelada' then raise exception 'CANCELAMENTO_CONCORRENTE %',estado; end if;
   perform dblink_send_query('be_b',criar);
  end if;
  perform pg_sleep(0.1);
  if dblink_is_busy('be_b')<>1 then raise exception 'BLOQUEIO_NAO_OBSERVADO'; end if;
  perform dblink_exec('be_a','commit');
  if i=1 then
   select x into estado from dblink_get_result('be_b') as t(x text);
   if estado<>'confirmada' then raise exception 'ENCERRAMENTO_CONCORRENTE %',estado; end if;
   perform x from dblink_get_result('be_b') as t(x text);
  else
   select x into r from dblink_get_result('be_b') as t(x jsonb);
   if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CRIACAO_TARDIA %',r; end if;
   perform x from dblink_get_result('be_b') as t(x jsonb);
  end if;
  select x into estado from dblink('be_a',format('select operacao.reconhecer_barreira_concessao_equipe_privado(%L::uuid,gen_random_uuid())',recibo)) as t(x text);
  if estado<>'reconhecido' then raise exception 'RECONCILIACAO_CONCORRENTE %',estado; end if;
 end loop;
 perform dblink_disconnect('be_a'); perform dblink_disconnect('be_b');
end $$;

-- Supressão da auditoria reverte concessão, ledger e confirmação da reserva.
create function public.bloquear_auditoria_equipe_fixture() returns trigger language plpgsql as $$ begin if new.request_id::text=current_setting('teste.equipe_request',true) then return null; end if; return new; end $$;
create trigger bloquear_auditoria_equipe_fixture before insert on auditoria.evento for each row execute function public.bloquear_auditoria_equipe_fixture();
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; reserva uuid:=gen_random_uuid(); alvo uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); epoca bigint; e jsonb; falhou boolean:=false;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select b.epoca into epoca from operacao.barreira_concessao_equipe b where ator_usuario_id=ator;
 if operacao.reservar_concessao_equipe_privado(ator,epoca,reserva)<>'aberta' then raise exception 'PREPARO_ROLLBACK'; end if;
 e:=jsonb_build_object('request_id',req,'concessao_id',alvo,'email',envelope,'email_hmac',repeat('h',43),'perfil','profissional','metodo','google_workspace','motivo',envelope,'auditoria_id',gen_random_uuid(),'chave_idempotencia','barreira-rollback','digest_idempotencia',repeat('a',43),'versao_idempotencia','v1','candidatos_idempotencia',jsonb_build_object('v1',jsonb_build_object('concessao_id',alvo,'digest_idempotencia',repeat('a',43))),'reserva_id',reserva,'geracao_reserva',epoca);
 perform set_config('teste.equipe_request',req::text,true);
 begin
  perform api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 exception when no_data_found then falhou:=true; end;
 if not falhou or exists(select 1 from identidade.concessao_equipe where id=alvo) or exists(select 1 from operacao.requisicao where chave_idempotencia='barreira-rollback') or (select estado from operacao.reserva_concessao_equipe where id=reserva)<>'aberta' then raise exception 'ROLLBACK_AUDITORIA'; end if;
 -- Conflito de idempotência também precisa falhar se auditoria for suprimida.
 e:=e || jsonb_build_object('chave_idempotencia','barreira-equipe');
 falhou:=false;
 begin
  perform api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 exception when no_data_found then falhou:=true; end;
 if not falhou or (select estado from operacao.reserva_concessao_equipe where id=reserva)<>'aberta' then raise exception 'AUDITORIA_CONFLITO_IDEMPOTENCIA'; end if;
 -- Colisão de e-mail reverte também o recibo inserido antes da tentativa.
 e:=e || jsonb_build_object('chave_idempotencia','barreira-conflito-email','email_hmac',repeat('z',43));
 falhou:=false;
 begin
  perform api.criar_concessao_equipe_privado(public.assinar_anamnese_fixture(e,'api.criar_concessao_equipe',ator,sessao));
 exception when no_data_found then falhou:=true; end;
 if not falhou or exists(select 1 from operacao.requisicao where chave_idempotencia='barreira-conflito-email') or (select estado from operacao.reserva_concessao_equipe where id=reserva)<>'aberta' then raise exception 'AUDITORIA_CONFLITO_EMAIL'; end if;

end $$;
drop trigger bloquear_auditoria_equipe_fixture on auditoria.evento;
drop function public.bloquear_auditoria_equipe_fixture();

-- Identidade Auth sem perfil gera negativa auditada e não recebe acesso.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000099'; sessao uuid:='20000000-0000-4000-8000-000000000099'; req uuid:=gen_random_uuid(); acao text:='api.consultar_barreira_concessao_equipe'; e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 e:=jsonb_build_object('request_id',req,'operacao',acao);
 r:=api.equipe_barreira_composicao(public.assinar_anamnese_fixture(e,acao,ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or (select count(*) from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and auditoria.evento.acao='api.consultar_barreira_concessao_equipe' and resultado='negado')<>1 then raise exception 'AUTH_SEM_PERFIL_NAO_AUDITADO %',r; end if;
end $$;

-- Policy Auth impede atribuição a terceiro e resultado permitido.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000099'; negado boolean;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator)::text,true);
 perform set_config('role','ffcmapp_equipe_barreira_owner',true);
 negado:=false;
 begin
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),gen_random_uuid(),'api.consultar_barreira_concessao_equipe','requisicao','negado',gen_random_uuid());
 exception when insufficient_privilege then negado:=true; end;
 if not negado then raise exception 'AUTH_FORJADO_ACEITO'; end if;
 negado:=false;
 begin
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),ator,'api.consultar_barreira_concessao_equipe','requisicao','permitido',gen_random_uuid());
 exception when insufficient_privilege then negado:=true; end;
 if not negado then raise exception 'AUTH_PERMITIDO_ACEITO'; end if;
 perform set_config('role','none',true);
end $$;
