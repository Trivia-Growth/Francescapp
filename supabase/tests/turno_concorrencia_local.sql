-- PREPARADO; execução adiada. PostgreSQL descartável, dados fictícios.
create extension if not exists dblink;
-- Fechamento direto SOMENTE de fixture para liberar unicidade entre cenários;
-- não representa implementação do encerramento de produção (grupo 3 pendente).
update cadastro.turno set situacao='encerrado',encerrado_em=clock_timestamp(),versao=2 where situacao='aberto';
create function public.reservar_turno_concorrente_fixture(turno uuid,paciente uuid) returns jsonb language plpgsql as $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; e jsonb; r jsonb; geracao bigint;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select epoca into geracao from operacao.barreira_turno where ator_usuario_id=ator;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_turno','epoca',coalesce(geracao,1),'reserva_id',turno,'paciente_id',paciente,'turno_id',turno,'versao_esperada',0);
 r:=api.turno_barreira_composicao(public.assinar_anamnese_fixture(e,'api.reservar_turno',ator,sessao));
 if r#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_CONCORRENTE_FALHOU'; end if;
 return r;
end $$;
create function public.abrir_turno_concorrente_fixture(chave text,turno uuid,paciente uuid) returns jsonb language plpgsql as $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; e jsonb; geracao bigint;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select epoca into geracao from operacao.reserva_turno where id=turno;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno,'reserva_id',turno,'geracao_reserva',geracao,'chave_idempotencia',chave,'digest_idempotencia',repeat('c',43));
 return api.turno_privado(public.assinar_anamnese_fixture(e,'api.abrir_turno',ator,sessao));
end $$;
select dblink_connect('escrita',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_connect('revogacao',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
do $$
declare tipo text; ordem text; paciente uuid; registro uuid; escrita text; revogar text; resultado jsonb; pid_alvo integer; pid_bloqueador integer; bloqueado boolean; n integer;
begin
 foreach tipo in array array['concessao','sessao','vinculo'] loop
  foreach ordem in array array['revogacao_primeiro','escrita_primeiro'] loop
   paciente:=gen_random_uuid(); registro:=gen_random_uuid();
   perform dblink_exec('escrita',format('insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values (%L,%L,%L)',paciente,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'));
   perform dblink_exec('escrita',format('insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values(gen_random_uuid(),%L,%L,%L,%L)',paciente,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'));
   perform dblink_exec('escrita','update operacao.barreira_turno set epoca=epoca+1,reserva_atual=null,resultado_pendente=null where ator_usuario_id=''10000000-0000-4000-8000-000000000002''');
   perform r from dblink('escrita',format('select public.reservar_turno_concorrente_fixture(%L,%L)',registro,paciente)) as t(r jsonb);
   escrita:=format('select public.abrir_turno_concorrente_fixture(%L,%L,%L)',tipo||ordem,registro,paciente);
   if tipo='concessao' then
    revogar:='update identidade.concessao_equipe set estado=''revogada'',revogada_em=clock_timestamp(),revogada_por_usuario_id=usuario_id,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=''10000000-0000-4000-8000-000000000002''';
   elsif tipo='vinculo' then
    revogar:=format('update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=usuario_id,motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=%L',paciente);
   else
    revogar:='update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=usuario_id,motivo_revogacao_cifrado=(select motivo_cifrado from identidade.concessao_equipe where usuario_id=identidade.sessao.usuario_id) where session_id=''20000000-0000-4000-8000-000000000002''';
   end if;
   perform dblink_exec('escrita','begin'); perform dblink_exec('revogacao','begin');
   perform dblink_exec('escrita','set local statement_timeout = ''10s''');
   perform dblink_exec('revogacao','set local statement_timeout = ''10s''');
   if ordem='revogacao_primeiro' then
    perform dblink_exec('revogacao',revogar);
    select p into pid_alvo from dblink('escrita','select pg_backend_pid()') as t(p integer);
    select p into pid_bloqueador from dblink('revogacao','select pg_backend_pid()') as t(p integer);
    perform dblink_send_query('escrita',escrita);
   else
    select r into resultado from dblink('escrita',escrita) as t(r jsonb);
    if resultado->>'ok' is distinct from 'true' then raise exception 'ESCRITA_INICIAL_FALHOU: %',resultado; end if;
    select p into pid_alvo from dblink('revogacao','select pg_backend_pid()') as t(p integer);
    select p into pid_bloqueador from dblink('escrita','select pg_backend_pid()') as t(p integer);
    perform dblink_send_query('revogacao',revogar);
   end if;
   bloqueado:=false;
   for n in 1..200 loop
    select exists(select 1 from pg_stat_activity where pg_stat_activity.pid=pid_alvo and wait_event_type='Lock' and pid_bloqueador = any(pg_blocking_pids(pid_alvo))) into bloqueado;
    exit when bloqueado;
    perform pg_sleep(0.01);
   end loop;
   if not bloqueado then raise exception 'ESPERA_AUSENTE: %, %',tipo,ordem; end if;
   if ordem='revogacao_primeiro' then
    perform dblink_exec('revogacao','commit');
    select r into resultado from dblink_get_result('escrita') as t(r jsonb);
    perform * from dblink_get_result('escrita') as t(r jsonb);
    if resultado#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO_NAO_IMPEDIU: %',resultado; end if;
    perform dblink_exec('escrita','commit');
   else
    perform dblink_exec('escrita','commit');
    perform * from dblink_get_result('revogacao') as t(status text);
    perform * from dblink_get_result('revogacao') as t(status text);
    perform dblink_exec('revogacao','commit');
    select r into resultado from dblink('escrita',escrita) as t(r jsonb);
    if resultado#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_APOS_REVOGACAO_ACEITO: %',resultado; end if;
   end if;
   if (select count(*) from cadastro.turno v where v.paciente_id=paciente) <> (case when ordem='escrita_primeiro' then 1 else 0 end) then
    raise exception 'TURNOS_INCONSISTENTES: %, %',tipo,ordem;
   end if;
   perform dblink_exec('escrita',format('update cadastro.turno set situacao=''encerrado'',encerrado_em=clock_timestamp(),versao=2 where id=%L',registro));
   perform dblink_exec('revogacao','update identidade.concessao_equipe set estado=''vinculada'',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=''10000000-0000-4000-8000-000000000002''');
   perform dblink_exec('revogacao','update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where session_id=''20000000-0000-4000-8000-000000000002''');
  end loop;
 end loop;
end $$;
-- Duas transações reais ultrapassam checagem de aplicação: o índice arbitra.
create function public.inserir_turno_indice_fixture(turno uuid) returns text language plpgsql as $$
begin
 insert into cadastro.turno(id,paciente_id,profissional_usuario_id,parametros)
 values(turno,'40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',jsonb_build_object('duracao_padrao_minutos',480,'tolerancia_atraso_minutos',15,'tratamento_nao_encerrado','sinalizar_pendencia'));
 return 'aberto';
exception when unique_violation then return 'conflito'; end $$;
do $$
declare primeiro uuid:=gen_random_uuid(); segundo uuid:=gen_random_uuid(); resultado text; alvo integer; bloqueador integer; bloqueado boolean:=false; n integer;
begin
 perform dblink_exec('escrita','begin'); perform dblink_exec('revogacao','begin');
 perform dblink_exec('escrita','set local statement_timeout=''10s'''); perform dblink_exec('revogacao','set local statement_timeout=''10s''');
 select r into resultado from dblink('escrita',format('select public.inserir_turno_indice_fixture(%L)',primeiro)) as t(r text);
 if resultado is distinct from 'aberto' then raise exception 'PRIMEIRO_TURNO_CONCORRENTE_FALHOU'; end if;
 select p into alvo from dblink('revogacao','select pg_backend_pid()') as t(p integer);
 select p into bloqueador from dblink('escrita','select pg_backend_pid()') as t(p integer);
 perform dblink_send_query('revogacao',format('select public.inserir_turno_indice_fixture(%L)',segundo));
 for n in 1..200 loop
  select exists(select 1 from pg_stat_activity where pid=alvo and wait_event_type='Lock' and bloqueador=any(pg_blocking_pids(alvo))) into bloqueado;
  exit when bloqueado; perform pg_sleep(0.01);
 end loop;
 if not bloqueado then raise exception 'INDICE_NAO_SERIALIZOU'; end if;
 perform dblink_exec('escrita','commit');
 select r into resultado from dblink_get_result('revogacao') as t(r text);
 perform * from dblink_get_result('revogacao') as t(r text);
 perform dblink_exec('revogacao','commit');
 if resultado is distinct from 'conflito' or not exists(select 1 from cadastro.turno where id=primeiro) or exists(select 1 from cadastro.turno where id=segundo) then raise exception 'INDICE_ACEITOU_SEGUNDO_TURNO'; end if;
end $$;
select dblink_disconnect('escrita');
select dblink_disconnect('revogacao');
