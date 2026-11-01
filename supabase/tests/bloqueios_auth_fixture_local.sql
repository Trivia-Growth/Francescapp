-- Experimento isolado: estas tabelas não representam o esquema real do Auth.
create extension dblink;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id), valor integer);
create table auth.identities (id uuid primary key, user_id uuid references auth.users(id), valor integer);
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into auth.sessions values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 0);
insert into auth.identities values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 0);
\ir ../drafts/20261107120000_bloqueios_auth_experimento.sql

do $$ begin
  if has_function_privilege('public', 'bloqueios_auth_experimento.travar(uuid,uuid)', 'execute') then
    raise exception 'Execução pública indevida';
  end if;
  if bloqueios_auth_experimento.travar('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000002') then
    raise exception 'Usuário inexistente aceito';
  end if;
  if bloqueios_auth_experimento.travar('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000099') then
    raise exception 'Sessão inexistente aceita';
  end if;
end $$;

select dblink_connect('protetor', format('host=%L port=%L dbname=%L', current_setting('unix_socket_directories'), current_setting('port'), current_database()));
select dblink_connect('concorrente', format('host=%L port=%L dbname=%L', current_setting('unix_socket_directories'), current_setting('port'), current_database()));

do $$
declare
  comando text;
  pid_concorrente integer;
  aguardando boolean;
  resultado text;
begin
  select pid into pid_concorrente from dblink('concorrente', 'select pg_backend_pid()') as t(pid integer);
  foreach comando in array array[
    'insert into auth.identities values (''00000000-0000-0000-0000-000000000004'', ''00000000-0000-0000-0000-000000000001'', 0)',
    'insert into auth.sessions values (''00000000-0000-0000-0000-000000000004'', ''00000000-0000-0000-0000-000000000001'', 0)',
    'update auth.sessions set valor = 1 where id = ''00000000-0000-0000-0000-000000000002''',
    'delete from auth.sessions where id = ''00000000-0000-0000-0000-000000000002''',
    'update auth.identities set valor = 1 where id = ''00000000-0000-0000-0000-000000000003''',
    'delete from auth.identities where id = ''00000000-0000-0000-0000-000000000003'''
  ] loop
    perform dblink_exec('protetor', 'begin');
    if not (select valido from dblink('protetor', $query$select bloqueios_auth_experimento.travar('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$query$) as t(valido boolean)) then
      raise exception 'Fixture de autoridade recusada';
    end if;
    perform dblink_exec('concorrente', 'begin');
    perform dblink_exec('concorrente', 'set local statement_timeout = ''5s''');
    perform dblink_send_query('concorrente', comando);
    aguardando := false;
    for tentativa in 1..100 loop
      select exists(select 1 from pg_stat_activity where pid = pid_concorrente and wait_event_type = 'Lock') into aguardando;
      exit when aguardando;
      perform pg_sleep(0.02);
    end loop;
    if not aguardando then
      raise exception 'Operação não aguardou bloqueio: %', comando;
    end if;
    perform dblink_exec('protetor', 'commit');
    select status into resultado from dblink_get_result('concorrente') as t(status text);
    if resultado not in ('INSERT 0 1', 'UPDATE 1', 'DELETE 1') then
      raise exception 'Operação não concluiu após liberação: %: %', comando, resultado;
    end if;
    -- Consumir resultado final antes de reutilizar conexão assíncrona.
    perform * from dblink_get_result('concorrente') as t(status text);
    perform dblink_exec('concorrente', 'rollback');
    raise notice 'Bloqueou e concluiu: %', comando;
  end loop;
end $$;
select dblink_disconnect('protetor');
select dblink_disconnect('concorrente');
