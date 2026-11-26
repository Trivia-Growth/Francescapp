-- FR-007: a linha do tempo passa a enxergar a data do acontecimento e a área do diário, que
-- saíram do envelope em `20261120360000`, e ganha os filtros que o requisito pede por esses
-- dois eixos. Nada mais muda: as mesmas fontes, a mesma regra de audiência já provada e
-- nenhum envelope cifrado lido.
--
-- A assinatura ganha `p_areas` e `p_objetivo` no FIM da lista, então a função antiga é
-- substituída e os chamadores que ainda não passam os dois continuam válidos por omissão.
-- `20261120380000` atualiza o wrapper; a exportação chama por posição e é atualizada junto.

-- A leitura das colunas que saíram do envelope em `20261120360000`, concedida aqui porque
-- é aqui que a função passa a usá-las.
grant select (aconteceu_em, area)
  on cadastro.diario_registro_versao to ffcmapp_linha_tempo_owner;

select set_config('ffcmapp.migrador_linha_tempo_area', current_user, false);
grant ffcmapp_linha_tempo_owner to current_user with inherit false, set true;
-- A assinatura nova é uma função nova, então o dono precisa de CREATE no schema outra vez;
-- devolvido no fim, como em `20261120300000`.
grant create on schema cadastro to ffcmapp_linha_tempo_owner;
set role ffcmapp_linha_tempo_owner;
create or replace function cadastro.linha_tempo_caso(
  p_paciente uuid,
  p_leitor uuid,
  p_familia boolean,
  p_de timestamptz,
  p_ate timestamptz,
  p_fontes text[],
  p_autor uuid,
  p_cursor_em timestamptz,
  p_cursor_id uuid,
  p_limite integer,
  p_areas text[],
  p_objetivo uuid
) returns jsonb
language sql stable security definer set search_path = '' set row_security = on as $$
with limite as (
  select least(greatest(coalesce(p_limite, 50), 1), 200) as n
), itens as (
  -- Diário. Rascunho é privado do autor (FR-012); publicado/retificado respeita audiência.
  -- Família só alcança 'equipe_e_familia' e o que ela própria escreveu.
  select
    v.id,
    'diario'::text as fonte,
    r.tipo as subtipo,
    case
      when v.estado = 'rascunho' then 'rascunho'
      when v.estado = 'retificado' then 'retificacao'
      when v.versao > 1 then 'atualizacao'
      else 'registro'
    end as tipo_evento,
    v.criado_em as registrado_em,
    -- Em claro desde 12/11/2026 (`20261120360000`): FR-007 exige distinguir acontecimento
    -- de registro e buscar por área, e nenhuma das duas é possível sobre um envelope.
    v.aconteceu_em,
    v.criado_por_usuario_id as autor_usuario_id,
    v.audiencia,
    v.versao,
    r.id as registro_id,
    null::uuid as objetivo_id,
    v.area,
    jsonb_build_object(
      'atencao', v.atencao,
      'retorno_solicitado', v.retorno_solicitado,
      'origem_conteudo', v.origem_conteudo,
      'responde_registro_id', v.responde_registro_id,
      'tarefa_id', v.tarefa_id,
      'estado', v.estado
    ) as detalhe
  from cadastro.diario_registro r
  join cadastro.diario_registro_versao v on v.diario_registro_id = r.id
  where r.paciente_id = p_paciente
    and (
      v.estado <> 'rascunho'
      or r.autor_usuario_id = p_leitor
    )
    and (
      not p_familia
      or (v.estado <> 'rascunho' and v.audiencia = 'equipe_e_familia')
      or r.autor_usuario_id = p_leitor
    )

  union all

  -- Documento. 'removido' sai da linha do tempo; 'indisponivel' permanece e é marcado,
  -- porque FR-029/SC-010 exigem que a indisponibilidade seja identificável, não escondida.
  select
    v.id, 'documento', null,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, v.data_documento, v.criado_por_usuario_id, v.audiencia, v.versao,
    v.documento_id, null::uuid, v.categoria,
    jsonb_build_object('estado', v.estado, 'origem', v.origem)
  from cadastro.documento_caso_versao v
  where v.paciente_id = p_paciente
    and v.estado <> 'removido'
    and (not p_familia or v.audiencia = 'equipe_e_familia')

  union all

  select v.id, 'anamnese', null,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, v.paciente_id,
    null::uuid, null::text, '{}'::jsonb
  from cadastro.anamnese_versao v where v.paciente_id = p_paciente and not p_familia

  union all

  select v.id, 'saude', null,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, v.paciente_id,
    null::uuid, null::text, '{}'::jsonb
  from cadastro.saude_versao v where v.paciente_id = p_paciente and not p_familia

  union all

  select v.id, 'contexto', null,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, v.paciente_id,
    null::uuid, null::text, '{}'::jsonb
  from cadastro.contexto_cuidado_versao v where v.paciente_id = p_paciente and not p_familia

  union all

  select v.id, 'rede', null,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, v.paciente_id,
    null::uuid, null::text, '{}'::jsonb
  from cadastro.rede_cuidado_versao v where v.paciente_id = p_paciente and not p_familia

  union all

  select a.id, 'situacao', a.situacao,
    case when a.versao > 1 then 'atualizacao' else 'registro' end,
    a.criado_em, null, a.ator_usuario_id, 'equipe', a.versao, a.paciente_id,
    null::uuid, null::text,
    jsonb_build_object('situacao', a.situacao, 'responsavel_usuario_id', a.responsavel_usuario_id)
  from cadastro.acompanhamento_caso a where a.paciente_id = p_paciente and not p_familia

  union all

  select v.id, 'objetivo', null,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, o.id,
    o.id, null::text, '{}'::jsonb
  from cadastro.objetivo_cuidado o
  join cadastro.objetivo_cuidado_versao v on v.objetivo_id = o.id
  where o.paciente_id = p_paciente and not p_familia

  union all

  select v.id, 'tarefa', null,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, t.id,
    null::uuid, null::text, '{}'::jsonb
  from cadastro.tarefa_cuidado t
  join cadastro.tarefa_cuidado_versao v on v.tarefa_id = t.id
  where t.paciente_id = p_paciente and not p_familia

  union all

  select v.id, 'encaminhamento', v.etapa,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, e.id,
    null::uuid, null::text, jsonb_build_object('etapa', v.etapa)
  from cadastro.encaminhamento e
  join cadastro.encaminhamento_versao v on v.encaminhamento_id = e.id
  where e.paciente_id = p_paciente and not p_familia

  union all

  select v.id, 'orientacao', v.situacao,
    case when v.versao > 1 then 'atualizacao' else 'registro' end,
    v.criado_em, null, v.criado_por_usuario_id, 'equipe', v.versao, o.id,
    null::uuid, null::text, jsonb_build_object('situacao', v.situacao)
  from cadastro.orientacao o
  join cadastro.orientacao_versao v on v.orientacao_id = o.id
  where o.paciente_id = p_paciente and not p_familia

  union all

  -- Pendência: a tratativa é o evento; a origem continua onde está (FR-027).
  select t.id, 'pendencia', t.tipo, 'registro',
    t.criado_em, null, t.ator_usuario_id, 'equipe', 1, t.id,
    null::uuid, null::text,
    jsonb_build_object('tipo', t.tipo, 'acao', t.acao, 'chave_origem', t.chave_origem,
      'atribuido_usuario_id', t.atribuido_usuario_id)
  from cadastro.pendencia_tratativa t where t.paciente_id = p_paciente and not p_familia
), filtrados as (
  select i.* from itens i
  where (p_de is null or i.registrado_em >= p_de)
    and (p_ate is null or i.registrado_em < p_ate)
    and (p_fontes is null or i.fonte = any (p_fontes))
    and (p_autor is null or i.autor_usuario_id = p_autor)
    and (p_areas is null or i.area = any (p_areas))
    and (p_objetivo is null or i.objetivo_id = p_objetivo)
    and (
      p_cursor_em is null or p_cursor_id is null
      or (i.registrado_em, i.id) < (p_cursor_em, p_cursor_id)
    )
), pagina as (
  select f.* from filtrados f
  order by f.registrado_em desc, f.id desc
  limit (select n + 1 from limite)
), cortada as (
  select p.*, row_number() over (order by p.registrado_em desc, p.id desc) as linha from pagina p
)
select jsonb_build_object(
  'itens', coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'fonte', c.fonte,
      'subtipo', c.subtipo,
      'tipo_evento', c.tipo_evento,
      'registrado_em', c.registrado_em,
      'aconteceu_em', c.aconteceu_em,
      'autor_usuario_id', c.autor_usuario_id,
      'audiencia', c.audiencia,
      'versao', c.versao,
      'registro_id', c.registro_id,
      'objetivo_id', c.objetivo_id,
      'area', c.area,
      'detalhe', c.detalhe
    ) order by c.registrado_em desc, c.id desc
  ) filter (where c.linha <= (select n from limite)), '[]'::jsonb),
  'proximo_cursor', (
    select jsonb_build_object('registrado_em', x.registrado_em, 'id', x.id)
    from cortada x where x.linha = (select n from limite)
      and exists (select 1 from cortada y where y.linha = (select n + 1 from limite))
  )
)
from cortada c
$$;
revoke all on function cadastro.linha_tempo_caso(uuid, uuid, boolean, timestamptz, timestamptz, text[], uuid, timestamptz, uuid, integer, text[], uuid)
  from public, anon, authenticated, service_role;
-- A assinatura antiga deixa de existir: manter as duas conviveria com chamadas ambíguas e
-- com um caminho que ignora silenciosamente os filtros novos. O drop acontece como o
-- próprio dono, que é quem tem o privilégio.
drop function cadastro.linha_tempo_caso(uuid, uuid, boolean, timestamptz, timestamptz, text[], uuid, timestamptz, uuid, integer);
reset role;
select set_config('role', current_setting('ffcmapp.migrador_linha_tempo_area'), false);
revoke create on schema cadastro from ffcmapp_linha_tempo_owner;
revoke ffcmapp_linha_tempo_owner from current_user;
