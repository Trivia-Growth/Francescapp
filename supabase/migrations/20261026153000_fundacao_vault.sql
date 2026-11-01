-- Fundação FFCMApp — D-08: leitura interna e restrita de chaves no Vault.
-- A referência é configurada no servidor; nenhuma rota pública executa esta função.

create function identidade.ler_chave_cifra_vault(p_referencia text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, vault
as $$
declare
  v_chave text;
begin
  if p_referencia !~ '^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception using errcode = 'P0001', message = 'CONFIGURACAO_COFRE_AUSENTE';
  end if;

  select d.decrypted_secret into v_chave
  from vault.decrypted_secrets d
  where d.name = p_referencia;

  if v_chave is null or length(v_chave) <> 44 then
    raise exception using errcode = 'P0001', message = 'CONFIGURACAO_COFRE_AUSENTE';
  end if;

  return v_chave;
end;
$$;

revoke all on function identidade.ler_chave_cifra_vault(text) from public, anon, authenticated;
