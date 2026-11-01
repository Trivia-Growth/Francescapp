-- Clone descartável dedicado: COMMITs apenas em dados fictícios.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'ffcm_reserva_barreira_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
\ir ../drafts/20261103200000_reserva_barreira_sessao_experimento.sql
do $$ declare papel text; helper regprocedure; begin
 foreach papel in array array['anon','authenticated'] loop
  foreach helper in array array['reserva_fixture.abrir(uuid,bigint,uuid)'::regprocedure,
   'reserva_fixture.fechar(uuid,bigint,uuid)'::regprocedure,
   'reserva_fixture.confirmar(uuid,bigint,uuid)'::regprocedure,
   'reserva_fixture.consultar(uuid)'::regprocedure,
   'reserva_fixture.admitir_snapshot_fixture(uuid,uuid,bytea)'::regprocedure,
   'reserva_fixture.abrir_snapshot_fixture(uuid,uuid,bytea,uuid)'::regprocedure,
   'reserva_fixture.barreira_snapshot_fixture(uuid,uuid,bytea)'::regprocedure] loop
   if has_function_privilege(papel,helper,'execute') then raise exception 'helper diretamente acessível: % %',papel,helper; end if;
  end loop;
 end loop;
end $$;
create extension dblink;
insert into reserva_fixture.ator(id) values('f1000000-0000-4000-8000-000000000001'),('f1000000-0000-4000-8000-000000000002');
do $$ declare a uuid; begin
 foreach a in array array['f1000000-0000-4000-8000-000000000001'::uuid,'f1000000-0000-4000-8000-000000000002'::uuid] loop
  if not reserva_fixture.admitir_snapshot_fixture(a,case when a::text like '%001' then 'f2000000-0000-4000-8000-000000000001'::uuid else 'f2000000-0000-4000-8000-000000000003'::uuid end,decode(repeat('01',32),'hex')) then raise exception 'snapshot antigo negado'; end if;
  if not reserva_fixture.admitir_snapshot_fixture(a,case when a::text like '%001' then 'f2000000-0000-4000-8000-000000000002'::uuid else 'f2000000-0000-4000-8000-000000000004'::uuid end,decode(repeat('02',32),'hex')) then raise exception 'snapshot novo negado'; end if;
 end loop;
end $$;
create function pg_temp.espera_bloqueio(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz:=clock_timestamp()+interval '3 seconds'; begin loop
 perform pg_stat_clear_snapshot();
 if exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
 if clock_timestamp()>=prazo then raise exception 'bloqueio não observado'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select pid as backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
select dblink_exec('outra','set statement_timeout=30000');
select dblink_exec('outra','set lock_timeout=10000');
-- Barreira vence; abertura anterior efetivamente espera e é negada.
begin;
do $$ begin if reserva_fixture.barreira_snapshot_fixture('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002',decode(repeat('02',32),'hex'))<>'ausente_cercada' then raise exception 'barreira negada'; end if; end $$;
select dblink_send_query('outra',$$select reserva_fixture.abrir_snapshot_fixture('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',decode(repeat('01',32),'hex'),'f3000000-0000-4000-8000-000000000001')$$);
select pg_temp.espera_bloqueio(:backend);
commit;
do $$ declare r text; begin select resultado into r from dblink_get_result('outra') as x(resultado text);
 if r<>'negada' or exists(select 1 from reserva_fixture.reserva where id='f3000000-0000-4000-8000-000000000001') then raise exception 'abertura antiga aceita'; end if;
 if reserva_fixture.barreira_snapshot_fixture('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002',decode(repeat('02',32),'hex'))<>'negada' then raise exception 'replay após resposta perdida avançou'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado text);
-- Abertura vence; barreira espera e observa a reserva antes de cercá-la.
begin;
do $$ begin if reserva_fixture.abrir_snapshot_fixture('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000003',decode(repeat('01',32),'hex'),'f3000000-0000-4000-8000-000000000002')<>'aberta' then raise exception 'abertura negada'; end if; end $$;
select dblink_send_query('outra',$$select reserva_fixture.barreira_snapshot_fixture('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000004',decode(repeat('02',32),'hex'))$$);
select pg_temp.espera_bloqueio(:backend);
commit;
do $$ declare r text; begin select resultado into r from dblink_get_result('outra') as x(resultado text);
 if r<>'cancelada' or not exists(select 1 from reserva_fixture.reserva where id='f3000000-0000-4000-8000-000000000002' and estado='cancelada' and fechada) then raise exception 'barreira perdeu operação anterior'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado text);
-- Após perder resposta 'cancelada', uma nova sessão recupera o estado persistido.
do $$ begin
 if not reserva_fixture.admitir_snapshot_fixture('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000005',decode(repeat('03',32),'hex')) then raise exception 'nova sessão fixture negada'; end if;
 if reserva_fixture.barreira_snapshot_fixture('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000005',decode(repeat('03',32),'hex'))<>'cancelada'
  or not exists(select 1 from reserva_fixture.reserva where id='f3000000-0000-4000-8000-000000000002' and estado='cancelada') then raise exception 'contraexemplo mudou'; end if;
 if reserva_fixture.barreira_snapshot_fixture('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000005',decode(repeat('03',32),'hex'))<>'negada' then raise exception 'replay alterou barreira'; end if;
 if not reserva_fixture.admitir_snapshot_fixture('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000007',decode(repeat('05',32),'hex')) then raise exception 'sessão posterior negada'; end if;
 if reserva_fixture.abrir_snapshot_fixture('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000007',decode(repeat('05',32),'hex'),'f3000000-0000-4000-8000-000000000003')<>'bloqueada' then raise exception 'nova reserva permitida sem confirmação'; end if;
 if not reserva_fixture.admitir_snapshot_fixture('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000006',decode(repeat('04',32),'hex')) then raise exception 'outra sessão fixture negada'; end if;
 if reserva_fixture.barreira_snapshot_fixture('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000006',decode(repeat('04',32),'hex'))<>'ausente_cercada' then raise exception 'outro ator viu resultado'; end if;
end $$;
-- Falhas silenciosas em ledger e fencing revertem reserva, resultado e época.
insert into reserva_fixture.ator(id) values('f1000000-0000-4000-8000-000000000003');
do $$ begin
 if not reserva_fixture.admitir_snapshot_fixture('f1000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000008',decode(repeat('06',32),'hex'))
 or reserva_fixture.abrir_snapshot_fixture('f1000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000008',decode(repeat('06',32),'hex'),'f3000000-0000-4000-8000-000000000004')<>'aberta' then raise exception 'fixture falhou'; end if;
end $$;
create function pg_temp.suprimir_gravacao_barreira() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.suprimir_barreira',true)=tg_argv[0] then return null; end if;
 return new;
end $$;
create trigger suprimir_ledger_barreira before insert on reserva_fixture.resultado_barreira_fixture for each row execute function pg_temp.suprimir_gravacao_barreira('ledger');
create trigger suprimir_ator_barreira before update on reserva_fixture.ator for each row execute function pg_temp.suprimir_gravacao_barreira('ator');
do $$ declare tipo text; esperado text; begin
 foreach tipo in array array['ledger','ator'] loop
  esperado:=case tipo when 'ledger' then 'RESULTADO_NAO_REGISTRADO' else 'BARREIRA_NAO_AVANCADA' end;
  perform set_config('ffcm_fixture.suprimir_barreira',tipo,true);
  begin
   perform reserva_fixture.barreira_snapshot_fixture('f1000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000008',decode(repeat('06',32),'hex'));
   raise exception 'falha silenciosa aceita';
  exception when sqlstate 'P0002' then if sqlerrm<>esperado then raise; end if; end;
  if not exists(select 1 from reserva_fixture.ator where id='f1000000-0000-4000-8000-000000000003' and geracao=1 and atual='f3000000-0000-4000-8000-000000000004')
   or not exists(select 1 from reserva_fixture.reserva where id='f3000000-0000-4000-8000-000000000004' and estado='aberta' and not fechada)
   or exists(select 1 from reserva_fixture.resultado_barreira_fixture where ator='f1000000-0000-4000-8000-000000000003') then raise exception 'rollback incompleto'; end if;
 end loop;
end $$;
select dblink_disconnect('outra');
