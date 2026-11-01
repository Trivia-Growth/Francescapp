-- Experimento privado, não ativado. Exige confirmação das FKs reais do Auth,
-- privilégios/RLS e ordem de locks antes de integrar às funções de autoridade.
-- SELECT FOR UPDATE/SHARE requer UPDATE em uma coluna: este grant permite
-- alteração direta dessa coluna pelo owner e precisa de revisão de segurança.
create role ffcm_bloqueios_auth_experimento nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema bloqueios_auth_experimento;
revoke all on schema bloqueios_auth_experimento from public;
grant usage on schema auth to ffcm_bloqueios_auth_experimento;
grant select (id), update (id) on auth.users to ffcm_bloqueios_auth_experimento;
grant select (id, user_id), update (id) on auth.sessions to ffcm_bloqueios_auth_experimento;
grant select (id, user_id), update (id) on auth.identities to ffcm_bloqueios_auth_experimento;

create function bloqueios_auth_experimento.travar(p_usuario uuid, p_sessao uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id = p_usuario for update;
  if not found then return false; end if;
  perform 1 from auth.sessions where id = p_sessao and user_id = p_usuario for share;
  if not found then return false; end if;
  perform 1 from auth.identities where user_id = p_usuario order by id for share;
  return found;
end $$;
alter function bloqueios_auth_experimento.travar(uuid, uuid) owner to ffcm_bloqueios_auth_experimento;
revoke all on function bloqueios_auth_experimento.travar(uuid, uuid) from public;
