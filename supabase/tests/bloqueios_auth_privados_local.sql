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
     or has_column_privilege('ffcmapp_bloqueios_auth_owner', 'auth.sessions', 'id', 'update')
     or has_column_privilege('ffcmapp_bloqueios_auth_owner', 'auth.users', 'id', 'update')
     or has_column_privilege('ffcmapp_bloqueios_auth_owner', 'auth.identities', 'id', 'update') then
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
-- Alterações externas não aguardam a transação já autorizada.
select dblink_exec('privado', 'begin');
select dblink_exec('privado', 'set local role ffcm_teste_chamador');
do $$ begin
  if not (select valido from dblink('privado', $q$select bloqueios_auth.travar('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$q$) as t(valido boolean)) then
    raise exception 'Vínculo válido recusado';
  end if;
end $$;
select dblink_exec('alteracao', 'begin');
select dblink_exec('alteracao', 'set local statement_timeout = ''2s''');
select dblink_exec('alteracao', 'delete from auth.identities where id=''00000000-0000-0000-0000-000000000003''');
select dblink_exec('alteracao', 'commit');
select dblink_exec('privado', 'commit');
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
