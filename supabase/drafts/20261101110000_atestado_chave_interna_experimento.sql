-- EXPERIMENTO. O chamador não fornece a chave. ler_chave_interna é fixture local;
-- não representa Vault, e não é uma política de chaves ou de privilégios real.
-- É obrigatório revisar SECURITY DEFINER, owner, busca de chave e canal de chamada.
-- Não verifica JCS, prazo, sessão, JWT ou autorização; não usar para produção.
create function experimento_atestado.verificar_com_chave_interna(
  p_entrada_canonica text, p_dados_canonicos text,
  p_entrada_usada jsonb, p_dados_usados jsonb, p_mac text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_dados jsonb;
  v_chave bytea;
begin
  if p_dados_canonicos is null then return false; end if;
  begin
    v_dados := p_dados_canonicos::jsonb;
  exception when invalid_text_representation then
    return false;
  end;
  if jsonb_typeof(v_dados) is distinct from 'object'
     or jsonb_typeof(v_dados -> 'key_id') is distinct from 'string'
     or length(v_dados ->> 'key_id') not between 1 and 128 then
    return false;
  end if;
  begin
    v_chave := experimento_atestado.ler_chave_interna(v_dados ->> 'key_id');
    if v_chave is null or octet_length(v_chave) <> 32 then
      raise exception using errcode='55000',message='CHAVE_INDISPONIVEL';
    end if;
  exception when others then
    raise exception using errcode='55000',message='CHAVE_INDISPONIVEL';
  end;
  return experimento_atestado.verificar(
    p_entrada_canonica, p_dados_canonicos, p_entrada_usada, p_dados_usados, p_mac, v_chave
  ) is true;
end $$;
revoke all on function experimento_atestado.verificar_com_chave_interna(text, text, jsonb, jsonb, text) from public;
