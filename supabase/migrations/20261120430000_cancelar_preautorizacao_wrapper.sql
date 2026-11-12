-- Expõe o cancelamento de pré-autorização familiar à aplicação (FR-051/FR-054).
-- Sem este wrapper a equipe podia convidar e pré-autorizar, mas não desfazer: desde
-- 20261120420000 o cancelamento também revoga o acesso já materializado, então deixá-lo
-- inalcançável é funcionalidade pela metade.
--
-- Capacidade: a mesma já exigida para convidar — sessão administrativa vigente,
-- conferida dentro de identidade.cancelar_preautorizacao_familiar_privado por
-- api.consultar_sessao_nativa. Nenhuma capacidade nova é criada.
-- Owner dedicado porque o cancelamento escreve em cadastro.acesso_paciente, o que
-- ffcmapp_convite_familiar_owner não faz e não deve passar a fazer.
-- Depende de 20261119250000, 20261120400000 e 20261120420000.
-- Rollback: drop function api.cancelar_preautorizacao_familiar_privado(jsonb);
--   drop owned by ffcmapp_cancelar_preautorizacao_owner; drop role ffcmapp_cancelar_preautorizacao_owner;
create role ffcmapp_cancelar_preautorizacao_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_cancelar_preautorizacao_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_cancelar_preautorizacao_owner;
grant usage on schema identidade, cadastro, auditoria, operacao, public, auth_privado to ffcmapp_cancelar_preautorizacao_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt() to ffcmapp_cancelar_preautorizacao_owner;
grant execute on function api.consultar_sessao_nativa(uuid) to ffcmapp_cancelar_preautorizacao_owner;
grant execute on function identidade.cancelar_preautorizacao_familiar_privado(uuid, uuid, jsonb)
  to ffcmapp_cancelar_preautorizacao_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_cancelar_preautorizacao_owner;
grant select (id, paciente_id, estado, acesso_preautorizado_id, acesso_revogado_em, acesso_revogado_por, atualizado_em),
  update (acesso_revogado_em, acesso_revogado_por, atualizado_em)
  on identidade.convite_familiar to ffcmapp_cancelar_preautorizacao_owner;
grant select (id, paciente_id, usuario_id, revogada_em, versao),
  update (revogada_em, revogado_por_usuario_id, motivo_revogacao_cifrado, versao)
  on cadastro.acesso_paciente to ffcmapp_cancelar_preautorizacao_owner;
-- SELECT na tabela inteira porque o ledger é lido como rowtype (`returning *`);
-- a política abaixo limita o alcance às requisições do próprio ator.
grant select,
  insert (id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id),
  delete on operacao.requisicao to ffcmapp_cancelar_preautorizacao_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_cancelar_preautorizacao_owner;

create policy cancelar_preaut_usuario on public.usuario for select
  to ffcmapp_cancelar_preautorizacao_owner using (id = (select auth_privado.uid()));
create policy cancelar_preaut_usuario_lock on public.usuario for update
  to ffcmapp_cancelar_preautorizacao_owner using (id = (select auth_privado.uid())) with check (false);
create policy cancelar_preaut_convite on identidade.convite_familiar for select
  to ffcmapp_cancelar_preautorizacao_owner using (true);
-- Só fecha: nunca reabre uma pré-autorização nem muda o caso de destino.
create policy cancelar_preaut_convite_update on identidade.convite_familiar for update
  to ffcmapp_cancelar_preautorizacao_owner using (acesso_preautorizado_id is not null)
  with check (acesso_revogado_em is not null and acesso_revogado_por is not null);
create policy cancelar_preaut_acesso on cadastro.acesso_paciente for select
  to ffcmapp_cancelar_preautorizacao_owner using (true);
-- A linha de acesso fechada tem de ser exatamente a que a pré-autorização aponta.
create policy cancelar_preaut_acesso_update on cadastro.acesso_paciente for update
  to ffcmapp_cancelar_preautorizacao_owner
  using (exists (select 1 from identidade.convite_familiar c
    where c.acesso_preautorizado_id = acesso_paciente.id and c.paciente_id = acesso_paciente.paciente_id))
  with check (revogada_em is not null and revogado_por_usuario_id is not null
    and motivo_revogacao_cifrado is not null);
create policy cancelar_preaut_requisicao on operacao.requisicao for select
  to ffcmapp_cancelar_preautorizacao_owner using (ator_usuario_id = (select auth_privado.uid()));
create policy cancelar_preaut_requisicao_insert on operacao.requisicao for insert
  to ffcmapp_cancelar_preautorizacao_owner
  with check (ator_usuario_id = (select auth_privado.uid())
    and operacao = 'api.cancelar_preautorizacao_familiar');
create policy cancelar_preaut_requisicao_delete on operacao.requisicao for delete
  to ffcmapp_cancelar_preautorizacao_owner
  using (ator_usuario_id = (select auth_privado.uid())
    and operacao = 'api.cancelar_preautorizacao_familiar');
-- Dois eventos por operação, de propósito: a decisão de domínio
-- (`cancelar_preautorizacao_familiar`, gravada pela função interna) e a fronteira de
-- API (`api.cancelar_preautorizacao_familiar`, que registra também repetição e conflito
-- de idempotência). A política admite as duas ações e nenhuma outra.
create policy cancelar_preaut_auditoria on auditoria.evento for insert
  to ffcmapp_cancelar_preautorizacao_owner
  with check (ator_usuario_id = (select auth_privado.uid()) and tipo_objeto = 'convite_familiar'
    and acao in ('api.cancelar_preautorizacao_familiar', 'cancelar_preautorizacao_familiar'));

select set_config('ffcmapp.cancelar_preaut_migrador', current_user, false);
select set_config('ffcmapp.cancelar_preaut_tinha_verificador',
  pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.cancelar_preaut_tinha_verificador') = 'false' then
    if exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
      join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text)
  to ffcmapp_cancelar_preautorizacao_owner;
reset role;
select set_config('role', current_setting('ffcmapp.cancelar_preaut_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.cancelar_preaut_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

set role ffcmapp_cancelar_preautorizacao_owner;
create function api.cancelar_preautorizacao_familiar_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  e jsonb := p_transporte -> 'entrada'; a jsonb := e -> 'atestado';
  ator uuid; sessao uuid; req uuid; convite uuid;
  inicio timestamptz; fim timestamptz; anterior operacao.requisicao; resultado jsonb;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'convite_id', 'motivo_cifrado', 'chave_idempotencia',
      'digest_idempotencia', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object'
    or jsonb_typeof(e -> 'motivo_cifrado') is distinct from 'object'
    or jsonb_typeof(e -> 'chave_idempotencia') is distinct from 'string'
    or jsonb_typeof(e -> 'digest_idempotencia') is distinct from 'string'
    or nullif(btrim(e ->> 'chave_idempotencia'), '') is null
    or nullif(btrim(e ->> 'digest_idempotencia'), '') is null then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt() ->> 'session_id')::uuid;
    req := (e ->> 'request_id')::uuid; convite := (e ->> 'convite_id')::uuid;
    inicio := (a ->> 'emitido_em')::timestamptz; fim := (a ->> 'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  -- Atestado conferido antes de qualquer leitura da pré-autorização.
  if ator is null or sessao is null or req is null or convite is null or inicio is null or fim is null
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio
    or fim - inicio > interval '30 seconds'
    or a ->> 'usuario_id' is distinct from ator::text or a ->> 'session_id' is distinct from sessao::text
    or a ->> 'request_id' is distinct from req::text
    or a ->> 'operacao' is distinct from 'api.cancelar_preautorizacao_familiar'
    or identidade.verificar_assinatura_atestado(p_transporte ->> 'entrada_canonica',
      p_transporte ->> 'dados_canonicos', e - 'atestado', a - 'mac', a ->> 'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Ledger de idempotência: mesma chave com entrada diferente é conflito, não repetição.
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id)
    values (gen_random_uuid(), ator, 'api.cancelar_preautorizacao_familiar',
      e ->> 'chave_idempotencia', e ->> 'digest_idempotencia', 'concluida', convite)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r
      where r.ator_usuario_id = ator and r.operacao = 'api.cancelar_preautorizacao_familiar'
        and r.chave_idempotencia = e ->> 'chave_idempotencia';
    if anterior.digest_entrada is distinct from e ->> 'digest_idempotencia'
      or anterior.estado is distinct from 'concluida' or anterior.resultado_id is distinct from convite then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values (gen_random_uuid(), ator, 'api.cancelar_preautorizacao_familiar', 'convite_familiar', convite, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    -- Repetição legítima da mesma operação: já está cancelado, nada muda.
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), ator, 'api.cancelar_preautorizacao_familiar', 'convite_familiar', convite, 'permitido', req);
    return jsonb_build_object('ok', true, 'repeticao', true, 'convite_id', convite, 'request_id', req);
  end if;
  resultado := identidade.cancelar_preautorizacao_familiar_privado(convite, req, e -> 'motivo_cifrado');
  if resultado ->> 'ok' is distinct from 'true' then
    -- Recusa não consome a chave: a equipe pode corrigir e repetir.
    delete from operacao.requisicao where id = anterior.id;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), ator, 'api.cancelar_preautorizacao_familiar', 'convite_familiar', convite, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', coalesce(resultado ->> 'codigo', 'sem_permissao')), 'request_id', req);
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), ator, 'api.cancelar_preautorizacao_familiar', 'convite_familiar', convite, 'permitido', req);
  if fim <= clock_timestamp() then raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA'; end if;
  return jsonb_build_object('ok', true, 'repeticao', false, 'convite_id', convite,
    'acessos_fechados', resultado -> 'acessos_fechados', 'request_id', req);
end $$;
revoke all on function api.cancelar_preautorizacao_familiar_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.cancelar_preaut_migrador'), false);
revoke create on schema api from ffcmapp_cancelar_preautorizacao_owner;
revoke ffcmapp_cancelar_preautorizacao_owner from current_user;
