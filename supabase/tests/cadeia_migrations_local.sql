\set ON_ERROR_STOP on
-- Apenas interfaces externas Auth/Vault são simuladas; funções da aplicação vêm das migrations.
do $$ begin
  if current_database() <> 'ffcm_cadeia_local' or inet_server_addr() is not null then
    raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
  end if;
end $$;
create role postgres superuser nologin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
set role postgres;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema vault;
create table vault.segredos_fixture (name text primary key, decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.segredos_fixture;
create function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)
  returns bytea language sql as $$ select $1; $$;
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
create table auth.identities (id uuid primary key, user_id uuid references auth.users, provider text, provider_id text, identity_data jsonb);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
grant usage on schema auth to authenticated;
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
\ir ../migrations/20261026143000_fundacao_grants_rls.sql
\ir ../migrations/20261026150000_fundacao_auditoria_idempotencia.sql
\ir ../migrations/20261026153000_fundacao_vault.sql
\ir ../migrations/20261027160000_auditoria_correlacao_request.sql
\ir ../migrations/20261027170000_vault_owner_restrito.sql
\ir ../migrations/20261028100000_sessao_identificador_invalido.sql
\ir ../migrations/20261104120000_vault_atestado.sql
\ir ../migrations/20261105130000_auth_nativo_sessao.sql
\ir ../migrations/20261106100000_carteira_nativa.sql
\ir ../migrations/20261106130000_carteira_nativa.sql
\ir ../migrations/20261106140000_criar_paciente_privado.sql
\ir ../migrations/20261106150000_criar_paciente.sql
\ir ../migrations/20261106160000_reconciliar_cadastro.sql
\ir ../migrations/20261106170000_cadastro_composicao.sql
\ir ../migrations/20261106180000_bloqueios_auth.sql
\ir ../migrations/20261106190000_wrappers_privados.sql
\ir ../migrations/20261106200000_autoridade_locks.sql
