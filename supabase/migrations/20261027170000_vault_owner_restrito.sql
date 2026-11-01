-- Owner sem login e executor separado. Sem senha, login ou credencial de runtime.
-- Não muda o default global de postgres nem concede acesso direto ao Vault ao executor.
create role ffcmapp_vault_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_vault_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_vault_owner to postgres;
grant usage, create on schema identidade to ffcmapp_vault_owner;
grant usage on schema identidade to ffcmapp_vault_executor;
grant usage on schema vault to ffcmapp_vault_owner;
grant select on vault.decrypted_secrets to ffcmapp_vault_owner;
grant execute on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)
  to ffcmapp_vault_owner;

set role ffcmapp_vault_owner;
alter default privileges revoke execute on functions from public;
reset role;

alter function identidade.ler_chave_cifra_vault(text) owner to ffcmapp_vault_owner;
revoke create on schema identidade from ffcmapp_vault_owner;
set role ffcmapp_vault_owner;
revoke all on function identidade.ler_chave_cifra_vault(text) from public, anon, authenticated;
grant execute on function identidade.ler_chave_cifra_vault(text) to ffcmapp_vault_executor;
reset role;
revoke ffcmapp_vault_owner from postgres;
