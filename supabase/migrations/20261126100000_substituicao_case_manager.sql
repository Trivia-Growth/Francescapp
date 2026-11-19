-- FR-037 / DF-024 (19/11/2026): substituição temporária da case manager.
-- Durante o período declarado a substituta é case manager atual DAQUELE caso, inclusive
-- para agir (FR-020). Nunca alcança a carteira nem outro caso, e NÃO concede acesso:
-- nenhuma regra de acesso lê esta tabela, como já valia para o responsável do caso.
-- Fora do período o titular volta sozinho, sem ação manual.
-- Migração ADITIVA: não reescreve 20261113100000 nem 20261125040000; só substitui a
-- definição da policy e da função de aprovação para consultarem a fonte única da regra.
-- Reversão funcional: restaurar policy/função de 20261125040000 e remover os objetos
-- criados aqui; o histórico de substituições não é apagado sem procedimento aprovado.
-- Preparação local, sem operação remota.
create extension if not exists btree_gist with schema extensions;

create table cadastro.substituicao_case_manager (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  versao integer not null check (versao > 0),
  -- Titular NO MOMENTO DO REGISTRO: substituir é substituir alguém. Se o responsável
  -- do caso mudar, a substituição deixa de valer (ver design.md).
  responsavel_usuario_id uuid not null references public.usuario (id) on delete no action,
  substituto_usuario_id uuid not null references public.usuario (id) on delete no action,
  inicio timestamptz not null,
  fim timestamptz not null,
  encerrada_em timestamptz,
  encerrada_por_usuario_id uuid references public.usuario (id) on delete no action,
  encerramento_auditoria_id uuid unique references auditoria.evento (id) on delete no action,
  auditoria_id uuid not null unique references auditoria.evento (id) on delete no action,
  registrada_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  unique (paciente_id, versao),
  constraint substituicao_cm_periodo_chk check (fim > inicio),
  constraint substituicao_cm_distintos_chk check (substituto_usuario_id <> responsavel_usuario_id),
  constraint substituicao_cm_encerramento_chk check (
    encerrada_em is null or (encerrada_em >= inicio and encerrada_em <= fim)
  ),
  constraint substituicao_cm_encerramento_completo_chk check (
    num_nonnulls(encerrada_em, encerrada_por_usuario_id, encerramento_auditoria_id) in (0, 3)
  ),
  -- Sobreposição é impedida PELO BANCO, não pela aplicação: duas transações concorrentes
  -- não conseguem abrir janelas que se cruzem no mesmo caso. Encerrar encolhe o intervalo,
  -- então nunca cria conflito e libera o restante do período.
  constraint substituicao_cm_sem_sobreposicao exclude using gist (
    paciente_id extensions.gist_uuid_ops with =,
    tstzrange(inicio, coalesce(encerrada_em, fim), '[)') with &&
  )
);
create index substituicao_cm_paciente_idx
  on cadastro.substituicao_case_manager (paciente_id, versao desc);
alter table cadastro.substituicao_case_manager enable row level security;
revoke all on cadastro.substituicao_case_manager from public, anon, authenticated, service_role;

-- Append-only com UMA transição nomeada: encerrar antecipadamente. Nada mais muda, nada
-- é apagado e um registro encerrado não reabre.
create function cadastro.substituicao_cm_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = '42501', message = 'REGISTRO_IMUTAVEL'; end if;
  if old.encerrada_em is not null or new.encerrada_em is null
    or new.encerrada_por_usuario_id is null or new.encerramento_auditoria_id is null
    or new.id is distinct from old.id or new.paciente_id is distinct from old.paciente_id
    or new.versao is distinct from old.versao
    or new.responsavel_usuario_id is distinct from old.responsavel_usuario_id
    or new.substituto_usuario_id is distinct from old.substituto_usuario_id
    or new.inicio is distinct from old.inicio or new.fim is distinct from old.fim
    or new.auditoria_id is distinct from old.auditoria_id
    or new.registrada_por_usuario_id is distinct from old.registrada_por_usuario_id
    or new.criado_em is distinct from old.criado_em then
    raise exception using errcode = '42501', message = 'REGISTRO_IMUTAVEL';
  end if;
  return new;
end $$;
revoke all on function cadastro.substituicao_cm_imutavel() from public, anon, authenticated, service_role;
create trigger substituicao_cm_imutavel before update or delete on cadastro.substituicao_case_manager
  for each row execute function cadastro.substituicao_cm_imutavel();

-- FONTE ÚNICA da regra "case manager atual". Devolve conjunto porque a autorização
-- pergunta "esta pessoa pode agir neste caso agora?" e a tela pergunta "quem lidera e em
-- que papel?". Duas funções diriam a mesma regra duas vezes.
-- SUPOSIÇÃO CONSERVADORA (não decidida pelo solicitante): o titular CONTINUA podendo
-- agir durante a substituição. FR-037 cobre ausência; não manda retirar alçada.
create function cadastro.case_manager_atual(p_paciente uuid)
returns table (usuario_id uuid, papel text)
language sql security definer set search_path = '' as $$
  with titular as (
    select h.responsavel_usuario_id as rid
    from cadastro.acompanhamento_caso h
    where h.paciente_id = p_paciente
    order by h.versao desc
    limit 1
  )
  select t.rid, 'titular'::text from titular t where t.rid is not null
  union all
  select s.substituto_usuario_id, 'substituto'::text
  from cadastro.substituicao_case_manager s
  join titular t on t.rid = s.responsavel_usuario_id
  where s.paciente_id = p_paciente
    and s.encerrada_em is null
    and s.inicio <= clock_timestamp()
    and s.fim > clock_timestamp()
$$;
revoke all on function cadastro.case_manager_atual(uuid) from public, anon, authenticated, service_role;

-- Owner dedicado da fatia: nologin, nobypassrls, noinherit, sem membros.
create role ffcmapp_substituicao_cm_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_substituicao_cm_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_substituicao_cm_owner;
grant usage on schema public, cadastro, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_substituicao_cm_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(),
  auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), cadastro.case_manager_atual(uuid)
  to ffcmapp_substituicao_cm_owner;
grant execute on function cadastro.case_manager_atual(uuid) to ffcmapp_plano_crise_owner;
-- `for share`/`for update` exigem UPDATE além de SELECT; a coluna inócua vem acompanhada
-- de policy `_lock` com `with check (false)`, que impede escrita real.
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace)
  on identidade.configuracao_auth_nativo to ffcmapp_substituicao_cm_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_substituicao_cm_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao)
  on identidade.concessao_equipe to ffcmapp_substituicao_cm_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_substituicao_cm_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em),
  update (revogada_em) on identidade.sessao to ffcmapp_substituicao_cm_owner;
grant select (id, versao), update (versao) on cadastro.paciente to ffcmapp_substituicao_cm_owner;
grant select (paciente_id, versao, responsavel_usuario_id) on cadastro.acompanhamento_caso to ffcmapp_substituicao_cm_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_substituicao_cm_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_substituicao_cm_owner;
grant select (id, paciente_id, versao, responsavel_usuario_id, substituto_usuario_id, inicio, fim,
  encerrada_em, encerrada_por_usuario_id, encerramento_auditoria_id, auditoria_id,
  registrada_por_usuario_id, criado_em),
  insert (id, paciente_id, versao, responsavel_usuario_id, substituto_usuario_id, inicio, fim,
    auditoria_id, registrada_por_usuario_id),
  update (encerrada_em, encerrada_por_usuario_id, encerramento_auditoria_id)
  on cadastro.substituicao_case_manager to ffcmapp_substituicao_cm_owner;

create policy substituicao_cm_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_substituicao_cm_owner using (true);
create policy substituicao_cm_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_substituicao_cm_owner using (true) with check (false);
create policy substituicao_cm_usuario_select on public.usuario for select to ffcmapp_substituicao_cm_owner using (true);
create policy substituicao_cm_usuario_lock on public.usuario for update to ffcmapp_substituicao_cm_owner using (true) with check (false);
create policy substituicao_cm_concessao_select on identidade.concessao_equipe for select to ffcmapp_substituicao_cm_owner using (true);
create policy substituicao_cm_concessao_lock on identidade.concessao_equipe for update to ffcmapp_substituicao_cm_owner using (true) with check (false);
create policy substituicao_cm_excecao_select on identidade.excecao_tecnica for select to ffcmapp_substituicao_cm_owner using (usuario_id = (select auth_privado.uid()));
create policy substituicao_cm_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_substituicao_cm_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy substituicao_cm_sessao_select on identidade.sessao for select to ffcmapp_substituicao_cm_owner using (usuario_id = (select auth_privado.uid()));
create policy substituicao_cm_sessao_lock on identidade.sessao for update to ffcmapp_substituicao_cm_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy substituicao_cm_paciente_select on cadastro.paciente for select to ffcmapp_substituicao_cm_owner using (true);
create policy substituicao_cm_paciente_lock on cadastro.paciente for update to ffcmapp_substituicao_cm_owner using (true) with check (false);
create policy substituicao_cm_acompanhamento_select on cadastro.acompanhamento_caso for select to ffcmapp_substituicao_cm_owner using (true);
create policy substituicao_cm_requisicao_todos on operacao.requisicao for all to ffcmapp_substituicao_cm_owner
  using (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_substituicao_cm', 'api.encerrar_substituicao_cm'))
  with check (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_substituicao_cm', 'api.encerrar_substituicao_cm'));
create policy substituicao_cm_auditoria_insert on auditoria.evento for insert to ffcmapp_substituicao_cm_owner with check (true);
create policy substituicao_cm_select on cadastro.substituicao_case_manager for select to ffcmapp_substituicao_cm_owner using (true);
-- Quem registra é quem está autenticado; o titular gravado tem de ser o responsável vigente.
create policy substituicao_cm_insert on cadastro.substituicao_case_manager for insert to ffcmapp_substituicao_cm_owner with check (
  registrada_por_usuario_id = (select auth_privado.uid())
  and exists(select 1 from cadastro.paciente p where p.id = substituicao_case_manager.paciente_id)
  and responsavel_usuario_id = (
    select h.responsavel_usuario_id from cadastro.acompanhamento_caso h
    where h.paciente_id = substituicao_case_manager.paciente_id order by h.versao desc limit 1
  )
);
create policy substituicao_cm_encerrar on cadastro.substituicao_case_manager for update to ffcmapp_substituicao_cm_owner
  using (encerrada_em is null) with check (encerrada_por_usuario_id = (select auth_privado.uid()));

-- Operação privada da substituição. Administrador-only nas três ações: a tela que a usa é
-- a de edição do caso, já administrativa, e consultar quem lidera um caso é informação de
-- governança. Auditoria obrigatória na mesma transação, inclusive na negação.
create function operacao.substituicao_cm_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; paciente uuid; alvo uuid; substituto uuid;
  inicio timestamptz; fim timestamptz; p_inicio timestamptz; p_fim timestamptz;
  concessao uuid; dominio text; sujeito text; google record;
  autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text; aud uuid;
  titular uuid; nova_versao integer; encerrou timestamptz;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'paciente_id', 'substituicao_id', 'substituto_usuario_id',
      'inicio', 'fim', 'chave_idempotencia', 'digest_idempotencia', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; paciente := (e->>'paciente_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
    alvo := (e->>'substituicao_id')::uuid;
    substituto := (e->>'substituto_usuario_id')::uuid;
    p_inicio := (e->>'inicio')::timestamptz; p_fim := (e->>'fim')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
    or acao not in ('api.consultar_substituicao_cm', 'api.registrar_substituicao_cm', 'api.encerrar_substituicao_cm')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
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
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
    else
      insert into auditoria.evento(id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
    end if;
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.registrar_substituicao_cm' then
    if alvo is null or substituto is null or p_inicio is null or p_fim is null
      or jsonb_typeof(e->'inicio') is distinct from 'string' or jsonb_typeof(e->'fim') is distinct from 'string'
      or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
      or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  elsif acao = 'api.encerrar_substituicao_cm' then
    if e - array['request_id', 'paciente_id', 'substituicao_id', 'chave_idempotencia', 'digest_idempotencia', 'atestado'] <> '{}'::jsonb
      or alvo is null
      or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
      or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  else
    if e - array['request_id', 'paciente_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  end if;
  -- Mesma trava do paciente usada pela troca de responsável: quem lidera o caso não pode
  -- mudar entre a leitura e a gravação da substituição.
  perform 1 from cadastro.paciente p where p.id = paciente for update;
  if not found then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  select h.responsavel_usuario_id into titular from cadastro.acompanhamento_caso h
    where h.paciente_id = paciente order by h.versao desc limit 1;
  if acao = 'api.registrar_substituicao_cm' then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
    repeticao := found;
    if not found then
      -- Substituir exige titular vigente, pessoa distinta, ainda colaboradora e período
      -- futuro delimitado. Teto de 180 dias: ausência temporária, não troca permanente.
      if titular is null or substituto = titular or p_fim <= p_inicio or p_fim <= clock_timestamp()
        or p_fim - p_inicio > interval '180 days'
        or not exists(select 1 from public.usuario u where u.id = substituto and u.ativo and u.perfil in ('administrador', 'profissional'))
        or not exists(select 1 from identidade.concessao_equipe c where c.usuario_id = substituto and c.estado = 'vinculada' and c.perfil in ('administrador', 'profissional')) then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
        if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'responsavel_invalido'), 'request_id', req);
      end if;
      select coalesce(max(s.versao), 0) + 1 into nova_versao from cadastro.substituicao_case_manager s where s.paciente_id = paciente;
      aud := gen_random_uuid();
      insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
        values(gen_random_uuid(), ator, acao, e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, nova_versao)
        on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
      if found then
        begin
          insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
            values(aud, ator, acao, 'paciente', paciente, 'permitido', req);
          insert into cadastro.substituicao_case_manager(id, paciente_id, versao, responsavel_usuario_id,
            substituto_usuario_id, inicio, fim, auditoria_id, registrada_por_usuario_id)
            values(alvo, paciente, nova_versao, titular, substituto, p_inicio, p_fim, aud, ator);
        exception when exclusion_violation or unique_violation then
          -- Período sobreposto é recusado pelo índice, não pela aplicação. O ledger da
          -- idempotência não pode ficar apontando para um registro que não existe.
          delete from operacao.requisicao where id = anterior.id;
          insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
            values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
          if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
          return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
        end;
      else
        repeticao := true;
        select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
      end if;
    end if;
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
      or not exists(select 1 from cadastro.substituicao_case_manager s where s.id = anterior.resultado_id
        and s.paciente_id = paciente and s.versao = anterior.resultado_versao) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
  elsif acao = 'api.encerrar_substituicao_cm' then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
    repeticao := found;
    if not found then
      select s.versao, least(greatest(s.inicio, clock_timestamp()), s.fim) into nova_versao, encerrou
        from cadastro.substituicao_case_manager s
        where s.id = alvo and s.paciente_id = paciente and s.encerrada_em is null for update;
      if not found then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
        if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end if;
      aud := gen_random_uuid();
      insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
        values(gen_random_uuid(), ator, acao, e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, nova_versao)
        on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
      if found then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(aud, ator, acao, 'paciente', paciente, 'permitido', req);
        update cadastro.substituicao_case_manager
          set encerrada_em = encerrou, encerrada_por_usuario_id = ator, encerramento_auditoria_id = aud
          where id = alvo and paciente_id = paciente and encerrada_em is null;
        if not found then raise exception using errcode = 'P0002', message = 'ENCERRAMENTO_NAO_GRAVADO'; end if;
      else
        repeticao := true;
        select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
      end if;
    end if;
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
      or not exists(select 1 from cadastro.substituicao_case_manager s where s.id = anterior.resultado_id
        and s.paciente_id = paciente and s.encerrada_em is not null) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
  end if;
  select jsonb_build_object(
      'paciente_id', paciente,
      'titular_usuario_id', titular,
      'case_manager_atual_id', coalesce(
        (select c.usuario_id from cadastro.case_manager_atual(paciente) c where c.papel = 'substituto' limit 1),
        titular),
      'vigente', (select jsonb_build_object('id', s.id, 'substituto_usuario_id', s.substituto_usuario_id,
          'inicio', s.inicio, 'fim', s.fim)
        from cadastro.substituicao_case_manager s
        where s.paciente_id = paciente and s.encerrada_em is null and s.responsavel_usuario_id = titular
          and s.inicio <= clock_timestamp() and s.fim > clock_timestamp() limit 1),
      'substituicoes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', q.id, 'versao', q.versao, 'substituto_usuario_id', q.substituto_usuario_id,
            'responsavel_usuario_id', q.responsavel_usuario_id, 'inicio', q.inicio, 'fim', q.fim,
            'encerrada_em', q.encerrada_em, 'registrada_por_usuario_id', q.registrada_por_usuario_id,
            'criado_em', q.criado_em) order by q.versao desc)
        from (select s.id, s.versao, s.substituto_usuario_id, s.responsavel_usuario_id, s.inicio, s.fim,
            s.encerrada_em, s.registrada_por_usuario_id, s.criado_em
          from cadastro.substituicao_case_manager s where s.paciente_id = paciente
          order by s.versao desc limit 50) q), '[]'::jsonb))
    into resultado;
  if acao = 'api.consultar_substituicao_cm' or repeticao then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'paciente', paciente, 'permitido', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req, 'repeticao', repeticao);
end $$;
revoke all on function operacao.substituicao_cm_privada(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.substituicao_cm_privada(jsonb) to ffcmapp_substituicao_cm_owner;

create function api.substituicao_case_manager_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; alvo uuid; acao text;
begin
  begin
    return operacao.substituicao_cm_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    alvo := (p_transporte#>>'{entrada,paciente_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'paciente', alvo, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.substituicao_case_manager_privado(jsonb) from public, anon, authenticated, service_role;
alter function api.substituicao_case_manager_privado(jsonb) owner to ffcmapp_substituicao_cm_owner;
select set_config('ffcmapp.substituicao_cm_migrador', current_user, false);
set role ffcmapp_substituicao_cm_owner;
revoke all on function api.substituicao_case_manager_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.substituicao_cm_migrador'), false);
revoke create on schema api from ffcmapp_substituicao_cm_owner;
revoke ffcmapp_substituicao_cm_owner from current_user;

-- O verificador do atestado é de outro owner; conceder exige assumir o papel dono.
select set_config('ffcmapp.substituicao_cm_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.substituicao_cm_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_substituicao_cm_owner;
reset role;
select set_config('role', current_setting('ffcmapp.substituicao_cm_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.substituicao_cm_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

-- Redefinição ADITIVA do portão de aprovação do plano de crise (FR-020) para reconhecer a
-- substituta vigente. O corpo é o de 20261125040000, com um único trecho trocado: a
-- subconsulta do último retrato dá lugar a cadastro.case_manager_atual(paciente).
alter policy crise_aprovacao_responsavel_atual on cadastro.plano_crise_aprovacao with check (
 exists(select 1 from cadastro.case_manager_atual(plano_crise_aprovacao.paciente_id) c
  where c.usuario_id = (select auth_privado.uid()))
);
select set_config('ffcmapp.migrador_substituicao_crise', current_user, false);
select set_config('ffcmapp.substituicao_crise_tinha_set',pg_has_role(current_user,'ffcmapp_plano_crise_owner','SET')::text,false);
select set_config('ffcmapp.substituicao_crise_tinha_create',exists(
 select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 join pg_roles r on r.oid=a.grantee where n.nspname='api'
 and r.rolname='ffcmapp_plano_crise_owner' and a.privilege_type='CREATE')::text,false);
do $$ begin
 if (select p.proowner from pg_proc p where p.oid='api.plano_crise_operacao_privada(jsonb)'::regprocedure)
  is distinct from 'ffcmapp_plano_crise_owner'::regrole then raise exception 'OWNER_INESPERADO'; end if;
 if current_setting('ffcmapp.substituicao_crise_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m where m.roleid='ffcmapp_plano_crise_owner'::regrole
   and m.member=current_user::regrole and m.grantor=current_user::regrole) then
   raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_plano_crise_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.substituicao_crise_tinha_create')='false' then
  grant create on schema api to ffcmapp_plano_crise_owner;
 end if;
end $$;
set role ffcmapp_plano_crise_owner;
create or replace function api.plano_crise_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; esperada integer; alvo_versao integer; atual integer;
 inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text; google record;
 dominio text; autorizado boolean:=false; habilitado boolean:=false; aprovacao uuid;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','versao_esperada','versao','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_plano_crise' then
   registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  elsif acao='api.aprovar_plano_crise' then
   registro:=(e->>'registro_id')::uuid; alvo_versao:=(e->>'versao')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_plano_crise','api.gravar_plano_crise','api.aprovar_plano_crise') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google,c.habilitado_plano_crise into concessao,perfil,sujeito,habilitado
    from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 -- DF-021: habilitação explícita e liderança atual do caso; perfil sozinho não autoriza.
 if acao='api.aprovar_plano_crise' and not (perfil in ('administrador','profissional') and habilitado is true) then
  autorizado:=false;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_plano_crise' then
  if e - array['request_id','paciente_id','atestado'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 elsif acao='api.aprovar_plano_crise' then
  if e - array['request_id','paciente_id','registro_id','versao','chave_idempotencia','digest_idempotencia','atestado'] <> '{}'::jsonb
   or registro is null or alvo_versao is null or alvo_versao<1 or alvo_versao=2147483647
   or jsonb_typeof(e->'versao') is distinct from 'number'
   or coalesce(e->>'versao','') !~ '^[1-9][0-9]*$'
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.plano_crise_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- DF-021/DF-024: paciente já está travado FOR UPDATE, assim como na edição do responsável.
 -- A regra de quem é case manager atual vive em cadastro.case_manager_atual: titular e,
 -- durante o período, a substituta daquele caso. Revalidado inclusive no replay.
 if acao='api.aprovar_plano_crise' and not exists(
   select 1 from cadastro.case_manager_atual(paciente) c where c.usuario_id=ator
 ) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.gravar_plano_crise' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao into atual from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    insert into cadastro.plano_crise_versao(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
     values(registro,paciente,esperada+1,nullif(esperada,0),envelope,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.plano_crise_versao v where v.id=anterior.resultado_id and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  registro:=anterior.resultado_id;
 elsif acao='api.aprovar_plano_crise' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   -- Aprova-se a versão corrente e nomeada: se o plano mudou entre a leitura e o clique,
   -- a aprovação recai sobre um texto que já não é o que a pessoa leu.
   select v.versao into atual from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if atual is null or atual<>alvo_versao
    or not exists(select 1 from cadastro.plano_crise_versao v where v.id=registro and v.paciente_id=paciente and v.versao=alvo_versao) then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   aprovacao:=gen_random_uuid();
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',aprovacao,alvo_versao)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    begin
     insert into cadastro.plano_crise_aprovacao(id,registro_id,paciente_id,aprovador_usuario_id,concessao_id)
      values(aprovacao,registro,paciente,ator,concessao);
    exception when unique_violation then
     -- Esta pessoa já aprovou esta versão: o carimbo original continua valendo.
     delete from operacao.requisicao where id=anterior.id;
     insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
      values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
     if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
    end;
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.plano_crise_aprovacao ap where ap.id=anterior.resultado_id
     and ap.registro_id=registro and ap.paciente_id=paciente and ap.aprovador_usuario_id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
 end if;
 if acao='api.ler_plano_crise' then
  select v.id into registro from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 end if;
 select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado,
   'aprovacao',(select jsonb_build_object('aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em)
     from cadastro.plano_crise_aprovacao ap where ap.registro_id=v.id order by ap.aprovado_em,ap.id limit 1))
  into resultado from cadastro.plano_crise_versao v where v.id=registro and v.paciente_id=paciente;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_substituicao_crise'), false);
do $$ begin
 if current_setting('ffcmapp.substituicao_crise_tinha_create')='false' then
  revoke create on schema api from ffcmapp_plano_crise_owner;
 end if;
 if current_setting('ffcmapp.substituicao_crise_tinha_set')='false' then
  execute format('revoke ffcmapp_plano_crise_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
