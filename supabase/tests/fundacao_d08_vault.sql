-- Fundação FFCMApp — testes da tarefa 2.4.2 / D-08.
-- Segredos aleatórios existem somente durante a transação e são revertidos.

begin;

do $bloco$
declare
  v_referencia_ativa constant text := 'ffcmapp.cifra.teste-ativa';
  v_referencia_anterior constant text := 'ffcmapp.cifra.teste-anterior';
  v_ativa text;
  v_anterior text;
begin
  perform vault.create_secret(encode(gen_random_bytes(32), 'base64'), v_referencia_ativa, 'teste transitório FFCMApp');
  perform vault.create_secret(encode(gen_random_bytes(32), 'base64'), v_referencia_anterior, 'teste transitório FFCMApp');

  select identidade.ler_chave_cifra_vault(v_referencia_ativa) into v_ativa;
  select identidade.ler_chave_cifra_vault(v_referencia_anterior) into v_anterior;

  if length(v_ativa) <> 44 or length(v_anterior) <> 44 or v_ativa = v_anterior then
    raise exception 'FALHA: leitor de Vault não retornou a referência correta';
  end if;

  begin
    perform identidade.ler_chave_cifra_vault('ffcmapp.cifra.inexistente');
    raise exception 'FALHA: referência ausente foi aceita';
  exception
    when raise_exception then
      if sqlerrm <> 'CONFIGURACAO_COFRE_AUSENTE' then
        raise;
      end if;
  end;

  if has_schema_privilege('anon', 'vault', 'usage')
    or has_schema_privilege('authenticated', 'vault', 'usage')
    or has_table_privilege('anon', 'vault.decrypted_secrets', 'select')
    or has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select')
    or has_function_privilege('anon', 'identidade.ler_chave_cifra_vault(text)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'identidade.ler_chave_cifra_vault(text)'::regprocedure, 'execute') then
    raise exception 'FALHA: role pública acessa segredos ou leitor interno';
  end if;
end
$bloco$;

rollback;
