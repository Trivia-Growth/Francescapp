-- O experimento instala fixture isolada e prova conflito das operações de Auth.
\ir bloqueios_auth_fixture_local.sql
\ir ../migrations/20261106180000_bloqueios_auth.sql

create role ffcm_teste_chamador nologin noinherit;
grant usage on schema bloqueios_auth to ffcm_teste_chamador;
grant execute on function bloqueios_auth.travar(uuid, uuid) to ffcm_teste_chamador;
do $$
begin
  if has_function_privilege('public', 'bloqueios_auth.travar(uuid,uuid)', 'execute')
     or has_schema_privilege('public', 'bloqueios_auth', 'usage')
     or pg_has_role('ffcm_teste_chamador', 'ffcmapp_bloqueios_auth_owner', 'member')
     or has_column_privilege('ffcmapp_bloqueios_auth_owner', 'auth.sessions', 'id', 'update') then
    raise exception 'Privilégio indevido';
  end if;
end $$;
set role ffcm_teste_chamador;
do $$
begin
  if not bloqueios_auth.travar('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') then
    raise exception 'Vínculo válido recusado';
  end if;
  if bloqueios_auth.travar('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000002')
     or bloqueios_auth.travar('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000099') then
    raise exception 'Vínculo inválido aceito';
  end if;
end $$;
reset role;

select dblink_connect('privado', format('host=%L port=%L dbname=%L', current_setting('unix_socket_directories'), current_setting('port'), current_database()));
select dblink_connect('alteracao', format('host=%L port=%L dbname=%L', current_setting('unix_socket_directories'), current_setting('port'), current_database()));
do $$
declare comando text; pid_alteracao integer; bloqueado boolean; resultado text;
begin
  select t.pid into pid_alteracao from dblink('alteracao', 'select pg_backend_pid()') as t(pid integer);
  foreach comando in array array[
    'insert into auth.identities values (''00000000-0000-0000-0000-000000000004'', ''00000000-0000-0000-0000-000000000001'', 0)',
    'insert into auth.sessions values (''00000000-0000-0000-0000-000000000004'', ''00000000-0000-0000-0000-000000000001'', 0)',
    'update auth.identities set valor=1 where id=''00000000-0000-0000-0000-000000000003''',
    'delete from auth.identities where id=''00000000-0000-0000-0000-000000000003'''
  ] loop
    perform dblink_exec('privado', 'begin');
    perform dblink_exec('privado', 'set local role ffcm_teste_chamador');
    if not (select valido from dblink('privado', $q$select bloqueios_auth.travar('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$q$) as t(valido boolean)) then
      raise exception 'Vínculo válido recusado na concorrência';
    end if;
    perform dblink_exec('alteracao', 'begin');
    perform dblink_exec('alteracao', 'set local statement_timeout = ''5s''');
    perform dblink_send_query('alteracao', comando);
    bloqueado := false;
    for tentativa in 1..100 loop
      select exists(select 1 from pg_stat_activity a where a.pid=pid_alteracao and a.wait_event_type='Lock' and cardinality(pg_blocking_pids(a.pid))>0) into bloqueado;
      exit when bloqueado;
      perform pg_sleep(0.02);
    end loop;
    if not bloqueado then raise exception 'Operação não bloqueou: %', comando; end if;
    perform dblink_exec('privado', 'commit');
    select status into resultado from dblink_get_result('alteracao') as t(status text);
    if resultado not in ('INSERT 0 1', 'UPDATE 1', 'DELETE 1') then raise exception 'Operação não concluiu: %', comando; end if;
    perform * from dblink_get_result('alteracao') as t(status text);
    perform dblink_exec('alteracao', 'rollback');
  end loop;
end $$;
-- Logout externo não deve esperar o fim da transação que verificou a sessão.
select dblink_exec('privado', 'begin');
select dblink_exec('privado', 'set local role ffcm_teste_chamador');
do $$ begin
  if not (select valido from dblink('privado', $q$select bloqueios_auth.travar('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$q$) as t(valido boolean)) then
    raise exception 'Vínculo válido recusado antes do logout';
  end if;
end $$;
select dblink_exec('alteracao', 'begin');
select dblink_exec('alteracao', 'set local statement_timeout = ''2s''');
do $$ begin
  if dblink_exec('alteracao', 'delete from auth.sessions where id=''00000000-0000-0000-0000-000000000002''') <> 'DELETE 1' then
    raise exception 'Logout externo não excluiu sessão';
  end if;
end $$;
select dblink_exec('alteracao', 'rollback');
select dblink_exec('privado', 'rollback');
select dblink_disconnect('privado');
select dblink_disconnect('alteracao');
