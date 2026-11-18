-- PREPARADO, NÃO EXECUTADO. Duas conexões reais; espera verificada por pg_blocking_pids.
create extension if not exists dblink;
create table public.conversao_concorrencia_fixture(tag text primary key,origem uuid,tarefa2 uuid,evolucao2 uuid,reserva2 uuid,geracao2 bigint,tarefa3 uuid,evolucao3 uuid,reserva3 uuid,geracao3 bigint);
create function public.preparar_conversao_concorrente_fixture(p_tag text) returns void language plpgsql as $$
declare paciente uuid:='40000000-0000-4000-8000-000000000001'; linha public.conversao_concorrencia_fixture;
begin
 insert into public.conversao_concorrencia_fixture(tag,origem,tarefa2,evolucao2,reserva2,tarefa3,evolucao3,reserva3) values(p_tag,public.origem_conversao_fixture(paciente),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) returning * into linha;
 update public.conversao_concorrencia_fixture set geracao2=public.reserva_conversao_fixture('10000000-0000-4000-8000-000000000002',paciente,linha.tarefa2,linha.reserva2) where tag=p_tag;
 if p_tag='paralela' then update public.conversao_concorrencia_fixture set geracao3=public.reserva_conversao_fixture('10000000-0000-4000-8000-000000000003',paciente,linha.tarefa3,linha.reserva3) where tag=p_tag; end if;
end $$;
create function public.converter_concorrente_fixture(p_tag text,p_ator uuid) returns jsonb language plpgsql as $$
declare linha public.conversao_concorrencia_fixture; t jsonb; r jsonb;
begin
 select * into strict linha from public.conversao_concorrencia_fixture where tag=p_tag;
 perform public.claims_diario_fixture(p_ator,replace(p_ator::text,'10000000-','20000000-')::uuid,'oauth');
 t:=public.transporte_conversao_fixture(p_ator,'40000000-0000-4000-8000-000000000001',linha.origem,1,
  case when p_ator='10000000-0000-4000-8000-000000000002' then linha.tarefa2 else linha.tarefa3 end,
  case when p_ator='10000000-0000-4000-8000-000000000002' then linha.evolucao2 else linha.evolucao3 end,
  case when p_ator='10000000-0000-4000-8000-000000000002' then linha.reserva2 else linha.reserva3 end,
  case when p_ator='10000000-0000-4000-8000-000000000002' then linha.geracao2 else linha.geracao3 end,p_tag||'-'||p_ator,repeat('g',43));
 execute 'set local role authenticated'; r:=api.conversao_diario_tarefa_privada(t); execute 'reset role'; return r;
end $$;
create function public.esperar_lock_conversao_fixture(p_conexao_alvo text,p_conexao_bloqueador text) returns void language plpgsql as $$
declare alvo integer; bloqueador integer; n integer; begin
 select p into alvo from dblink(p_conexao_alvo,'select pg_backend_pid()') as t(p integer);
 select p into bloqueador from dblink(p_conexao_bloqueador,'select pg_backend_pid()') as t(p integer);
 -- PID do alvo precisa ser obtido ANTES do envio assíncrono; chamador salva em GUC.
 perform set_config('fixture.conversao_pid_alvo',alvo::text,true); perform set_config('fixture.conversao_pid_bloqueador',bloqueador::text,true);
end $$;
create function public.confirmar_lock_conversao_fixture() returns void language plpgsql as $$
declare alvo integer:=current_setting('fixture.conversao_pid_alvo')::integer; bloqueador integer:=current_setting('fixture.conversao_pid_bloqueador')::integer; n integer; begin
 for n in 1..200 loop if exists(select 1 from pg_stat_activity where pid=alvo and wait_event_type='Lock' and bloqueador=any(pg_blocking_pids(alvo))) then return; end if; perform pg_sleep(0.01); end loop;
 raise exception 'CONVERSAO_NAO_SERIALIZOU'; end $$;
create function public.retificar_origem_concorrente_fixture(p_tag text) returns jsonb language plpgsql as $$
declare origem uuid; registro uuid:=gen_random_uuid(); ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; e jsonb;
begin
 select f.origem into strict origem from public.conversao_concorrencia_fixture f where f.tag=p_tag; perform public.claims_diario_fixture(ator,sessao,'oauth');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','diario_registro_id',origem,'registro_id',registro,'versao_esperada',1,'tipo','evolucao_profissional','estado','retificado','audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto','chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('h',43),'conteudo',public.envelope_diario_fixture('a'),'justificativa',public.envelope_diario_fixture('b'),'aad',public.aad_diario_fixture('40000000-0000-4000-8000-000000000001',origem,registro,2,'conteudo'),'aad_justificativa',public.aad_diario_fixture('40000000-0000-4000-8000-000000000001',origem,registro,2,'justificativa'),'aconteceu_em','2026-11-18','area','Psicologia');
 return api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
end $$;
select dblink_connect('conversao_a',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_connect('conversao_b',format('host=%L port=%L dbname=%L user=%L',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
-- Setup em comando confirmado ANTES das transações remotas: nenhuma origem invisível.
select public.preparar_conversao_concorrente_fixture('paralela');
do $$
declare primeiro jsonb; segundo jsonb; linha public.conversao_concorrencia_fixture; begin
 select * into linha from public.conversao_concorrencia_fixture where tag='paralela';
 perform dblink_exec('conversao_a','begin'); perform dblink_exec('conversao_b','begin');
 perform dblink_exec('conversao_a','set local statement_timeout=''10s'''); perform dblink_exec('conversao_b','set local statement_timeout=''10s''');
 select r into primeiro from dblink('conversao_a','select public.converter_concorrente_fixture(''paralela'',''10000000-0000-4000-8000-000000000002'')') as t(r jsonb);
 if primeiro->>'ok' is distinct from 'true' then raise exception 'PRIMEIRA_CONVERSAO_CONCORRENTE_FALHOU'; end if;
 perform public.esperar_lock_conversao_fixture('conversao_b','conversao_a');
 perform dblink_send_query('conversao_b','select public.converter_concorrente_fixture(''paralela'',''10000000-0000-4000-8000-000000000003'')'); perform public.confirmar_lock_conversao_fixture();
 perform dblink_exec('conversao_a','commit'); select r into segundo from dblink_get_result('conversao_b') as t(r jsonb); perform * from dblink_get_result('conversao_b') as t(r jsonb); perform dblink_exec('conversao_b','commit');
 if segundo->>'ok' is distinct from 'true' or segundo->>'repeticao' is distinct from 'true' or segundo->'dados' is distinct from primeiro->'dados'
  or (select count(*) from operacao.conversao_diario_tarefa where origem_id=linha.origem)<>1 or exists(select 1 from cadastro.tarefa_cuidado where id=linha.tarefa3) or exists(select 1 from cadastro.diario_registro where id=linha.evolucao3)
  or (select estado from operacao.reserva_tarefa_cuidado where id=linha.reserva3)<>'aberta' then raise exception 'CONCORRENCIA_DUPLICOU_OU_REATRIBUIU'; end if;
end $$;
select public.preparar_conversao_concorrente_fixture('revogacao');
do $$
declare r jsonb; linha public.conversao_concorrencia_fixture; begin
 select * into linha from public.conversao_concorrencia_fixture where tag='revogacao';
 perform dblink_exec('conversao_a','begin'); perform dblink_exec('conversao_b','begin');
 perform dblink_exec('conversao_a','set local statement_timeout=''10s'''); perform dblink_exec('conversao_b','set local statement_timeout=''10s''');
 perform dblink_exec('conversao_b','update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=usuario_id,motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=''40000000-0000-4000-8000-000000000001'' and usuario_id=''10000000-0000-4000-8000-000000000002''');
 perform public.esperar_lock_conversao_fixture('conversao_a','conversao_b'); perform dblink_send_query('conversao_a','select public.converter_concorrente_fixture(''revogacao'',''10000000-0000-4000-8000-000000000002'')'); perform public.confirmar_lock_conversao_fixture();
 perform dblink_exec('conversao_b','commit'); select x into r from dblink_get_result('conversao_a') as t(x jsonb); perform * from dblink_get_result('conversao_a') as t(x jsonb); perform dblink_exec('conversao_a','commit');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' or exists(select 1 from operacao.conversao_diario_tarefa where origem_id=linha.origem) or exists(select 1 from cadastro.tarefa_cuidado where id=linha.tarefa2) then raise exception 'REVOGACAO_PERMITIU_CONVERSAO'; end if;
 perform dblink_exec('conversao_b','update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=''40000000-0000-4000-8000-000000000001'' and usuario_id=''10000000-0000-4000-8000-000000000002''');
end $$;
select public.preparar_conversao_concorrente_fixture('retificacao');
do $$
declare r jsonb; linha public.conversao_concorrencia_fixture; begin
 select * into linha from public.conversao_concorrencia_fixture where tag='retificacao';
 perform dblink_exec('conversao_a','begin'); perform dblink_exec('conversao_b','begin');
 perform dblink_exec('conversao_a','set local statement_timeout=''10s'''); perform dblink_exec('conversao_b','set local statement_timeout=''10s''');
 select x into r from dblink('conversao_b','select public.retificar_origem_concorrente_fixture(''retificacao'')') as t(x jsonb); if r->>'ok' is distinct from 'true' then raise exception 'RETIFICACAO_FIXTURE_FALHOU'; end if;
 perform public.esperar_lock_conversao_fixture('conversao_a','conversao_b'); perform dblink_send_query('conversao_a','select public.converter_concorrente_fixture(''retificacao'',''10000000-0000-4000-8000-000000000002'')'); perform public.confirmar_lock_conversao_fixture();
 perform dblink_exec('conversao_b','commit'); select x into r from dblink_get_result('conversao_a') as t(x jsonb); perform * from dblink_get_result('conversao_a') as t(x jsonb); perform dblink_exec('conversao_a','commit');
 if r#>>'{erro,codigo}' is distinct from 'conflito' or exists(select 1 from operacao.conversao_diario_tarefa where origem_id=linha.origem) or exists(select 1 from cadastro.tarefa_cuidado where id=linha.tarefa2) then raise exception 'RETIFICACAO_TOCTOU_ACEITA'; end if;
end $$;
select dblink_disconnect('conversao_a'); select dblink_disconnect('conversao_b');
