-- Ativação do convite familiar (FR-052/FR-054) — semântica decidida em 12/11/2026.
-- A ativação SOMENTE estabelece identidade: liga a conta Auth confirmada ao convite.
-- Não cria perfil em public.usuario nem concessão em cadastro.acesso_paciente, e por
-- isso o papel dono não recebe INSERT nessas tabelas — a ausência de privilégio é a
-- garantia, não a boa intenção do corpo da função. Toda autorização vem da
-- pré-autorização registrada pela equipe antes do convite e revalidada a cada leitura.
-- Sem pré-autorização vigente a entrada é negada e auditada, nunca provisionada.
-- Depende de 20261119250000_convite_familiar.sql.
-- Rollback: drop function api.ativar_convite_familiar_privado(jsonb);
--   drop owned by ffcmapp_ativar_familiar_owner; drop role ffcmapp_ativar_familiar_owner;
-- O convite passa a vincular uma CONTA Auth, não um perfil de aplicação: sob a nova
-- semântica quem ativa ainda não tem linha em public.usuario. É o mesmo alvo que
-- identidade.concessao_equipe.usuario_id já usa para a equipe.
alter table identidade.convite_familiar drop constraint convite_familiar_usuario_id_fkey;
alter table identidade.convite_familiar add constraint convite_familiar_usuario_id_fkey
  foreign key (usuario_id) references auth.users (id) on delete no action;

create role ffcmapp_ativar_familiar_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_ativar_familiar_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_ativar_familiar_owner;
grant usage on schema identidade, cadastro, auditoria, public, auth_privado to ffcmapp_ativar_familiar_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes() to ffcmapp_ativar_familiar_owner;
-- Leitura do acesso só para recusar reabertura de vínculo revogado; `for share` exige
-- UPDATE, neutralizado pela política `_lock` com `check (false)`. Sem INSERT.
grant select (id, paciente_id, usuario_id, revogada_em), update (versao) on cadastro.acesso_paciente to ffcmapp_ativar_familiar_owner;
grant select (id, paciente_id, email_hmac, estado, usuario_id, tentativa_envio_id, ultima_tentativa_id,
    acesso_preautorizado_id, acesso_autorizado_por, motivo_acesso_cifrado, acesso_revogado_em),
  update (estado, usuario_id, ativado_em, atualizado_em, tentativa_envio_id, ultima_tentativa_id)
  on identidade.convite_familiar to ffcmapp_ativar_familiar_owner;
grant insert (id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_ativar_familiar_owner;
-- Quem ativa ainda não tem perfil de aplicação — consequência direta da ativação só
-- estabelecer identidade. `auditoria.evento.ator_usuario_id` referencia public.usuario,
-- então o evento é registrado pelo operador restrito enquanto o perfil não existir.
grant select (id) on public.usuario to ffcmapp_ativar_familiar_owner;
grant select (operador_auditoria) on identidade.configuracao_auth_nativo to ffcmapp_ativar_familiar_owner;
create policy ativar_familiar_usuario_select on public.usuario for select to ffcmapp_ativar_familiar_owner
  using (id = (select auth_privado.uid()));
create policy ativar_familiar_config on identidade.configuracao_auth_nativo for select to ffcmapp_ativar_familiar_owner
  using (true);
create policy ativar_familiar_acesso_select on cadastro.acesso_paciente for select to ffcmapp_ativar_familiar_owner
  using (usuario_id = (select auth_privado.uid()));
create policy ativar_familiar_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_ativar_familiar_owner
  using (usuario_id = (select auth_privado.uid())) with check (false);
create policy ativar_familiar_convite_select on identidade.convite_familiar for select to ffcmapp_ativar_familiar_owner
  using (true);
-- Só avança convite com pré-autorização vigente, e só para 'ativado' do próprio titular.
create policy ativar_familiar_convite_update on identidade.convite_familiar for update to ffcmapp_ativar_familiar_owner
  using (acesso_preautorizado_id is not null and acesso_revogado_em is null
    and (estado in ('pendente', 'enviado', 'falha') or (estado = 'ativado' and usuario_id = (select auth_privado.uid()))))
  with check (estado = 'ativado' and usuario_id = (select auth_privado.uid())
    and acesso_preautorizado_id is not null and acesso_revogado_em is null);
create policy ativar_familiar_auditoria on auditoria.evento for insert to ffcmapp_ativar_familiar_owner
  with check (acao = 'ativar_convite_familiar' and tipo_objeto = 'convite_familiar'
    and ((ator_usuario_id = (select auth_privado.uid()) and operador_restrito is null)
      or (ator_usuario_id is null and operador_restrito is not null)));

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
  permitido boolean := false; eventos integer; v_ator uuid; v_operador text;
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
  <<ativar>>
  begin
    -- O convite é encontrado pelo par (id, email_hmac): um token de outro e-mail,
    -- ou de outro caso, não alcança este registro.
    select paciente_id, estado, acesso_preautorizado_id, acesso_autorizado_por, motivo_acesso_cifrado, acesso_revogado_em
      into v_convite from identidade.convite_familiar
      where id = convite and email_hmac = e ->> 'email_hmac'
        and (estado in ('pendente', 'enviado', 'falha') or (estado = 'ativado' and usuario_id = ator)) for update;
    if not found then exit ativar; end if;
    paciente := v_convite.paciente_id; estado_anterior := v_convite.estado;
    -- Sem pré-autorização vigente da equipe não há entrada. Revogar a pré-autorização
    -- fecha na hora, inclusive para um link de convite antigo que ainda esteja válido.
    if v_convite.acesso_preautorizado_id is null or v_convite.acesso_autorizado_por is null
      or v_convite.motivo_acesso_cifrado is null or v_convite.acesso_revogado_em is not null then
      exit ativar;
    end if;
    -- Vínculo já revogado não é reaberto por ativação nem por recuperação de senha.
    perform 1 from cadastro.acesso_paciente
      where paciente_id = paciente and usuario_id = ator and revogada_em is not null for share;
    if found then exit ativar; end if;
    -- Identidade apenas: estado e titular do convite. Nenhuma linha de perfil ou de
    -- acesso é criada aqui, e o papel dono sequer tem INSERT para isso.
    if estado_anterior <> 'ativado' then
      update identidade.convite_familiar set estado = 'ativado', usuario_id = ator,
        ativado_em = clock_timestamp(), atualizado_em = clock_timestamp(),
        ultima_tentativa_id = coalesce(tentativa_envio_id, ultima_tentativa_id), tentativa_envio_id = null
        where id = convite;
    end if;
    permitido := true;
  end;
  -- Enquanto não houver perfil, o evento sai pelo operador restrito: a ativação não
  -- cria a identidade de aplicação só para conseguir auditar a si mesma.
  select u.id into v_ator from public.usuario u where u.id = ator;
  if v_ator is null then
    select c.operador_auditoria into strict v_operador from identidade.configuracao_auth_nativo c;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, v_operador, 'ativar_convite_familiar', 'convite_familiar', convite,
      case when permitido then 'permitido' else 'negado' end, req);
  get diagnostics eventos = row_count;
  if eventos <> 1 then raise exception using errcode = '55000', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  if not permitido then return jsonb_build_object('ok', false); end if;
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
