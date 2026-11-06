-- Conexões reais comprovam a ordem entre autorização e revogação, sem depender de sleeps fixos.
create extension if not exists dblink;
create function public.gravar_anamnese_concorrente_fixture(chave text, registro uuid, paciente uuid) returns jsonb language plpgsql as $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; e jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
  'chave_idempotencia',chave,'digest_idempotencia',repeat('c',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.anamnese_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 return api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.gravar_anamnese',ator,sessao));
end $$;
select dblink_connect('escrita',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_connect('revogacao',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
do $$
declare tipo text; ordem text; paciente uuid; registro uuid; escrita text; revogar text; resultado jsonb; pid_alvo integer; pid_bloqueador integer; bloqueado boolean; n integer;
begin
 foreach tipo in array array['concessao','sessao'] loop
  foreach ordem in array array['revogacao_primeiro','escrita_primeiro'] loop
   paciente:=gen_random_uuid(); registro:=gen_random_uuid();
   perform dblink_exec('escrita',format('insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values (%L,%L,%L)',paciente,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'));
   escrita:=format('select public.gravar_anamnese_concorrente_fixture(%L,%L,%L)',tipo||ordem,registro,paciente);
   if tipo='concessao' then
    revogar:='update identidade.concessao_equipe set estado=''revogada'',revogada_em=clock_timestamp(),revogada_por_usuario_id=usuario_id,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=''10000000-0000-4000-8000-000000000002''';
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
   if (select count(*) from cadastro.anamnese_versao v where v.paciente_id=paciente) <> (case when ordem='escrita_primeiro' then 1 else 0 end) then
    raise exception 'VERSOES_INCONSISTENTES: %, %',tipo,ordem;
   end if;
   perform dblink_exec('revogacao','update identidade.concessao_equipe set estado=''vinculada'',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=''10000000-0000-4000-8000-000000000002''');
   perform dblink_exec('revogacao','update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where session_id=''20000000-0000-4000-8000-000000000002''');
  end loop;
 end loop;
end $$;
select dblink_disconnect('escrita');
select dblink_disconnect('revogacao');
