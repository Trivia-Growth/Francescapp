-- Somente cluster temporário; não é Supabase Vault nem migração.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'postgres' or inet_server_addr() is not null
    or current_setting('data_directory') not like '%/ffcm-tls.%/data-valido' then
    raise exception 'Cluster de teste obrigatório';
  end if;
end $$;
create role ffcmapp_vault_executor nologin noinherit;
alter role ffcm_tls_teste noinherit;
grant ffcmapp_vault_executor to ffcm_tls_teste;
create schema identidade;
revoke all on schema identidade from public;
grant usage on schema identidade to ffcmapp_vault_executor;
create function identidade.ler_chave_cifra_vault(p_referencia text) returns text
language sql stable security definer set search_path=pg_catalog as $$
  select case p_referencia
    when 'ffcmapp.cifra.aes' then encode(decode(repeat('11',32),'hex'),'base64')
    when 'ffcmapp.cifra.aes_v2' then encode(decode(repeat('22',32),'hex'),'base64')
    when 'ffcmapp.cifra.hmac' then encode(decode(repeat('2b',32),'hex'),'base64')
    else null end
$$;
revoke all on function identidade.ler_chave_cifra_vault(text) from public;
grant execute on function identidade.ler_chave_cifra_vault(text) to ffcmapp_vault_executor;
