\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Duas conexões reais no PostgreSQL descartável.
create extension if not exists dblink;
update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id='40000000-0000-4000-8000-000000000001' and usuario_id='10000000-0000-4000-8000-000000000002';
create table public.grupo3_corrida_estado_fixture(entrada jsonb not null,diario_id uuid not null);
create function public.grupo3_corrida_fechar_fixture(e jsonb) returns jsonb language plpgsql as $$ begin
 perform public.claims_diario_fixture('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 return public.grupo3_turno_pedir_fixture(e,'api.encerrar_turno');end $$;
revoke all on function public.grupo3_corrida_fechar_fixture(jsonb) from public,anon,authenticated,service_role;
do $$
declare turno uuid;epoca bigint;reserva uuid:=gen_random_uuid();comando uuid:=gen_random_uuid();r jsonb;diario uuid;registro uuid;
begin
 perform public.claims_diario_fixture('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 select turno_seguinte into turno from grupo3_estado_fixture;
 r:=public.grupo3_publicar_fixture(turno,0,'corrida-publicar-fixture');if r->>'ok' is distinct from 'true' then raise exception 'SETUP_PUBLICACAO_CORRIDA_FALHOU';end if;
 diario:=(r#>>'{dados,diario_registro_id}')::uuid;registro:=(r#>>'{dados,registro_id}')::uuid;
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_turno'),'api.consultar_barreira_turno');epoca:=(r#>>'{dados,epoca}')::bigint;
 perform public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_barreira_turno','epoca',epoca,'reserva_id',(r#>>'{dados,reserva,id}')::uuid,'comando_id',comando),'api.encerrar_barreira_turno');
 perform public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_turno','comando_id',comando),'api.reconhecer_barreira_turno');
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_turno'),'api.consultar_barreira_turno');epoca:=(r#>>'{dados,epoca}')::bigint;
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_turno','epoca',epoca,'reserva_id',reserva,'paciente_id','40000000-0000-4000-8000-000000000001','turno_id',turno,'versao_esperada',1),'api.reservar_turno');
 if r#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'SETUP_RESERVA_CORRIDA_FALHOU';end if;
 insert into public.grupo3_corrida_estado_fixture values(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','turno_id',turno,'reserva_id',reserva,'geracao_reserva',epoca,'versao_esperada',1,'sintese_registro_id',registro,'chave_idempotencia','corrida-fechar-fixture','digest_idempotencia',repeat('n',43)),diario);
end $$;
select dblink_connect('g3_escrita',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_connect('g3_alteracao',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
do $$
declare e jsonb;diario uuid;r jsonb;alvo integer;bloqueador integer;espera boolean;n integer;consulta text;
begin
 select entrada,diario_id into e,diario from public.grupo3_corrida_estado_fixture;
 consulta:=format('select public.grupo3_corrida_fechar_fixture(%L::jsonb)',e);
 perform dblink_exec('g3_alteracao','begin');
 perform * from dblink('g3_alteracao','select id from cadastro.paciente where id=''40000000-0000-4000-8000-000000000001'' for update') as t(id uuid);
 perform dblink_exec('g3_escrita','set statement_timeout=''10s''');
 select p into alvo from dblink('g3_escrita','select pg_backend_pid()') as t(p integer);
 select p into bloqueador from dblink('g3_alteracao','select pg_backend_pid()') as t(p integer);
 perform dblink_send_query('g3_escrita',consulta);
 espera:=false;for n in 1..200 loop select bloqueador=any(pg_blocking_pids(alvo)) into espera;exit when espera;perform pg_sleep(0.01);end loop;
 if not espera then raise exception 'FECHAMENTO_NAO_TRAVOU_PACIENTE';end if;
 perform dblink_exec('g3_alteracao',format('insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,versao_esperada,estado,audiencia,atencao,retorno_solicitado,origem_conteudo,conteudo_cifrado,justificativa_cifrada,criado_por_usuario_id,aconteceu_em,area) select gen_random_uuid(),diario_registro_id,2,1,''retificado'',audiencia,atencao,retorno_solicitado,origem_conteudo,conteudo_cifrado,public.envelope_diario_fixture(''o''),criado_por_usuario_id,aconteceu_em,area from cadastro.diario_registro_versao where diario_registro_id=%L and versao=1',diario));
 perform dblink_exec('g3_alteracao','commit');
 select x into r from dblink_get_result('g3_escrita') as t(x jsonb);perform * from dblink_get_result('g3_escrita') as t(x jsonb);
 if r#>>'{erro,codigo}' is distinct from 'conflito' or exists(select 1 from cadastro.turno where id=(e->>'turno_id')::uuid and situacao='encerrado') then raise exception 'RETIFICACAO_CONCORRENTE_ENCERROU_VERSAO_ANTIGA';end if;
 perform dblink_exec('g3_alteracao','begin');
 perform dblink_exec('g3_alteracao','update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=''10000000-0000-4000-8000-000000000001'',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=''40000000-0000-4000-8000-000000000001'' and usuario_id=''10000000-0000-4000-8000-000000000002''');
 perform dblink_send_query('g3_escrita',consulta);
 espera:=false;for n in 1..200 loop select bloqueador=any(pg_blocking_pids(alvo)) into espera;exit when espera;perform pg_sleep(0.01);end loop;
 if not espera then raise exception 'FECHAMENTO_NAO_TRAVOU_VINCULO';end if;
 perform dblink_exec('g3_alteracao','commit');select x into r from dblink_get_result('g3_escrita') as t(x jsonb);perform * from dblink_get_result('g3_escrita') as t(x jsonb);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'REVOGACAO_CONCORRENTE_NAO_NEGOU';end if;
end $$;
select dblink_disconnect('g3_escrita');select dblink_disconnect('g3_alteracao');
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';
