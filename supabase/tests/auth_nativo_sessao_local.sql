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
create schema extensions;
create extension pgcrypto with schema extensions;
-- Somente a superfície da view Vault é fictícia; HMAC usa pgcrypto real.
create schema vault;
create table vault.segredos_fixture (name text primary key, decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.segredos_fixture;
create function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)
  returns bytea language sql as $$ select $1; $$;
insert into vault.segredos_fixture values ('ffcmapp.hmac.email.v1', encode(decode(repeat('ab',32),'hex'),'base64'));
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users, provider text, provider_id text, identity_data jsonb
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
\ir ../migrations/20261106180000_bloqueios_auth.sql
grant usage on schema bloqueios_auth to ffcmapp_auth_nativo_owner;
grant execute on function bloqueios_auth.travar(uuid,uuid) to ffcmapp_auth_nativo_owner;

insert into identidade.configuracao_auth_nativo (dominio_workspace, google_unico_oauth_confirmado)
values ('example.test', true);
insert into auth.users values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
insert into public.usuario (id, perfil) values
  ('10000000-0000-4000-8000-000000000001', 'administrador'),
  ('10000000-0000-4000-8000-000000000002', 'profissional');
insert into auth.identities (user_id,provider,provider_id,identity_data) select id, 'google', 'google-'||id,
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
set local role postgres;
-- A primeira entrada recebe somente o perfil da pré-concessão administrativa.
insert into identidade.concessao_equipe (
  id, email_cifrado, email_hmac, perfil, metodo, estado, motivo_cifrado
) values (
  '30000000-0000-4000-8000-000000000003',
  '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}',
  rtrim(translate(encode(extensions.hmac(convert_to(
    'ffcmapp:hmac:v1:email-concessao:pessoa-ficticia@example.test','UTF8'
  ),decode(repeat('ab',32),'hex'),'sha256'),'base64'),'+/','-_'),'='),
  'profissional', 'google_workspace', 'pendente',
  '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'
);
set local role authenticated;
do $$ declare resultado jsonb; begin
  -- Consulta não pode vincular uma concessão pendente.
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'CONSULTA_VINCULOU_CONCESSAO'; end if;
  resultado := api.admitir_sessao_nativa(gen_random_uuid());
  if resultado #>> '{usuario,perfil}' is distinct from 'profissional'
    or resultado->'capacidades' ? 'administrar_cadastro' then raise exception 'PRECONCESSAO_NAO_VINCULADA'; end if;
  if api.admitir_sessao_nativa(gen_random_uuid()) is distinct from resultado then raise exception 'PRIMEIRA_ENTRADA_NAO_IDEMPOTENTE'; end if;
  begin
    perform identidade.email_google_hmac_nativo();
    raise exception 'ORACULO_HMAC_PUBLICO';
  exception when insufficient_privilege then null; end;
  begin
    perform decrypted_secret from vault.decrypted_secrets;
    raise exception 'CHAVE_HMAC_PUBLICA';
  exception when insufficient_privilege then null; end;
end $$;
set local role postgres;
do $$ begin
  if not exists(select 1 from identidade.concessao_equipe
    where id='30000000-0000-4000-8000-000000000003'
      and usuario_id='10000000-0000-4000-8000-000000000003'
      and estado='vinculada' and versao=2
      and subject_google='google-10000000-0000-4000-8000-000000000003')
    then raise exception 'VINCULO_DIVERGENTE'; end if;
  if not exists(select 1 from auditoria.evento where acao='vincular_concessao_equipe'
    and objeto_id='30000000-0000-4000-8000-000000000003') then raise exception 'VINCULO_SEM_AUDITORIA'; end if;
end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000004');
insert into auth.identities (user_id,provider,provider_id,identity_data) values (
  '10000000-0000-4000-8000-000000000004', 'google', 'google-outra-conta',
  '{"sub":"google-outra-conta","email":"pessoa-ficticia@example.test","email_verified":true,"custom_claims":{"hd":"example.test"}}'
);
insert into auth.sessions values (
  '20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004',null
);
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000004","session_id":"20000000-0000-4000-8000-000000000005","amr":[{"method":"oauth"}]}';
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'EMAIL_TRANSFERIU_CONTA_VINCULADA'; end if;
end $$;
set local role postgres;
-- Mais de uma identidade Google não pode escolher arbitrariamente a Workspace.
insert into auth.identities (user_id,provider,provider_id,identity_data) values (
  '10000000-0000-4000-8000-000000000003', 'google', 'google-segunda-conta',
  '{"sub":"google-segunda-conta","email":"pessoal-ficticia@example.test","email_verified":true}'
);
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}';
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'IDENTIDADE_GOOGLE_AMBIGUA_ACEITA'; end if;
end $$;
set local role postgres;
delete from auth.identities where provider_id='google-segunda-conta';
-- Depois da desvinculação, a próxima operação deve ser negada.
savepoint antes_desvinculacao;
delete from auth.identities where user_id='10000000-0000-4000-8000-000000000003' and provider='google';
set local role authenticated;
do $$ begin
  if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'IDENTIDADE_DESVINCULADA_ACEITA'; end if;
end $$;
rollback to savepoint antes_desvinculacao;
set local role authenticated;
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
insert into auth.users values ('10000000-0000-4000-8000-000000000006');
insert into auth.identities (user_id,provider,provider_id,identity_data) values (
  '10000000-0000-4000-8000-000000000006', 'google', 'google-primeira-entrada',
  '{"sub":"google-primeira-entrada","email":"nova-ficticia@example.test","email_verified":true,"custom_claims":{"hd":"example.test"}}'
);
insert into auth.sessions values (
  '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',null
);
insert into identidade.concessao_equipe (
  id, email_cifrado, email_hmac, perfil, metodo, estado, motivo_cifrado
) values (
  '30000000-0000-4000-8000-000000000006',
  '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}',
  rtrim(translate(encode(extensions.hmac(convert_to(
    'ffcmapp:hmac:v1:email-concessao:nova-ficticia@example.test','UTF8'
  ),decode(repeat('ab',32),'hex'),'sha256'),'base64'),'+/','-_'),'='),
  'profissional', 'google_workspace', 'pendente',
  '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'
);
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
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000006","session_id":"20000000-0000-4000-8000-000000000006","amr":[{"method":"oauth"}]}';
do $$ begin
  begin
    perform api.admitir_sessao_nativa(gen_random_uuid());
    raise exception 'VINCULO_SEM_AUDITORIA_ACEITO';
  exception when sqlstate '55000' then
    if sqlerrm <> 'AUDITORIA_AUTH_INDISPONIVEL' then raise; end if;
  end;
end $$;
set local role postgres;
do $$ begin
  if exists(select 1 from identidade.sessao where session_id='20000000-0000-4000-8000-000000000004')
    then raise exception 'ADMISSAO_PARCIAL_PERSISTIU'; end if;
  if exists(select 1 from public.usuario where id='10000000-0000-4000-8000-000000000006')
    or exists(select 1 from identidade.sessao where session_id='20000000-0000-4000-8000-000000000006')
    or not exists(select 1 from identidade.concessao_equipe
      where id='30000000-0000-4000-8000-000000000006' and estado='pendente' and usuario_id is null and versao=1)
    then raise exception 'VINCULO_PARCIAL_PERSISTIU'; end if;
end $$;
drop trigger suprimir_fixture on auditoria.evento;
-- Saída permanece possível mesmo com concessão revogada e não aceita alvo de outro login.
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}';
create trigger suprimir_fixture before insert on auditoria.evento for each row execute function auditoria.suprimir_fixture();
set local role authenticated;
do $$ begin
  begin
    perform api.encerrar_sessao_nativa('20000000-0000-4000-8000-000000000002', gen_random_uuid());
    raise exception 'SAIDA_SEM_AUDITORIA_ACEITA';
  exception when sqlstate '55000' then
    if sqlerrm <> 'AUDITORIA_AUTH_INDISPONIVEL' then raise; end if;
  end;
end $$;
set local role postgres;
do $$ begin
  if exists(select 1 from identidade.sessao where session_id='20000000-0000-4000-8000-000000000002' and encerrada_em is not null) then raise exception 'SAIDA_PARCIAL_PERSISTIU'; end if;
end $$;
drop trigger suprimir_fixture on auditoria.evento;
set local role authenticated;
do $$ begin
  if api.encerrar_sessao_nativa('20000000-0000-4000-8000-000000000001', gen_random_uuid()) then raise exception 'OUTRA_SESSAO_ENCERRADA'; end if;
  if not api.encerrar_sessao_nativa('20000000-0000-4000-8000-000000000002', gen_random_uuid()) then raise exception 'SAIDA_NEGADA'; end if;
  if not api.encerrar_sessao_nativa('20000000-0000-4000-8000-000000000002', gen_random_uuid()) then raise exception 'SAIDA_NAO_IDEMPOTENTE'; end if;
end $$;
set local role postgres;
do $$ begin
  if identidade.sessao_atual_valida() then raise exception 'SESSAO_ENCERRADA_LIBERADA'; end if;
  if not exists(select 1 from identidade.sessao where session_id='20000000-0000-4000-8000-000000000002' and encerrada_em is not null) then raise exception 'TOMBSTONE_AUSENTE'; end if;
end $$;
update identidade.concessao_equipe set estado='revogada', revogada_em=clock_timestamp(),
  revogada_por_usuario_id='10000000-0000-4000-8000-000000000001',
  motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'
where id='30000000-0000-4000-8000-000000000006';
set local role authenticated;
do $$ begin
  if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'PRECONCESSAO_REVOGADA_LIBERADA'; end if;
end $$;
set local role postgres;
-- Nova concessão pendente (não reabrir a revogada) exige a chave de comparação.
insert into identidade.concessao_equipe (
  id, email_cifrado, email_hmac, perfil, metodo, estado, motivo_cifrado
) select '30000000-0000-4000-8000-000000000007', email_cifrado, email_hmac,
    perfil, metodo, 'pendente', motivo_cifrado from identidade.concessao_equipe
  where id='30000000-0000-4000-8000-000000000006';
update vault.segredos_fixture set decrypted_secret=null;
set local role authenticated;
do $$ begin
  begin
    perform api.admitir_sessao_nativa(gen_random_uuid());
    raise exception 'CHAVE_AUSENTE_ACEITA';
  exception when sqlstate '55000' then
    if sqlerrm <> 'CONFIGURACAO_HMAC_EMAIL_INDISPONIVEL' then raise; end if;
  end;
end $$;
set local role postgres;
do $$ begin
  if not exists(select 1 from auditoria.evento where operador_restrito='sistema.auth_nativo' and resultado='negado')
    or not exists(select 1 from auditoria.evento where resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
end $$;
rollback;
-- Sessão expira enquanto operação aguarda concessão; o helper é o real.
create extension dblink;
set request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}';
select api.admitir_sessao_nativa(gen_random_uuid());
select dblink_connect('concorrente',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),session_user));
select dblink_exec('concorrente','set role authenticated');
select dblink_exec('concorrente', $$set request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}'$$);
select pid as backend_concorrente from dblink('concorrente','select pg_backend_pid()') as x(pid integer) \gset
create function pg_temp.esperar_auth(p_pid integer) returns void language plpgsql as $$
declare limite timestamptz:=clock_timestamp()+interval '5 seconds';
begin loop
 perform pg_stat_clear_snapshot();
 exit when exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid)));
 if clock_timestamp()>limite then raise exception 'BLOQUEIO_AUTH_NAO_OBSERVADO'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id='20000000-0000-4000-8000-000000000001';
begin;
select 1 from identidade.concessao_equipe where id='30000000-0000-4000-8000-000000000001' for update;
select dblink_send_query('concorrente', $$select api.consultar_sessao_nativa('70000000-0000-4000-8000-000000000001')$$);
select pg_temp.esperar_auth(:backend_concorrente);
select pg_sleep(2.1);
commit;
do $$ declare r jsonb; begin
 select x into r from dblink_get_result('concorrente') as t(x jsonb);
 if r is not null or not exists(select 1 from auditoria.evento where request_id='70000000-0000-4000-8000-000000000001' and resultado='negado') then raise exception 'CONSULTA_EXPIRADA_ACEITA'; end if;
end $$;
select * from dblink_get_result('concorrente') as x(resultado jsonb);
update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id='20000000-0000-4000-8000-000000000001';
begin;
select 1 from identidade.concessao_equipe where id='30000000-0000-4000-8000-000000000001' for update;
select dblink_send_query('concorrente', $$select api.admitir_sessao_nativa('70000000-0000-4000-8000-000000000002')$$);
select pg_temp.esperar_auth(:backend_concorrente);
select pg_sleep(2.1);
commit;
do $$ declare r jsonb; begin
 select x into r from dblink_get_result('concorrente') as t(x jsonb);
 if r is not null or not exists(select 1 from auditoria.evento where request_id='70000000-0000-4000-8000-000000000002' and resultado='negado') then raise exception 'ADMISSAO_EXPIRADA_ACEITA'; end if;
end $$;
select dblink_disconnect('concorrente');
-- A espera ocorre depois da inserção da sessão e dos outros efeitos de admissão.
insert into identidade.concessao_equipe (id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado)
values ('30000000-0000-4000-8000-000000000003',
 '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}',
 rtrim(translate(encode(extensions.hmac(convert_to('ffcmapp:hmac:v1:email-concessao:pessoa-ficticia@example.test','UTF8'),decode(repeat('ab',32),'hex'),'sha256'),'base64'),'+/','-_'),'='),
 'profissional','google_workspace','pendente',
 '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}');
create function public.esperar_apos_sessao_fixture() returns trigger language plpgsql as $$
begin
 if new.session_id='20000000-0000-4000-8000-000000000003' then perform pg_advisory_xact_lock(193002); end if;
 return new;
end $$;
create trigger esperar_apos_sessao after insert on identidade.sessao for each row execute function public.esperar_apos_sessao_fixture();
select dblink_connect('admissao',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),session_user));
select dblink_exec('admissao','set role authenticated');
select dblink_exec('admissao', $$set request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}'$$);
select pid as backend_admissao from dblink('admissao','select pg_backend_pid()') as x(pid integer) \gset
update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id='20000000-0000-4000-8000-000000000003';
begin;
select pg_advisory_xact_lock(193002);
select dblink_send_query('admissao', $$select api.admitir_sessao_nativa('70000000-0000-4000-8000-000000000003')$$);
select pg_temp.esperar_auth(:backend_admissao);
select pg_sleep(2.1);
commit;
do $$
declare negada boolean:=false; r jsonb;
begin
 begin select x into r from dblink_get_result('admissao') as t(x jsonb);
 exception when insufficient_privilege then
  if sqlerrm <> 'SEM_PERMISSAO' then raise; end if;
  negada:=true;
 end;
 if not negada or exists(select 1 from public.usuario where id='10000000-0000-4000-8000-000000000003')
  or exists(select 1 from identidade.sessao where session_id='20000000-0000-4000-8000-000000000003')
  or not exists(select 1 from identidade.concessao_equipe where id='30000000-0000-4000-8000-000000000003' and estado='pendente' and usuario_id is null)
  or exists(select 1 from auditoria.evento where request_id='70000000-0000-4000-8000-000000000003' and resultado='permitido') then
  raise exception 'ROLLBACK_ADMISSAO_EXPIRADA_INCOMPLETO';
 end if;
end $$;
select dblink_disconnect('admissao');

-- Troca concorrente após captura: subject antigo nunca pode vincular concessão do novo email.
insert into identidade.concessao_equipe (id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado)
values ('30000000-0000-4000-8000-000000000008',
 '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}',
 rtrim(translate(encode(extensions.hmac(convert_to('ffcmapp:hmac:v1:email-concessao:outra-ficticia@example.test','UTF8'),decode(repeat('ab',32),'hex'),'sha256'),'base64'),'+/','-_'),'='),
 'profissional','google_workspace','pendente',
 '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}');
update auth.sessions set not_after=null where id='20000000-0000-4000-8000-000000000003';
select dblink_connect('identidade_troca',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),session_user));
select dblink_exec('identidade_troca','set role authenticated');
select dblink_exec('identidade_troca', $$set request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}'$$);
select pid as backend_troca from dblink('identidade_troca','select pg_backend_pid()') as x(pid integer) \gset
begin;
select 1 from identidade.concessao_equipe where id='30000000-0000-4000-8000-000000000003' for update;
select dblink_send_query('identidade_troca', $$select api.admitir_sessao_nativa('70000000-0000-4000-8000-000000000008')$$);
select pg_temp.esperar_auth(:backend_troca);
update auth.identities set provider_id='google-trocado',
 identity_data=jsonb_set(jsonb_set(identity_data,'{sub}','"google-trocado"'),'{email}','"outra-ficticia@example.test"')
 where user_id='10000000-0000-4000-8000-000000000003' and provider='google';
commit;
do $$ declare r jsonb; begin
 begin
  select x into r from dblink_get_result('identidade_troca') as t(x jsonb);
 exception when sqlstate '55000' then
  if sqlerrm <> 'ADMISSAO_AUTH_INCONSISTENTE' then raise; end if;
 end;
 if exists(select 1 from identidade.concessao_equipe where id='30000000-0000-4000-8000-000000000008' and (subject_google is not null or usuario_id is not null or estado <> 'pendente'))
 or exists(select 1 from identidade.concessao_equipe where id='30000000-0000-4000-8000-000000000003' and subject_google='google-trocado') then
  raise exception 'IDENTIDADE_VINCULADA_A_EMAIL_DIVERGENTE';
 end if;
 if r is not null and not exists(select 1 from identidade.concessao_equipe where id='30000000-0000-4000-8000-000000000003' and subject_google='google-10000000-0000-4000-8000-000000000003' and estado='vinculada') then
  raise exception 'ADMISSAO_SEM_IDENTIDADE_CAPTURADA';
 end if;
end $$;
select dblink_disconnect('identidade_troca');
