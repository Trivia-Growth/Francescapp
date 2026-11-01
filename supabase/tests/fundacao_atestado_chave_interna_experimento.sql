-- Cluster descartável local: função interna de chave é somente fixture fictícia.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'ffcm_atestado_teste_local'
     or inet_server_addr() is not null
     or current_setting('unix_socket_directories') not like '/tmp/ffcm-atestado.%' then
    raise exception 'Cluster local descartável obrigatório';
  end if;
end $$;
create role ffcm_teste_owner nologin nosuperuser nocreatedb nocreaterole noinherit;
create role ffcm_teste_runtime nologin nosuperuser nocreatedb nocreaterole noinherit;
create role ffcm_teste_anon nologin nosuperuser nocreatedb nocreaterole noinherit;
create schema experimento_atestado authorization ffcm_teste_owner;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to ffcm_teste_owner;
grant usage on schema experimento_atestado to ffcm_teste_runtime, ffcm_teste_anon;
set role ffcm_teste_owner;
create function experimento_atestado.ler_chave_interna(p_id text) returns bytea
language sql security invoker set search_path = pg_catalog
as $$ select case when p_id = 'v1' then decode(repeat('07', 32), 'hex') else null end $$;
revoke all on function experimento_atestado.ler_chave_interna(text) from public;
\ir ../drafts/20261101100000_atestado_jcs_experimento.sql
\ir ../drafts/20261101110000_atestado_chave_interna_experimento.sql
grant execute on function experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text) to ffcm_teste_runtime;
reset role;
do $$ begin
  if has_function_privilege('ffcm_teste_runtime', 'experimento_atestado.ler_chave_interna(text)', 'execute')
     or has_function_privilege('ffcm_teste_runtime', 'experimento_atestado.verificar(text,text,jsonb,jsonb,text,bytea)', 'execute')
     or has_function_privilege('ffcm_teste_anon', 'experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text)', 'execute')
     or has_function_privilege('public', 'experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text)', 'execute') then
    raise exception 'privilégio indevido';
  end if;
end $$;
set role ffcm_teste_runtime;
do $$ begin
  begin
    perform experimento_atestado.ler_chave_interna('v1');
    raise exception 'runtime leu chave diretamente';
  exception when insufficient_privilege then null; end;
end $$;
do $$
declare
  entrada text := '{"a":1,"z":"x"}';
  dados text := '{"digest_entrada":"vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o","emitido_em":"2026-10-29T12:00:00Z","expira_em":"2026-10-29T12:01:00Z","key_id":"v1","operacao":"cadastro.criar_paciente","request_id":"10000000-0000-4000-8000-000000000003","session_id":"10000000-0000-4000-8000-000000000002","usuario_id":"10000000-0000-4000-8000-000000000001"}';
  mac text := 'zSHk3mxFrqSNPQIAMkFFTS5g5WciUqcECKrNGqdGPzs';
begin
  if experimento_atestado.verificar_com_chave_interna(entrada, dados, entrada::jsonb, dados::jsonb, mac) is distinct from true then
    raise exception 'atestado válido recusado';
  end if;
  if experimento_atestado.verificar_com_chave_interna(entrada, dados, '{"a":2,"z":"x"}'::jsonb, dados::jsonb, mac) is distinct from false
     or experimento_atestado.verificar_com_chave_interna(entrada, dados, entrada::jsonb, dados::jsonb || '{"usuario_id":"outro"}'::jsonb, mac) is distinct from false
     or experimento_atestado.verificar_com_chave_interna(entrada, dados, entrada::jsonb, dados::jsonb, repeat('A', 43)) is distinct from false
     or experimento_atestado.verificar_com_chave_interna(entrada, 'não JSON', entrada::jsonb, '{}'::jsonb, mac) is distinct from false
     or experimento_atestado.verificar_com_chave_interna(entrada, null, entrada::jsonb, dados::jsonb, mac) is distinct from false then
    raise exception 'atestado inválido aceito';
  end if;
  begin
    perform experimento_atestado.verificar_com_chave_interna(entrada, replace(dados, 'v1', 'v2'), entrada::jsonb, replace(dados, 'v1', 'v2')::jsonb, mac);
    raise exception 'chave ausente não sinalizada';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'CHAVE_INDISPONIVEL' then raise; end if;
  end;
end $$;
reset role;
rollback;
