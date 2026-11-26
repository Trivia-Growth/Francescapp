-- FR-070 / design D3 e D6: apuração de repasse como CONSULTA DERIVADA de turnos encerrados.
--
-- Nada é gravado: não existe tabela de apuração e o papel dono não tem INSERT, UPDATE nem
-- DELETE em `cadastro.turno`. "A apuração não altera o turno" é privilégio ausente, não
-- disciplina de quem escreve a função. Pelo mesmo motivo uma retificação de turno aparece
-- sozinha na apuração seguinte: não há número congelado para divergir dela.
--
-- O retorno carrega sempre o instante da consulta, e a forma é a da união discriminada do
-- contrato (`origem: 'consulta_aberta'`): quando o solicitante decidir ciclo travado, o
-- fechamento gravado entra como origem nova, sem quebrar esta.
--
-- Design D6, garantido por grant de coluna: este papel lê de `cadastro.turno` apenas
-- id, profissional, aberto_em, encerrado_em, situacao e versao. `paciente_id` e `parametros`
-- são conteúdo de cuidado e o privilégio simplesmente não existe — a Fabiana tem audiência
-- sobre todos os casos, e um retorno descuidado lhe daria conteúdo de saúde de todos eles.
create role ffcmapp_financeiro_apuracao_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_financeiro_apuracao_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_financeiro_apuracao_owner;
grant usage on schema public, cadastro, operacao, auditoria, auth_privado, financeiro to ffcmapp_financeiro_apuracao_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes() to ffcmapp_financeiro_apuracao_owner;
grant select (id) on public.usuario to ffcmapp_financeiro_apuracao_owner;
grant select (id, profissional_usuario_id, valor_turno_centavos, vigencia) on financeiro.valor_acordado_turno to ffcmapp_financeiro_apuracao_owner;
grant select (id, profissional_usuario_id, aberto_em, encerrado_em, situacao, versao) on cadastro.turno to ffcmapp_financeiro_apuracao_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_financeiro_apuracao_owner;
create policy financeiro_apuracao_usuario on public.usuario for select to ffcmapp_financeiro_apuracao_owner using (id = (select auth_privado.uid()));
create policy financeiro_apuracao_valor on financeiro.valor_acordado_turno for select to ffcmapp_financeiro_apuracao_owner using (true);
create policy financeiro_apuracao_turno on cadastro.turno for select to ffcmapp_financeiro_apuracao_owner using (true);
create policy financeiro_apuracao_auditoria on auditoria.evento for insert to ffcmapp_financeiro_apuracao_owner with check (ator_usuario_id = (select auth_privado.uid()));

-- A apuração varre turnos de um profissional por data de encerramento; o índice parcial
-- existente é por turno ABERTO e não serve a esta varredura.
create index turno_profissional_encerrado_idx on cadastro.turno (profissional_usuario_id, encerrado_em)
  where situacao = 'encerrado';

create function operacao.financeiro_apuracao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada';
  ctx jsonb; ator uuid; sessao uuid; req uuid; acao text;
  profissional uuid; inicio date; fim_periodo date; consultado_em timestamptz;
  linhas jsonb; total bigint; pendentes integer;
begin
  ctx := operacao.financeiro_atestado_privada(p_transporte, array[
    'api.executar_apuracao_repasse', 'api.consultar_apuracao_repasse', 'api.exportar_apuracao_repasse']);
  if ctx is null then raise exception using errcode = '42501', message = 'SEM_PERMISSAO'; end if;
  ator := (ctx->>'ator')::uuid; sessao := (ctx->>'sessao')::uuid;
  req := (ctx->>'request_id')::uuid; acao := ctx->>'operacao';
  -- Negativa de audiência vale inclusive para o próprio profissional apurado (FR-070).
  if not operacao.financeiro_audiencia_privada(ator, sessao) then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'apuracao_repasse', null, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if e - array['request_id', 'profissional_usuario_id', 'periodo_inicio', 'periodo_fim', 'atestado'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  begin
    profissional := (e->>'profissional_usuario_id')::uuid;
    inicio := (e->>'periodo_inicio')::date; fim_periodo := (e->>'periodo_fim')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end;
  if profissional is null or inicio is null or fim_periodo is null or fim_periodo < inicio then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  consultado_em := clock_timestamp();
  -- Cada linha referencia o turno e a vigência aplicada, para que o total seja reconstituível.
  -- Turno encerrado sem vigência aplicável NÃO recebe valor presumido: vira pendência de valor.
  with alcance as (
    select t.id, t.profissional_usuario_id, t.situacao, t.encerrado_em
      from cadastro.turno t
      where t.profissional_usuario_id = profissional
        and ((t.situacao = 'encerrado' and t.encerrado_em >= inicio::timestamptz
              and t.encerrado_em < (fim_periodo + 1)::timestamptz)
          or (t.situacao = 'aberto' and t.encerrado_em is null
              and t.aberto_em >= inicio::timestamptz and t.aberto_em < (fim_periodo + 1)::timestamptz))
      order by coalesce(t.encerrado_em, t.aberto_em), t.id
      limit 1000
  ), linha as (
    select a.id, a.situacao, a.encerrado_em, v.id vigencia_id, v.valor_turno_centavos
      from alcance a
      left join financeiro.valor_acordado_turno v
        on a.situacao = 'encerrado'
        and v.profissional_usuario_id = a.profissional_usuario_id
        and v.vigencia @> a.encerrado_em::date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'situacao', case when l.situacao = 'aberto' then 'pendente_resolucao'
        when l.vigencia_id is null then 'pendente_valor' else 'apurada' end,
      'turno_id', l.id,
      'profissional_usuario_id', profissional,
      'data', case when l.situacao = 'aberto' then null else to_jsonb(l.encerrado_em) end,
      'valor_centavos', l.valor_turno_centavos,
      'vigencia_id', l.vigencia_id)
    order by coalesce(l.encerrado_em, 'infinity'::timestamptz), l.id), '[]'::jsonb),
    coalesce(sum(l.valor_turno_centavos) filter (where l.vigencia_id is not null), 0),
    count(*) filter (where l.situacao = 'aberto' or l.vigencia_id is null)
    into linhas, total, pendentes
    from linha l;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(gen_random_uuid(), ator, acao, 'apuracao_repasse', profissional, 'permitido', req);
  if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok', true, 'request_id', req, 'dados', jsonb_build_object(
    'origem', 'consulta_aberta', 'consultado_em', consultado_em,
    'profissional_usuario_id', profissional, 'periodo_inicio', inicio, 'periodo_fim', fim_periodo,
    'linhas', linhas, 'total_centavos', total, 'pendentes', pendentes));
end $$;
revoke all on function operacao.financeiro_apuracao_privada(jsonb) from public, anon, authenticated, service_role;

create function api.financeiro_apuracao_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
begin
  return operacao.financeiro_apuracao_privada(p_transporte);
end $$;
revoke all on function api.financeiro_apuracao_privado(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.financeiro_apuracao_privada(jsonb) to ffcmapp_financeiro_apuracao_owner;
alter function api.financeiro_apuracao_privado(jsonb) owner to ffcmapp_financeiro_apuracao_owner;

select set_config('ffcmapp.financeiro_apuracao_migrador', current_user, false);
select set_config('ffcmapp.financeiro_apuracao_tinha_audiencia', pg_has_role(current_user, 'ffcmapp_financeiro_audiencia_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.financeiro_apuracao_tinha_audiencia') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_financeiro_audiencia_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_AUDIENCIA_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_financeiro_audiencia_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_financeiro_audiencia_owner;
grant execute on function operacao.financeiro_atestado_privada(jsonb, text[]), operacao.financeiro_audiencia_privada(uuid, uuid) to ffcmapp_financeiro_apuracao_owner;
reset role;
select set_config('role', current_setting('ffcmapp.financeiro_apuracao_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.financeiro_apuracao_tinha_audiencia') = 'false' then
    execute format('revoke ffcmapp_financeiro_audiencia_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_financeiro_apuracao_owner;
revoke all on function api.financeiro_apuracao_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.financeiro_apuracao_migrador'), false);
revoke create on schema api from ffcmapp_financeiro_apuracao_owner;
revoke ffcmapp_financeiro_apuracao_owner from current_user;
