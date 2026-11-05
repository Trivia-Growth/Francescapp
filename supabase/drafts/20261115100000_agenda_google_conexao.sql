-- PREPARAÇÃO LOCAL: sem grants a runtime. Antes de promover, comprovar gateway JWT,
-- privilégios Vault, canal sem logs de parâmetros e concorrência/revogação reais.
select set_config('ffcmapp.migrador_agenda', current_user, false);
create role ffcmapp_agenda_google_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_agenda_google_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_agenda_google_owner to current_user with inherit false, set true;
grant usage, create on schema identidade to ffcmapp_agenda_google_owner;
grant usage on schema identidade to ffcmapp_agenda_google_executor;
grant usage on schema auth_privado, vault, extensions to ffcmapp_agenda_google_owner;
grant execute on function extensions.digest(bytea,text) to ffcmapp_agenda_google_owner;
grant ffcmapp_atestado_verificador_owner to current_user with inherit false, set true;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_agenda_google_owner;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_agenda'),false);
revoke ffcmapp_atestado_verificador_owner from current_user;
grant execute on function auth_privado.sessoes(), auth_privado.identidades() to ffcmapp_agenda_google_owner;
grant select (id, ativo, perfil), update (versao) on public.usuario to ffcmapp_agenda_google_owner;
grant select (id, usuario_id, perfil, estado, metodo, subject_google), update (versao) on identidade.concessao_equipe to ffcmapp_agenda_google_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_agenda_google_owner;
grant select on identidade.configuracao_auth_nativo to ffcmapp_agenda_google_owner;
create policy agenda_google_usuario on public.usuario for select to ffcmapp_agenda_google_owner
  using (id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid);
create policy agenda_google_concessao on identidade.concessao_equipe for select to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid);
create policy agenda_google_sessao on identidade.sessao for select to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid
    and session_id=nullif(current_setting('ffcmapp.agenda_sessao',true),'')::uuid);
create policy agenda_google_usuario_lock on public.usuario for update to ffcmapp_agenda_google_owner
  using (id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid) with check (false);
create policy agenda_google_concessao_lock on identidade.concessao_equipe for update to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid) with check (false);
create policy agenda_google_sessao_lock on identidade.sessao for update to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid
    and session_id=nullif(current_setting('ffcmapp.agenda_sessao',true),'')::uuid) with check (false);
create policy agenda_google_config on identidade.configuracao_auth_nativo for select to ffcmapp_agenda_google_owner using (true);
grant execute on function vault.create_secret(text,text,text,uuid), vault.update_secret(uuid,text,text,text,uuid)
  to ffcmapp_agenda_google_owner;
grant select on vault.decrypted_secrets to ffcmapp_agenda_google_owner;
grant delete on vault.secrets to ffcmapp_agenda_google_owner;
grant execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)
  to ffcmapp_agenda_google_owner;
set role ffcmapp_agenda_google_owner;
alter default privileges revoke execute on functions from public;

create table identidade.agenda_google_requisicao (
  request_id uuid primary key,
  expira_em timestamptz not null
);
create table identidade.agenda_google_geracao (
  usuario_id uuid primary key,
  geracao bigint not null default 0
);
create table identidade.agenda_google_state (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  usuario_id uuid not null,
  sessao_id uuid not null,
  geracao bigint not null,
  selado text not null check (octet_length(selado) between 1 and 2048),
  expira_em timestamptz not null default (clock_timestamp() + interval '10 minutes')
);
create table identidade.agenda_google_credencial (
  usuario_id uuid primary key,
  subject_google text not null check (length(subject_google) between 1 and 255),
  geracao bigint not null,
  segredo_id uuid not null unique
);
revoke all on identidade.agenda_google_state, identidade.agenda_google_credencial, identidade.agenda_google_geracao, identidade.agenda_google_requisicao from public, anon, authenticated, service_role;

-- Contexto interno somente após verificação do atestado pelo wrapper privado.
-- Funções auxiliares não têm grants para executor ou papéis públicos.
create function identidade.agenda_google_contexto()
returns table(usuario_id uuid, sessao_id uuid) language sql stable security definer set search_path = '' as $$
  select nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid,
    nullif(current_setting('ffcmapp.agenda_sessao',true),'')::uuid
$$;

create function identidade.agenda_google_registrar_state(p_hash text, p_selado text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null or p_hash !~ '^[0-9a-f]{64}$' or p_selado is null or octet_length(p_selado) not between 1 and 2048 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  insert into identidade.agenda_google_geracao(usuario_id) values(v_usuario) on conflict do nothing;
  select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
  insert into identidade.agenda_google_state(hash,usuario_id,sessao_id,geracao,selado) values(p_hash,v_usuario,v_sessao,v_geracao,p_selado);
  return true;
end $$;

-- DELETE é a única operação de consumo: chamadas concorrentes não recebem a mesma linha.
create function identidade.agenda_google_consumir_state(p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_selado text; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  delete from identidade.agenda_google_state s where s.hash=p_hash and s.usuario_id=v_usuario
    and s.sessao_id=v_sessao and s.expira_em>clock_timestamp() returning s.selado,s.geracao into v_selado,v_geracao;
  if v_selado is null then return null; end if;
  return pg_catalog.jsonb_build_object('selado',v_selado,'geracao',v_geracao::text);
end $$;

-- O armazenamento e a substituição são transacionais; erro não remove segredo vigente.
create function identidade.agenda_google_salvar_credencial(p_refresh text, p_geracao bigint, p_subject text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_antigo uuid; v_novo uuid; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null or p_refresh is null or octet_length(p_refresh) not between 1 and 4096
    or p_subject is null or length(p_subject) not between 1 and 255 then return false; end if;
  if not exists (select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
    join auth_privado.identidades() i on i.user_id=s.usuario_id and i.provider='google' and i.provider_id=c.subject_google
    where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=p_subject) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
  if v_geracao is null or v_geracao is distinct from p_geracao then return false; end if;
  update identidade.agenda_google_geracao set geracao=geracao+1 where usuario_id=v_usuario returning geracao into v_geracao;
  select segredo_id into v_antigo from identidade.agenda_google_credencial where usuario_id=v_usuario for update;
  v_novo := vault.create_secret(p_refresh, null, null, null);
  insert into identidade.agenda_google_credencial(usuario_id,subject_google,geracao,segredo_id) values(v_usuario,p_subject,v_geracao,v_novo)
    on conflict(usuario_id) do update set subject_google=excluded.subject_google,geracao=excluded.geracao,segredo_id=excluded.segredo_id;
  if v_antigo is not null then delete from vault.secrets where id=v_antigo; end if;
  return true;
end $$;
create function identidade.agenda_google_ler_credencial()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_refresh text; v_atual text; v_registrado text; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  select con.subject_google into v_atual from identidade.sessao s
    join identidade.concessao_equipe con on con.id=s.concessao_id
    where s.usuario_id=v_usuario and s.session_id=v_sessao;
  select c.subject_google into v_registrado from identidade.agenda_google_credencial c where c.usuario_id=v_usuario;
  if v_registrado is not null and v_registrado is distinct from v_atual then
    perform identidade.agenda_google_revogar_credencial();
    return null;
  end if;
  select d.decrypted_secret,c.geracao into v_refresh,v_geracao from identidade.agenda_google_credencial c
    join vault.decrypted_secrets d on d.id=c.segredo_id
    join identidade.sessao s on s.usuario_id=c.usuario_id and s.session_id=v_sessao
    join identidade.concessao_equipe con on con.id=s.concessao_id and con.subject_google=c.subject_google
    join auth_privado.identidades() i on i.user_id=c.usuario_id and i.provider='google' and i.provider_id=c.subject_google
    where c.usuario_id=v_usuario;
  if v_refresh is null then return null; end if;
  return pg_catalog.jsonb_build_object('refresh',v_refresh,'geracao',v_geracao::text);
end $$;
create function identidade.agenda_google_revogar_credencial()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_segredo uuid;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  insert into identidade.agenda_google_geracao(usuario_id,geracao) values(v_usuario,1)
    on conflict(usuario_id) do update set geracao=identidade.agenda_google_geracao.geracao+1;
  delete from identidade.agenda_google_credencial where usuario_id=v_usuario returning segredo_id into v_segredo;
  if v_segredo is not null then delete from vault.secrets where id=v_segredo; end if;
  delete from identidade.agenda_google_state where usuario_id=v_usuario;
  return true;
end $$;
-- O executor apresenta atestado emitido após validação do JWT no servidor. O valor sensível
-- viaja separado do envelope assinado, ligado por SHA-256; proteger parâmetros
-- contra logs continua sendo pré-condição. Nenhum executor recebe grant aqui.
create function identidade.agenda_google_operacao_privada(p_transporte jsonb, p_valor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  v_usuario uuid; v_sessao uuid; v_req uuid; v_inicio timestamptz; v_fim timestamptz;
  v_acao text; v_resultado jsonb; v_valor_hash text;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id','hash','valor_hash','geracao','subject','atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end if;
  begin
    v_usuario := (a->>'usuario_id')::uuid; v_sessao := (a->>'session_id')::uuid;
    v_req := (e->>'request_id')::uuid;
    v_inicio := (a->>'emitido_em')::timestamptz; v_fim := (a->>'expira_em')::timestamptz;
    v_acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end;
  if v_usuario is null or v_sessao is null or v_req is null or v_inicio is null or v_fim is null
    or v_acao not in ('agenda.registrar','agenda.consumir','agenda.salvar','agenda.ler','agenda.revogar')
    or v_acao is null or a->>'usuario_id' is distinct from v_usuario::text
    or a->>'session_id' is distinct from v_sessao::text or a->>'request_id' is distinct from v_req::text
    or v_inicio>clock_timestamp() or v_fim<=clock_timestamp() or v_fim<=v_inicio or v_fim-v_inicio>interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end if;
  perform set_config('ffcmapp.agenda_usuario',v_usuario::text,true);
  perform set_config('ffcmapp.agenda_sessao',v_sessao::text,true);
  -- Mesma ordem das operações privadas: concessão, usuário, sessão.
  perform 1 from identidade.concessao_equipe c where c.usuario_id=v_usuario and c.estado='vinculada' for share;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  perform 1 from public.usuario u where u.id=v_usuario and u.ativo for share;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  perform 1 from identidade.sessao s where s.usuario_id=v_usuario and s.session_id=v_sessao
    and s.revogada_em is null and s.encerrada_em is null for share;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  if not exists (
    select 1 from identidade.sessao s
    join public.usuario u on u.id=s.usuario_id and u.ativo
    join identidade.concessao_equipe c on c.id=s.concessao_id and c.usuario_id=u.id
      and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil=u.perfil
      and c.perfil in ('administrador','profissional')
    join auth_privado.sessoes() auth_s on auth_s.id=s.session_id and auth_s.user_id=u.id
      and (auth_s.not_after is null or auth_s.not_after>clock_timestamp())
    join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
      and i.provider_id=c.subject_google and i.identity_data->>'sub'=i.provider_id
      and i.identity_data->>'email_verified'='true'
    join identidade.configuracao_auth_nativo conf on conf.google_unico_oauth_confirmado
      and i.identity_data#>>'{custom_claims,hd}'=conf.dominio_workspace
    where s.usuario_id=v_usuario and s.session_id=v_sessao and s.metodo='google_workspace'
      and s.revogada_em is null and s.encerrada_em is null
      and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
  ) then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  if p_valor is not null then
    v_valor_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_valor,'UTF8'),'sha256'),'hex');
  end if;
  if e->>'valor_hash' is distinct from v_valor_hash then raise exception using errcode='42501', message='SEM_PERMISSAO'; end if;
  insert into identidade.agenda_google_requisicao(request_id,expira_em) values(v_req,v_fim) on conflict do nothing;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  case v_acao
    when 'agenda.registrar' then v_resultado := to_jsonb(identidade.agenda_google_registrar_state(e->>'hash',p_valor));
    when 'agenda.consumir' then v_resultado := identidade.agenda_google_consumir_state(e->>'hash');
    when 'agenda.salvar' then
      if coalesce(e->>'geracao','') !~ '^[0-9]{1,18}$' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
      v_resultado := to_jsonb(identidade.agenda_google_salvar_credencial(p_valor,(e->>'geracao')::bigint,e->>'subject'));
    when 'agenda.ler' then v_resultado := identidade.agenda_google_ler_credencial();
    when 'agenda.revogar' then v_resultado := to_jsonb(identidade.agenda_google_revogar_credencial());
  end case;
  if v_fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=v_sessao and s.user_id=v_usuario and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  return v_resultado;
end $$;
revoke all on function identidade.agenda_google_contexto(), identidade.agenda_google_registrar_state(text,text),
  identidade.agenda_google_consumir_state(text), identidade.agenda_google_salvar_credencial(text,bigint,text),
  identidade.agenda_google_ler_credencial(), identidade.agenda_google_revogar_credencial(),
  identidade.agenda_google_operacao_privada(jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function identidade.agenda_google_operacao_privada(jsonb,text) to ffcmapp_agenda_google_executor;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_agenda'), false);
revoke create on schema identidade from ffcmapp_agenda_google_owner;
revoke ffcmapp_agenda_google_owner from current_user;
