\set ON_ERROR_STOP on
-- Executar em banco PostgreSQL 17 descartável, conectado como superusuário.
-- Tudo é revertido; as funções auxiliares são fixtures sem dados reais.
reset role;
do $$ begin
  if current_user <> 'papel_padrao_fixture' or current_user = session_user then
    raise exception 'Papel padrão da conexão não foi configurado';
  end if;
end $$;
set role none;
do $$ begin
  if current_user <> session_user then
    raise exception 'SET ROLE NONE não restaurou o executor';
  end if;
end $$;
begin;
do $$ begin
  if current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'Este teste requer PostgreSQL 17';
  end if;
end $$;
create role migrador_owners_fixture nologin nosuperuser createrole;
create role conexao_migrador_fixture login nosuperuser nocreaterole noinherit;
grant migrador_owners_fixture to conexao_migrador_fixture with inherit false, set true;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant create on database postgres to migrador_owners_fixture;
alter schema public owner to migrador_owners_fixture;
set session authorization conexao_migrador_fixture;
set role migrador_owners_fixture;
create schema identidade;
create schema vault;
create schema extensions;
create schema auth;
create schema auth_privado;
create function auth_privado.uid() returns uuid language sql as $$ select null::uuid $$;
create schema cadastro;
create schema auditoria;
create schema operacao;
create schema api;
create table vault.decrypted_secrets(name text, decrypted_secret text);
create function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) returns bytea language sql as $$ select null::bytea $$;
create function extensions.digest(bytea,text) returns bytea language sql as $$ select null::bytea $$;
create function extensions.hmac(bytea,bytea,text) returns bytea language sql as $$ select null::bytea $$;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table identidade.configuracao_auth_nativo(dominio_workspace text, google_unico_oauth_confirmado boolean);
create table public.usuario(id uuid, perfil text, ativo boolean, versao integer);
create table identidade.concessao_equipe(id uuid, usuario_id uuid, perfil text, estado text, subject_google text, metodo text, versao integer);
create table identidade.sessao(session_id uuid, usuario_id uuid, concessao_id uuid, metodo text, revogada_em timestamptz, encerrada_em timestamptz);
create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
create table auth.identities(user_id uuid, provider text, provider_id text, identity_data jsonb);
create table cadastro.paciente(id uuid, criado_em timestamptz, nome_cifrado text, nome_preferencia_cifrado text, data_nascimento_cifrada text, criado_por_usuario_id uuid, versao integer);
create table cadastro.acesso_paciente(id uuid, paciente_id uuid, usuario_id uuid, revogada_em timestamptz);
create table cadastro.contato_paciente(id uuid, paciente_id uuid, tipo text, valor_cifrado text, versao integer, criado_em timestamptz);
create table auditoria.evento(id uuid, ator_usuario_id uuid, acao text, tipo_objeto text, objeto_id uuid, resultado text, request_id uuid);
create table operacao.barreira_cadastro(ator_usuario_id uuid);
create table operacao.reserva_cadastro(ator_usuario_id uuid);
create table operacao.recibo_barreira_cadastro(ator_usuario_id uuid);
create table operacao.requisicao(ator_usuario_id uuid);
create function operacao.criar_paciente_privado(jsonb) returns jsonb language sql as $$ select null::jsonb $$;
create function operacao.cadastro_composicao_privada(jsonb) returns jsonb language sql as $$ select null::jsonb $$;
create function operacao.reservar_cadastro_privado(uuid,bigint,uuid) returns jsonb language sql as $$ select null::jsonb $$;
create function operacao.encerrar_cadastro_privado(uuid,bigint,uuid,uuid) returns jsonb language sql as $$ select null::jsonb $$;
create function operacao.consultar_barreira_cadastro_privado(uuid) returns jsonb language sql as $$ select null::jsonb $$;
create function operacao.reconhecer_barreira_cadastro_privado(uuid,uuid) returns jsonb language sql as $$ select null::jsonb $$;

\ir ../migrations/20261104120000_vault_atestado.sql
do $$ begin if current_user <> 'migrador_owners_fixture' or session_user <> 'conexao_migrador_fixture' then raise exception 'Executor não restaurado'; end if; end $$;
\ir ../migrations/20261106100000_carteira_nativa.sql
do $$ begin if current_user <> 'migrador_owners_fixture' or session_user <> 'conexao_migrador_fixture' then raise exception 'Executor não restaurado'; end if; end $$;
\ir ../migrations/20261106130000_carteira_nativa.sql
do $$ begin if current_user <> 'migrador_owners_fixture' or session_user <> 'conexao_migrador_fixture' then raise exception 'Executor não restaurado'; end if; end $$;
\ir ../migrations/20261106190000_wrappers_privados.sql
do $$ begin if current_user <> 'migrador_owners_fixture' or session_user <> 'conexao_migrador_fixture' then raise exception 'Executor não restaurado'; end if; end $$;

do $$
declare dono text;
begin
  foreach dono in array array['ffcmapp_atestado_vault_owner','ffcmapp_atestado_verificador_owner',
    'ffcmapp_carteira_owner','ffcmapp_api_cadastro_owner','ffcmapp_api_carteira_owner'] loop
    if (select count(*) from pg_auth_members
        where roleid = dono::regrole and member = current_user::regrole
          and admin_option and not inherit_option and not set_option) <> 1
      or (select count(*) from pg_auth_members where roleid = dono::regrole) <> 1 then
      raise exception 'Concessão temporária restante ou grant automático alterado para %', dono;
    end if;
    begin
      execute format('set role %I', dono);
      raise exception 'SET ROLE permaneceu disponível para %', dono;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  if not has_function_privilege('ffcmapp_atestado_verificador_owner', 'identidade.ler_chave_atestado_vault(text)', 'execute')
    or not has_function_privilege('ffcmapp_carteira_owner', 'identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)', 'execute')
    or not has_function_privilege('ffcmapp_api_carteira_owner', 'identidade.listar_carteira_privada(jsonb)', 'execute')
    or not has_function_privilege('ffcmapp_api_cadastro_owner', 'identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)', 'execute')
    or has_function_privilege('public', 'identidade.listar_carteira_privada(jsonb)', 'execute') then
    raise exception 'Privilégios de execução incorretos';
  end if;
end $$;
reset session authorization;
rollback;
