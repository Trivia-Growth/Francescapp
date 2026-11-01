-- D-14: admissão e consulta de sessão Supabase nativa, sem provas/refresh próprios.
-- Não provisiona configuração, identidade ou concessão. Ainda exige prova no
-- Supabase e revisão S-02 antes de aplicação remota. Vinculação inicial deriva
-- e-mail/subject da identidade Google nativa; nunca recebe esses dados do cliente.
create role ffcmapp_auth_nativo_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
alter table identidade.sessao add column encerrada_em timestamptz
  constraint sessao_encerrada_em_chk check (encerrada_em >= admitida_em);
grant ffcmapp_auth_nativo_owner to postgres;
grant usage, create on schema api, identidade to ffcmapp_auth_nativo_owner;
grant usage on schema public, auth, auditoria to ffcmapp_auth_nativo_owner;

-- Registro privado de configuração e do operador automático desta integração.
-- A confirmação é operacional, não um parâmetro recebido do navegador.
create table identidade.configuracao_auth_nativo (
  singleton boolean primary key default true check (singleton),
  dominio_workspace text not null check (dominio_workspace ~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,63}$'),
  google_unico_oauth_confirmado boolean not null default false,
  referencia_hmac_email text not null default 'ffcmapp.hmac.email.v1'
    check (referencia_hmac_email ~ '^ffcmapp\.hmac\.email\.[a-z0-9_-]{1,64}$'),
  operador_auditoria text not null default 'sistema.auth_nativo'
    check (operador_auditoria = 'sistema.auth_nativo')
);
alter table identidade.configuracao_auth_nativo enable row level security;
revoke all on identidade.configuracao_auth_nativo from public, anon, authenticated;
grant select on identidade.configuracao_auth_nativo to ffcmapp_auth_nativo_owner;
create policy configuracao_auth_nativo_interna on identidade.configuracao_auth_nativo
  for select to ffcmapp_auth_nativo_owner using (true);

-- O leitor da chave é nologin, separado do owner das RPCs e não aceita e-mail
-- arbitrário. Só retorna o índice do e-mail Google verificado da própria conta.
create role ffcmapp_email_hmac_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_email_hmac_owner to postgres;
grant usage, create on schema identidade to ffcmapp_email_hmac_owner;
grant usage on schema auth, vault, extensions to ffcmapp_email_hmac_owner;
grant select on identidade.configuracao_auth_nativo to ffcmapp_email_hmac_owner;
create policy configuracao_email_hmac_interna on identidade.configuracao_auth_nativo
  for select to ffcmapp_email_hmac_owner using (true);
grant select (user_id, provider, provider_id, identity_data) on auth.identities to ffcmapp_email_hmac_owner;
grant select on vault.decrypted_secrets to ffcmapp_email_hmac_owner;
grant execute on function extensions.hmac(bytea, bytea, text) to ffcmapp_email_hmac_owner;
-- Vault usa esta função ao abrir a view, conforme a migração de cofre existente.
grant execute on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)
  to ffcmapp_email_hmac_owner;
set role ffcmapp_email_hmac_owner;
alter default privileges revoke execute on functions from public;
create function identidade.email_google_hmac_nativo()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_config identidade.configuracao_auth_nativo;
  v_email text;
  v_chave_texto text;
  v_chave bytea;
begin
  select * into strict v_config from identidade.configuracao_auth_nativo;
  select lower(btrim(i.identity_data ->> 'email')) into v_email
    from auth.identities i where i.user_id = auth.uid() and i.provider = 'google'
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = v_config.dominio_workspace;
  if v_email is null or v_email !~ '^[!-~]+@[!-~]+$' or length(v_email) > 254 then return null; end if;
  begin
    select d.decrypted_secret into strict v_chave_texto from vault.decrypted_secrets d
      where d.name = v_config.referencia_hmac_email;
    v_chave := decode(v_chave_texto, 'base64');
    if v_chave is null or octet_length(v_chave) <> 32 or encode(v_chave,'base64') <> v_chave_texto
      then raise exception 'CHAVE_INVALIDA'; end if;
  exception when others then
    raise exception using errcode = '55000', message = 'CONFIGURACAO_HMAC_EMAIL_INDISPONIVEL';
  end;
  -- Mesmo domínio do calcularHmac('email-concessao:' + emailNormalizado) existente.
  return rtrim(translate(encode(extensions.hmac(
    convert_to('ffcmapp:hmac:v1:email-concessao:' || v_email, 'UTF8'), v_chave, 'sha256'
  ), 'base64'), '+/', '-_'), '=');
end $$;
revoke all on function identidade.email_google_hmac_nativo() from public, anon, authenticated;
grant execute on function identidade.email_google_hmac_nativo() to ffcmapp_auth_nativo_owner;
reset role;
revoke create on schema identidade from ffcmapp_email_hmac_owner;
revoke ffcmapp_email_hmac_owner from postgres;

grant select (id, perfil, ativo, versao) on public.usuario to ffcmapp_auth_nativo_owner;
grant update (versao) on public.usuario to ffcmapp_auth_nativo_owner;
grant insert (id, perfil) on public.usuario to ffcmapp_auth_nativo_owner;
grant select (id, usuario_id, perfil, estado, versao, subject_google, metodo, email_hmac)
  on identidade.concessao_equipe to ffcmapp_auth_nativo_owner;
grant update (versao, estado, usuario_id, subject_google, vinculada_em, atualizada_em)
  on identidade.concessao_equipe to ffcmapp_auth_nativo_owner;
grant select, insert on identidade.sessao to ffcmapp_auth_nativo_owner;
grant update (revogada_em, encerrada_em) on identidade.sessao to ffcmapp_auth_nativo_owner;
grant select (id, user_id, not_after) on auth.sessions to ffcmapp_auth_nativo_owner;
grant select (user_id, provider, provider_id, identity_data) on auth.identities to ffcmapp_auth_nativo_owner;
grant insert on auditoria.evento to ffcmapp_auth_nativo_owner;

create policy usuario_auth_nativo_leitura on public.usuario
  for select to ffcmapp_auth_nativo_owner using (id = (select auth.uid()));
create policy usuario_auth_nativo_insercao on public.usuario
  for insert to ffcmapp_auth_nativo_owner with check (id = (select auth.uid()));
-- PostgreSQL exige também policy UPDATE para SELECT ... FOR SHARE.
-- Os grants por coluna acima servem aos locks; as RPCs não alteram perfis.
create policy usuario_auth_nativo_lock on public.usuario
  for update to ffcmapp_auth_nativo_owner
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy concessao_auth_nativo_leitura on identidade.concessao_equipe
  for select to ffcmapp_auth_nativo_owner using (
    usuario_id = (select auth.uid())
    or (estado = 'pendente' and email_hmac = (select identidade.email_google_hmac_nativo()))
  );
create policy concessao_auth_nativo_lock on identidade.concessao_equipe
  for update to ffcmapp_auth_nativo_owner
  using (usuario_id = (select auth.uid())
    or (estado = 'pendente' and email_hmac = (select identidade.email_google_hmac_nativo())))
  with check (usuario_id = (select auth.uid()));
create policy sessao_auth_nativo_leitura on identidade.sessao
  for select to ffcmapp_auth_nativo_owner using (usuario_id = (select auth.uid()));
create policy sessao_auth_nativo_lock on identidade.sessao
  for update to ffcmapp_auth_nativo_owner
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy sessao_auth_nativo_insercao on identidade.sessao
  for insert to ffcmapp_auth_nativo_owner with check (usuario_id = (select auth.uid()));
create policy auditoria_auth_nativo_insercao on auditoria.evento
  for insert to ffcmapp_auth_nativo_owner with check (
    ator_usuario_id = (select auth.uid())
    or (ator_usuario_id is null and operador_restrito = 'sistema.auth_nativo')
  );

-- As funções recebem somente request_id. Identidade, sessão, método e domínio
-- vêm do Auth/gateway e das tabelas privadas, nunca de parâmetros autodeclarados.
set role ffcmapp_auth_nativo_owner;
alter default privileges revoke execute on functions from public;
create function identidade.sessao_nativa(p_request_id uuid, p_admitir boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_session_text text := auth.jwt() ->> 'session_id';
  v_session uuid;
  v_config identidade.configuracao_auth_nativo;
  v_perfil text;
  v_ativo boolean;
  v_versao integer;
  v_concessao record;
  v_google record;
  v_sessao record;
  v_permitido boolean := false;
  v_ator uuid;
  v_eventos integer;
  v_alterou boolean := false;
begin
  if p_request_id is null then
    raise exception using errcode = '22004', message = 'REQUEST_ID_OBRIGATORIO';
  end if;
  select * into strict v_config from identidade.configuracao_auth_nativo;
  if not v_config.google_unico_oauth_confirmado then
    raise exception using errcode = '55000', message = 'CONFIGURACAO_AUTH_INDISPONIVEL';
  end if;
  if v_session_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_session := v_session_text::uuid;
  end if;
  <<autorizar>>
  begin
    if v_usuario is null or v_session is null or bloqueios_auth.travar(v_usuario,v_session) is distinct from true or not exists (
      select 1 from auth.sessions s where s.id = v_session and s.user_id = v_usuario
        and (s.not_after is null or s.not_after > clock_timestamp())
    ) or not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
          then auth.jwt() -> 'amr' else '[]'::jsonb end
      ) m where m ->> 'method' = 'oauth'
    ) then exit autorizar; end if;
    if (select count(*) from auth.identities i
      where i.user_id = v_usuario and i.provider = 'google') <> 1
      then exit autorizar; end if;
    select i.provider_id, i.identity_data into v_google
      from auth.identities i where i.user_id = v_usuario and i.provider = 'google';
    if not found or v_google.identity_data ->> 'sub' is distinct from v_google.provider_id
      or v_google.identity_data ->> 'email_verified' is distinct from 'true'
      or v_google.identity_data #>> '{custom_claims,hd}' is distinct from v_config.dominio_workspace
    then exit autorizar; end if;

    select c.id, c.versao, c.perfil, c.estado into v_concessao
      from identidade.concessao_equipe c
      where c.usuario_id = v_usuario and c.estado = 'vinculada'
        and c.metodo = 'google_workspace' and c.subject_google = v_google.provider_id
      for update;
    if not found and p_admitir then
      select c.id, c.versao, c.perfil, c.estado into v_concessao
        from identidade.concessao_equipe c where c.estado = 'pendente'
          and c.metodo = 'google_workspace'
          and c.email_hmac = identidade.email_google_hmac_nativo()
        for update;
    end if;
    if not found then exit autorizar; end if;
    select u.perfil, u.ativo, u.versao into v_perfil, v_ativo, v_versao
      from public.usuario u where u.id = v_usuario for share;
    if found and (not v_ativo or v_perfil <> v_concessao.perfil) then exit autorizar; end if;
    if v_perfil is null and (not p_admitir or v_concessao.estado <> 'pendente') then exit autorizar; end if;

    -- Conferir tombstone antes de criar perfil ou vincular concessão.
    select s.usuario_id, s.concessao_id, s.metodo, s.revogada_em, s.encerrada_em into v_sessao
      from identidade.sessao s where s.session_id = v_session for share;
    if found and (v_sessao.usuario_id <> v_usuario or v_sessao.concessao_id <> v_concessao.id
      or v_sessao.metodo <> 'google_workspace' or v_sessao.revogada_em is not null or v_sessao.encerrada_em is not null)
      then exit autorizar; end if;

    -- Locks anteriores podem aguardar até depois da expiração da sessão.
    if not exists (select 1 from auth.sessions s where s.id=v_session and s.user_id=v_usuario
      and (s.not_after is null or s.not_after>clock_timestamp())) then exit autorizar; end if;

    if v_perfil is null then
      insert into public.usuario (id, perfil) values (v_usuario, v_concessao.perfil);
      get diagnostics v_eventos = row_count;
      if v_eventos <> 1 then raise exception using errcode='55000', message='ADMISSAO_AUTH_INCONSISTENTE'; end if;
      v_alterou := true;
      select u.perfil, u.ativo, u.versao into v_perfil, v_ativo, v_versao
        from public.usuario u where u.id = v_usuario for share;
      if not found or not v_ativo or v_perfil <> v_concessao.perfil then
        raise exception using errcode='55000', message='ADMISSAO_AUTH_INCONSISTENTE';
      end if;
    end if;
    if v_concessao.estado = 'pendente' then
      update identidade.concessao_equipe set usuario_id = v_usuario,
        subject_google = v_google.provider_id, estado = 'vinculada',
        versao = versao + 1, vinculada_em = clock_timestamp(), atualizada_em = clock_timestamp()
        where id = v_concessao.id and estado = 'pendente';
      get diagnostics v_eventos = row_count;
      if v_eventos <> 1 then raise exception using errcode='55000', message='ADMISSAO_AUTH_INCONSISTENTE'; end if;
      v_concessao.versao := v_concessao.versao + 1;
      v_alterou := true;
    end if;

    if p_admitir then
      insert into identidade.sessao (
        session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo
      ) values (v_session, v_usuario, v_concessao.id, v_concessao.versao, 'google_workspace')
      on conflict (session_id) do nothing;
    end if;
    select s.usuario_id, s.concessao_id, s.metodo, s.revogada_em, s.encerrada_em into v_sessao
      from identidade.sessao s where s.session_id = v_session for share;
    if not found or v_sessao.usuario_id <> v_usuario
      or v_sessao.concessao_id <> v_concessao.id or v_sessao.metodo <> 'google_workspace'
      or v_sessao.revogada_em is not null or v_sessao.encerrada_em is not null then
        if v_alterou then raise exception using errcode='55000', message='ADMISSAO_AUTH_INCONSISTENTE'; end if;
        exit autorizar;
    end if;
    v_permitido := true;
  end;

  select u.id into v_ator from public.usuario u where u.id = v_usuario;
  if v_alterou then
    insert into auditoria.evento (
      id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id
    ) values (
      gen_random_uuid(), v_ator, 'vincular_concessao_equipe', 'concessao_equipe',
      v_concessao.id, 'permitido', p_request_id
    );
    get diagnostics v_eventos = row_count;
    if v_eventos <> 1 then
      raise exception using errcode='55000', message='AUDITORIA_AUTH_INDISPONIVEL';
    end if;
  end if;
  insert into auditoria.evento (
    id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id
  ) values (
    gen_random_uuid(), v_ator,
    case when v_ator is null then v_config.operador_auditoria else null end,
    case when p_admitir then 'admitir_sessao_nativa' else 'consultar_sessao_nativa' end,
    'sessao', v_session, case when v_permitido then 'permitido' else 'negado' end, p_request_id
  );
  get diagnostics v_eventos = row_count;
  if v_eventos <> 1 then
    raise exception using errcode = '55000', message = 'AUDITORIA_AUTH_INDISPONIVEL';
  end if;
  if not v_permitido then return null; end if;
  -- Uma espera durante escrita/auditoria também pode consumir a validade.
  -- Exceção reverte admissão, vínculo e auditoria da mesma transação.
  if not exists (select 1 from auth.sessions s where s.id=v_session and s.user_id=v_usuario
    and (s.not_after is null or s.not_after>clock_timestamp())) then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end if;
  return jsonb_build_object(
    'session_id', v_session,
    'usuario', jsonb_build_object('id', v_usuario, 'perfil', v_perfil, 'ativo', true, 'versao', v_versao),
    'capacidades', case when v_perfil = 'administrador' then
      jsonb_build_array('administrar_concessoes', 'administrar_cadastro', 'consultar_carteira_integral', 'consultar_auditoria')
      else jsonb_build_array('consultar_pacientes_vinculados') end
  );
end $$;
revoke all on function identidade.sessao_nativa(uuid, boolean) from public, anon, authenticated;

create function api.admitir_sessao_nativa(p_request_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select identidade.sessao_nativa(p_request_id, true);
$$;
create function api.consultar_sessao_nativa(p_request_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select identidade.sessao_nativa(p_request_id, false);
$$;
create function api.encerrar_sessao_nativa(p_session_id uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_texto text := auth.jwt() ->> 'session_id';
  v_session uuid;
  v_encerrada timestamptz;
  v_eventos integer;
begin
  if p_request_id is null then raise exception using errcode = '22004', message = 'REQUEST_ID_OBRIGATORIO'; end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_session := v_texto::uuid;
  end if;
  if v_usuario is null or v_session is null or p_session_id is distinct from v_session then return false; end if;
  select s.encerrada_em into v_encerrada from identidade.sessao s
    where s.session_id = v_session and s.usuario_id = v_usuario for update;
  if not found then return false; end if;
  if v_encerrada is null then
    update identidade.sessao set encerrada_em = clock_timestamp() where session_id = v_session;
  end if;
  insert into auditoria.evento (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_usuario, 'encerrar_sessao_nativa', 'sessao', v_session, 'permitido', p_request_id);
  get diagnostics v_eventos = row_count;
  if v_eventos <> 1 then raise exception using errcode = '55000', message = 'AUDITORIA_AUTH_INDISPONIVEL'; end if;
  return true;
end $$;
revoke all on function api.encerrar_sessao_nativa(uuid, uuid) from public, anon, authenticated;
grant execute on function api.encerrar_sessao_nativa(uuid, uuid) to authenticated;
revoke all on function api.admitir_sessao_nativa(uuid), api.consultar_sessao_nativa(uuid)
  from public, anon, authenticated;
grant execute on function api.admitir_sessao_nativa(uuid), api.consultar_sessao_nativa(uuid)
  to authenticated;
reset role;
grant usage on schema api to authenticated;
revoke create on schema api, identidade from ffcmapp_auth_nativo_owner;
revoke ffcmapp_auth_nativo_owner from postgres;

-- Não deixar o caminho de cadastro anterior aceitar JWT cuja sessão Auth já
-- desapareceu. Mantém assinatura/ACL privadas e o owner do helper existente.
create or replace function identidade.sessao_atual_valida()
returns boolean language sql stable security definer set search_path = '' as $$
  with contexto as (
    select
      case when coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then auth.uid() else null::uuid end as usuario_id,
      case when auth.jwt() ->> 'session_id'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (auth.jwt() ->> 'session_id')::uuid else null::uuid end as session_id
  )
  select exists (
    select 1 from contexto x
    join public.usuario u on u.id=x.usuario_id and u.ativo
    join identidade.sessao s on s.usuario_id=u.id and s.session_id=x.session_id and s.revogada_em is null and s.encerrada_em is null
    join auth.sessions a on a.id=s.session_id and a.user_id=u.id
      and (a.not_after is null or a.not_after > statement_timestamp())
    join identidade.concessao_equipe c on c.id=s.concessao_id
      and c.usuario_id=u.id and c.estado='vinculada' and c.perfil=u.perfil
  );
$$;
revoke all on function identidade.sessao_atual_valida() from public, anon, authenticated;
