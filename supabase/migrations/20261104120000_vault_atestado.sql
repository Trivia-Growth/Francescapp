-- Pré-requisito local: não provisiona segredo, não publica RPC nem comprova atestado.
-- A execução remota depende da revisão S-02 e de configuração autorizada.
create role ffcmapp_atestado_vault_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_atestado_vault_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_atestado_vault_owner to postgres;
grant usage, create on schema identidade to ffcmapp_atestado_vault_owner;
grant usage on schema identidade to ffcmapp_atestado_vault_executor;
grant usage on schema vault to ffcmapp_atestado_vault_owner;
grant select on vault.decrypted_secrets to ffcmapp_atestado_vault_owner;
grant execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) to ffcmapp_atestado_vault_owner;

set role ffcmapp_atestado_vault_owner;
alter default privileges revoke execute on functions from public;
create table identidade.referencias_atestado_vault (
 referencia text primary key check (referencia ~ '^ffcmapp\.atestado\.[a-z0-9][a-z0-9_-]{0,63}$'),
 ativa boolean not null default true
);
revoke all on identidade.referencias_atestado_vault from public,anon,authenticated,ffcmapp_atestado_vault_executor;
create function identidade.ler_chave_atestado_vault(p_referencia text)
returns bytea language plpgsql security definer set search_path=pg_catalog as $$
declare segredo text; chave bytea;
begin
 if p_referencia is null or p_referencia !~ '^ffcmapp\.atestado\.[a-z0-9][a-z0-9_-]{0,63}$' then
  raise exception using errcode='55000',message='CONFIGURACAO_ATTESTADO_AUSENTE';
 end if;
 begin
  perform 1 from identidade.referencias_atestado_vault where referencia=p_referencia and ativa for share;
  if not found then raise exception 'referência não autorizada'; end if;
  select decrypted_secret into strict segredo from vault.decrypted_secrets where name=p_referencia;
  if segredo is null or segredo !~ '^[A-Za-z0-9+/]{43}=$' then raise exception 'configuração inválida'; end if;
  chave:=decode(segredo,'base64');
  if octet_length(chave)<>32 or encode(chave,'base64')<>segredo then raise exception 'configuração inválida'; end if;
 exception when others then
  raise exception using errcode='55000',message='CONFIGURACAO_ATTESTADO_AUSENTE';
 end;
 return chave;
end $$;
revoke all on function identidade.ler_chave_atestado_vault(text) from public,anon,authenticated;
grant execute on function identidade.ler_chave_atestado_vault(text) to ffcmapp_atestado_vault_executor;
reset role;
revoke create on schema identidade from ffcmapp_atestado_vault_owner;
revoke ffcmapp_atestado_vault_owner from postgres;
