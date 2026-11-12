-- FR-027/FR-028: periodicidades acordadas por caso, tratativa de pendência e o cálculo
-- único do sinal operacional. Esta migration cria só o armazenamento e o derivador; a
-- autorização, a auditoria e a exposição HTTP ficam nas migrations seguintes.
--
-- Decisões registradas aqui porque o requisito depende delas:
--
-- 1. Pendência NÃO é linha gravada por um gerador. Ela é derivada da própria origem
--    (acordo do caso, data da última atualização, encaminhamento aguardando retorno) a
--    cada leitura. Reconhecer, atribuir ou resolver grava um evento em
--    `cadastro.pendencia_tratativa`, que é append-only e nunca toca a origem — é assim
--    que FR-027 ("sem apagar sua origem") fica garantido por estrutura, não por disciplina.
--
-- 2. `chave_origem` identifica a instância exata da origem (a data da revisão acordada, o
--    instante da última atualização, o encaminhamento). Quando a origem muda, a chave muda
--    e a pendência reaparece aberta: resolver não esconde um fato novo.
--
-- 3. FR-028 fica no modelo, não na interface: este cálculo só enxerga compromisso
--    operacional (acordo, datas, etapa de encaminhamento). Nenhuma sinalização clínica
--    entra aqui, e nenhum envelope cifrado é lido. "Em dia" significa compromisso
--    operacional em dia e nada além disso.
--
-- 4. Atraso de tarefa fica FORA do derivador do banco de propósito: o prazo da tarefa vive
--    dentro de `cadastro.tarefa_cuidado_versao.conteudo_cifrado` e o banco não o vê. Pôr o
--    prazo em claro só para alimentar este cálculo ampliaria o que o banco conhece sobre o
--    caso. A detecção de tarefa atrasada é feita onde o texto claro já existe (o cliente da
--    ficha, que decifra a tarefa) e a tratativa correspondente é gravada aqui normalmente,
--    com tipo 'tarefa_atrasada' e `chave_origem` igual ao identificador da tarefa.
--
-- Reversão: drop function cadastro.sinal_operacional_caso(uuid); as duas tabelas guardam
-- histórico e acordo e não são apagadas sem procedimento aprovado.

create table cadastro.acordo_acompanhamento (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  versao integer not null check (versao > 0),
  dias_entre_atualizacoes integer check (dias_entre_atualizacoes between 1 and 365),
  dias_antecedencia_revisao integer not null check (dias_antecedencia_revisao between 1 and 180),
  dias_retorno_encaminhamento integer not null check (dias_retorno_encaminhamento between 1 and 365),
  proxima_revisao_em date,
  ator_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint acordo_acompanhamento_versao_uq unique (paciente_id, versao),
  constraint acordo_acompanhamento_sequencia_chk check ((versao > 0) is true)
);

alter table cadastro.acordo_acompanhamento enable row level security;
revoke all on cadastro.acordo_acompanhamento from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_acordo_acompanhamento() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'REGISTRO_IMUTAVEL';
end $$;
revoke all on function cadastro.impedir_alteracao_acordo_acompanhamento()
  from public, anon, authenticated, service_role;
create trigger acordo_acompanhamento_imutavel
  before update or delete on cadastro.acordo_acompanhamento
  for each row execute function cadastro.impedir_alteracao_acordo_acompanhamento();
create trigger acordo_acompanhamento_imutavel_truncate
  before truncate on cadastro.acordo_acompanhamento
  for each statement execute function cadastro.impedir_alteracao_acordo_acompanhamento();

-- Tratativa da pendência. Só acrescenta: a origem continua onde está e nunca é alterada.
-- 'reaberta' existe para desfazer uma resolução sem apagar o registro de que ela ocorreu.
create table cadastro.pendencia_tratativa (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  tipo text not null check (tipo in (
    'revisao_proxima', 'atualizacao_ausente', 'encaminhamento_sem_retorno', 'tarefa_atrasada'
  )),
  chave_origem text not null check (length(chave_origem) between 1 and 200),
  acao text not null check (acao in ('reconhecida', 'atribuida', 'resolvida', 'reaberta')),
  atribuido_usuario_id uuid references public.usuario (id) on delete no action,
  ator_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint pendencia_atribuicao_chk check (
    ((acao = 'atribuida') = (atribuido_usuario_id is not null)) is true
  )
);

create index pendencia_tratativa_origem_idx
  on cadastro.pendencia_tratativa (paciente_id, tipo, chave_origem, criado_em desc);

alter table cadastro.pendencia_tratativa enable row level security;
revoke all on cadastro.pendencia_tratativa from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_pendencia_tratativa() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'REGISTRO_IMUTAVEL';
end $$;
revoke all on function cadastro.impedir_alteracao_pendencia_tratativa()
  from public, anon, authenticated, service_role;
create trigger pendencia_tratativa_imutavel
  before update or delete on cadastro.pendencia_tratativa
  for each row execute function cadastro.impedir_alteracao_pendencia_tratativa();
create trigger pendencia_tratativa_imutavel_truncate
  before truncate on cadastro.pendencia_tratativa
  for each statement execute function cadastro.impedir_alteracao_pendencia_tratativa();

-- Papel dono do derivador. Existe para que nem a carteira nem a fatia de pendências
-- precisem de privilégio direto sobre as nove tabelas de versão: ambas só executam a
-- função. O que o papel lê das tabelas de versão é exclusivamente metadado operacional
-- (`paciente_id` e `criado_em`); nenhum envelope cifrado e nenhum autor entram no cálculo.
select set_config('ffcmapp.migrador_sinal_operacional', current_user, false);
create role ffcmapp_sinal_operacional_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_sinal_operacional_owner to current_user with inherit false, set true;
grant usage, create on schema cadastro to ffcmapp_sinal_operacional_owner;

grant select (id, paciente_id, versao, dias_entre_atualizacoes, dias_antecedencia_revisao,
  dias_retorno_encaminhamento, proxima_revisao_em, criado_em)
  on cadastro.acordo_acompanhamento to ffcmapp_sinal_operacional_owner;
grant select (id, paciente_id, tipo, chave_origem, acao, atribuido_usuario_id, criado_em)
  on cadastro.pendencia_tratativa to ffcmapp_sinal_operacional_owner;
grant select (paciente_id, criado_em) on cadastro.anamnese_versao to ffcmapp_sinal_operacional_owner;
grant select (paciente_id, criado_em) on cadastro.saude_versao to ffcmapp_sinal_operacional_owner;
grant select (paciente_id, criado_em) on cadastro.contexto_cuidado_versao to ffcmapp_sinal_operacional_owner;
grant select (paciente_id, criado_em) on cadastro.rede_cuidado_versao to ffcmapp_sinal_operacional_owner;
grant select (paciente_id, criado_em) on cadastro.acompanhamento_caso to ffcmapp_sinal_operacional_owner;
grant select (id, paciente_id) on cadastro.objetivo_cuidado to ffcmapp_sinal_operacional_owner;
grant select (objetivo_id, criado_em) on cadastro.objetivo_cuidado_versao to ffcmapp_sinal_operacional_owner;
grant select (id, paciente_id) on cadastro.tarefa_cuidado to ffcmapp_sinal_operacional_owner;
grant select (tarefa_id, criado_em) on cadastro.tarefa_cuidado_versao to ffcmapp_sinal_operacional_owner;
grant select (id, paciente_id) on cadastro.encaminhamento to ffcmapp_sinal_operacional_owner;
grant select (encaminhamento_id, versao, etapa, criado_em) on cadastro.encaminhamento_versao to ffcmapp_sinal_operacional_owner;
grant select (id, paciente_id) on cadastro.orientacao to ffcmapp_sinal_operacional_owner;
grant select (orientacao_id, criado_em) on cadastro.orientacao_versao to ffcmapp_sinal_operacional_owner;

create policy sinal_operacional_acordo on cadastro.acordo_acompanhamento
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_tratativa on cadastro.pendencia_tratativa
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_anamnese on cadastro.anamnese_versao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_saude on cadastro.saude_versao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_contexto on cadastro.contexto_cuidado_versao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_rede on cadastro.rede_cuidado_versao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_acompanhamento on cadastro.acompanhamento_caso
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_objetivo on cadastro.objetivo_cuidado
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_objetivo_versao on cadastro.objetivo_cuidado_versao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_tarefa on cadastro.tarefa_cuidado
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_tarefa_versao on cadastro.tarefa_cuidado_versao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_encaminhamento on cadastro.encaminhamento
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_encaminhamento_versao on cadastro.encaminhamento_versao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_orientacao on cadastro.orientacao
  for select to ffcmapp_sinal_operacional_owner using (true);
create policy sinal_operacional_orientacao_versao on cadastro.orientacao_versao
  for select to ffcmapp_sinal_operacional_owner using (true);

set role ffcmapp_sinal_operacional_owner;
-- ATENÇÃO: esta função NÃO autoriza nada. Ela recebe um paciente já autorizado pelo
-- chamador e devolve metadado operacional. Só pode ser executada de dentro de um wrapper
-- que já tenha provado identidade, sessão e vínculo com o caso — por isso o execute é
-- revogado de todos os papéis do PostgREST e concedido um a um aos owners autorizados.
create function cadastro.sinal_operacional_caso(p_paciente uuid) returns jsonb
language sql stable security definer set search_path = '' set row_security = on as $$
with acordo as (
  select a.versao, a.dias_entre_atualizacoes, a.dias_antecedencia_revisao,
    a.dias_retorno_encaminhamento, a.proxima_revisao_em
  from cadastro.acordo_acompanhamento a
  where a.paciente_id = p_paciente order by a.versao desc limit 1
), atualizacao as (
  select max(instante) as em from (
    select max(v.criado_em) from cadastro.anamnese_versao v where v.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.saude_versao v where v.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.contexto_cuidado_versao v where v.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.rede_cuidado_versao v where v.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.acompanhamento_caso v where v.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.objetivo_cuidado_versao v
      join cadastro.objetivo_cuidado o on o.id = v.objetivo_id where o.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.tarefa_cuidado_versao v
      join cadastro.tarefa_cuidado t on t.id = v.tarefa_id where t.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.encaminhamento_versao v
      join cadastro.encaminhamento e on e.id = v.encaminhamento_id where e.paciente_id = p_paciente
    union all select max(v.criado_em) from cadastro.orientacao_versao v
      join cadastro.orientacao o on o.id = v.orientacao_id where o.paciente_id = p_paciente
  ) fontes(instante)
), encaminhamentos as (
  select e.id, v.etapa, v.criado_em
  from cadastro.encaminhamento e
  join lateral (
    select ev.etapa, ev.criado_em from cadastro.encaminhamento_versao ev
    where ev.encaminhamento_id = e.id order by ev.versao desc limit 1
  ) v on true
  where e.paciente_id = p_paciente
), derivadas as (
  select 'revisao_proxima'::text as tipo,
    'revisao:' || to_char(a.proxima_revisao_em, 'YYYY-MM-DD') as chave_origem,
    case when a.proxima_revisao_em < current_date
      then 'Revisão acordada para ' || to_char(a.proxima_revisao_em, 'DD/MM/YYYY') || ', ainda não registrada.'
      else 'Revisão acordada para ' || to_char(a.proxima_revisao_em, 'DD/MM/YYYY') || '.' end as motivo,
    to_char(a.proxima_revisao_em - a.dias_antecedencia_revisao, 'YYYY-MM-DD') as desde
  from acordo a
  where a.proxima_revisao_em is not null
    and a.proxima_revisao_em - a.dias_antecedencia_revisao <= current_date
  union all
  select 'atualizacao_ausente',
    'atualizacao:' || coalesce(to_char(u.em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), 'nunca'),
    case when u.em is null then 'Nenhuma atualização registrada neste caso.'
      else 'Sem atualização registrada há ' || (current_date - u.em::date)::text
        || ' dias; o acordado é a cada ' || a.dias_entre_atualizacoes::text || '.' end,
    coalesce(to_char((u.em::date + a.dias_entre_atualizacoes), 'YYYY-MM-DD'), '')
  from acordo a cross join atualizacao u
  where a.dias_entre_atualizacoes is not null
    and (u.em is null or u.em::date + a.dias_entre_atualizacoes <= current_date)
  union all
  select 'encaminhamento_sem_retorno', 'encaminhamento:' || e.id::text,
    'Encaminhamento aguardando retorno há ' || (current_date - e.criado_em::date)::text
      || ' dias; o acordado é ' || a.dias_retorno_encaminhamento::text || '.',
    to_char((e.criado_em::date + a.dias_retorno_encaminhamento), 'YYYY-MM-DD')
  from encaminhamentos e cross join acordo a
  where e.etapa = 'retorno_pendente'
    and e.criado_em::date + a.dias_retorno_encaminhamento <= current_date
), tratativa as (
  select t.tipo, t.chave_origem, t.acao, t.atribuido_usuario_id, t.criado_em,
    row_number() over (partition by t.tipo, t.chave_origem order by t.criado_em desc, t.id desc) as recente
  from cadastro.pendencia_tratativa t where t.paciente_id = p_paciente
), pendencias as (
  select d.tipo, d.chave_origem, d.motivo, d.desde,
    case when t.acao is null or t.acao = 'reaberta' then 'aberta' else t.acao end as estado,
    t.atribuido_usuario_id, t.criado_em as tratada_em
  from derivadas d
  left join tratativa t on t.tipo = d.tipo and t.chave_origem = d.chave_origem and t.recente = 1
  union all
  -- Tratativa de origem detectada fora do banco (tarefa atrasada) continua visível enquanto
  -- não estiver resolvida; a origem real é a tarefa e segue intocada na sua própria tabela.
  select t.tipo, t.chave_origem, 'Tarefa marcada como atrasada no acompanhamento.', null,
    case when t.acao = 'reaberta' then 'aberta' else t.acao end, t.atribuido_usuario_id, t.criado_em
  from tratativa t where t.recente = 1 and t.tipo = 'tarefa_atrasada'
)
select jsonb_build_object(
  'acordo', (select to_jsonb(a) - 'proxima_revisao_em'
    || jsonb_build_object('proxima_revisao_em', to_char(a.proxima_revisao_em, 'YYYY-MM-DD')) from acordo a),
  'ultima_atualizacao_em', (select u.em from atualizacao u),
  'estado', case
    when not exists (select 1 from acordo) then 'informacao_insuficiente'
    when exists (select 1 from pendencias p where p.estado <> 'resolvida') then 'atencao_operacional'
    else 'em_dia' end,
  'pendencias', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tipo', p.tipo, 'chave_origem', p.chave_origem, 'motivo', p.motivo,
      'desde', nullif(p.desde, ''), 'estado', p.estado,
      'atribuido_usuario_id', p.atribuido_usuario_id, 'tratada_em', p.tratada_em
    ) order by p.tipo, p.chave_origem) from pendencias p
  ), '[]'::jsonb)
);
$$;
revoke all on function cadastro.sinal_operacional_caso(uuid) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_sinal_operacional'), false);
revoke create on schema cadastro from ffcmapp_sinal_operacional_owner;
revoke ffcmapp_sinal_operacional_owner from current_user;
