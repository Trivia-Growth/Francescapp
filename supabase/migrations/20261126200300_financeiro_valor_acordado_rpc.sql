-- FR-068/FR-039: RPC privada de criar, alterar e ler o valor acordado, com auditoria
-- obrigatória na mesma transação.
--
-- Design D2 em uma frase: não existe RPC que devolva o valor a quem não tem audiência
-- financeira, e o valor não é coluna de nenhum retorno de cadastro, escala ou turno. O
-- profissional não lê o próprio valor por ausência de caminho, não por filtro de serialização.
--
-- Alterar é registrar: fecha a ponta aberta da vigência corrente e grava uma vigência nova.
-- A anterior continua consultável com autor, data e motivo; o gatilho de imutabilidade da
-- tabela recusa qualquer outra forma de UPDATE e todo DELETE.
create role ffcmapp_financeiro_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_financeiro_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_financeiro_owner;
grant usage on schema public, operacao, auditoria, auth_privado, financeiro to ffcmapp_financeiro_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes() to ffcmapp_financeiro_owner;
grant select (id) on public.usuario to ffcmapp_financeiro_owner;
grant select, insert, update (vigencia, encerrada_em, encerrada_por_usuario_id) on financeiro.valor_acordado_turno to ffcmapp_financeiro_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_financeiro_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_financeiro_owner;
-- Prova estrutural do design D1: este papel NÃO recebe select em cadastro.acesso_paciente,
-- cadastro.paciente, cadastro.turno nem em qualquer tabela clínica. A audiência financeira
-- não alcança conteúdo de saúde porque o privilégio não existe.
create policy financeiro_owner_usuario on public.usuario for select to ffcmapp_financeiro_owner using (id = (select auth_privado.uid()));
create policy financeiro_owner_valor_acordado on financeiro.valor_acordado_turno to ffcmapp_financeiro_owner using (true) with check (true);
create policy financeiro_owner_requisicao on operacao.requisicao to ffcmapp_financeiro_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao like 'api.%valor_acordado') with check (ator_usuario_id = (select auth_privado.uid()) and operacao like 'api.%valor_acordado');
create policy financeiro_owner_auditoria on auditoria.evento for insert to ffcmapp_financeiro_owner with check (ator_usuario_id = (select auth_privado.uid()));

create function operacao.financeiro_valor_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada';
  ctx jsonb; ator uuid; sessao uuid; req uuid; acao text; fim timestamptz;
  auditoria_id uuid; alvo uuid; profissional uuid; corte date; faixa daterange;
  anterior operacao.requisicao; repeticao boolean := false; conflito boolean := false;
  resultado jsonb; prev financeiro.valor_acordado_turno;
begin
  ctx := operacao.financeiro_atestado_privada(p_transporte, array[
    'api.registrar_valor_acordado', 'api.alterar_valor_acordado', 'api.consultar_valor_acordado']);
  if ctx is null then raise exception using errcode = '42501', message = 'SEM_PERMISSAO'; end if;
  ator := (ctx->>'ator')::uuid; sessao := (ctx->>'sessao')::uuid;
  req := (ctx->>'request_id')::uuid; acao := ctx->>'operacao';
  fim := (ctx->>'expira_em')::timestamptz;
  -- Audiência financeira própria. Nenhum vínculo de caso é consultado (design D1).
  if not operacao.financeiro_audiencia_privada(ator, sessao) then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'valor_acordado', null, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;

  if acao = 'api.consultar_valor_acordado' then
    if e - array['request_id', 'profissional_usuario_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    begin profissional := (e->>'profissional_usuario_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA'; end;
    if profissional is null then raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA'; end if;
    -- Histórico completo: a vigência anterior permanece consultável (FR-068).
    select coalesce(jsonb_agg(jsonb_build_object(
        'valor_id', v.id, 'profissional_usuario_id', v.profissional_usuario_id,
        'valor_turno_centavos', v.valor_turno_centavos,
        'vigencia', jsonb_build_object('inicio', lower(v.vigencia), 'fim', upper(v.vigencia)),
        'motivo_cifrado', v.motivo_cifrado, 'autor_usuario_id', v.autor_usuario_id,
        'registrado_em', v.registrado_em)
      order by lower(v.vigencia), v.id), '[]'::jsonb)
      into resultado
      from (select q.* from financeiro.valor_acordado_turno q
        where q.profissional_usuario_id = profissional
        order by lower(q.vigencia), q.id limit 500) v;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'valor_acordado', profissional, 'permitido', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;

  if acao = 'api.registrar_valor_acordado' then
    if e - array['request_id', 'valor_id', 'profissional_usuario_id', 'valor_turno_centavos',
      'vigencia_inicio', 'vigencia_fim', 'motivo_cifrado', 'chave_idempotencia',
      'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  else
    if e - array['request_id', 'valor_id', 'profissional_usuario_id', 'valor_turno_centavos',
      'vigencia_anterior_id', 'vigente_a_partir_de', 'motivo_cifrado', 'chave_idempotencia',
      'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  end if;
  begin
    alvo := (e->>'valor_id')::uuid; profissional := (e->>'profissional_usuario_id')::uuid;
    auditoria_id := (e->>'auditoria_id')::uuid;
    if acao = 'api.registrar_valor_acordado' then
      faixa := daterange((e->>'vigencia_inicio')::date, (e->>'vigencia_fim')::date, '[)');
    else
      corte := (e->>'vigente_a_partir_de')::date;
      faixa := daterange(corte, null, '[)');
    end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or data_exception then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end;
  -- Nenhuma duração, nenhum valor-hora: só o valor do turno realizado (FR-068).
  if alvo is null or profissional is null or auditoria_id is null
    or jsonb_typeof(e->'valor_turno_centavos') is distinct from 'number'
    or coalesce(e->>'valor_turno_centavos', '') !~ '^[1-9][0-9]*$'
    or (e->>'valor_turno_centavos')::bigint > 1000000000
    or jsonb_typeof(e->'motivo_cifrado') is distinct from 'object'
    or faixa is null or isempty(faixa) or lower(faixa) is null
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or (acao = 'api.alterar_valor_acordado' and (e->>'vigencia_anterior_id') is null) then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;

  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, acao, e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator
      and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia'
      or anterior.estado is distinct from 'concluida' or anterior.resultado_id is distinct from alvo
      or not exists(select 1 from financeiro.valor_acordado_turno v where v.id = alvo) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'valor_acordado', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    if acao = 'api.alterar_valor_acordado' then
      select * into prev from financeiro.valor_acordado_turno v
        where v.id = (e->>'vigencia_anterior_id')::uuid
          and v.profissional_usuario_id = profissional
          and v.encerrada_em is null and upper(v.vigencia) is null for update;
      if not found or corte <= lower(prev.vigencia) then
        conflito := true;
      else
        update financeiro.valor_acordado_turno
          set vigencia = daterange(lower(vigencia), corte, '[)'),
            encerrada_em = clock_timestamp(), encerrada_por_usuario_id = ator
          where id = prev.id;
      end if;
    end if;
    if not conflito then
      -- A recusa de vigência sobreposta vem da exclusion constraint, não de checagem prévia:
      -- é a única forma de recusar duas escritas realmente concorrentes (design D4).
      begin
        insert into financeiro.valor_acordado_turno(id, profissional_usuario_id, valor_turno_centavos, vigencia, motivo_cifrado, autor_usuario_id)
          values(alvo, profissional, (e->>'valor_turno_centavos')::bigint, faixa, e->'motivo_cifrado', ator);
      exception when exclusion_violation or unique_violation or check_violation or foreign_key_violation then
        conflito := true;
      end;
    end if;
    if conflito then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'valor_acordado', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'valor_acordado', alvo, 'permitido', req);
  if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object(
      'valor_id', v.id, 'profissional_usuario_id', v.profissional_usuario_id,
      'valor_turno_centavos', v.valor_turno_centavos,
      'vigencia', jsonb_build_object('inicio', lower(v.vigencia), 'fim', upper(v.vigencia)),
      'motivo_cifrado', v.motivo_cifrado, 'autor_usuario_id', v.autor_usuario_id,
      'registrado_em', v.registrado_em)
    into resultado from financeiro.valor_acordado_turno v where v.id = alvo;
  return jsonb_build_object('ok', true, 'repeticao', repeticao, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.financeiro_valor_privada(jsonb) from public, anon, authenticated, service_role;

create function api.financeiro_valor_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; alvo uuid; acao text;
begin
  begin
    return operacao.financeiro_valor_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    alvo := (p_transporte#>>'{entrada,valor_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'valor_acordado', alvo, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.financeiro_valor_privado(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.financeiro_valor_privada(jsonb) to ffcmapp_financeiro_owner;
alter function api.financeiro_valor_privado(jsonb) owner to ffcmapp_financeiro_owner;

-- EXECUTE dos auxiliares pertence ao owner da audiência; conceder exige assumir aquele papel.
select set_config('ffcmapp.financeiro_valor_migrador', current_user, false);
select set_config('ffcmapp.financeiro_valor_tinha_audiencia', pg_has_role(current_user, 'ffcmapp_financeiro_audiencia_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.financeiro_valor_tinha_audiencia') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_financeiro_audiencia_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_AUDIENCIA_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_financeiro_audiencia_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_financeiro_audiencia_owner;
grant execute on function operacao.financeiro_atestado_privada(jsonb, text[]), operacao.financeiro_audiencia_privada(uuid, uuid) to ffcmapp_financeiro_owner;
reset role;
select set_config('role', current_setting('ffcmapp.financeiro_valor_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.financeiro_valor_tinha_audiencia') = 'false' then
    execute format('revoke ffcmapp_financeiro_audiencia_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_financeiro_owner;
revoke all on function api.financeiro_valor_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.financeiro_valor_migrador'), false);
revoke create on schema api from ffcmapp_financeiro_owner;
revoke ffcmapp_financeiro_owner from current_user;
