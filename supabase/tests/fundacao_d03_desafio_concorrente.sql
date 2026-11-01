-- Somente cluster local descartável; cria objetos e NÃO remove dados existentes.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'ffcm_desafio_teste_local'
     or inet_server_addr() is not null
     or current_setting('unix_socket_directories') not like '/tmp/ffcm-desafio.%' then
    raise exception 'Cluster local descartável obrigatório';
  end if;
end $$;
create extension dblink;
create role anon nologin;
create role authenticated nologin;
create schema identidade;
create table identidade.desafio_login (
  id uuid primary key,
  nonce_hash text not null check (length(btrim(nonce_hash)) > 0),
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default clock_timestamp(),
  constraint desafio_login_ordem_datas_chk check (
    expira_em > criado_em and (consumido_em is null or consumido_em >= criado_em)
  )
);
\ir ../drafts/20261031120000_desafio_google.sql
do $$
declare
  conn text := format('host=%s port=%s dbname=%s', current_setting('unix_socket_directories'), current_setting('port'), current_database());
  a integer;
  b integer;
  bloqueado boolean := false;
  resultado boolean;
  segundos_restantes double precision;
  hash text := repeat('a', 64);
  id uuid := '11111111-1111-4111-8111-111111111111';
  id_expira uuid := '22222222-2222-4222-8222-222222222222';
begin
  perform dblink_connect('d03_a', conn);
  perform dblink_connect('d03_b', conn);
  select pid into a from dblink('d03_a', 'select pg_backend_pid()') as t(pid integer);
  select pid into b from dblink('d03_b', 'select pg_backend_pid()') as t(pid integer);
  perform * from dblink('d03_a', format('select identidade.registrar_desafio_google(%L, %L, clock_timestamp() + interval %L)', id, hash, '1 minute')) as t(ignorado text);
  perform dblink_exec('d03_a', 'begin');
  select ok into resultado from dblink('d03_a', format('select identidade.consumir_desafio_google(%L, %L)', id, hash)) as t(ok boolean);
  if not resultado then raise exception 'primeiro consumo recusado'; end if;
  perform dblink_send_query('d03_b', format('select identidade.consumir_desafio_google(%L, %L)', id, hash));
  for i in 1..100 loop
    select a = any(pg_blocking_pids(b)) into bloqueado;
    exit when bloqueado;
    perform pg_sleep(0.02);
  end loop;
  if not bloqueado then raise exception 'concorrência sem bloqueio esperado'; end if;
  perform dblink_exec('d03_a', 'commit');
  select ok into resultado from dblink_get_result('d03_b') as t(ok boolean);
  if resultado is distinct from false then raise exception 'segundo consumo aceito'; end if;
  -- Drena resultado assíncrono antes da próxima consulta.
  perform * from dblink_get_result('d03_b') as t(ok boolean);
  perform * from dblink('d03_a', format('select identidade.registrar_desafio_google(%L, %L, clock_timestamp() + interval %L)', id_expira, hash, '2 seconds')) as t(ignorado text);
  perform dblink_exec('d03_a', 'begin');
  perform * from dblink('d03_a', format('select id from identidade.desafio_login where id = %L for update', id_expira)) as t(id uuid);
  perform dblink_send_query('d03_b', format('select identidade.consumir_desafio_google(%L, %L)', id_expira, hash));
  bloqueado := false;
  for i in 1..100 loop
    select a = any(pg_blocking_pids(b)) into bloqueado;
    exit when bloqueado;
    perform pg_sleep(0.02);
  end loop;
  if not bloqueado then raise exception 'espera por lock não confirmada'; end if;
  select extract(epoch from desafio.expira_em - clock_timestamp())
    into segundos_restantes from identidade.desafio_login as desafio where desafio.id = id_expira;
  if segundos_restantes is null or segundos_restantes <= 0.5 then
    raise exception 'bloqueio não confirmado com margem antes da expiração';
  end if;
  loop
    select extract(epoch from desafio.expira_em - clock_timestamp())
      into segundos_restantes from identidade.desafio_login as desafio where desafio.id = id_expira;
    exit when segundos_restantes <= 0;
    perform pg_sleep(least(segundos_restantes + 0.01, 0.2));
  end loop;
  perform dblink_exec('d03_a', 'commit');
  select ok into resultado from dblink_get_result('d03_b') as t(ok boolean);
  if resultado is distinct from false then raise exception 'desafio expirado durante lock aceito'; end if;
  perform dblink_disconnect('d03_a');
  perform dblink_disconnect('d03_b');
end $$;
