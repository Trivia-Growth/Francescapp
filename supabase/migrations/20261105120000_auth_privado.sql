-- Ponte privada: postgres possui acesso ao Auth sem poder delegar USAGE no schema.
-- Dados de tabelas limitados ao usuário e à sessão do JWT da própria requisição.
create schema auth_privado;
revoke all on schema auth_privado from public;
create function auth_privado.uid() returns uuid language sql stable security definer set search_path = '' as $$ select auth.uid() $$;
create function auth_privado.jwt() returns jsonb language sql stable security definer set search_path = '' as $$ select auth.jwt() $$;
create function auth_privado.sessoes() returns table(id uuid, user_id uuid, not_after timestamptz)
language sql stable security definer set search_path = '' as $$
 select s.id, s.user_id, s.not_after from auth.sessions s
 where s.user_id = auth.uid() and s.id::text = auth.jwt()->>'session_id'
$$;
create function auth_privado.identidades() returns table(user_id uuid, provider text, provider_id text, identity_data jsonb)
language sql stable security definer set search_path = '' as $$
 select i.user_id, i.provider, i.provider_id, i.identity_data from auth.identities i
 where i.user_id = auth.uid() and i.provider = 'google'
$$;
revoke all on all functions in schema auth_privado from public;
