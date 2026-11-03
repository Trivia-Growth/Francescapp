-- Verificação privada de existência no snapshot da consulta. Autorização e
-- revogações locais permanecem responsabilidade dos chamadores.
create role ffcmapp_bloqueios_auth_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_bloqueios_auth_owner to current_user with inherit true, set true;
create schema bloqueios_auth authorization ffcmapp_bloqueios_auth_owner;
revoke all on schema bloqueios_auth from public;
grant usage on schema auth to ffcmapp_bloqueios_auth_owner;
grant select (id) on auth.users to ffcmapp_bloqueios_auth_owner;
grant select (id, user_id) on auth.sessions to ffcmapp_bloqueios_auth_owner;

create function bloqueios_auth.travar(p_usuario uuid, p_sessao uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join auth.sessions s on s.user_id = u.id
    where u.id = p_usuario and s.id = p_sessao)
$$;
alter function bloqueios_auth.travar(uuid, uuid) owner to ffcmapp_bloqueios_auth_owner;
revoke all on function bloqueios_auth.travar(uuid, uuid) from public;
revoke ffcmapp_bloqueios_auth_owner from current_user;
