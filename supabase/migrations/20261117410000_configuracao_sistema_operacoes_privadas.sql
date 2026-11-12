-- Preparação privada. Sem grants de aplicação; exige revisão independente e provas reais antes de exposição.
-- Administração da configuração do sistema (diretriz do solicitante de 11/11/2026), só por
-- Administrador. Espelha o bloco de autorização admin-only de
-- `operacao.campo_extra_plano_operacao_privada`, sem alteração nessa lógica.
--
-- `gravar` SÓ ATUALIZA valor de chave existente: nunca cria, nunca renomeia, nunca muda tipo,
-- rótulo, descrição ou exposição. O catálogo de chaves pertence às migrations porque quem lê a
-- configuração é o código — chave criada pela tela não teria leitor, e tipo editável pela tela
-- invalidaria a validação do valor. Por isso `versao_esperada` é sempre > 0 aqui.
create function operacao.configuracao_sistema_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text;
  alvo uuid; tipo_atual text; versao_atual integer; esperada integer; item jsonb;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'configuracao_chave', 'valor', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_configuracao_sistema', 'api.gravar_configuracao_sistema')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Bloco de autorização idêntico ao de operacao.criar_concessao_equipe_privado (admin-only):
  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
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
        values(gen_random_uuid(), ator, acao, 'configuracao_sistema', null, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_configuracao_sistema' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('chave', c.chave, 'valor', c.valor, 'tipo', c.tipo,
      'rotulo', c.rotulo, 'descricao', c.descricao, 'exposicao', c.exposicao, 'versao', c.versao,
      'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em)
      order by c.chave), '[]'::jsonb)
      into resultado from identidade.configuracao_sistema c;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'configuracao_sistema', null, 'permitido', req);
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
  -- acao = 'api.gravar_configuracao_sistema'
  if jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^[1-9][0-9]*$'
    or coalesce(e->>'configuracao_chave', '') !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
    or e->'valor' is null
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or auditoria_id is null then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  esperada := (e->>'versao_esperada')::integer;
  -- Trava a linha antes do recibo: serializa duas administrações na mesma chave e dá o uuid que
  -- o recibo de idempotência e a auditoria precisam referenciar.
  select c.id, c.tipo, c.versao into alvo, tipo_atual, versao_atual
    from identidade.configuracao_sistema c where c.chave = e->>'configuracao_chave' for update;
  if not found then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'configuracao_sistema', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
  end if;
  -- O tipo vem do catálogo, não da entrada: a tela edita valor, nunca o formato da chave.
  if (tipo_atual = 'booleano' and jsonb_typeof(e->'valor') is distinct from 'boolean')
    or (tipo_atual = 'numero' and jsonb_typeof(e->'valor') is distinct from 'number')
    or (tipo_atual = 'texto' and (jsonb_typeof(e->'valor') is distinct from 'string'
      or coalesce(length(e->>'valor') between 1 and 600, false) is not true))
    or (tipo_atual = 'lista' and (jsonb_typeof(e->'valor') is distinct from 'array'
      or jsonb_array_length(e->'valor') not between 1 and 50)) then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  if tipo_atual = 'lista' then
    for item in select value from jsonb_array_elements(e->'valor') loop
      if jsonb_typeof(item) is distinct from 'string'
        or coalesce(length(btrim(item #>> '{}')) between 1 and 200, false) is not true then
        raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
      end if;
    end loop;
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.gravar_configuracao_sistema', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, esperada + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = 'api.gravar_configuracao_sistema' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
      or anterior.resultado_id is distinct from alvo or anterior.resultado_versao is distinct from esperada + 1
      or versao_atual is distinct from esperada + 1 then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'configuracao_sistema', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    if versao_atual is distinct from esperada then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'configuracao_sistema', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    update identidade.configuracao_sistema
      set valor = e->'valor', versao = versao_atual + 1, atualizado_por_usuario_id = ator,
        atualizado_em = clock_timestamp()
      where id = alvo and versao = versao_atual;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'configuracao_sistema', alvo, 'permitido', req);
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object('chave', c.chave, 'valor', c.valor, 'tipo', c.tipo, 'rotulo', c.rotulo,
    'descricao', c.descricao, 'exposicao', c.exposicao, 'versao', c.versao,
    'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em)
    into resultado from identidade.configuracao_sistema c where c.id = alvo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.configuracao_sistema_operacao_privada(jsonb) from public, anon, authenticated, service_role;

create function api.configuracao_sistema_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; acao text;
begin
  begin
    return operacao.configuracao_sistema_operacao_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'configuracao_sistema', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.configuracao_sistema_privado(jsonb) from public, anon, authenticated, service_role;

-- Owner dedicado, privilégios mínimos, sem grant de aplicação. Revisão independente pendente.
create role ffcmapp_configuracao_sistema_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_configuracao_sistema_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_configuracao_sistema_owner;
grant usage on schema public, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_configuracao_sistema_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.configuracao_sistema_operacao_privada(jsonb) to ffcmapp_configuracao_sistema_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_configuracao_sistema_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_configuracao_sistema_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_configuracao_sistema_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_configuracao_sistema_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_configuracao_sistema_owner;
-- UPDATE só nas colunas de valor. `chave`, `tipo`, `rotulo`, `descricao` e `exposicao` são o
-- catálogo: nem o owner desta operação pode mexer, logo a tela não muda tipo nem renomeia chave
-- mesmo que a função tivesse defeito. Sem INSERT e sem DELETE: a tela não cria nem apaga chave.
grant select, update (valor, versao, atualizado_por_usuario_id, atualizado_em) on identidade.configuracao_sistema to ffcmapp_configuracao_sistema_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_configuracao_sistema_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_configuracao_sistema_owner;
create policy configuracao_sistema_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_configuracao_sistema_owner using (true);
create policy configuracao_sistema_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_configuracao_sistema_owner using (true) with check (false);
create policy configuracao_sistema_usuario_select on public.usuario for select to ffcmapp_configuracao_sistema_owner using (id = (select auth_privado.uid()));
create policy configuracao_sistema_usuario_lock on public.usuario for update to ffcmapp_configuracao_sistema_owner using (id = (select auth_privado.uid())) with check (false);
create policy configuracao_sistema_concessao_select on identidade.concessao_equipe for select to ffcmapp_configuracao_sistema_owner using (usuario_id = (select auth_privado.uid()));
create policy configuracao_sistema_concessao_lock on identidade.concessao_equipe for update to ffcmapp_configuracao_sistema_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy configuracao_sistema_excecao_select on identidade.excecao_tecnica for select to ffcmapp_configuracao_sistema_owner using (usuario_id = (select auth_privado.uid()));
create policy configuracao_sistema_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_configuracao_sistema_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy configuracao_sistema_sessao_select on identidade.sessao for select to ffcmapp_configuracao_sistema_owner using (usuario_id = (select auth_privado.uid()));
create policy configuracao_sistema_sessao_lock on identidade.sessao for update to ffcmapp_configuracao_sistema_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy configuracao_sistema_rw on identidade.configuracao_sistema for all to ffcmapp_configuracao_sistema_owner using (true) with check (true);
create policy configuracao_sistema_requisicao on operacao.requisicao to ffcmapp_configuracao_sistema_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_configuracao_sistema') with check (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_configuracao_sistema');
create policy configuracao_sistema_auditoria on auditoria.evento for insert to ffcmapp_configuracao_sistema_owner with check (ator_usuario_id = (select auth_privado.uid()));
alter function api.configuracao_sistema_privado(jsonb) owner to ffcmapp_configuracao_sistema_owner;
select set_config('ffcmapp.configuracao_sistema_migrador', current_user, false);
set role ffcmapp_configuracao_sistema_owner;
revoke all on function api.configuracao_sistema_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.configuracao_sistema_migrador'), false);
revoke create on schema api from ffcmapp_configuracao_sistema_owner;
revoke ffcmapp_configuracao_sistema_owner from current_user;

select set_config('ffcmapp.configuracao_sistema_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.configuracao_sistema_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_configuracao_sistema_owner;
reset role;
select set_config('role', current_setting('ffcmapp.configuracao_sistema_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.configuracao_sistema_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
