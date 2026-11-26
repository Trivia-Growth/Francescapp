-- FR-024 (19/11/2026): situação de realização do compromisso em tabela LOCAL própria,
-- chaveada pelo identificador do evento. O compromisso continua vivendo no Google Calendar;
-- o produto não vira dono dele, não o copia e não o sincroniza.
-- Nada aqui depende da integração Google estar ligada: a flag desta fatia é própria e a
-- prova local roda com `ffcm.agenda_google.ativo` desligada.
-- `realizacao_nao_confirmada` NÃO é valor gravável: é estado derivado de compromisso já
-- passado sem registro. Ausência de registro nunca vira falta — por desenho, não por tela.
-- A tabela NÃO guarda paciente_id e esta operação não alcança paciente nem vínculo: a
-- situação de realização não pode virar canal lateral do caso.
-- Migração ADITIVA. Preparação local; não aplicar remotamente.
-- Rollback: drop das funções/policies/role e da tabela criados aqui.

create table cadastro.realizacao_compromisso (
  id uuid primary key,
  -- Dono da agenda individual. O trio abaixo é o mesmo já usado por
  -- identidade.agenda_google_vinculo_paciente; `subject_google` nunca vem do cliente.
  usuario_id uuid not null references public.usuario (id) on delete no action,
  subject_google text not null check (length(btrim(subject_google)) between 1 and 255),
  evento_id text not null check (evento_id ~ '^[A-Za-z0-9_-]+$' and length(evento_id) <= 1024),
  versao integer not null check (versao > 0 and versao < 2147483647),
  -- Catálogo fechado. `realizacao_nao_confirmada` está deliberadamente FORA: não existe
  -- caminho que a grave, e não existe caminho que transforme ausência de registro em falta.
  situacao text not null check (situacao in ('realizado', 'faltou', 'cancelado', 'remarcado')),
  -- Barreiras logísticas, sem escore e sem termo clínico: o requisito manda identificar
  -- barreira SEM produzir diagnóstico de risco.
  motivo text check (motivo in ('transporte', 'custo', 'disponibilidade', 'outras')),
  observacao_cifrada jsonb check (observacao_cifrada is null or jsonb_typeof(observacao_cifrada) = 'object'),
  -- Vínculo entre datas: a remarcação relaciona o compromisso original à nova data.
  evento_destino_id text,
  autor_usuario_id uuid not null references public.usuario (id) on delete no action,
  registrado_em timestamptz not null default clock_timestamp(),
  auditoria_id uuid not null unique references auditoria.evento (id) on delete no action,
  -- Duas transações concorrentes que leiam a mesma versão vigente tentam gravar a MESMA
  -- versão seguinte; a segunda é recusada pelo índice, não pela aplicação.
  unique (usuario_id, subject_google, evento_id, versao),
  constraint realizacao_destino_apenas_remarcado_chk check (
    (situacao = 'remarcado') = (evento_destino_id is not null)
  ),
  constraint realizacao_destino_distinto_chk check (
    evento_destino_id is null or evento_destino_id <> evento_id
  ),
  constraint realizacao_destino_formato_chk check (
    evento_destino_id is null
    or (evento_destino_id ~ '^[A-Za-z0-9_-]+$' and length(evento_destino_id) <= 1024)
  ),
  constraint realizacao_motivo_falta_chk check (situacao <> 'faltou' or motivo is not null),
  -- Registrar que algo foi realizado não é lugar para motivo de barreira nem texto livre
  -- sobre a pessoa.
  constraint realizacao_realizado_sem_texto_chk check (
    situacao <> 'realizado' or (motivo is null and observacao_cifrada is null)
  )
);
create index realizacao_compromisso_evento_idx
  on cadastro.realizacao_compromisso (usuario_id, subject_google, evento_id, versao desc);
-- Direção inversa do vínculo entre datas: "quais compromissos foram remarcados PARA este".
create index realizacao_compromisso_destino_idx
  on cadastro.realizacao_compromisso (usuario_id, subject_google, evento_destino_id, versao desc)
  where evento_destino_id is not null;
alter table cadastro.realizacao_compromisso enable row level security;
revoke all on cadastro.realizacao_compromisso from public, anon, authenticated, service_role;

-- Append-only puro: retificar grava versão nova e preserva a anterior.
create function cadastro.realizacao_compromisso_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'REGISTRO_IMUTAVEL';
end $$;
revoke all on function cadastro.realizacao_compromisso_imutavel() from public, anon, authenticated, service_role;
create trigger realizacao_compromisso_imutavel before update or delete
  on cadastro.realizacao_compromisso for each row
  execute function cadastro.realizacao_compromisso_imutavel();

-- Derivação da situação apresentada. Função PURA: a ausência de registro vira
-- `realizacao_nao_confirmada` quando o compromisso já terminou e `agendado` quando não.
-- Ela NUNCA devolve `faltou` sem registro de falta — é esse o coração de FR-024.
-- `p_fim` vem do Google pela composição do servidor e serve só para apresentação:
-- não participa de nenhuma autorização.
create function cadastro.realizacao_situacao_derivada(
  p_registrada text, p_fim timestamptz, p_agora timestamptz
) returns text language sql immutable set search_path = '' as $$
  select case
    when p_registrada is not null then p_registrada
    when p_fim is not null and p_fim <= p_agora then 'realizacao_nao_confirmada'
    else 'agendado'
  end;
$$;
revoke all on function cadastro.realizacao_situacao_derivada(text, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

-- Quem é Administrador é pergunta que a policy de public.usuario precisa fazer SOBRE
-- public.usuario: em policy direta isso seria recursão. A função confere sempre a identidade
-- do chamador, não aceita argumento e não é alcançável por papel da aplicação.
create function cadastro.realizacao_ator_administrador() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.usuario u
    where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'administrador');
$$;
revoke all on function cadastro.realizacao_ator_administrador() from public, anon, authenticated, service_role;

insert into identidade.configuracao_sistema(id, chave, valor, tipo, rotulo, descricao, exposicao) values
(gen_random_uuid(), 'ffcm.realizacao_compromisso.ativo', 'false', 'booleano',
 'Registro de realização do compromisso (em implementação)',
 'Desligado por padrão. Interruptor próprio, independente da integração Google. Não substitui autorização.',
 'servidor');

-- Owner dedicado: nologin, noinherit, nobypassrls, sem membros.
select set_config('ffcmapp.realizacao_migrador', current_user, false);
create role ffcmapp_realizacao_compromisso_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_realizacao_compromisso_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_realizacao_compromisso_owner;
grant usage on schema public, cadastro, identidade, operacao, auditoria, auth_privado, bloqueios_auth
  to ffcmapp_realizacao_compromisso_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(),
  auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid),
  cadastro.realizacao_situacao_derivada(text, timestamptz, timestamptz),
  cadastro.realizacao_ator_administrador()
  to ffcmapp_realizacao_compromisso_owner;
-- `for share`/`for update` exigem UPDATE além de SELECT; a coluna inócua vem acompanhada
-- de policy `_lock` com `with check (false)`, que impede escrita real.
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace)
  on identidade.configuracao_auth_nativo to ffcmapp_realizacao_compromisso_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_realizacao_compromisso_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao)
  on identidade.concessao_equipe to ffcmapp_realizacao_compromisso_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em),
  update (revogada_em) on identidade.sessao to ffcmapp_realizacao_compromisso_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_realizacao_compromisso_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_realizacao_compromisso_owner;
grant select (id, usuario_id, subject_google, evento_id, versao, situacao, motivo,
    observacao_cifrada, evento_destino_id, autor_usuario_id, registrado_em, auditoria_id),
  insert (id, usuario_id, subject_google, evento_id, versao, situacao, motivo,
    observacao_cifrada, evento_destino_id, autor_usuario_id, auditoria_id)
  on cadastro.realizacao_compromisso to ffcmapp_realizacao_compromisso_owner;
-- NENHUM privilégio sobre cadastro.paciente, cadastro.acesso_paciente ou
-- identidade.agenda_google_vinculo_paciente: a situação não alcança o caso.

create policy realizacao_config_select on identidade.configuracao_auth_nativo
  for select to ffcmapp_realizacao_compromisso_owner using (true);
create policy realizacao_config_lock on identidade.configuracao_auth_nativo
  for update to ffcmapp_realizacao_compromisso_owner using (true) with check (false);
-- O ator enxerga a si mesmo; Administrador ativo enxerga a equipe, porque administrar
-- agenda alheia é a audiência adotada (suposição conservadora registrada no design).
create policy realizacao_usuario_select on public.usuario
  for select to ffcmapp_realizacao_compromisso_owner using (
    id = (select auth_privado.uid())
    or (select cadastro.realizacao_ator_administrador())
  );
create policy realizacao_usuario_lock on public.usuario
  for update to ffcmapp_realizacao_compromisso_owner using (
    id = (select auth_privado.uid())
    or (select cadastro.realizacao_ator_administrador())
  ) with check (false);
create policy realizacao_concessao_select on identidade.concessao_equipe
  for select to ffcmapp_realizacao_compromisso_owner using (
    usuario_id = (select auth_privado.uid())
    or (select cadastro.realizacao_ator_administrador())
  );
create policy realizacao_concessao_lock on identidade.concessao_equipe
  for update to ffcmapp_realizacao_compromisso_owner using (
    usuario_id = (select auth_privado.uid())
    or (select cadastro.realizacao_ator_administrador())
  ) with check (false);
create policy realizacao_sessao_select on identidade.sessao
  for select to ffcmapp_realizacao_compromisso_owner using (usuario_id = (select auth_privado.uid()));
create policy realizacao_sessao_lock on identidade.sessao
  for update to ffcmapp_realizacao_compromisso_owner
  using (usuario_id = (select auth_privado.uid())) with check (false);
create policy realizacao_requisicao_todos on operacao.requisicao
  for all to ffcmapp_realizacao_compromisso_owner
  using (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.registrar_realizacao_compromisso')
  with check (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.registrar_realizacao_compromisso');
create policy realizacao_auditoria_insert on auditoria.evento
  for insert to ffcmapp_realizacao_compromisso_owner with check (
    tipo_objeto = 'agenda_realizacao'
    and acao in ('api.consultar_realizacao_compromisso', 'api.registrar_realizacao_compromisso')
    and ((ator_usuario_id = (select auth_privado.uid()) and ator_auth_id is null)
      or (ator_usuario_id is null and ator_auth_id = (select auth_privado.uid()) and resultado = 'negado'))
  );
-- Audiência no BANCO, não na tela: dono da agenda, ou Administrador ativo.
create policy realizacao_select on cadastro.realizacao_compromisso
  for select to ffcmapp_realizacao_compromisso_owner using (
    usuario_id = (select auth_privado.uid())
    or (select cadastro.realizacao_ator_administrador())
  );
create policy realizacao_insert on cadastro.realizacao_compromisso
  for insert to ffcmapp_realizacao_compromisso_owner with check (
    autor_usuario_id = (select auth_privado.uid())
    and (usuario_id = (select auth_privado.uid())
      or (select cadastro.realizacao_ator_administrador()))
  );

-- Operação privada. Duas ações: consultar e registrar. Registrar e retificar são a mesma
-- ação — retificar grava versão nova e preserva a anterior. Auditoria obrigatória na mesma
-- transação, inclusive na negação.
create function operacao.realizacao_compromisso_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; agenda uuid; registro uuid;
  inicio timestamptz; fim timestamptz; acao text;
  concessao uuid; perfil text; sujeito_ator text; sujeito text; dominio text; google record;
  autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; pedido jsonb;
  evento text; destino text; situacao text; motivo text; observacao jsonb;
  esperada integer; atual integer; aud uuid;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'agenda_usuario_id', 'eventos', 'registro_id', 'evento_id',
      'situacao', 'motivo', 'observacao', 'aad', 'evento_destino_id', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; agenda := (e->>'agenda_usuario_id')::uuid;
    registro := (e->>'registro_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
    esperada := (e->>'versao_esperada')::integer;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.consultar_realizacao_compromisso', 'api.registrar_realizacao_compromisso')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
      select i.provider_id, i.identity_data into google from auth_privado.identidades() i
        where i.user_id = ator and i.provider = 'google'
        and bloqueios_auth.travar(ator, sessao)
        and exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()))
        and (select count(*) from auth_privado.identidades() j where j.user_id = ator and j.provider = 'google') = 1;
      if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true'
        and google.identity_data#>>'{custom_claims,hd}' = dominio then
        select c.id, c.perfil, c.subject_google into concessao, perfil, sujeito_ator
          from identidade.concessao_equipe c
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace' for share;
        if found and perfil in ('administrador', 'profissional') and sujeito_ator = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = perfil for share;
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
  end if;
  agenda := coalesce(agenda, ator);
  -- Agenda alheia é alçada do Administrador. Família nunca chega aqui: não tem concessão
  -- de equipe vinculada por google_workspace.
  if agenda is distinct from ator and perfil is distinct from 'administrador' then autorizado := false; end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'agenda_realizacao', agenda, 'negado', req);
    else
      insert into auditoria.evento(id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'agenda_realizacao', agenda, 'negado', req);
    end if;
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.consultar_realizacao_compromisso' then
    if e - array['request_id', 'agenda_usuario_id', 'eventos', 'atestado'] <> '{}'::jsonb
      or jsonb_typeof(e->'eventos') is distinct from 'array'
      or jsonb_array_length(e->'eventos') not between 1 and 250
      or exists(select 1 from jsonb_array_elements(e->'eventos') p
        where jsonb_typeof(p) is distinct from 'object'
          or p - array['evento_id', 'fim'] <> '{}'::jsonb
          or jsonb_typeof(p->'evento_id') is distinct from 'string'
          or coalesce(p->>'evento_id', '') !~ '^[A-Za-z0-9_-]+$'
          or length(p->>'evento_id') > 1024
          or (p ? 'fim' and p->'fim' <> 'null'::jsonb
            and coalesce(p->>'fim', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')) then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    pedido := e->'eventos';
  else
    evento := e->>'evento_id'; destino := e->>'evento_destino_id';
    situacao := e->>'situacao'; motivo := e->>'motivo'; observacao := e->'observacao';
    if observacao = 'null'::jsonb then observacao := null; end if;
    if e - array['request_id', 'agenda_usuario_id', 'registro_id', 'evento_id', 'situacao',
        'motivo', 'observacao', 'aad', 'evento_destino_id', 'versao_esperada',
        'chave_idempotencia', 'digest_idempotencia', 'atestado'] <> '{}'::jsonb
      or registro is null or esperada is null or esperada < 0 or esperada >= 2147483646
      or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
      or coalesce(e->>'versao_esperada', '') !~ '^(0|[1-9][0-9]*)$'
      or jsonb_typeof(e->'evento_id') is distinct from 'string'
      or coalesce(evento, '') !~ '^[A-Za-z0-9_-]+$' or length(evento) > 1024
      or jsonb_typeof(e->'situacao') is distinct from 'string'
      or situacao not in ('realizado', 'faltou', 'cancelado', 'remarcado')
      -- Catálogo fechado de barreiras. Nada aqui classifica risco.
      or (motivo is not null and (jsonb_typeof(e->'motivo') is distinct from 'string'
        or motivo not in ('transporte', 'custo', 'disponibilidade', 'outras')))
      or (situacao = 'faltou' and motivo is null)
      or (situacao = 'realizado' and (motivo is not null or observacao is not null))
      or (situacao = 'remarcado') <> (destino is not null)
      or (destino is not null and (jsonb_typeof(e->'evento_destino_id') is distinct from 'string'
        or destino !~ '^[A-Za-z0-9_-]+$' or length(destino) > 1024 or destino = evento))
      or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
      or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
      or (observacao is null) <> (e->'aad' is null)
      or (observacao is not null and e->'aad' is distinct from jsonb_build_object(
        'tabela', 'cadastro.realizacao_compromisso', 'registro_id', registro::text,
        'versao', esperada + 1, 'campo', 'observacao', 'formato', 1)) then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    if observacao is not null and (jsonb_typeof(observacao) is distinct from 'object'
      or observacao - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] <> '{}'::jsonb
      or observacao->'formato' is distinct from '1'::jsonb
      or jsonb_typeof(observacao->'key_id') is distinct from 'string'
      or coalesce(length(observacao->>'key_id') between 1 and 128, false) is not true
      or coalesce(observacao->>'nonce', '') !~ '^[A-Za-z0-9_-]{16}$'
      or coalesce(observacao->>'tag', '') !~ '^[A-Za-z0-9_-]{22}$'
      or coalesce(length(observacao->>'ciphertext') between 1 and 8192
        and observacao->>'ciphertext' ~ '^[A-Za-z0-9_-]+$', false) is not true) then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    pedido := jsonb_build_array(jsonb_build_object('evento_id', evento));
  end if;
  -- `subject_google` NUNCA vem do cliente: sai da concessão vigente do dono da agenda.
  if agenda = ator then
    sujeito := sujeito_ator;
  else
    select c.subject_google into sujeito from identidade.concessao_equipe c
      where c.usuario_id = agenda and c.estado = 'vinculada' and c.metodo = 'google_workspace' for share;
    if found then
      perform 1 from public.usuario u where u.id = agenda and u.ativo and u.perfil in ('administrador', 'profissional') for share;
      if not found then sujeito := null; end if;
    else
      sujeito := null;
    end if;
  end if;
  if sujeito is null then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'agenda_realizacao', agenda, 'negado', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.registrar_realizacao_compromisso' then
    select * into anterior from operacao.requisicao r
      where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
    repeticao := found;
    if not found then
      select coalesce(max(r.versao), 0) into atual from cadastro.realizacao_compromisso r
        where r.usuario_id = agenda and r.subject_google = sujeito and r.evento_id = evento;
      if atual is distinct from esperada then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'agenda_realizacao', agenda, 'negado', req);
        if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end if;
      aud := gen_random_uuid();
      insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
        values(gen_random_uuid(), ator, acao, e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', registro, esperada + 1)
        on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
      if found then
        begin
          insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
            values(aud, ator, acao, 'agenda_realizacao', agenda, 'permitido', req);
          -- Versão seguinte é a MESMA para duas transações concorrentes: a segunda cai no
          -- índice único, não numa decisão da aplicação.
          insert into cadastro.realizacao_compromisso(id, usuario_id, subject_google, evento_id,
            versao, situacao, motivo, observacao_cifrada, evento_destino_id, autor_usuario_id, auditoria_id)
            values(registro, agenda, sujeito, evento, esperada + 1, situacao, motivo, observacao, destino, ator, aud);
        exception when unique_violation then
          delete from operacao.requisicao where id = anterior.id;
          insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
            values(gen_random_uuid(), ator, acao, 'agenda_realizacao', agenda, 'negado', req);
          if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
          return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
        end;
      else
        repeticao := true;
        select * into anterior from operacao.requisicao r
          where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
      end if;
    end if;
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
      or not exists(select 1 from cadastro.realizacao_compromisso r
        where r.id = anterior.resultado_id and r.usuario_id = agenda and r.versao = anterior.resultado_versao) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'agenda_realizacao', agenda, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
  end if;
  -- Saída SEM paciente, por construção: nem a tabela nem esta consulta alcançam o caso.
  -- `remarcado_de` é a direção inversa do vínculo entre datas.
  with q as (
    select t.ordinality as ordem, (t.p->>'evento_id') as evento_id,
      (case when t.p->'fim' is null or t.p->'fim' = 'null'::jsonb then null
        else (t.p->>'fim')::timestamptz end) as termino
    from jsonb_array_elements(pedido) with ordinality as t(p, ordinality)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'evento_id', q.evento_id,
      'situacao', cadastro.realizacao_situacao_derivada(v.situacao, q.termino, clock_timestamp()),
      'situacao_registrada', v.situacao,
      'motivo', v.motivo,
      'observacao', v.observacao_cifrada,
      'evento_destino_id', v.evento_destino_id,
      'versao', coalesce(v.versao, 0),
      'registrado_em', v.registrado_em,
      'autor_usuario_id', v.autor_usuario_id,
      'registro_id', v.id,
      'remarcado_de', coalesce(o.origens, '[]'::jsonb)) order by q.ordem), '[]'::jsonb)
    into resultado
    from q
    left join lateral (
      select r.id, r.versao, r.situacao, r.motivo, r.observacao_cifrada, r.evento_destino_id,
        r.registrado_em, r.autor_usuario_id
      from cadastro.realizacao_compromisso r
      where r.usuario_id = agenda and r.subject_google = sujeito and r.evento_id = q.evento_id
      order by r.versao desc limit 1) v on true
    left join lateral (
      select jsonb_agg(x.evento_id order by x.evento_id) as origens from (
        select distinct on (r2.evento_id) r2.evento_id, r2.evento_destino_id
        from cadastro.realizacao_compromisso r2
        where r2.usuario_id = agenda and r2.subject_google = sujeito
          and exists(select 1 from cadastro.realizacao_compromisso r3
            where r3.usuario_id = agenda and r3.subject_google = sujeito
              and r3.evento_id = r2.evento_id and r3.evento_destino_id = q.evento_id)
        order by r2.evento_id, r2.versao desc) x
      where x.evento_destino_id = q.evento_id) o on true;
  if acao = 'api.consultar_realizacao_compromisso' or repeticao then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'agenda_realizacao', agenda, 'permitido', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s
    where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return jsonb_build_object('ok', true, 'dados', jsonb_build_object(
    'agenda_usuario_id', agenda, 'compromissos', resultado), 'request_id', req, 'repeticao', repeticao);
end $$;
revoke all on function operacao.realizacao_compromisso_privada(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.realizacao_compromisso_privada(jsonb) to ffcmapp_realizacao_compromisso_owner;

create function api.realizacao_compromisso_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; alvo uuid; acao text;
begin
  begin
    return operacao.realizacao_compromisso_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    alvo := coalesce((p_transporte#>>'{entrada,agenda_usuario_id}')::uuid, auth_privado.uid());
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'agenda_realizacao', alvo, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.realizacao_compromisso_privado(jsonb) from public, anon, authenticated, service_role;
alter function api.realizacao_compromisso_privado(jsonb) owner to ffcmapp_realizacao_compromisso_owner;
set role ffcmapp_realizacao_compromisso_owner;
revoke all on function api.realizacao_compromisso_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.realizacao_migrador'), false);
revoke create on schema api from ffcmapp_realizacao_compromisso_owner;
revoke ffcmapp_realizacao_compromisso_owner from current_user;

-- O verificador do atestado é de outro owner; conceder exige assumir o papel dono.
select set_config('ffcmapp.realizacao_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.realizacao_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
      join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text)
  to ffcmapp_realizacao_compromisso_owner;
reset role;
select set_config('role', current_setting('ffcmapp.realizacao_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.realizacao_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
