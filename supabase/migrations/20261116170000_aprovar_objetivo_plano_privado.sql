-- Preparação privada. Sem grants de aplicação; exige revisão independente e provas reais antes de exposição.
-- Aprovação de objetivo/revisão do plano de cuidado: carimbo, não portão (decisão do
-- solicitante de 10/11/2026) — não bloqueia leitura nem escrita, só registra quem aprovou e
-- quando, como evento à parte (objetivo/versão são imutáveis). Autorizado para Administrador
-- (sempre, via Google Workspace ou exceção técnica — mesmo padrão admin-only já usado nesta
-- fatia) OU qualquer colaborador vinculado via Google Workspace que esteja ativo em
-- identidade.aprovador_plano_cuidado. Sem idempotência por chave: unicidade natural
-- (registro_id, aprovador_usuario_id) já torna a operação idempotente.
create function operacao.aprovar_objetivo_plano_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; registro uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; perfil text; dominio text; sujeito text;
  google record; autorizado boolean := false; resultado jsonb; linha cadastro.objetivo_cuidado_aprovacao;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'registro_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; registro := (e->>'registro_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or registro is null
    or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
    or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
    or a->>'operacao' is distinct from 'api.aprovar_objetivo_plano'
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Colaborador geral via Google Workspace (administrador ou profissional) — mesmo padrão de
  -- operacao.plano_cuidado_operacao_privada — seguido da exceção técnica, restrita a
  -- administrador, como em operacao.criar_concessao_equipe_privado.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
      select i.provider_id, i.identity_data into google from auth_privado.identidades() i where i.user_id = ator and i.provider = 'google'
        and bloqueios_auth.travar(ator, sessao)
        and exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()))
        and (select count(*) from auth_privado.identidades() j where j.user_id = ator and j.provider = 'google') = 1;
      if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true' and google.identity_data#>>'{custom_claims,hd}' = dominio then
        select c.id, c.perfil, c.subject_google into concessao, perfil, sujeito from identidade.concessao_equipe c
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace' for share;
        if found and perfil in ('administrador', 'profissional') and sujeito = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = perfil for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
      select c.id into concessao from identidade.concessao_equipe c
        where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'tecnica' and c.perfil = 'administrador' for share;
      if found then
        perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
        if found then
          perform 1 from identidade.excecao_tecnica x where x.usuario_id = ator and x.concessao_id = concessao for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
              perfil := 'administrador';
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  -- Gate extra: colaborador autorizado só aprova se for administrador ou estiver ativo na
  -- lista de aprovadores indicados.
  if autorizado and perfil <> 'administrador'
    and not exists(select 1 from identidade.aprovador_plano_cuidado c where c.usuario_id = ator and c.ativo) then
    autorizado := false;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, 'api.aprovar_objetivo_plano', 'objetivo_cuidado_aprovacao', registro, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  perform 1 from cadastro.objetivo_cuidado_versao v where v.id = registro for share;
  if not found then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, 'api.aprovar_objetivo_plano', 'objetivo_cuidado_aprovacao', registro, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
  end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  insert into cadastro.objetivo_cuidado_aprovacao(id, registro_id, aprovador_usuario_id)
    values(gen_random_uuid(), registro, ator)
    on conflict (registro_id, aprovador_usuario_id) do nothing
    returning * into linha;
  if linha.id is null then
    select * into linha from cadastro.objetivo_cuidado_aprovacao a where a.registro_id = registro and a.aprovador_usuario_id = ator;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(gen_random_uuid(), ator, 'api.aprovar_objetivo_plano', 'objetivo_cuidado_aprovacao', registro, 'permitido', req);
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  resultado := jsonb_build_object('registro_id', linha.registro_id, 'aprovador_usuario_id', linha.aprovador_usuario_id, 'aprovado_em', linha.aprovado_em);
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.aprovar_objetivo_plano_operacao_privada(jsonb) from public, anon, authenticated, service_role;

create function api.aprovar_objetivo_plano_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; registro uuid;
begin
  begin
    return operacao.aprovar_objetivo_plano_operacao_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    registro := (p_transporte#>>'{entrada,registro_id}')::uuid;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), 'api.aprovar_objetivo_plano', 'objetivo_cuidado_aprovacao', registro, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.aprovar_objetivo_plano_privado(jsonb) from public, anon, authenticated, service_role;

-- Owner dedicado, privilégios mínimos, sem grant de aplicação. Revisão independente pendente.
create role ffcmapp_aprovar_objetivo_plano_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_aprovar_objetivo_plano_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_aprovar_objetivo_plano_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_aprovar_objetivo_plano_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.aprovar_objetivo_plano_operacao_privada(jsonb) to ffcmapp_aprovar_objetivo_plano_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_aprovar_objetivo_plano_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_aprovar_objetivo_plano_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_aprovar_objetivo_plano_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_aprovar_objetivo_plano_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_aprovar_objetivo_plano_owner;
grant select (usuario_id, ativo) on identidade.aprovador_plano_cuidado to ffcmapp_aprovar_objetivo_plano_owner;
grant select, update (id) on cadastro.objetivo_cuidado_versao to ffcmapp_aprovar_objetivo_plano_owner;
grant select, insert on cadastro.objetivo_cuidado_aprovacao to ffcmapp_aprovar_objetivo_plano_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_aprovar_objetivo_plano_owner;
create policy aprovar_objetivo_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_aprovar_objetivo_plano_owner using (true);
create policy aprovar_objetivo_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_aprovar_objetivo_plano_owner using (true) with check (false);
create policy aprovar_objetivo_usuario_select on public.usuario for select to ffcmapp_aprovar_objetivo_plano_owner using (id = (select auth_privado.uid()));
create policy aprovar_objetivo_usuario_lock on public.usuario for update to ffcmapp_aprovar_objetivo_plano_owner using (id = (select auth_privado.uid())) with check (false);
create policy aprovar_objetivo_concessao_select on identidade.concessao_equipe for select to ffcmapp_aprovar_objetivo_plano_owner using (usuario_id = (select auth_privado.uid()));
create policy aprovar_objetivo_concessao_lock on identidade.concessao_equipe for update to ffcmapp_aprovar_objetivo_plano_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy aprovar_objetivo_excecao_select on identidade.excecao_tecnica for select to ffcmapp_aprovar_objetivo_plano_owner using (usuario_id = (select auth_privado.uid()));
create policy aprovar_objetivo_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_aprovar_objetivo_plano_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy aprovar_objetivo_sessao_select on identidade.sessao for select to ffcmapp_aprovar_objetivo_plano_owner using (usuario_id = (select auth_privado.uid()));
create policy aprovar_objetivo_sessao_lock on identidade.sessao for update to ffcmapp_aprovar_objetivo_plano_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy aprovar_objetivo_aprovador_select on identidade.aprovador_plano_cuidado for select to ffcmapp_aprovar_objetivo_plano_owner using (true);
create policy aprovar_objetivo_versao_select on cadastro.objetivo_cuidado_versao for select to ffcmapp_aprovar_objetivo_plano_owner using (true);
create policy aprovar_objetivo_versao_lock on cadastro.objetivo_cuidado_versao for update to ffcmapp_aprovar_objetivo_plano_owner using (true) with check (false);
create policy aprovar_objetivo_aprovacao_rw on cadastro.objetivo_cuidado_aprovacao for all to ffcmapp_aprovar_objetivo_plano_owner using (true) with check (aprovador_usuario_id = (select auth_privado.uid()));
create policy aprovar_objetivo_auditoria on auditoria.evento for insert to ffcmapp_aprovar_objetivo_plano_owner with check (ator_usuario_id = (select auth_privado.uid()));
alter function api.aprovar_objetivo_plano_privado(jsonb) owner to ffcmapp_aprovar_objetivo_plano_owner;
select set_config('ffcmapp.aprovar_objetivo_migrador', current_user, false);
set role ffcmapp_aprovar_objetivo_plano_owner;
revoke all on function api.aprovar_objetivo_plano_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.aprovar_objetivo_migrador'), false);
revoke create on schema api from ffcmapp_aprovar_objetivo_plano_owner;
revoke ffcmapp_aprovar_objetivo_plano_owner from current_user;

select set_config('ffcmapp.aprovar_objetivo_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.aprovar_objetivo_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_aprovar_objetivo_plano_owner;
reset role;
select set_config('role', current_setting('ffcmapp.aprovar_objetivo_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.aprovar_objetivo_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
