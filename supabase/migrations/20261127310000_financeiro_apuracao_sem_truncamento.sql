begin;
-- Impede que a apuração de repasse devolva um total silenciosamente errado.
--
-- Achado em 20/11/2026, durante o levantamento do que deveria ser configurável: a consulta
-- de `operacao.financeiro_apuracao_privada` varre turnos com `limit 1000` e em seguida
-- SOMA as linhas para formar o total do período. Acima de 1000 turnos o excedente era
-- descartado sem sinal nenhum, e o total saía menor que o devido — sem erro, sem aviso e
-- sem cursor que permitisse perceber.
--
-- Mil turnos é muito (cerca de três anos de plantão diário), então isto não é um defeito
-- provável; é um defeito grave. FR-070 exige que a conta seja reconstituível, e um total
-- truncado em silêncio não é.
--
-- A correção é deliberadamente conservadora: recusar com `PERIODO_EXCEDE_APURACAO` e pedir
-- período menor, em vez de devolver número parcial. Nenhuma outra linha da função muda, e
-- nenhum privilégio é alterado — `create or replace` preserva dono e ACL.

create or replace function operacao.financeiro_apuracao_privada(p_transporte jsonb) returns jsonb
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
  -- Teto de varredura: a consulta abaixo usa `limit 1000`, e o total é a SOMA dessas
  -- linhas. Sem esta guarda, um período com mais de 1000 turnos produziria um total
  -- silenciosamente MENOR que o devido — o pior modo de falha possível para um número de
  -- pagamento. Recusar e pedir período menor é honesto; truncar e somar não é.
  if (select count(*) from cadastro.turno t
        where t.profissional_usuario_id = profissional
          and ((t.situacao = 'encerrado' and t.encerrado_em >= inicio::timestamptz
                and t.encerrado_em < (fim_periodo + 1)::timestamptz)
            or (t.situacao = 'aberto' and t.encerrado_em is null
                and t.aberto_em >= inicio::timestamptz
                and t.aberto_em < (fim_periodo + 1)::timestamptz))) > 1000 then
    raise exception using errcode = '22023', message = 'PERIODO_EXCEDE_APURACAO';
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

commit;
