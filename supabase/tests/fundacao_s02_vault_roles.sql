-- Prova transacional: roles de teste, segredos e grants desaparecem no rollback.
begin;

create role ffcmapp_teste_vault_owner_s02 nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_teste_vault_backend_s02 nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_teste_vault_owner_s02 to postgres with inherit false, set true;
grant ffcmapp_teste_vault_backend_s02 to postgres with inherit false, set true;
grant usage, create on schema identidade to ffcmapp_teste_vault_owner_s02;
grant usage on schema identidade to ffcmapp_teste_vault_backend_s02;
grant usage on schema vault to ffcmapp_teste_vault_owner_s02;
grant select on vault.decrypted_secrets to ffcmapp_teste_vault_owner_s02;
grant execute on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)
  to ffcmapp_teste_vault_owner_s02;

set local role ffcmapp_teste_vault_owner_s02;
alter default privileges revoke execute on functions from public;
create function identidade.teste_ler_vault_s02(p_nome text) returns text
language sql security definer set search_path = pg_catalog, vault
as $$ select decrypted_secret from vault.decrypted_secrets
  where name = p_nome and p_nome ~ '^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$' $$;
grant execute on function identidade.teste_ler_vault_s02(text) to ffcmapp_teste_vault_backend_s02;
reset role;

select vault.create_secret(encode(gen_random_bytes(32), 'base64'), 'ffcmapp.cifra.teste-role-s02');

do $bloco$
begin
  if has_table_privilege('ffcmapp_teste_vault_backend_s02', 'vault.decrypted_secrets', 'select')
    or has_schema_privilege('ffcmapp_teste_vault_backend_s02', 'vault', 'usage')
    or has_function_privilege('anon', 'identidade.teste_ler_vault_s02(text)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'identidade.teste_ler_vault_s02(text)'::regprocedure, 'execute') then
    raise exception 'FALHA: acesso excessivo ao cofre';
  end if;
end
$bloco$;

set local role ffcmapp_teste_vault_backend_s02;
do $bloco$
begin
  if length(identidade.teste_ler_vault_s02('ffcmapp.cifra.teste-role-s02')) is distinct from 44 then
    raise exception 'FALHA: backend restrito não lê referência fictícia';
  end if;
  if identidade.teste_ler_vault_s02('fora-do-escopo') is not null
    or identidade.teste_ler_vault_s02('ffcmapp.cifra.ausente-s02') is not null then
    raise exception 'FALHA: referência inválida ou ausente foi aceita';
  end if;
  begin
    perform decrypted_secret from vault.decrypted_secrets limit 1;
    raise exception 'FALHA: backend leu view diretamente';
  exception when insufficient_privilege then null;
  end;
end
$bloco$;
reset role;

rollback;
