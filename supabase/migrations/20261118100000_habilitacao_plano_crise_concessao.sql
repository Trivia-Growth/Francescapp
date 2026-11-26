-- FR-020: marca de habilitação para aprovar plano de crise, guardada na concessão de equipe.
--
-- Decisão do solicitante de 11/11/2026: "profissional habilitado" não é constante no código
-- nem variável de ambiente; é um dado preenchido na tela de administração e guardado no banco.
-- A marca mora na própria concessão (identidade.concessao_equipe) porque é uma propriedade do
-- acesso daquela pessoa, e some junto com ele quando a concessão é revogada.
--
-- A marca só vale para perfil `profissional`: FR-020 diz que a case manager não emite conduta
-- clínica por assumir a coordenação, então administrador não aprova plano de crise. O estado
-- `vinculada` é exigido na gravação e na aprovação, não no CHECK, para que revogar uma
-- concessão continue possível sem esbarrar nesta restrição.
alter table identidade.concessao_equipe
  add column habilitado_plano_crise boolean not null default false,
  add column habilitacao_versao integer not null default 0
    check (habilitacao_versao between 0 and 2147483647),
  add column habilitacao_por_usuario_id uuid references public.usuario (id) on delete no action,
  add column habilitacao_em timestamptz,
  add constraint concessao_habilitacao_perfil_chk
    check ((not habilitado_plano_crise or perfil = 'profissional') is true);

-- Operação administrativa: listar a equipe com a marca e gravar a marca de uma concessão.
-- Bloco de autorização idêntico ao de operacao.aprovador_plano_operacao_privada (admin-only),
-- sem alteração de lógica: Google Workspace vinculado como administrador, ou exceção técnica
-- individual vinculada como administrador.
create function operacao.habilitacao_plano_crise_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; alvo uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text; atual integer;
  alvo_perfil text; alvo_estado text;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'concessao_id', 'habilitado', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; alvo := (e->>'concessao_id')::uuid;
    auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_habilitacao_plano_crise', 'api.gravar_habilitacao_plano_crise')
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
        values(gen_random_uuid(), ator, acao, 'concessao_equipe', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_habilitacao_plano_crise' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    -- Limite fixo: a equipe da clínica cabe muito abaixo disso, e um teto explícito evita
    -- devolver uma página arbitrariamente grande se a tabela crescer por outro caminho.
    select coalesce(jsonb_agg(jsonb_build_object(
        'concessao_id', c.id, 'usuario_id', c.usuario_id, 'email', c.email_cifrado,
        'perfil', c.perfil, 'estado', c.estado,
        'habilitado', c.habilitado_plano_crise, 'versao', c.habilitacao_versao)
      order by c.criada_em, c.id), '[]'::jsonb)
      into resultado
      from (select q.id, q.usuario_id, q.email_cifrado, q.perfil, q.estado,
          q.habilitado_plano_crise, q.habilitacao_versao, q.criada_em
        from identidade.concessao_equipe q order by q.criada_em, q.id limit 500) c;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'concessao_equipe', null, 'permitido', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
  -- acao = 'api.gravar_habilitacao_plano_crise'
  if alvo is null or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^(0|[1-9][0-9]*)$'
    or (e->>'versao_esperada')::integer = 2147483647
    or jsonb_typeof(e->'habilitado') is distinct from 'boolean'
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or auditoria_id is null then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.gravar_habilitacao_plano_crise', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, (e->>'versao_esperada')::integer + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator
      and r.operacao = 'api.gravar_habilitacao_plano_crise' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
      or anterior.resultado_id is distinct from alvo or anterior.resultado_versao is distinct from (e->>'versao_esperada')::integer + 1
      or not exists(select 1 from identidade.concessao_equipe c where c.id = alvo and c.habilitacao_versao = (e->>'versao_esperada')::integer + 1) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'concessao_equipe', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    select c.habilitacao_versao, c.perfil, c.estado into atual, alvo_perfil, alvo_estado
      from identidade.concessao_equipe c where c.id = alvo for update;
    -- Marcar exige concessão de profissional ainda vinculada; desmarcar continua possível
    -- em qualquer estado, para que retirar a habilitação nunca fique bloqueado.
    if not found or atual <> (e->>'versao_esperada')::integer
      or ((e->'habilitado')::boolean and (alvo_perfil <> 'profissional' or alvo_estado <> 'vinculada')) then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'concessao_equipe', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    update identidade.concessao_equipe
      set habilitado_plano_crise = (e->'habilitado')::boolean,
        habilitacao_versao = atual + 1,
        habilitacao_por_usuario_id = ator,
        habilitacao_em = clock_timestamp()
      where id = alvo and habilitacao_versao = atual;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'concessao_equipe', alvo, 'permitido', req);
  if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object(
      'concessao_id', c.id, 'usuario_id', c.usuario_id, 'email', c.email_cifrado,
      'perfil', c.perfil, 'estado', c.estado,
      'habilitado', c.habilitado_plano_crise, 'versao', c.habilitacao_versao)
    into resultado from identidade.concessao_equipe c where c.id = alvo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.habilitacao_plano_crise_privada(jsonb) from public, anon, authenticated, service_role;

create function api.habilitacao_plano_crise_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; alvo uuid; acao text;
begin
  begin
    return operacao.habilitacao_plano_crise_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    alvo := (p_transporte#>>'{entrada,concessao_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'concessao_equipe', alvo, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.habilitacao_plano_crise_privado(jsonb) from public, anon, authenticated, service_role;

-- Owner dedicado, privilégios mínimos. O grant de aplicação fica na migration de grants.
create role ffcmapp_habilitacao_crise_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_habilitacao_crise_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_habilitacao_crise_owner;
grant usage on schema public, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_habilitacao_crise_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.habilitacao_plano_crise_privada(jsonb) to ffcmapp_habilitacao_crise_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_habilitacao_crise_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_habilitacao_crise_owner;
-- Escrita restrita às colunas da habilitação: o owner nunca altera perfil, estado ou e-mail.
grant select (id, usuario_id, perfil, estado, subject_google, metodo, email_cifrado, criada_em,
  habilitado_plano_crise, habilitacao_versao),
  update (habilitado_plano_crise, habilitacao_versao, habilitacao_por_usuario_id, habilitacao_em)
  on identidade.concessao_equipe to ffcmapp_habilitacao_crise_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_habilitacao_crise_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_habilitacao_crise_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_habilitacao_crise_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_habilitacao_crise_owner;
create policy habilitacao_crise_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_habilitacao_crise_owner using (true);
create policy habilitacao_crise_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_habilitacao_crise_owner using (true) with check (false);
create policy habilitacao_crise_usuario_select on public.usuario for select to ffcmapp_habilitacao_crise_owner using (id = (select auth_privado.uid()));
create policy habilitacao_crise_usuario_lock on public.usuario for update to ffcmapp_habilitacao_crise_owner using (id = (select auth_privado.uid())) with check (false);
-- A operação é administrativa: enxerga a equipe inteira, mas só grava a marca, e a própria
-- função exige perfil profissional e concessão vinculada antes de marcar.
create policy habilitacao_crise_concessao_select on identidade.concessao_equipe for select to ffcmapp_habilitacao_crise_owner using (true);
create policy habilitacao_crise_concessao_update on identidade.concessao_equipe for update to ffcmapp_habilitacao_crise_owner using (true) with check (not habilitado_plano_crise or perfil = 'profissional');
create policy habilitacao_crise_excecao_select on identidade.excecao_tecnica for select to ffcmapp_habilitacao_crise_owner using (usuario_id = (select auth_privado.uid()));
create policy habilitacao_crise_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_habilitacao_crise_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy habilitacao_crise_sessao_select on identidade.sessao for select to ffcmapp_habilitacao_crise_owner using (usuario_id = (select auth_privado.uid()));
create policy habilitacao_crise_sessao_lock on identidade.sessao for update to ffcmapp_habilitacao_crise_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy habilitacao_crise_requisicao on operacao.requisicao to ffcmapp_habilitacao_crise_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_habilitacao_plano_crise') with check (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_habilitacao_plano_crise');
create policy habilitacao_crise_auditoria on auditoria.evento for insert to ffcmapp_habilitacao_crise_owner with check (ator_usuario_id = (select auth_privado.uid()));
alter function api.habilitacao_plano_crise_privado(jsonb) owner to ffcmapp_habilitacao_crise_owner;
select set_config('ffcmapp.habilitacao_crise_migrador', current_user, false);
set role ffcmapp_habilitacao_crise_owner;
revoke all on function api.habilitacao_plano_crise_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.habilitacao_crise_migrador'), false);
revoke create on schema api from ffcmapp_habilitacao_crise_owner;
revoke ffcmapp_habilitacao_crise_owner from current_user;

-- O verificador do atestado é de outro owner; conceder exige assumir o papel dono.
select set_config('ffcmapp.habilitacao_crise_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.habilitacao_crise_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_habilitacao_crise_owner;
reset role;
select set_config('role', current_setting('ffcmapp.habilitacao_crise_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.habilitacao_crise_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
