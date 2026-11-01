\set ON_ERROR_STOP on
-- Fixture PostgreSQL descartável: não representa gateway/JWT/Google reais.
do $$ begin
  if current_database() <> 'ffcm_auth_nativo_teste_local' or inet_server_addr() is not null then
    raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
  end if;
end $$;
create role postgres superuser nologin;
create role anon nologin;
create role authenticated nologin;
set role postgres;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
create table auth.identities (
  user_id uuid references auth.users, provider text, provider_id text, identity_data jsonb
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
grant usage on schema auth to authenticated;
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
\ir ../migrations/20261026143000_fundacao_grants_rls.sql
\ir ../migrations/20261026150000_fundacao_auditoria_idempotencia.sql
\ir ../migrations/20261028100000_sessao_identificador_invalido.sql
\ir ../migrations/20261105130000_auth_nativo_sessao.sql

insert into identidade.configuracao_auth_nativo (dominio_workspace, google_unico_oauth_confirmado)
values ('example.test', true);
insert into auth.users values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
insert into public.usuario (id, perfil) values
  ('10000000-0000-4000-8000-000000000001', 'administrador'),
  ('10000000-0000-4000-8000-000000000002', 'profissional');
insert into auth.identities select id, 'google', 'google-'||id,
  jsonb_build_object('sub', 'google-'||id, 'email_verified', true,
    'email', 'pessoa-ficticia@example.test', 'custom_claims', jsonb_build_object('hd', 'example.test'))
  from auth.users;
insert into auth.sessions select
  replace(id::text, '10000000-', '20000000-')::uuid, id, null from auth.users;
insert into identidade.concessao_equipe (
  id, email_cifrado, email_hmac, perfil, metodo, estado, usuario_id, subject_google,
  motivo_cifrado, criada_em, vinculada_em
) select
  replace(id::text, '10000000-', '30000000-')::uuid,
  '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'::jsonb,
  'hmac-ficticio-'||id, perfil, 'google_workspace', 'vinculada', id, 'google-'||id,
  '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'::jsonb,
  now()-interval '1 day', now()
  from public.usuario;

begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}';
do $$ declare resultado jsonb; begin
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'SESSAO_NAO_ADMITIDA_LIBERADA'; end if;
  resultado := api.admitir_sessao_nativa(gen_random_uuid());
  if resultado #>> '{usuario,perfil}' is distinct from 'administrador'
    or not (resultado->'capacidades' ? 'administrar_cadastro') then raise exception 'ADMIN_NEGADO'; end if;
  if api.admitir_sessao_nativa(gen_random_uuid()) is distinct from resultado then raise exception 'READMISSAO_DIVERGENTE'; end if;
  if api.consultar_sessao_nativa(gen_random_uuid()) is distinct from resultado then raise exception 'CONSULTA_DIVERGENTE'; end if;
  begin
    perform session_id from identidade.sessao;
    raise exception 'SESSOES_DIRETAS_LIBERADAS';
  exception when insufficient_privilege then null; end;
  begin
    perform provider_id from auth.identities;
    raise exception 'IDENTIDADES_DIRETAS_LIBERADAS';
  exception when insufficient_privilege then null; end;
  begin
    perform identidade.sessao_nativa(gen_random_uuid(), true);
    raise exception 'HELPER_DIRETO_LIBERADO';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','api.admitir_sessao_nativa(uuid)','EXECUTE')
    or pg_has_role('authenticated','ffcmapp_auth_nativo_owner','MEMBER') then raise exception 'PRIVILEGIOS_EXCESSIVOS'; end if;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}';
do $$ declare resultado jsonb; begin
  resultado := api.admitir_sessao_nativa(gen_random_uuid());
  if resultado #>> '{usuario,perfil}' is distinct from 'profissional'
    or resultado->'capacidades' ? 'administrar_cadastro' then raise exception 'PERFIL_AMPLIADO'; end if;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}';
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'SEM_CONCESSAO_LIBERADO'; end if;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"password"}],"user_metadata":{"hd":"example.test","perfil":"administrador"}}';
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'SENHA_COM_GOOGLE_LIGADO_LIBERADA'; end if;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"invalido","amr":[{"method":"oauth"}]}';
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'SESSAO_MALFORMADA_LIBERADA'; end if;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}';
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'SESSAO_ALHEIA_LIBERADA'; end if;
end $$;
set local role postgres;
update auth.identities set identity_data = jsonb_set(identity_data,'{custom_claims,hd}','"outro.test"')
where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}';
do $$ begin
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'WORKSPACE_ERRADO_LIBERADO'; end if;
end $$;
set local role postgres;
update auth.identities set identity_data = jsonb_set(identity_data,'{custom_claims,hd}','"example.test"')
where user_id='10000000-0000-4000-8000-000000000001';
update identidade.sessao set revogada_em=clock_timestamp(),
  revogada_por_usuario_id=usuario_id,
  motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'
where usuario_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null
    or api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'SESSAO_REVOGADA_REABERTA'; end if;
end $$;
set local role postgres;
update public.usuario set ativo=false where id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}';
do $$ begin
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'INATIVO_LIBERADO'; end if;
end $$;
set local role postgres;
update public.usuario set ativo=true where id='10000000-0000-4000-8000-000000000002';
update identidade.concessao_equipe set perfil='administrador'
  where usuario_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'PERFIL_DIVERGENTE_LIBERADO'; end if;
end $$;
set local role postgres;
update identidade.concessao_equipe set perfil='profissional'
  where usuario_id='10000000-0000-4000-8000-000000000002';
delete from auth.sessions where user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'AUTH_REMOVIDO_LIBERADO'; end if;
end $$;
set local role postgres;
do $$ begin
  if identidade.sessao_atual_valida() then raise exception 'HELPER_CADASTRO_ACEITOU_AUTH_REMOVIDO'; end if;
end $$;
insert into auth.sessions values (
  '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', null
);
update identidade.concessao_equipe set estado='revogada', revogada_em=clock_timestamp(),
  revogada_por_usuario_id='10000000-0000-4000-8000-000000000001',
  motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'
where usuario_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null
    or api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'CONCESSAO_REVOGADA_LIBERADA'; end if;
end $$;
set local role postgres;
-- Falha da evidência deve reverter uma admissão nova, não só bloquear a resposta.
insert into auth.sessions values (
  '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', null
);
create function auditoria.suprimir_fixture() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger suprimir_fixture before insert on auditoria.evento for each row execute function auditoria.suprimir_fixture();
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000004","amr":[{"method":"oauth"}]}';
do $$ begin
  begin
    perform api.admitir_sessao_nativa(gen_random_uuid());
    raise exception 'AUDITORIA_SUPRIMIDA_ACEITA';
  exception when sqlstate '55000' then
    if sqlerrm <> 'AUDITORIA_AUTH_INDISPONIVEL' then raise; end if;
  end;
end $$;
set local role postgres;
do $$ begin
  if exists(select 1 from identidade.sessao where session_id='20000000-0000-4000-8000-000000000004')
    then raise exception 'ADMISSAO_PARCIAL_PERSISTIU'; end if;
end $$;
drop trigger suprimir_fixture on auditoria.evento;
do $$ begin
  if not exists(select 1 from auditoria.evento where operador_restrito='sistema.auth_nativo' and resultado='negado')
    or not exists(select 1 from auditoria.evento where resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
end $$;
rollback;
