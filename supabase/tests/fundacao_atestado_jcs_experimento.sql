-- Somente banco temporário isolado. Não executar no Supabase.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'ffcm_atestado_teste_local'
     or inet_server_addr() is not null
     or current_setting('unix_socket_directories') not like '/tmp/ffcm-atestado.%' then
    raise exception 'Cluster local descartável obrigatório';
  end if;
end $$;
create schema experimento_atestado;
create schema extensions;
create extension pgcrypto with schema extensions;
\ir ../drafts/20261101100000_atestado_jcs_experimento.sql
do $$
declare
  entrada text := '{"a":1,"z":"x"}';
  dados text := '{"digest_entrada":"vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o","emitido_em":"2026-10-29T12:00:00Z","expira_em":"2026-10-29T12:01:00Z","key_id":"v1","operacao":"cadastro.criar_paciente","request_id":"10000000-0000-4000-8000-000000000003","session_id":"10000000-0000-4000-8000-000000000002","usuario_id":"10000000-0000-4000-8000-000000000001"}';
  mac text := 'zSHk3mxFrqSNPQIAMkFFTS5g5WciUqcECKrNGqdGPzs';
  chave bytea := decode(repeat('07', 32), 'hex');
  entrada_usada jsonb := '{"z":"x","a":1}';
  dados_usados jsonb := dados::jsonb;
begin
  if experimento_atestado.verificar(entrada, dados, entrada_usada, dados_usados, mac, chave) is distinct from true then
    raise exception 'vetor JavaScript recusado';
  end if;
  if experimento_atestado.verificar(entrada, dados, '{"z":"x","a":2}'::jsonb, dados_usados, mac, chave) is distinct from false
     or experimento_atestado.verificar('{"a":2,"z":"x"}', dados, '{"a":2,"z":"x"}'::jsonb, dados_usados, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, dados, entrada_usada, dados_usados || '{"key_id":"v2"}'::jsonb, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, replace(dados, 'v1', 'v2'), entrada_usada, replace(dados, 'v1', 'v2')::jsonb, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, dados, entrada_usada, dados_usados, mac, decode(repeat('08', 32), 'hex')) is distinct from false
     or experimento_atestado.verificar(entrada, dados, entrada_usada, dados_usados, repeat('A', 43), chave) is distinct from false
     or experimento_atestado.verificar(null, dados, entrada_usada, dados_usados, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, null, entrada_usada, dados_usados, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, dados, null, dados_usados, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, dados, entrada_usada, null, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, dados, entrada_usada, dados_usados, null, chave) is distinct from false
     or experimento_atestado.verificar(entrada, dados, entrada_usada, dados_usados, mac, null) is distinct from false
     or experimento_atestado.verificar('não JSON', dados, entrada_usada, dados_usados, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, 'não JSON', entrada_usada, dados_usados, mac, chave) is distinct from false
     or experimento_atestado.verificar(entrada, '{}', entrada_usada, '{}'::jsonb, mac, chave) is distinct from false then
    raise exception 'alteração ou entrada inválida aceita';
  end if;
  if has_function_privilege('public', 'experimento_atestado.verificar(text,text,jsonb,jsonb,text,bytea)', 'execute') then
    raise exception 'verificador público';
  end if;
end $$;
rollback;
