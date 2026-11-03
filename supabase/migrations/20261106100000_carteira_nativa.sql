-- Verificação criptográfica interna de bytes JCS; não autoriza operações.
-- Sem executor de aplicação até S-02 e integração com JWT, sessão e prazo.
do $$ begin
 if current_user <> session_user then
  raise exception 'Migration requer conexão direta como executor';
 end if;
end $$;
create role ffcmapp_atestado_verificador_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_atestado_verificador_owner to current_user with inherit false, set true;
grant usage, create on schema identidade to ffcmapp_atestado_verificador_owner;
grant usage on schema extensions to ffcmapp_atestado_verificador_owner;
grant execute on function extensions.digest(bytea,text), extensions.hmac(bytea,bytea,text)
  to ffcmapp_atestado_verificador_owner;
grant ffcmapp_atestado_vault_owner to current_user with inherit false, set true;
set role ffcmapp_atestado_vault_owner;
grant execute on function identidade.ler_chave_atestado_vault(text) to ffcmapp_atestado_verificador_owner;
set role none;
revoke ffcmapp_atestado_vault_owner from current_user;
set role ffcmapp_atestado_verificador_owner;
alter default privileges revoke execute on functions from public;
create function identidade.verificar_assinatura_atestado(
  p_entrada_canonica text, p_dados_canonicos text, p_entrada_usada jsonb, p_dados_usados jsonb, p_mac text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare entrada jsonb; dados jsonb; chave bytea; digest text; mac text; key_id text;
begin
  if p_entrada_canonica is null or p_dados_canonicos is null or p_entrada_usada is null or p_dados_usados is null
    or p_mac is null or p_mac !~ '^[A-Za-z0-9_-]{43}$'
    or octet_length(p_entrada_canonica) > 1048576 or octet_length(p_dados_canonicos) > 1048576 then return false; end if;
  begin
    entrada := p_entrada_canonica::jsonb;
    dados := p_dados_canonicos::jsonb;
  exception when invalid_text_representation then return false;
  end;
  if jsonb_typeof(entrada) is distinct from 'object' or jsonb_typeof(dados) is distinct from 'object'
    or entrada is distinct from p_entrada_usada or dados is distinct from p_dados_usados
    or dados ? 'mac' or jsonb_typeof(dados->'key_id') is distinct from 'string'
    or jsonb_typeof(dados->'digest_entrada') is distinct from 'string'
    or dados->>'digest_entrada' !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  key_id := dados->>'key_id';
  if key_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then return false; end if;
  begin
    chave := identidade.ler_chave_atestado_vault('ffcmapp.atestado.' || key_id);
  exception when others then
    raise exception using errcode = '55000', message = 'CHAVE_INDISPONIVEL';
  end;
  digest := translate(rtrim(encode(extensions.digest(convert_to(p_entrada_canonica,'UTF8'),'sha256'),'base64'),'='),'+/','-_');
  mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:' || p_dados_canonicos,'UTF8'),chave,'sha256'),'base64'),'='),'+/','-_');
  return digest = dados->>'digest_entrada' and mac = p_mac;
exception
  when sqlstate '55000' then raise exception using errcode = '55000', message = 'CHAVE_INDISPONIVEL';
  when others then raise exception using errcode = 'XX000', message = 'VERIFICACAO_INDISPONIVEL';
end $$;
revoke all on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) from public, anon, authenticated;
set role none;
revoke create on schema identidade from ffcmapp_atestado_verificador_owner;
revoke ffcmapp_atestado_verificador_owner from current_user;
