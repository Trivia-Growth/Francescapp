-- FR-007: derivador da linha do tempo do caso. Esta migration cria só o papel dono e a
-- função que agrega metadado; a autorização, a auditoria e a exposição HTTP ficam na
-- migration seguinte.
--
-- Decisões registradas aqui porque o requisito depende delas:
--
-- 1. A linha do tempo NÃO é tabela. É derivada das fatias existentes a cada leitura, no
--    mesmo desenho de `cadastro.sinal_operacional_caso`: nenhum gerador grava linha, nada
--    precisa ser reconciliado quando uma fatia muda, e não existe cópia de conteúdo fora
--    da sua origem. Cada VERSÃO é um item: é assim que "sem apagar a versão anterior"
--    (FR-012) aparece na linha do tempo sem esforço adicional.
--
-- 2. `tipo_evento` distingue o que o requisito manda distinguir:
--    - 'registro'    : primeira versão de um registro;
--    - 'atualizacao' : versão seguinte de uma fatia versionada comum;
--    - 'retificacao' : versão de diário com estado 'retificado', que é a retificação no
--                      sentido de FR-012 — substitui a publicada sem apagá-la;
--    - 'rascunho'    : versão de diário ainda privada do autor.
--
-- 3. ACONTECIMENTO vs REGISTRO — limitação real, não esquecimento. `registrado_em` existe
--    em todas as fontes (`criado_em`). `aconteceu_em` só existe em claro onde a própria
--    fatia o pôs em claro: `cadastro.documento_caso_versao.data_documento`. No diário, a
--    data do acontecimento viaja DENTRO do envelope cifrado por decisão registrada em
--    `20261118200000`, e o banco não a vê. Pôr essa data em claro só para alimentar este
--    derivador ampliaria o que o banco sabe sobre o caso — é a mesma razão pela qual o
--    prazo da tarefa ficou fora do derivador de pendências. Quando `aconteceu_em` é nulo,
--    a linha do tempo diz "data do acontecimento no conteúdo", e quem já decifra o item
--    (o cliente da ficha) refina ali. A decisão de expor essa data em claro é do
--    solicitante, não deste derivador.
--
-- 4. ÁREA, idem. FR-007 pede busca por área; no diário a categoria/área viaja cifrada. O
--    único eixo de área em claro hoje é `documento_caso_versao.categoria`. Está exposto
--    como `area` para documentos e nulo nas demais fontes, sem fingir cobertura.
--
-- 5. AUDIÊNCIA é a mais estrita das fontes, como na fatia de pendências. Família enxerga
--    exclusivamente diário publicado/retificado com audiência 'equipe_e_familia' (mais o
--    que ela própria escreveu) e documento com audiência 'equipe_e_familia' — nenhuma das
--    outras fatias tem audiência familiar hoje, e este derivador não inventa uma. Item que
--    a pessoa não pode ver não aparece NEM COMO METADADO: ele é descartado no WHERE, não
--    mascarado depois.
--
-- 6. Nenhum envelope cifrado é lido. Os grants abaixo são por coluna exatamente para que
--    isso seja garantido por privilégio, não por disciplina de quem escreve a consulta.
--
-- Reversão: drop function cadastro.linha_tempo_caso(uuid, uuid, boolean, timestamptz,
-- timestamptz, text[], uuid, timestamptz, uuid, integer); nenhuma tabela é criada.

select set_config('ffcmapp.migrador_linha_tempo', current_user, false);
create role ffcmapp_linha_tempo_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_linha_tempo_owner to current_user with inherit false, set true;
grant usage, create on schema cadastro to ffcmapp_linha_tempo_owner;

grant select (id, paciente_id, tipo, autor_usuario_id, criado_em)
  on cadastro.diario_registro to ffcmapp_linha_tempo_owner;
grant select (id, diario_registro_id, versao, estado, audiencia, atencao, retorno_solicitado,
  origem_conteudo, responde_registro_id, tarefa_id, criado_por_usuario_id, criado_em)
  on cadastro.diario_registro_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id) on cadastro.documento_caso to ffcmapp_linha_tempo_owner;
grant select (id, documento_id, paciente_id, versao, categoria, origem, data_documento,
  audiencia, estado, criado_por_usuario_id, criado_em)
  on cadastro.documento_caso_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id, versao, criado_por_usuario_id, criado_em)
  on cadastro.anamnese_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id, versao, criado_por_usuario_id, criado_em)
  on cadastro.saude_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id, versao, criado_por_usuario_id, criado_em)
  on cadastro.contexto_cuidado_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id, versao, criado_por_usuario_id, criado_em)
  on cadastro.rede_cuidado_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id, versao, situacao, responsavel_usuario_id, ator_usuario_id, criado_em)
  on cadastro.acompanhamento_caso to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id) on cadastro.objetivo_cuidado to ffcmapp_linha_tempo_owner;
grant select (id, objetivo_id, versao, criado_por_usuario_id, criado_em)
  on cadastro.objetivo_cuidado_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id) on cadastro.tarefa_cuidado to ffcmapp_linha_tempo_owner;
grant select (id, tarefa_id, versao, criado_por_usuario_id, criado_em)
  on cadastro.tarefa_cuidado_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id) on cadastro.encaminhamento to ffcmapp_linha_tempo_owner;
grant select (id, encaminhamento_id, versao, etapa, criado_por_usuario_id, criado_em)
  on cadastro.encaminhamento_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id) on cadastro.orientacao to ffcmapp_linha_tempo_owner;
grant select (id, orientacao_id, versao, situacao, criado_por_usuario_id, criado_em)
  on cadastro.orientacao_versao to ffcmapp_linha_tempo_owner;
grant select (id, paciente_id, tipo, chave_origem, acao, atribuido_usuario_id, ator_usuario_id, criado_em)
  on cadastro.pendencia_tratativa to ffcmapp_linha_tempo_owner;

create policy linha_tempo_diario on cadastro.diario_registro
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_diario_versao on cadastro.diario_registro_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_documento on cadastro.documento_caso
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_documento_versao on cadastro.documento_caso_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_anamnese on cadastro.anamnese_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_saude on cadastro.saude_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_contexto on cadastro.contexto_cuidado_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_rede on cadastro.rede_cuidado_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_acompanhamento on cadastro.acompanhamento_caso
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_objetivo on cadastro.objetivo_cuidado
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_objetivo_versao on cadastro.objetivo_cuidado_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_tarefa on cadastro.tarefa_cuidado
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_tarefa_versao on cadastro.tarefa_cuidado_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_encaminhamento on cadastro.encaminhamento
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_encaminhamento_versao on cadastro.encaminhamento_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_orientacao on cadastro.orientacao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_orientacao_versao on cadastro.orientacao_versao
  for select to ffcmapp_linha_tempo_owner using (true);
create policy linha_tempo_pendencia on cadastro.pendencia_tratativa
  for select to ffcmapp_linha_tempo_owner using (true);

set role ffcmapp_linha_tempo_owner;

-- ATENÇÃO: esta função NÃO autoriza nada. Ela recebe um paciente já autorizado pelo
-- chamador, mais quem está lendo (`p_leitor`) e se o leitor é familiar (`p_familia`), e
-- aplica a audiência de cada fonte. Só pode ser executada de dentro de um wrapper que já
-- tenha provado identidade, sessão e vínculo — por isso o execute é revogado de todos os
-- papéis do PostgREST e concedido um a um aos owners autorizados.
--
-- `p_cursor_em`/`p_cursor_id` paginam por (registrado_em desc, id desc). `p_limite` é
-- obrigatório e limitado na própria função: linha do tempo de caso antigo pode ser longa, e
-- nenhuma tela precisa de tudo de uma vez.
create function cadastro.linha_tempo_caso(
  p_paciente uuid,
  p_leitor uuid,
  p_familia boolean,
  p_de timestamptz,
  p_ate timestamptz,
  p_fontes text[],
  p_autor uuid,
  p_cursor_em timestamptz,
  p_cursor_id uuid,
  p_limite integer
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
    null::date as aconteceu_em,
    v.criado_por_usuario_id as autor_usuario_id,
    v.audiencia,
    v.versao,
    r.id as registro_id,
    null::uuid as objetivo_id,
    null::text as area,
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
revoke all on function cadastro.linha_tempo_caso(uuid, uuid, boolean, timestamptz, timestamptz, text[], uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_linha_tempo'), false);

revoke create on schema cadastro from ffcmapp_linha_tempo_owner;
revoke ffcmapp_linha_tempo_owner from current_user;
