-- A ponte preserva a verificação de usuário e sessão no snapshot atual.
create schema bloqueios_auth;
revoke all on schema bloqueios_auth from public;
create function bloqueios_auth.travar(p_usuario uuid, p_sessao uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select p_usuario = auth.uid() and p_sessao::text = auth.jwt()->>'session_id'
   and exists (select 1 from auth.users u join auth.sessions s on s.user_id = u.id
     where u.id = p_usuario and s.id = p_sessao)
$$;
revoke all on function bloqueios_auth.travar(uuid, uuid) from public;
