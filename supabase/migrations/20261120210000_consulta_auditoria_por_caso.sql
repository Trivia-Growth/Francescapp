-- FR-039, continuação de 20261119300000. Aquela migration registrou, na nota 3 do topo, que não
-- havia filtro por caso e que a decisão ficava pendente do solicitante. Ele decidiu em
-- 12/11/2026: gravar o caso no evento. `20261120200000` criou a coluna e o gatilho; aqui a
-- consulta passa a filtrar e a devolver o campo.
--
-- O controle de coluna de 20261119300000 continua inteiro: este owner ganha `paciente_id`, que é
-- IDENTIFICADOR de caso, e não conteúdo. `motivo_cifrado` e `request_id` seguem fora do grant —
-- mesmo que esta função tivesse defeito, o envelope cifrado não é alcançável por este caminho.
-- Nada foi concedido sobre `cadastro.paciente` ou qualquer tabela de domínio: o nome do caso não
-- é resolvido aqui, e a tela correlaciona o identificador com a carteira que o usuário já pode
-- ver por outro caminho autorizado.
grant select (paciente_id) on auditoria.evento to ffcmapp_consulta_auditoria_owner;

create or replace function operacao.consultar_auditoria_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false;
  limite integer; cursor_id uuid; cursor_instante timestamptz;
  filtro_ator uuid; filtro_objeto uuid; filtro_acao text; filtro_resultado text;
  filtro_paciente uuid;
  de timestamptz; ate timestamptz; pagina jsonb;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'limite', 'cursor', 'ator_id', 'objeto_id', 'paciente_id', 'acao',
      'resultado', 'instante_de', 'instante_ate', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object'
    or jsonb_typeof(e->'limite') is distinct from 'number'
    or coalesce(e->>'limite', '') !~ '^(100|[1-9][0-9]?)$'
    or (e ? 'cursor' and jsonb_typeof(e->'cursor') is distinct from 'string')
    or (e ? 'ator_id' and jsonb_typeof(e->'ator_id') is distinct from 'string')
    or (e ? 'objeto_id' and jsonb_typeof(e->'objeto_id') is distinct from 'string')
    or (e ? 'paciente_id' and jsonb_typeof(e->'paciente_id') is distinct from 'string')
    or (e ? 'acao' and (jsonb_typeof(e->'acao') is distinct from 'string'
      or coalesce(length(btrim(e->>'acao')) between 1 and 120, false) is not true))
    or (e ? 'resultado' and (jsonb_typeof(e->'resultado') is distinct from 'string'
      or e->>'resultado' not in ('permitido', 'negado', 'falhou')))
    or (e ? 'instante_de' and jsonb_typeof(e->'instante_de') is distinct from 'string')
    or (e ? 'instante_ate' and jsonb_typeof(e->'instante_ate') is distinct from 'string') then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    limite := (e->>'limite')::integer;
    filtro_acao := btrim(e->>'acao'); filtro_resultado := e->>'resultado';
    if e ? 'cursor' then cursor_id := (e->>'cursor')::uuid; end if;
    if e ? 'ator_id' then filtro_ator := (e->>'ator_id')::uuid; end if;
    if e ? 'objeto_id' then filtro_objeto := (e->>'objeto_id')::uuid; end if;
    if e ? 'paciente_id' then filtro_paciente := (e->>'paciente_id')::uuid; end if;
    if e ? 'instante_de' then de := (e->>'instante_de')::timestamptz; end if;
    if e ? 'instante_ate' then ate := (e->>'instante_ate')::timestamptz; end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or a->>'operacao' is distinct from 'api.consultar_auditoria'
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio
    or fim - inicio > interval '30 seconds'
    or (de is not null and ate is not null and de > ate)
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Bloco de autorização admin-only idêntico ao de operacao.listar_concessoes_equipe_privado.
  -- Nenhuma alteração de lógica em relação ao original.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
      select i.provider_id, i.identity_data into google from auth_privado.identidades() i where i.user_id = ator and i.provider = 'google'
        and bloqueios_auth.travar(ator, sessao)
        and exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()))
        and (select count(*) from auth_privado.identidades() j where j.user_id = ator and j.provider = 'google') = 1;
      if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true' and google.identity_data#>>'{custom_claims,hd}' = dominio then
        select c.id, c.subject_google into concessao, sujeito from identidade.concessao_equipe c
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.perfil = 'administrador' for share;
        if found and sujeito = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
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
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  -- O cursor é um evento da própria trilha. Resolver o instante aqui (em vez de confiar num
  -- cursor opaco com data embutida) impede que a tela peça uma janela que o filtro não cobre.
  if autorizado and cursor_id is not null then
    select v.instante into cursor_instante from auditoria.evento v where v.id = cursor_id;
    autorizado := found;
  end if;
  if autorizado then
    with s as (
      select v.id, v.instante, v.ator_usuario_id, v.ator_auth_id, v.operador_restrito,
        v.acao, v.tipo_objeto, v.objeto_id, v.paciente_id, v.resultado
      from auditoria.evento v
      where (filtro_ator is null or v.ator_usuario_id = filtro_ator or v.ator_auth_id = filtro_ator)
        and (filtro_objeto is null or v.objeto_id = filtro_objeto)
        -- Evento sem caso nunca entra num filtro por caso. Eventos anteriores a
        -- 20261120200000 têm `paciente_id` nulo e, por isso, também não entram: a tela avisa.
        and (filtro_paciente is null or v.paciente_id = filtro_paciente)
        and (filtro_acao is null or v.acao = filtro_acao)
        and (filtro_resultado is null or v.resultado = filtro_resultado)
        and (de is null or v.instante >= de)
        and (ate is null or v.instante <= ate)
        and (cursor_id is null or (v.instante, v.id) < (cursor_instante, cursor_id))
      order by v.instante desc, v.id desc limit limite + 1),
    n as (select *, row_number() over(order by instante desc, id desc) ordem from s)
    select jsonb_build_object('itens', coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'instante', n.instante, 'ator_usuario_id', n.ator_usuario_id,
      'ator_auth_id', n.ator_auth_id, 'operador_restrito', n.operador_restrito,
      'acao', n.acao, 'tipo_objeto', n.tipo_objeto, 'objeto_id', n.objeto_id,
      'paciente_id', n.paciente_id,
      'resultado', n.resultado) order by instante desc, id desc) filter(where ordem <= limite), '[]'::jsonb),
      'proximo_cursor', case when count(*) > limite then max(id::text) filter(where ordem = limite) end)
      into pagina from n;
  end if;
  autorizado := autorizado and fim > clock_timestamp() and exists(select 1 from auth_privado.sessoes() s
    where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()));
  -- A consulta da auditoria é ela própria auditada (FR-039 manda registrar "consultas"). Quando
  -- a consulta é POR CASO, o próprio evento da consulta fica rotulado com esse caso — é o que o
  -- investigador precisa ver ao auditar quem auditou.
  if exists(select 1 from public.usuario where id = ator) then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, paciente_id, resultado, request_id)
      values(gen_random_uuid(), ator, 'api.consultar_auditoria', 'evento', null, filtro_paciente,
        case when autorizado then 'permitido' else 'negado' end, req);
  end if;
  if not autorizado then
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return jsonb_build_object('ok', true, 'dados', pagina, 'request_id', req);
end $$;

-- O insert acima nomeia `paciente_id` explicitamente, então agora o privilégio de coluna é
-- exigido de verdade (o gatilho só dispensa quem NÃO nomeia a coluna). Sem este grant, toda
-- consulta de auditoria falharia ao gravar o próprio evento.
grant insert (paciente_id) on auditoria.evento to ffcmapp_consulta_auditoria_owner;
