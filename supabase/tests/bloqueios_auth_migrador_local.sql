\set ON_ERROR_STOP on

-- Exercita o executor real da migration sem privilégios de superuser.
do $$ begin
  if current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'Este teste requer PostgreSQL 17';
  end if;
end $$;
create role migrador_fixture login nosuperuser createrole;
grant create on database postgres to migrador_fixture;
set role migrador_fixture;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id));
create table auth.identities (id uuid primary key, user_id uuid references auth.users(id));

\ir ../migrations/20261106180000_bloqueios_auth.sql
reset role;

do $$ begin
  -- PG17 concede ADMIN ao criador, sem INHERIT ou SET; preservar essa ACL.
  if (select count(*) from pg_auth_members
      where roleid = 'ffcmapp_bloqueios_auth_owner'::regrole
        and member = 'migrador_fixture'::regrole
        and grantor = session_user::regrole
        and admin_option and not inherit_option and not set_option) <> 1
    or (select count(*) from pg_auth_members
        where roleid = 'ffcmapp_bloqueios_auth_owner'::regrole) <> 1 then
    raise exception 'Membership automática alterada ou concessão temporária restante';
  end if;
  if has_schema_privilege('public', 'bloqueios_auth', 'usage')
    or has_function_privilege('public', 'bloqueios_auth.travar(uuid,uuid)', 'execute') then
    raise exception 'PUBLIC recebeu acesso ao bloqueio';
  end if;
  if (select proowner from pg_proc
      where oid = 'bloqueios_auth.travar(uuid,uuid)'::regprocedure)
      <> 'ffcmapp_bloqueios_auth_owner'::regrole then
    raise exception 'Proprietário da função incorreto';
  end if;
end $$;
