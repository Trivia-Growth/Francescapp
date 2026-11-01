-- Infraestrutura privada, ainda não conectada às operações. O resultado não
-- autentica nem autoriza: o chamador deve revalidar autoridade na transação.
-- Depende de FKs imediatas e validadas: FOR UPDATE em users impede novos
-- vínculos, enquanto FOR SHARE protege as linhas existentes até o commit.
do $$
declare tabela regclass;
begin
  foreach tabela in array array['auth.sessions'::regclass, 'auth.identities'::regclass] loop
    if not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = tabela and c.confrelid = 'auth.users'::regclass
        and c.contype = 'f' and c.convalidated and not c.condeferrable
        and c.conkey = array[(select attnum from pg_catalog.pg_attribute where attrelid=tabela and attname='user_id')]::smallint[]
        and c.confkey = array[(select attnum from pg_catalog.pg_attribute where attrelid='auth.users'::regclass and attname='id')]::smallint[]
        and exists (select 1 from pg_catalog.pg_trigger t where t.tgconstraint=c.oid
          and t.tgrelid=tabela and t.tgisinternal and t.tgenabled in ('O','A') and (t.tgtype & 4) <> 0)
        and exists (select 1 from pg_catalog.pg_trigger t where t.tgconstraint=c.oid
          and t.tgrelid=tabela and t.tgisinternal and t.tgenabled in ('O','A') and (t.tgtype & 16) <> 0)
    ) then
      raise exception 'Auth incompatível: FK imediata e validada com triggers ativos de %.user_id para users.id ausente', tabela;
    end if;
  end loop;
end $$;

create role ffcmapp_bloqueios_auth_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema bloqueios_auth authorization ffcmapp_bloqueios_auth_owner;
revoke all on schema bloqueios_auth from public;
grant usage on schema auth to ffcmapp_bloqueios_auth_owner;
-- PostgreSQL exige UPDATE em alguma coluna para bloqueio de linha. O owner
-- isolado pode alterar id diretamente; não conceder membership a outros papéis.
grant select (id), update (id) on auth.users to ffcmapp_bloqueios_auth_owner;
grant select (id, user_id), update (id) on auth.sessions to ffcmapp_bloqueios_auth_owner;
grant select (id, user_id), update (id) on auth.identities to ffcmapp_bloqueios_auth_owner;

create function bloqueios_auth.travar(p_usuario uuid, p_sessao uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id = p_usuario for update;
  if not found then return false; end if;
  perform 1 from auth.sessions where id = p_sessao and user_id = p_usuario for share;
  if not found then return false; end if;
  perform 1 from auth.identities where user_id = p_usuario order by id for share;
  return found;
end $$;
alter function bloqueios_auth.travar(uuid, uuid) owner to ffcmapp_bloqueios_auth_owner;
revoke all on function bloqueios_auth.travar(uuid, uuid) from public;
