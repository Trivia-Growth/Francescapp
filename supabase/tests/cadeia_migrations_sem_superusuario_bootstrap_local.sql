\set ON_ERROR_STOP on
-- Preâmbulo da cadeia COMPLETA reproduzindo a condição do projeto remoto:
-- o papel migrador `postgres` tem CREATEROLE e NÃO é superusuário (PostgreSQL 17.11,
-- conforme docs/processo/revisao-s02-fundacao-ffcmapp.md). Apenas as interfaces
-- externas Auth/Vault/Storage/cron são simuladas; tudo da aplicação vem das migrations.
-- Este arquivo roda como superusuário descartável da fixture; as migrations, não.
-- Única variável alterada em relação a cadeia_migrations_local.sql: o migrador perde
-- SUPERUSER. Os objetos de fixture continuam pertencendo a `postgres`, e as extensões
-- (que exigem superusuário em qualquer servidor) são instaladas pela plataforma,
-- como no Supabase remoto.
do $$ begin
  if current_database() <> 'ffcm_cadeia_sem_superusuario_local' or inet_server_addr() is not null then
    raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
  end if;
end $$;
create role postgres createrole login;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
alter database ffcm_cadeia_sem_superusuario_local owner to postgres;
alter schema public owner to postgres;

-- Extensões instaladas pela plataforma, com repasse de concessão ao migrador.
create schema extensions authorization postgres;
create extension pgcrypto with schema extensions;
grant execute on all functions in schema extensions to postgres with grant option;
create extension if not exists pg_cron;
grant usage on schema cron to postgres;
grant select, insert, update, delete on all tables in schema cron to postgres;
grant execute on all functions in schema cron to postgres;

set role postgres;
create schema auth;
create schema vault;
create table vault.segredos_fixture (name text primary key, decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.segredos_fixture;
create function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)
  returns bytea language sql as $$ select $1; $$;
-- Adapter fictício das interfaces Vault exigidas pela cadeia, sem integração externa.
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text);
revoke all on vault.secrets from public,anon,authenticated,service_role;
create function vault.create_secret(new_secret text,new_name text default null,new_description text default '',new_key_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$ declare resultado uuid;begin insert into vault.secrets(name,secret) values(new_name,new_secret) returning id into resultado;return resultado;end $$;
revoke all on function vault.create_secret(text,text,text,uuid) from public,anon,authenticated,service_role;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
create table auth.identities (id uuid primary key, user_id uuid references auth.users, provider text, provider_id text, identity_data jsonb);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
grant usage on schema auth to authenticated;
-- Storage fictício, equivalente ao usado pelas fixtures de turno e financeiro.
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
reset role;

do $$ begin
  if (select rolsuper from pg_roles where rolname='postgres') then
    raise exception 'MIGRADOR_NAO_PODE_SER_SUPERUSUARIO';
  end if;
  if not (select rolcreaterole from pg_roles where rolname='postgres') then
    raise exception 'MIGRADOR_PRECISA_DE_CREATEROLE';
  end if;
end $$;
