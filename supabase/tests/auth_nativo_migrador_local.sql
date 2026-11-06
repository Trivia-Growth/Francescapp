\set ON_ERROR_STOP on
-- Fixture PostgreSQL descartável: não representa gateway/JWT/Google reais.
do $$ begin
  if current_database() <> 'ffcm_auth_nativo_teste_local' or inet_server_addr() is not null then
    raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
  end if;
end $$;
create role postgres superuser nologin;
create role anon nologin;
create role authenticated nologin;
set role postgres;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
-- Somente a superfície da view Vault é fictícia; HMAC usa pgcrypto real.
create schema vault;
create table vault.segredos_fixture (name text primary key, decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.segredos_fixture;
create function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)
  returns bytea language sql as $$ select $1; $$;
insert into vault.segredos_fixture values ('ffcmapp.hmac.email.v1', encode(decode(repeat('ab',32),'hex'),'base64'));
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, provider text, provider_id text, identity_data jsonb
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
grant usage on schema auth to authenticated;
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
\ir ../migrations/20261026143000_fundacao_grants_rls.sql
\ir ../migrations/20261026150000_fundacao_auditoria_idempotencia.sql
\ir ../migrations/20261028100000_sessao_identificador_invalido.sql
reset role;
-- Auth é propriedade de outro papel; CREATEROLE não concede acesso às tabelas.
create role auth_owner_fixture nologin;
alter table auth.sessions owner to auth_owner_fixture;
alter table auth.identities owner to auth_owner_fixture;
alter role postgres nosuperuser createrole;
set role postgres;
do $$ begin
  begin
    grant select (user_id) on auth.identities to authenticated;
    raise exception 'GRANT_AUTH_SEM_OPCAO_ACEITO';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
grant select (id, user_id, not_after) on auth.sessions to postgres with grant option;
grant select (user_id, provider, provider_id, identity_data) on auth.identities to postgres with grant option;
-- O executor não precisa ter o nome reservado do Supabase.
alter role postgres rename to migrador_fixture;
grant create on database ffcm_auth_nativo_teste_local to migrador_fixture;
-- Exercita runner que entrou no executor via SET ROLE; RESET ROLE voltaria ao bootstrap.
set role migrador_fixture;
\ir ../migrations/20261105120000_auth_privado.sql
\if :falha_injetada
\i :migration_injetada
\else
\ir ../migrations/20261105130000_auth_nativo_sessao.sql
\endif
reset role;
do $$ begin
 if (select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname in ('ffcmapp_auth_nativo_owner','ffcmapp_email_hmac_owner') and u.rolname='migrador_fixture' and m.admin_option and not m.set_option and not m.inherit_option) <> 2 or exists (select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname in ('ffcmapp_auth_nativo_owner','ffcmapp_email_hmac_owner') and u.rolname='migrador_fixture' and (m.set_option or m.inherit_option)) then raise exception 'MEMBRESIA_INCORRETA'; end if;
 if not has_function_privilege('ffcmapp_auth_nativo_owner','identidade.email_google_hmac_nativo()','execute') or not has_function_privilege('authenticated','api.admitir_sessao_nativa(uuid)','execute') or has_function_privilege('anon','api.admitir_sessao_nativa(uuid)','execute') then raise exception 'ACL_DIVERGENTE'; end if;
 if has_schema_privilege('ffcmapp_auth_nativo_owner','auth','usage') or has_column_privilege('ffcmapp_auth_nativo_owner','auth.sessions','id','select') or not has_function_privilege('ffcmapp_auth_nativo_owner','auth_privado.sessoes()','execute') or not has_function_privilege('ffcmapp_email_hmac_owner','auth_privado.identidades()','execute') then raise exception 'AUTH_ACL_DIVERGENTE'; end if;
end $$;
