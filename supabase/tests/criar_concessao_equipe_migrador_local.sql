\set ON_ERROR_STOP on
-- Fixture de catálogo: migrador não é superuser nem usuário da conexão.
create role criar_equipe_migrador nologin nosuperuser createrole;
create role criar_equipe_conexao nologin nosuperuser noinherit;
create role ffcmapp_atestado_verificador_owner nologin;
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant criar_equipe_migrador to criar_equipe_conexao with inherit false, set true;
grant ffcmapp_atestado_verificador_owner to criar_equipe_migrador with admin true, inherit false, set false;
grant create on database ffcm_migrador_local to criar_equipe_migrador;
alter schema public owner to criar_equipe_migrador;
set session authorization criar_equipe_conexao;
set role criar_equipe_migrador;
create schema identidade; create schema operacao; create schema auditoria; create schema api; create schema auth_privado; create schema bloqueios_auth;
create function auth_privado.uid() returns uuid language sql as $$select null::uuid$$;
create function auth_privado.jwt() returns jsonb language sql as $$select null::jsonb$$;
create function auth_privado.identidades() returns setof jsonb language sql as $$select null::jsonb where false$$;
create function auth_privado.sessoes() returns setof jsonb language sql as $$select null::jsonb where false$$;
create function bloqueios_auth.travar(uuid,uuid) returns boolean language sql as $$select true$$;
create function operacao.criar_concessao_equipe_privado(jsonb) returns jsonb language sql as $$select $1$$;
create table identidade.configuracao_auth_nativo(dominio_workspace text,google_unico_oauth_confirmado boolean);
create table public.usuario(id uuid,perfil text,ativo boolean,versao integer);
create table identidade.concessao_equipe(id uuid,usuario_id uuid,perfil text,estado text,subject_google text,metodo text,criado_por_usuario_id uuid,email_cifrado jsonb,email_hmac text,versao integer,motivo_cifrado jsonb);
create table identidade.sessao(session_id uuid,usuario_id uuid,concessao_id uuid,metodo text,revogada_em timestamptz,encerrada_em timestamptz);
create table identidade.excecao_tecnica(usuario_id uuid,concessao_id uuid);
create table operacao.requisicao(ator_usuario_id uuid,operacao text);
create table auditoria.evento(id uuid,ator_usuario_id uuid,acao text,tipo_objeto text,objeto_id uuid,resultado text,request_id uuid);
-- Criar função sob proprietário distinto, concedendo temporariamente acesso ao schema.
grant usage,create on schema identidade to ffcmapp_atestado_verificador_owner;
reset session authorization;
grant ffcmapp_atestado_verificador_owner to criar_equipe_conexao with inherit false, set true;
set session authorization criar_equipe_conexao;
set role ffcmapp_atestado_verificador_owner;
create function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) returns boolean language sql as $$select true$$;
revoke all on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) from public;
set role criar_equipe_migrador;
\ir ../drafts/owner_criar_concessao_equipe_privado.sql
do $$ begin
 if current_user<>'criar_equipe_migrador' or session_user<>'criar_equipe_conexao' then raise exception 'MIGRADOR_NAO_RESTAURADO'; end if;
 if pg_has_role(current_user,'ffcmapp_criar_equipe_owner','SET') or pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET') then raise exception 'MEMBERSHIP_RESIDUAL: owner %, verificador %', pg_has_role(current_user,'ffcmapp_criar_equipe_owner','SET'), pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET'); end if;
 if not has_function_privilege('ffcmapp_criar_equipe_owner','identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)','EXECUTE') then raise exception 'VERIFICADOR_SEM_GRANT'; end if;
 if has_function_privilege('anon','api.criar_concessao_equipe_privado(jsonb)','EXECUTE') or has_function_privilege('authenticated','api.criar_concessao_equipe_privado(jsonb)','EXECUTE') or has_function_privilege('service_role','api.criar_concessao_equipe_privado(jsonb)','EXECUTE') then raise exception 'WRAPPER_EXPOSTO'; end if;
end $$;
