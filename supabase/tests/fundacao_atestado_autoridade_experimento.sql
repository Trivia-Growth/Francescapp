-- Somente cluster local descartável. Os claims e a chave são fixtures fictícias.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'ffcm_atestado_teste_local' or inet_server_addr() is not null
     or current_setting('unix_socket_directories') not like '/tmp/ffcm-atestado.%' then
    raise exception 'Cluster local descartável obrigatório';
  end if;
end $$;
create role ffcm_teste_owner nologin nosuperuser nocreatedb nocreaterole noinherit;
create role ffcm_teste_runtime nologin nosuperuser nocreatedb nocreaterole noinherit;
create schema experimento_atestado authorization ffcm_teste_owner;
create schema auth;
create schema identidade;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions, auth, identidade to ffcm_teste_owner;
grant usage on schema extensions to ffcm_teste_runtime;
grant usage on schema experimento_atestado to ffcm_teste_runtime;
-- GUC apenas simula gateway; nunca é fonte confiável em conexão SQL direta.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('ffcm_teste.usuario', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('session_id', current_setting('ffcm_teste.sessao', true))
$$;
create function identidade.sessao_atual_valida() returns boolean language sql stable as $$
  select current_setting('ffcm_teste.sessao_ativa', true) = 'sim'
$$;
set role ffcm_teste_owner;
create function experimento_atestado.ler_chave_interna(p_id text) returns bytea language plpgsql as $$
begin
  if current_setting('ffcm_teste.atrasar_chave', true) = 'sim' then
    perform set_config('ffcm_teste.inicio_chave', clock_timestamp()::text, true);
    perform pg_sleep(2);
    perform set_config('ffcm_teste.fim_chave', clock_timestamp()::text, true);
  end if;
  return case when p_id = 'v1' then decode(repeat('07', 32), 'hex') else null end;
end
$$;
revoke all on function experimento_atestado.ler_chave_interna(text) from public;
-- Valor apenas para prova, não configura duração em produção.
create function experimento_atestado.prazo_maximo_teste() returns interval language sql as $$ select interval '60 seconds' $$;
revoke all on function experimento_atestado.prazo_maximo_teste() from public;
\ir ../drafts/20261101100000_atestado_jcs_experimento.sql
\ir ../drafts/20261101110000_atestado_chave_interna_experimento.sql
\ir ../drafts/20261101120000_atestado_autoridade_experimento.sql
grant execute on function experimento_atestado.verificar_criar_paciente(text,text,jsonb,jsonb,text) to ffcm_teste_runtime;
reset role;
set role ffcm_teste_runtime;
do $$
declare
  entrada text := '{"a":1,"z":"x"}';
  dados jsonb := jsonb_build_object('key_id', 'v1', 'usuario_id', '10000000-0000-4000-8000-000000000001',
    'session_id', '10000000-0000-4000-8000-000000000002', 'request_id', '10000000-0000-4000-8000-000000000003',
    'operacao', 'api.criar_paciente', 'emitido_em', clock_timestamp() - interval '1 second',
    'expira_em', clock_timestamp() + interval '30 seconds', 'digest_entrada', 'vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o');
  texto text := dados::text;
  mac text;
  alterados jsonb;
begin
  perform set_config('ffcm_teste.usuario', '10000000-0000-4000-8000-000000000001', true);
  perform set_config('ffcm_teste.sessao', '10000000-0000-4000-8000-000000000002', true);
  perform set_config('ffcm_teste.sessao_ativa', 'sim', true);
  -- Vetor assinado fora da interface real: chave e função abaixo são apenas fixtures.
  mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:' || texto, 'UTF8'), decode(repeat('07', 32), 'hex'), 'sha256'), 'base64'), '='), '+/', '-_');
  if experimento_atestado.verificar_criar_paciente(entrada, texto, entrada::jsonb, dados, mac) is distinct from true then raise exception 'válido recusado'; end if;
  perform set_config('ffcm_teste.usuario', '10000000-0000-4000-8000-000000000004', true);
  if experimento_atestado.verificar_criar_paciente(entrada, texto, entrada::jsonb, dados, mac) is distinct from false then raise exception 'outro usuário aceito'; end if;
  perform set_config('ffcm_teste.usuario', '10000000-0000-4000-8000-000000000001', true);
  perform set_config('ffcm_teste.sessao', '10000000-0000-4000-8000-000000000004', true);
  if experimento_atestado.verificar_criar_paciente(entrada, texto, entrada::jsonb, dados, mac) is distinct from false then raise exception 'outra sessão aceita'; end if;
  perform set_config('ffcm_teste.sessao', '10000000-0000-4000-8000-000000000002', true);
  perform set_config('ffcm_teste.sessao_ativa', 'não', true);
  if experimento_atestado.verificar_criar_paciente(entrada, texto, entrada::jsonb, dados, mac) is distinct from false then raise exception 'sessão revogada aceita'; end if;
  perform set_config('ffcm_teste.sessao_ativa', 'sim', true);
  for alterados in select valor from (values
    (dados || jsonb_build_object('operacao', 'cadastro.outra')),
    (dados || jsonb_build_object('emitido_em', clock_timestamp() + interval '1 minute', 'expira_em', clock_timestamp() + interval '2 minutes')),
    (dados || jsonb_build_object('emitido_em', clock_timestamp() - interval '2 minutes', 'expira_em', clock_timestamp() - interval '1 minute')),
    (dados || jsonb_build_object('emitido_em', clock_timestamp() - interval '2 minutes', 'expira_em', clock_timestamp() + interval '2 minutes')),
    (dados - 'expira_em')
  ) as casos(valor) loop
    texto := alterados::text;
    mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:' || texto, 'UTF8'), decode(repeat('07', 32), 'hex'), 'sha256'), 'base64'), '='), '+/', '-_');
    if experimento_atestado.verificar_criar_paciente(entrada, texto, entrada::jsonb, alterados, mac) is distinct from false then
      raise exception 'operação ou prazo inválido aceito';
    end if;
  end loop;
  alterados := dados || jsonb_build_object('emitido_em', clock_timestamp() - interval '1 second', 'expira_em', clock_timestamp() + interval '1 second');
  texto := alterados::text;
  mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:' || texto, 'UTF8'), decode(repeat('07', 32), 'hex'), 'sha256'), 'base64'), '='), '+/', '-_');
  perform set_config('ffcm_teste.atrasar_chave', 'sim', true);
  if (alterados ->> 'expira_em')::timestamptz <= clock_timestamp() then raise exception 'teste não iniciou antes da expiração'; end if;
  if experimento_atestado.verificar_criar_paciente(entrada, texto, entrada::jsonb, alterados, mac) is distinct from false then
    raise exception 'aceitou atestado expirado durante leitura da chave';
  end if;
  if nullif(current_setting('ffcm_teste.inicio_chave', true), '') is null
     or nullif(current_setting('ffcm_teste.fim_chave', true), '') is null
     or current_setting('ffcm_teste.inicio_chave', true)::timestamptz >= (alterados ->> 'expira_em')::timestamptz
     or current_setting('ffcm_teste.fim_chave', true)::timestamptz < (alterados ->> 'expira_em')::timestamptz then
    raise exception 'não comprovou expiração durante leitura da chave';
  end if;
end $$;
reset role;
rollback;
