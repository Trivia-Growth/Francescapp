-- Prova do leitor real com roles restritas; segredos fictícios em rollback.
begin;

grant ffcmapp_vault_executor to postgres;
do $bloco$
begin
  if not exists (
    select 1 from pg_proc p where p.oid = 'identidade.ler_chave_cifra_vault(text)'::regprocedure
      and pg_get_userbyid(p.proowner) = 'ffcmapp_vault_owner'
      and p.prosecdef
  ) or has_table_privilege('ffcmapp_vault_executor', 'vault.decrypted_secrets', 'select')
    or has_schema_privilege('ffcmapp_vault_executor', 'vault', 'usage')
    or has_function_privilege('anon', 'identidade.ler_chave_cifra_vault(text)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'identidade.ler_chave_cifra_vault(text)'::regprocedure, 'execute')
    or not has_function_privilege('ffcmapp_vault_executor', 'identidade.ler_chave_cifra_vault(text)'::regprocedure, 'execute') then
    raise exception 'FALHA: privilégios ou owner do leitor inválidos';
  end if;
  perform vault.create_secret(encode(decode(repeat('01', 32), 'hex'), 'base64'), 'ffcmapp.cifra.teste-executor-s02');
  perform vault.create_secret(encode(decode(repeat('02', 32), 'hex'), 'base64'), 'ffcmapp.cifra.teste-executor-anterior-s02');
  perform vault.create_secret(encode(decode(repeat('03', 32), 'hex'), 'base64'), 'fora-do-escopo');
end
$bloco$;

set local role ffcmapp_vault_executor;
do $bloco$
begin
  if identidade.ler_chave_cifra_vault('ffcmapp.cifra.teste-executor-s02')
      is distinct from encode(decode(repeat('01', 32), 'hex'), 'base64')
    or identidade.ler_chave_cifra_vault('ffcmapp.cifra.teste-executor-anterior-s02')
      is distinct from encode(decode(repeat('02', 32), 'hex'), 'base64') then
    raise exception 'FALHA: executor não acessa chave de teste';
  end if;
  begin
    perform identidade.ler_chave_cifra_vault('ffcmapp.cifra.ausente-s02');
    raise exception 'FALHA: chave ausente aceita';
  exception when raise_exception then
    if sqlerrm <> 'CONFIGURACAO_COFRE_AUSENTE' then raise; end if;
  end;
  begin
    perform identidade.ler_chave_cifra_vault('fora-do-escopo');
    raise exception 'FALHA: referência fora do escopo aceita';
  exception when raise_exception then
    if sqlerrm <> 'CONFIGURACAO_COFRE_AUSENTE' then raise; end if;
  end;
  begin
    perform decrypted_secret from vault.decrypted_secrets limit 1;
    raise exception 'FALHA: leitura direta aceita';
  exception when insufficient_privilege then null;
  end;
end
$bloco$;
reset role;
rollback;
