-- Rascunho dependente de convite_familiar_privado.sql. Não aplicar ou expor.
-- Conta nova só recebe perfil e acesso após decisão administrativa separada;
-- uma concessão revogada nunca é restaurada ou recriada por este fluxo.
create role ffcmapp_ativar_familiar_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_ativar_familiar_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_ativar_familiar_owner;
grant usage on schema identidade, cadastro, auditoria, public, auth_privado to ffcmapp_ativar_familiar_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes() to ffcmapp_ativar_familiar_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_ativar_familiar_owner;
grant insert (id, perfil, ativo) on public.usuario to ffcmapp_ativar_familiar_owner;
grant select (id, paciente_id, usuario_id, revogada_em), update (versao),
  insert (id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
  on cadastro.acesso_paciente to ffcmapp_ativar_familiar_owner;
grant select (id, paciente_id, email_hmac, estado, usuario_id, tentativa_envio_id, ultima_tentativa_id,
    acesso_preautorizado_id, acesso_autorizado_por, motivo_acesso_cifrado, acesso_revogado_em),
  update (estado, usuario_id, ativado_em, atualizado_em, tentativa_envio_id, ultima_tentativa_id)
  on identidade.convite_familiar to ffcmapp_ativar_familiar_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_ativar_familiar_owner;
create policy ativar_familiar_usuario_select on public.usuario for select to ffcmapp_ativar_familiar_owner
  using (id = (select auth_privado.uid()));
create policy ativar_familiar_usuario_lock on public.usuario for update to ffcmapp_ativar_familiar_owner
  using (id = (select auth_privado.uid())) with check (false);
create policy ativar_familiar_usuario_insert on public.usuario for insert to ffcmapp_ativar_familiar_owner
  with check (id = (select auth_privado.uid()) and perfil = 'familia' and ativo);
create policy ativar_familiar_acesso_select on cadastro.acesso_paciente for select to ffcmapp_ativar_familiar_owner
  using (usuario_id = (select auth_privado.uid()));
create policy ativar_familiar_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_ativar_familiar_owner
  using (usuario_id = (select auth_privado.uid())) with check (false);
create policy ativar_familiar_acesso_insert on cadastro.acesso_paciente for insert to ffcmapp_ativar_familiar_owner
  with check (usuario_id = (select auth_privado.uid()) and exists (
    select 1 from identidade.convite_familiar c where c.acesso_preautorizado_id = acesso_paciente.id
      and c.paciente_id = acesso_paciente.paciente_id and c.acesso_autorizado_por = acesso_paciente.concedido_por_usuario_id
      and c.motivo_acesso_cifrado = acesso_paciente.motivo_concessao_cifrado and c.acesso_revogado_em is null
      and c.estado in ('pendente', 'enviado', 'falha')));
create policy ativar_familiar_convite_select on identidade.convite_familiar for select to ffcmapp_ativar_familiar_owner
  using (true);
create policy ativar_familiar_convite_update on identidade.convite_familiar for update to ffcmapp_ativar_familiar_owner
  using (estado in ('pendente', 'enviado', 'falha') or (estado = 'ativado' and usuario_id = (select auth_privado.uid())))
  with check (estado = 'ativado' and usuario_id = (select auth_privado.uid()));
create policy ativar_familiar_auditoria on auditoria.evento for insert to ffcmapp_ativar_familiar_owner
  with check (ator_usuario_id = (select auth_privado.uid()) and acao = 'ativar_convite_familiar'
    and tipo_objeto = 'convite_familiar');

select set_config('ffcmapp.ativar_familiar_migrador', current_user, false);
select set_config('ffcmapp.ativar_familiar_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.ativar_familiar_tinha_verificador') = 'false' then
    if exists (select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
      join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
      where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_ativar_familiar_owner;
reset role;
select set_config('role', current_setting('ffcmapp.ativar_familiar_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.ativar_familiar_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

-- O atestado deve ser produzido somente após verifyOtp e getUser no servidor,
-- com HMAC do email confirmado obtido diretamente do Auth, não do navegador.
create function api.ativar_convite_familiar_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  e jsonb := p_transporte -> 'entrada'; a jsonb := e -> 'atestado';
  ator uuid; sessao uuid; req uuid; convite uuid; paciente uuid;
  inicio timestamptz; fim timestamptz; estado_anterior text; v_convite record;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'convite_id', 'email_hmac', 'tipo', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(e -> 'tipo') is distinct from 'string' or e ->> 'tipo' not in ('invite', 'recovery')
    or jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(e -> 'email_hmac') is distinct from 'string'
    or nullif(btrim(e ->> 'email_hmac'), '') is null then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt() ->> 'session_id')::uuid;
    req := (e ->> 'request_id')::uuid; convite := (e ->> 'convite_id')::uuid;
    inicio := (a ->> 'emitido_em')::timestamptz; fim := (a ->> 'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or convite is null or inicio is null or fim is null
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or a ->> 'usuario_id' is distinct from ator::text or a ->> 'session_id' is distinct from sessao::text
    or a ->> 'request_id' is distinct from req::text or a ->> 'operacao' is distinct from 'api.ativar_convite_familiar'
    or identidade.verificar_assinatura_atestado(p_transporte ->> 'entrada_canonica', p_transporte ->> 'dados_canonicos', e - 'atestado', a - 'mac', a ->> 'mac') is distinct from true
    or not exists (select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  select paciente_id, estado, acesso_preautorizado_id, acesso_autorizado_por, motivo_acesso_cifrado, acesso_revogado_em
    into v_convite from identidade.convite_familiar
    where id = convite and email_hmac = e ->> 'email_hmac'
      and (estado in ('pendente', 'enviado', 'falha') or (estado = 'ativado' and usuario_id = ator)) for update;
  if not found then return jsonb_build_object('ok', false); end if;
  paciente := v_convite.paciente_id; estado_anterior := v_convite.estado;
  if v_convite.acesso_preautorizado_id is null or v_convite.acesso_autorizado_por is null
    or v_convite.motivo_acesso_cifrado is null or v_convite.acesso_revogado_em is not null then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.usuario(id, perfil, ativo) values (ator, 'familia', true) on conflict (id) do nothing;
  perform 1 from public.usuario where id = ator and perfil = 'familia' and ativo for update;
  if not found then raise exception using errcode = '42501', message = 'SEM_PERMISSAO'; end if;
  perform 1 from cadastro.acesso_paciente where paciente_id = paciente and usuario_id = ator and revogada_em is null for share;
  if not found then
    -- Não transformar autorização antiga em reconcessão após revogação.
    perform 1 from cadastro.acesso_paciente where paciente_id = paciente and usuario_id = ator for share;
    if found then raise exception using errcode = '42501', message = 'SEM_PERMISSAO'; end if;
    insert into cadastro.acesso_paciente(id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
      values (v_convite.acesso_preautorizado_id, paciente, ator, v_convite.acesso_autorizado_por, v_convite.motivo_acesso_cifrado);
  end if;
  if estado_anterior <> 'ativado' then
    update identidade.convite_familiar set estado = 'ativado', usuario_id = ator,
      ativado_em = clock_timestamp(), atualizado_em = clock_timestamp(),
      ultima_tentativa_id = coalesce(tentativa_envio_id, ultima_tentativa_id), tentativa_envio_id = null
      where id = convite;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), ator, 'ativar_convite_familiar', 'convite_familiar', convite, 'permitido', req);
  if fim <= clock_timestamp() or not exists (select 1 from auth_privado.sessoes() s
    where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return jsonb_build_object('ok', true, 'usuario_id', ator);
end $$;
alter function api.ativar_convite_familiar_privado(jsonb) owner to ffcmapp_ativar_familiar_owner;
set role ffcmapp_ativar_familiar_owner;
revoke all on function api.ativar_convite_familiar_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.ativar_familiar_migrador'), false);
revoke create on schema api from ffcmapp_ativar_familiar_owner;
revoke ffcmapp_ativar_familiar_owner from current_user;
