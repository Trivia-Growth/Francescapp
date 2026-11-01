-- EXPERIMENTO LOCAL. Não implanta RPC, não consulta Vault e não concede execução.
-- Recebe representações JCS assinadas como texto; não implementa validação JCS.
-- A integração deve validar esquema, prazo, ator, sessão, operação e autorização.
-- Comparação SQL comum não comprova tempo constante; revisão de segurança pendente.
create function experimento_atestado.verificar(
  p_entrada_canonica text, p_dados_canonicos text,
  p_entrada_usada jsonb, p_dados_usados jsonb, p_mac text, p_chave bytea
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_entrada jsonb;
  v_dados jsonb;
  v_digest text;
  v_mac text;
begin
  if p_entrada_canonica is null or p_dados_canonicos is null
     or p_entrada_usada is null or p_dados_usados is null
     or p_mac is null or p_mac !~ '^[A-Za-z0-9_-]{43}$'
     or p_chave is null or octet_length(p_chave) <> 32 then
    return false;
  end if;
  v_entrada := p_entrada_canonica::jsonb;
  v_dados := p_dados_canonicos::jsonb;
  if jsonb_typeof(v_entrada) <> 'object' or jsonb_typeof(v_dados) <> 'object'
     or v_entrada is distinct from p_entrada_usada
     or v_dados is distinct from p_dados_usados
     or v_dados ? 'mac'
     or jsonb_typeof(v_dados -> 'digest_entrada') is distinct from 'string'
     or (v_dados ->> 'digest_entrada') !~ '^[A-Za-z0-9_-]{43}$' then
    return false;
  end if;
  v_digest := translate(rtrim(encode(extensions.digest(convert_to(p_entrada_canonica, 'UTF8'), 'sha256'), 'base64'), '='), '+/', '-_');
  v_mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:' || p_dados_canonicos, 'UTF8'), p_chave, 'sha256'), 'base64'), '='), '+/', '-_');
  return v_digest = v_dados ->> 'digest_entrada' and v_mac = p_mac;
exception when others then
  return false;
end $$;
revoke all on function experimento_atestado.verificar(text, text, jsonb, jsonb, text, bytea) from public;
