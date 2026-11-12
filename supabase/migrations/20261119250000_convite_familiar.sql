-- Convite familiar (FR-051/FR-052/FR-053): tabela, operações privadas, owner e wrappers.
-- Decisão do solicitante de 12/11/2026: a pré-autorização da equipe é a fonte única da
-- autorização e é registrada ANTES do convite, por e-mail (email_hmac), espelhando
-- identidade.concessao_equipe. A ativação apenas estabelece identidade (migration
-- seguinte) e nunca provisiona acesso. Promovido de supabase/preparacao/convite_familiar_privado.sql
-- sem alteração do corpo SQL.
-- Preparação fechada: sem rota, grants de aplicação ou integração Auth.
-- A identidade do destinatário é representada por HMAC de e-mail normalizado;
-- o e-mail e o motivo ficam cifrados. Nunca persistir tokens de convite.
create table identidade.convite_familiar (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente(id) on delete no action,
  email_hmac text not null check (length(btrim(email_hmac)) > 0),
  digest_entrada text not null check (length(btrim(digest_entrada)) > 0),
  email_cifrado jsonb not null,
  motivo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario(id) on delete no action,
  estado text not null default 'pendente' check (estado in ('pendente', 'enviado', 'falha', 'ativado')),
  usuario_id uuid references public.usuario(id) on delete no action,
  tentativa_envio_id uuid,
  ultima_tentativa_id uuid,
  acesso_preautorizado_id uuid unique,
  acesso_autorizado_por uuid references public.usuario(id) on delete no action,
  acesso_autorizado_em timestamptz,
  acesso_revogado_em timestamptz,
  acesso_revogado_por uuid references public.usuario(id) on delete no action,
  motivo_acesso_cifrado jsonb,
  digest_autorizacao text,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  ativado_em timestamptz,
  constraint convite_familiar_email_formato check ((
    jsonb_typeof(email_cifrado) = 'object'
    and email_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and email_cifrado ->> 'formato' = '1'
    and nullif(email_cifrado ->> 'key_id', '') is not null
    and nullif(email_cifrado ->> 'nonce', '') is not null
    and nullif(email_cifrado ->> 'ciphertext', '') is not null
    and nullif(email_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint convite_familiar_motivo_formato check ((
    jsonb_typeof(motivo_cifrado) = 'object'
    and motivo_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and motivo_cifrado ->> 'formato' = '1'
    and nullif(motivo_cifrado ->> 'key_id', '') is not null
    and nullif(motivo_cifrado ->> 'nonce', '') is not null
    and nullif(motivo_cifrado ->> 'ciphertext', '') is not null
    and nullif(motivo_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint convite_familiar_ativacao check ((
    (estado = 'ativado' and usuario_id is not null and ativado_em is not null and ativado_em >= criado_em)
    or (estado <> 'ativado' and usuario_id is null and ativado_em is null)
  ) is true),
  constraint convite_familiar_tentativa check (estado <> 'ativado' or tentativa_envio_id is null),
  constraint convite_familiar_cancelamento check ((
    (acesso_revogado_em is null and acesso_revogado_por is null)
    or (acesso_revogado_em is not null and acesso_revogado_por is not null
      and acesso_autorizado_em is not null and acesso_revogado_em >= acesso_autorizado_em)
  ) is true),
  constraint convite_familiar_autorizacao check ((
    num_nonnulls(acesso_preautorizado_id, acesso_autorizado_por, acesso_autorizado_em, motivo_acesso_cifrado, digest_autorizacao) = 0
    or (num_nonnulls(acesso_preautorizado_id, acesso_autorizado_por, acesso_autorizado_em, motivo_acesso_cifrado, digest_autorizacao) = 5
      and length(btrim(digest_autorizacao)) > 0
      and jsonb_typeof(motivo_acesso_cifrado) = 'object'
      and motivo_acesso_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and motivo_acesso_cifrado ->> 'formato' = '1'
      and nullif(motivo_acesso_cifrado ->> 'key_id', '') is not null
      and nullif(motivo_acesso_cifrado ->> 'nonce', '') is not null
      and nullif(motivo_acesso_cifrado ->> 'ciphertext', '') is not null
      and nullif(motivo_acesso_cifrado ->> 'tag', '') is not null)
  ) is true),
  constraint convite_familiar_datas check (atualizado_em >= criado_em)
);

-- Enviado e falha continuam pendentes de ativação; reenvio atualiza o mesmo registro.
create unique index convite_familiar_pendente_unico
  on identidade.convite_familiar (paciente_id, email_hmac)
  where estado in ('pendente', 'enviado', 'falha') and acesso_revogado_em is null;

alter table identidade.convite_familiar enable row level security;
alter table identidade.convite_familiar force row level security;
revoke all on identidade.convite_familiar from public, anon, authenticated, service_role;

-- Interface privada: o executor futuro deve fornecer cifra e HMAC confiáveis.
-- O índice resolve concorrência sem depender de consulta prévia.
create function identidade.registrar_convite_familiar_privado(
  p_id uuid, p_request_id uuid, p_paciente_id uuid, p_email_hmac text, p_digest_entrada text,
  p_email_cifrado jsonb, p_motivo_cifrado jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ator uuid := auth_privado.uid();
  v_sessao jsonb;
  v_id uuid; v_existente record;
begin
  if p_id is null or p_request_id is null or p_paciente_id is null
    or nullif(btrim(p_email_hmac), '') is null or nullif(btrim(p_digest_entrada), '') is null
    or p_email_cifrado is null or p_motivo_cifrado is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text
    or v_sessao #>> '{usuario,ativo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;
  perform 1 from cadastro.paciente where id = p_paciente_id for share;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'paciente_indisponivel');
  end if;
  select paciente_id, email_hmac, digest_entrada, criado_por_usuario_id, estado into v_existente
    from identidade.convite_familiar where id = p_id for update;
  if found then
    if v_existente.paciente_id is distinct from p_paciente_id or v_existente.email_hmac is distinct from p_email_hmac
      or v_existente.digest_entrada is distinct from p_digest_entrada or v_existente.criado_por_usuario_id is distinct from v_ator
      or v_existente.estado = 'ativado' then
      return jsonb_build_object('ok', false, 'codigo', 'operacao_divergente');
    end if;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), v_ator, 'registrar_convite_familiar', 'convite_familiar', p_id, 'permitido', p_request_id);
    return jsonb_build_object('ok', true, 'convite_id', p_id, 'repeticao', true);
  end if;
  insert into identidade.convite_familiar (
    id, paciente_id, email_hmac, digest_entrada, email_cifrado, motivo_cifrado, criado_por_usuario_id
  ) values (p_id, p_paciente_id, p_email_hmac, p_digest_entrada, p_email_cifrado, p_motivo_cifrado, v_ator)
  on conflict do nothing returning id into v_id;
  if v_id is null then
    select paciente_id, email_hmac, digest_entrada, criado_por_usuario_id, estado into v_existente
      from identidade.convite_familiar where id = p_id for update;
    if found then
      if v_existente.paciente_id is distinct from p_paciente_id or v_existente.email_hmac is distinct from p_email_hmac
        or v_existente.digest_entrada is distinct from p_digest_entrada or v_existente.criado_por_usuario_id is distinct from v_ator
        or v_existente.estado = 'ativado' then
        return jsonb_build_object('ok', false, 'codigo', 'operacao_divergente');
      end if;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values (gen_random_uuid(), v_ator, 'registrar_convite_familiar', 'convite_familiar', p_id, 'permitido', p_request_id);
      return jsonb_build_object('ok', true, 'convite_id', p_id, 'repeticao', true);
    end if;
    return jsonb_build_object('ok', false, 'codigo', 'convite_pendente');
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'registrar_convite_familiar', 'convite_familiar', v_id, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'convite_id', v_id, 'repeticao', false);
end $$;
revoke all on function identidade.registrar_convite_familiar_privado(uuid, uuid, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- Reserva e conclusão ocorrem em transações distintas: nenhuma transação fica
-- aberta durante chamada de rede. Resultado incerto mantém a reserva bloqueada.
create function identidade.reservar_reenvio_familiar_privado(
  p_convite_id uuid, p_tentativa_id uuid, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ator uuid := auth_privado.uid(); v_sessao jsonb; v_convite record;
begin
  if p_convite_id is null or p_tentativa_id is null or p_request_id is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text
    or v_sessao #>> '{usuario,ativo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;
  select paciente_id, estado, tentativa_envio_id, ultima_tentativa_id, email_cifrado, acesso_revogado_em into v_convite
    from identidade.convite_familiar where id = p_convite_id for update;
  if not found or v_convite.estado = 'ativado' or v_convite.acesso_revogado_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'convite_indisponivel');
  end if;
  if v_convite.ultima_tentativa_id = p_tentativa_id then
    return jsonb_build_object('ok', false, 'codigo', 'tentativa_concluida');
  end if;
  if v_convite.tentativa_envio_id = p_tentativa_id then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), v_ator, 'reservar_reenvio_familiar', 'convite_familiar', p_convite_id, 'permitido', p_request_id);
    return jsonb_build_object('ok', true, 'repeticao', true, 'convite_id', p_convite_id, 'tentativa_id', p_tentativa_id,
      'email_cifrado', v_convite.email_cifrado);
  end if;
  if v_convite.tentativa_envio_id is not null then
    return jsonb_build_object('ok', false, 'codigo', 'envio_em_andamento');
  end if;
  update identidade.convite_familiar set tentativa_envio_id = p_tentativa_id,
    atualizado_em = clock_timestamp() where id = p_convite_id;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'reservar_reenvio_familiar', 'convite_familiar', p_convite_id, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'repeticao', false, 'convite_id', p_convite_id, 'tentativa_id', p_tentativa_id,
    'email_cifrado', v_convite.email_cifrado);
end $$;
revoke all on function identidade.reservar_reenvio_familiar_privado(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Somente resultado definitivo pode liberar a reserva; timeout não é falha
-- confirmada, pois o provedor pode ter aceitado o envio antes da interrupção.
create function identidade.concluir_reenvio_familiar_privado(
  p_convite_id uuid, p_tentativa_id uuid, p_request_id uuid, p_enviado boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ator uuid := auth_privado.uid(); v_sessao jsonb;
begin
  if p_convite_id is null or p_tentativa_id is null or p_request_id is null or p_enviado is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text
    or v_sessao #>> '{usuario,ativo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;
  update identidade.convite_familiar
    set estado = case when p_enviado then 'enviado' else 'falha' end,
      tentativa_envio_id = null, ultima_tentativa_id = p_tentativa_id, atualizado_em = clock_timestamp()
    where id = p_convite_id and tentativa_envio_id = p_tentativa_id and estado <> 'ativado';
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'tentativa_indisponivel');
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'concluir_reenvio_familiar', 'convite_familiar', p_convite_id,
      case when p_enviado then 'permitido' else 'falhou' end, p_request_id);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function identidade.concluir_reenvio_familiar_privado(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- Consulta não presume entrega: uma reserva aberta continua incerta.
create function identidade.consultar_tentativa_familiar_privada(
  p_convite_id uuid, p_tentativa_id uuid, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ator uuid := auth_privado.uid(); v_sessao jsonb; v_convite record; v_estado text;
begin
  if p_convite_id is null or p_tentativa_id is null or p_request_id is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text
    or v_sessao #>> '{usuario,ativo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;
  select estado, tentativa_envio_id, ultima_tentativa_id into v_convite
    from identidade.convite_familiar where id = p_convite_id;
  if not found then return jsonb_build_object('ok', false, 'codigo', 'convite_indisponivel'); end if;
  v_estado := case
    when v_convite.tentativa_envio_id = p_tentativa_id then 'resultado_incerto'
    when v_convite.ultima_tentativa_id = p_tentativa_id and v_convite.estado = 'ativado' then 'ativado'
    when v_convite.ultima_tentativa_id = p_tentativa_id and v_convite.estado = 'enviado' then 'enviado'
    when v_convite.ultima_tentativa_id = p_tentativa_id and v_convite.estado = 'falha' then 'falha'
    else 'tentativa_indisponivel' end;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'consultar_tentativa_familiar', 'convite_familiar', p_convite_id, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'estado', v_estado);
end $$;
revoke all on function identidade.consultar_tentativa_familiar_privada(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Decisão administrativa distinta do convite: não insere nem reabre acesso.
create function identidade.preautorizar_acesso_familiar_privado(
  p_convite_id uuid, p_acesso_id uuid, p_motivo jsonb, p_digest text, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ator uuid := auth_privado.uid(); v_sessao jsonb; v_convite record;
begin
  if p_convite_id is null or p_acesso_id is null or p_motivo is null or nullif(btrim(p_digest), '') is null or p_request_id is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text
    or v_sessao #>> '{usuario,ativo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;
  select estado, acesso_preautorizado_id, acesso_autorizado_por, digest_autorizacao, acesso_revogado_em into v_convite
    from identidade.convite_familiar where id = p_convite_id for update;
  if not found or v_convite.estado = 'ativado' or v_convite.acesso_revogado_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'convite_indisponivel');
  end if;
  if v_convite.acesso_preautorizado_id is not null and
    (v_convite.acesso_preautorizado_id is distinct from p_acesso_id
      or v_convite.acesso_autorizado_por is distinct from v_ator
      or v_convite.digest_autorizacao is distinct from p_digest) then
    return jsonb_build_object('ok', false, 'codigo', 'operacao_divergente');
  end if;
  if v_convite.acesso_preautorizado_id is null then
    update identidade.convite_familiar set acesso_preautorizado_id = p_acesso_id,
      acesso_autorizado_por = v_ator, acesso_autorizado_em = clock_timestamp(),
      motivo_acesso_cifrado = p_motivo, digest_autorizacao = p_digest, atualizado_em = clock_timestamp() where id = p_convite_id;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'preautorizar_acesso_familiar', 'convite_familiar', p_convite_id, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'convite_id', p_convite_id);
end $$;
revoke all on function identidade.preautorizar_acesso_familiar_privado(uuid, uuid, jsonb, text, uuid)
  from public, anon, authenticated, service_role;

create function identidade.cancelar_preautorizacao_familiar_privado(p_convite_id uuid, p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_ator uuid := auth_privado.uid(); v_sessao jsonb; v_convite record;
begin
  if p_convite_id is null or p_request_id is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text
    or v_sessao #>> '{usuario,ativo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;
  select estado, acesso_preautorizado_id, acesso_revogado_em into v_convite
    from identidade.convite_familiar where id = p_convite_id for update;
  if not found or v_convite.estado = 'ativado' or v_convite.acesso_preautorizado_id is null then
    return jsonb_build_object('ok', false, 'codigo', 'convite_indisponivel');
  end if;
  if v_convite.acesso_revogado_em is null then
    update identidade.convite_familiar set acesso_revogado_em = clock_timestamp(),
      acesso_revogado_por = v_ator, atualizado_em = clock_timestamp() where id = p_convite_id;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'cancelar_preautorizacao_familiar', 'convite_familiar', p_convite_id, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'convite_id', p_convite_id);
end $$;
revoke all on function identidade.cancelar_preautorizacao_familiar_privado(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Owner sem login e sem bypass de RLS. Nenhum grant de execução à aplicação.
create role ffcmapp_convite_familiar_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_convite_familiar_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_convite_familiar_owner;
grant usage on schema identidade, cadastro, auditoria, public, auth_privado to ffcmapp_convite_familiar_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), api.consultar_sessao_nativa(uuid),
  identidade.registrar_convite_familiar_privado(uuid, uuid, uuid, text, text, jsonb, jsonb),
  identidade.reservar_reenvio_familiar_privado(uuid, uuid, uuid),
  identidade.concluir_reenvio_familiar_privado(uuid, uuid, uuid, boolean),
  identidade.consultar_tentativa_familiar_privada(uuid, uuid, uuid),
  identidade.preautorizar_acesso_familiar_privado(uuid, uuid, jsonb, text, uuid),
  identidade.cancelar_preautorizacao_familiar_privado(uuid, uuid)
  to ffcmapp_convite_familiar_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_convite_familiar_owner;
grant insert (id, paciente_id, email_hmac, digest_entrada, email_cifrado, motivo_cifrado, criado_por_usuario_id)
  on identidade.convite_familiar to ffcmapp_convite_familiar_owner;
grant select (id, paciente_id, email_hmac, digest_entrada, email_cifrado, estado, criado_por_usuario_id, tentativa_envio_id, ultima_tentativa_id,
    acesso_preautorizado_id, acesso_autorizado_por, motivo_acesso_cifrado, digest_autorizacao, acesso_revogado_em),
  update (estado, tentativa_envio_id, ultima_tentativa_id, atualizado_em, acesso_preautorizado_id,
    acesso_autorizado_por, acesso_autorizado_em, motivo_acesso_cifrado, digest_autorizacao, acesso_revogado_em, acesso_revogado_por)
  on identidade.convite_familiar to ffcmapp_convite_familiar_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_convite_familiar_owner;
create policy convite_familiar_paciente_select on cadastro.paciente for select to ffcmapp_convite_familiar_owner using (true);
create policy convite_familiar_paciente_lock on cadastro.paciente for update to ffcmapp_convite_familiar_owner using (true) with check (false);
create policy convite_familiar_insert on identidade.convite_familiar for insert to ffcmapp_convite_familiar_owner
  with check (criado_por_usuario_id = (select auth_privado.uid()) and estado = 'pendente');
create policy convite_familiar_select on identidade.convite_familiar for select to ffcmapp_convite_familiar_owner
  using (true);
create policy convite_familiar_update on identidade.convite_familiar for update to ffcmapp_convite_familiar_owner
  using (estado <> 'ativado') with check (estado <> 'ativado');
create policy convite_familiar_auditoria on auditoria.evento for insert to ffcmapp_convite_familiar_owner
  with check (ator_usuario_id = (select auth_privado.uid())
    and acao in ('registrar_convite_familiar', 'reservar_reenvio_familiar', 'concluir_reenvio_familiar', 'consultar_tentativa_familiar', 'preautorizar_acesso_familiar', 'cancelar_preautorizacao_familiar')
    and tipo_objeto = 'convite_familiar');

-- Permissão mínima ao verificador pertencente a outro owner; não concede ao cliente.
select set_config('ffcmapp.convite_migrador', current_user, false);
select set_config('ffcmapp.convite_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.convite_tinha_verificador') = 'false' then
    if exists (select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
      join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
      where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_convite_familiar_owner;
reset role;
select set_config('role', current_setting('ffcmapp.convite_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.convite_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

create function api.registrar_convite_familiar_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  e jsonb := p_transporte -> 'entrada'; a jsonb := e -> 'atestado';
  ator uuid; sessao uuid; req uuid; convite uuid; paciente uuid;
  inicio timestamptz; fim timestamptz; resultado jsonb;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['convite_id', 'request_id', 'paciente_id', 'email_hmac', 'digest_entrada', 'email_cifrado', 'motivo_cifrado', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object'
    or jsonb_typeof(e -> 'email_hmac') is distinct from 'string'
    or jsonb_typeof(e -> 'digest_entrada') is distinct from 'string'
    or jsonb_typeof(e -> 'email_cifrado') is distinct from 'object'
    or jsonb_typeof(e -> 'motivo_cifrado') is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt() ->> 'session_id')::uuid;
    req := (e ->> 'request_id')::uuid; convite := (e ->> 'convite_id')::uuid;
    paciente := (e ->> 'paciente_id')::uuid;
    inicio := (a ->> 'emitido_em')::timestamptz; fim := (a ->> 'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or convite is null or paciente is null
    or inicio is null or fim is null or inicio > clock_timestamp() or fim <= clock_timestamp()
    or fim <= inicio or fim - inicio > interval '30 seconds'
    or a ->> 'usuario_id' is distinct from ator::text or a ->> 'session_id' is distinct from sessao::text
    or a ->> 'request_id' is distinct from req::text or a ->> 'operacao' is distinct from 'api.registrar_convite_familiar'
    or identidade.verificar_assinatura_atestado(p_transporte ->> 'entrada_canonica', p_transporte ->> 'dados_canonicos', e - 'atestado', a - 'mac', a ->> 'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  resultado := identidade.registrar_convite_familiar_privado(convite, req, paciente, e ->> 'email_hmac', e ->> 'digest_entrada', e -> 'email_cifrado', e -> 'motivo_cifrado');
  if fim <= clock_timestamp() then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return resultado;
end $$;
alter function api.registrar_convite_familiar_privado(jsonb) owner to ffcmapp_convite_familiar_owner;

create function api.reenvio_familiar_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  e jsonb := p_transporte -> 'entrada'; a jsonb := e -> 'atestado';
  ator uuid; sessao uuid; req uuid; convite uuid; tentativa uuid;
  inicio timestamptz; fim timestamptz; resultado jsonb; acao text;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['convite_id', 'tentativa_id', 'request_id', 'acao', 'enviado', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object'
    or jsonb_typeof(e -> 'acao') is distinct from 'string'
    or e ->> 'acao' not in ('reservar', 'concluir', 'consultar', 'cancelar_autorizacao')
    or (e ->> 'acao' in ('reservar', 'consultar', 'cancelar_autorizacao') and e ? 'enviado')
    or (e ->> 'acao' = 'concluir' and jsonb_typeof(e -> 'enviado') is distinct from 'boolean') then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt() ->> 'session_id')::uuid;
    req := (e ->> 'request_id')::uuid; convite := (e ->> 'convite_id')::uuid;
    tentativa := (e ->> 'tentativa_id')::uuid; acao := e ->> 'acao';
    inicio := (a ->> 'emitido_em')::timestamptz; fim := (a ->> 'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or convite is null or tentativa is null
    or inicio is null or fim is null or inicio > clock_timestamp() or fim <= clock_timestamp()
    or fim <= inicio or fim - inicio > interval '30 seconds'
    or a ->> 'usuario_id' is distinct from ator::text or a ->> 'session_id' is distinct from sessao::text
    or a ->> 'request_id' is distinct from req::text or a ->> 'operacao' is distinct from 'api.reenvio_familiar'
    or identidade.verificar_assinatura_atestado(p_transporte ->> 'entrada_canonica', p_transporte ->> 'dados_canonicos', e - 'atestado', a - 'mac', a ->> 'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  if acao = 'reservar' then
    resultado := identidade.reservar_reenvio_familiar_privado(convite, tentativa, req);
  elsif acao = 'concluir' then
    resultado := identidade.concluir_reenvio_familiar_privado(convite, tentativa, req, (e ->> 'enviado')::boolean);
  elsif acao = 'cancelar_autorizacao' then
    resultado := identidade.cancelar_preautorizacao_familiar_privado(convite, req);
  else
    resultado := identidade.consultar_tentativa_familiar_privada(convite, tentativa, req);
  end if;
  if fim <= clock_timestamp() then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return resultado;
end $$;
alter function api.reenvio_familiar_privado(jsonb) owner to ffcmapp_convite_familiar_owner;

create function api.preautorizar_acesso_familiar_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  e jsonb := p_transporte -> 'entrada'; a jsonb := e -> 'atestado';
  ator uuid; sessao uuid; req uuid; convite uuid; acesso uuid;
  inicio timestamptz; fim timestamptz; resultado jsonb;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['convite_id', 'acesso_id', 'motivo_cifrado', 'digest_autorizacao', 'request_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(e -> 'motivo_cifrado') is distinct from 'object'
    or jsonb_typeof(e -> 'digest_autorizacao') is distinct from 'string' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt() ->> 'session_id')::uuid;
    req := (e ->> 'request_id')::uuid; convite := (e ->> 'convite_id')::uuid; acesso := (e ->> 'acesso_id')::uuid;
    inicio := (a ->> 'emitido_em')::timestamptz; fim := (a ->> 'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or convite is null or acesso is null
    or inicio is null or fim is null or inicio > clock_timestamp() or fim <= clock_timestamp()
    or fim <= inicio or fim - inicio > interval '30 seconds'
    or a ->> 'usuario_id' is distinct from ator::text or a ->> 'session_id' is distinct from sessao::text
    or a ->> 'request_id' is distinct from req::text or a ->> 'operacao' is distinct from 'api.preautorizar_acesso_familiar'
    or identidade.verificar_assinatura_atestado(p_transporte ->> 'entrada_canonica', p_transporte ->> 'dados_canonicos', e - 'atestado', a - 'mac', a ->> 'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  resultado := identidade.preautorizar_acesso_familiar_privado(convite, acesso, e -> 'motivo_cifrado', e ->> 'digest_autorizacao', req);
  if fim <= clock_timestamp() then raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA'; end if;
  return resultado;
end $$;
alter function api.preautorizar_acesso_familiar_privado(jsonb) owner to ffcmapp_convite_familiar_owner;
set role ffcmapp_convite_familiar_owner;
revoke all on function api.registrar_convite_familiar_privado(jsonb) from public, anon, authenticated, service_role;
revoke all on function api.reenvio_familiar_privado(jsonb) from public, anon, authenticated, service_role;
revoke all on function api.preautorizar_acesso_familiar_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.convite_migrador'), false);
revoke create on schema api from ffcmapp_convite_familiar_owner;
revoke ffcmapp_convite_familiar_owner from current_user;
