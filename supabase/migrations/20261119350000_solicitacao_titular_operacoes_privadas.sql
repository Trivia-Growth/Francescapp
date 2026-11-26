-- Preparação privada. Sem grants de aplicação; exige revisão independente e provas reais antes de exposição.
-- Operações do livro de solicitações do titular (FR-040). Três ações, todas administrador-only,
-- com o mesmo bloco de autorização de `operacao.configuracao_sistema_operacao_privada`.
--
-- PERFIL EXIGIDO É DECISÃO PENDENTE (ver tasks.md). Administrador é a escolha mais restritiva
-- entre as defensáveis, alinhada às demais operações de governança (concessões, configuração,
-- auditoria). Se o solicitante decidir que a case manager também recebe e responde, muda o bloco
-- de autorização desta função — e só ele. Nada aqui assume o contrário.
--
-- `responder` NÃO apaga, não anonimiza e não altera nenhum dado de paciente: grava a medida e o
-- fundamento na própria solicitação. O gatilho da tabela recusa qualquer outra transição.
create function operacao.solicitacao_titular_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text;
  paciente uuid; registro uuid; alvo uuid; esperada integer; versao_atual integer;
  estado_atual text; paciente_alvo uuid; limite integer; cursor_id uuid; cursor_instante timestamptz;
  recebida timestamptz;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'paciente_id', 'solicitacao_id', 'registro_id', 'tipo', 'descricao',
      'recebida_em', 'medida', 'resposta', 'versao_esperada', 'aad', 'limite', 'cursor',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
    if e ? 'paciente_id' then paciente := (e->>'paciente_id')::uuid; end if;
    if e ? 'registro_id' then registro := (e->>'registro_id')::uuid; end if;
    if e ? 'solicitacao_id' then alvo := (e->>'solicitacao_id')::uuid; end if;
    if e ? 'limite' then limite := (e->>'limite')::integer; end if;
    if e ? 'cursor' then cursor_id := (e->>'cursor')::uuid; end if;
    if e ? 'recebida_em' then recebida := (e->>'recebida_em')::timestamptz; end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_solicitacao_titular', 'api.registrar_solicitacao_titular',
      'api.responder_solicitacao_titular')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio
    or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Bloco de autorização admin-only idêntico ao de operacao.configuracao_sistema_operacao_privada.
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
        values(gen_random_uuid(), ator, acao, 'solicitacao_titular', null, 'negado', req);
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;

  if acao = 'api.listar_solicitacao_titular' then
    if e - array['request_id', 'paciente_id', 'limite', 'cursor', 'atestado'] <> '{}'::jsonb
      or jsonb_typeof(e->'limite') is distinct from 'number'
      or coalesce(e->>'limite', '') !~ '^(100|[1-9][0-9]?)$' then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    if cursor_id is not null then
      select s.recebida_em into cursor_instante from cadastro.solicitacao_titular s where s.id = cursor_id;
      if not found then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'solicitacao_titular', null, 'negado', req);
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end if;
    end if;
    -- A listagem NÃO devolve `descricao_cifrada` nem `resposta_cifrada`: o texto só sai na
    -- leitura de uma solicitação específica, para que abrir a tela não derrame todo o conteúdo.
    with s as (
      select t.id, t.paciente_id, t.tipo, t.recebida_em, t.estado, t.medida, t.versao,
        t.registrada_por_usuario_id, t.respondida_por_usuario_id, t.respondida_em
      from cadastro.solicitacao_titular t
      where (paciente is null or t.paciente_id = paciente)
        and (cursor_id is null or (t.recebida_em, t.id) < (cursor_instante, cursor_id))
      order by t.recebida_em desc, t.id desc limit limite + 1),
    n as (select *, row_number() over(order by recebida_em desc, id desc) ordem from s)
    select jsonb_build_object('itens', coalesce(jsonb_agg(jsonb_build_object(
      'solicitacao_id', n.id, 'paciente_id', n.paciente_id, 'tipo', n.tipo,
      'recebida_em', n.recebida_em, 'estado', n.estado, 'medida', n.medida, 'versao', n.versao,
      'registrada_por_usuario_id', n.registrada_por_usuario_id,
      'respondida_por_usuario_id', n.respondida_por_usuario_id, 'respondida_em', n.respondida_em)
      order by recebida_em desc, id desc) filter(where ordem <= limite), '[]'::jsonb),
      'proximo_cursor', case when count(*) > limite then max(id::text) filter(where ordem = limite) end)
      into resultado from n;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'solicitacao_titular', paciente, 'permitido', req);
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;

  if acao = 'api.registrar_solicitacao_titular' then
    if e - array['request_id', 'paciente_id', 'registro_id', 'tipo', 'descricao', 'recebida_em',
      'aad', 'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
      or paciente is null or registro is null or recebida is null or auditoria_id is null
      or coalesce(e->>'tipo', '') not in ('acesso', 'correcao', 'portabilidade', 'exclusao')
      or jsonb_typeof(e->'descricao') is distinct from 'object'
      or recebida > clock_timestamp()
      or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
      or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
      -- O AAD amarra o envelope à linha que está sendo criada. Sem isso, um envelope cifrado de
      -- outra solicitação poderia ser replantado aqui e decifraria normalmente.
      or e->'aad' is distinct from jsonb_build_object('tabela', 'cadastro.solicitacao_titular',
        'paciente_id', paciente::text, 'registro_id', registro::text, 'versao', 1,
        'campo', 'descricao', 'formato', 1) then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    perform 1 from cadastro.paciente p where p.id = paciente for share;
    if not found then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'solicitacao_titular', null, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
      values(gen_random_uuid(), ator, 'api.registrar_solicitacao_titular', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', registro, 1)
      on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
    if not found then
      select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator
        and r.operacao = 'api.registrar_solicitacao_titular' and r.chave_idempotencia = e->>'chave_idempotencia';
      if anterior.digest_entrada is distinct from e->>'digest_idempotencia'
        or anterior.estado is distinct from 'concluida' or anterior.resultado_id is distinct from registro then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'solicitacao_titular', registro, 'negado', req);
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
      end if;
      repeticao := true;
    else
      begin
        insert into cadastro.solicitacao_titular(id, paciente_id, tipo, descricao_cifrada,
          recebida_em, registrada_por_usuario_id)
          values(registro, paciente, e->>'tipo', e->'descricao', recebida, ator);
      exception when unique_violation then
        delete from operacao.requisicao where id = anterior.id;
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'solicitacao_titular', registro, 'negado', req);
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end;
    end if;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'solicitacao_titular', registro, 'permitido', req);
    if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
      raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
    end if;
    select jsonb_build_object('solicitacao_id', t.id, 'paciente_id', t.paciente_id, 'tipo', t.tipo,
      'recebida_em', t.recebida_em, 'estado', t.estado, 'medida', t.medida, 'versao', t.versao,
      'registrada_por_usuario_id', t.registrada_por_usuario_id,
      'respondida_por_usuario_id', t.respondida_por_usuario_id, 'respondida_em', t.respondida_em)
      into resultado from cadastro.solicitacao_titular t where t.id = registro;
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;

  -- acao = 'api.responder_solicitacao_titular'
  if e - array['request_id', 'solicitacao_id', 'medida', 'resposta', 'versao_esperada', 'aad',
    'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or alvo is null or auditoria_id is null
    or coalesce(e->>'medida', '') not in ('atendida', 'atendida_parcialmente', 'recusada')
    or jsonb_typeof(e->'resposta') is distinct from 'object'
    or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^[1-9][0-9]*$'
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  esperada := (e->>'versao_esperada')::integer;
  select t.paciente_id, t.versao, t.estado into paciente_alvo, versao_atual, estado_atual
    from cadastro.solicitacao_titular t where t.id = alvo for update;
  if not found then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'solicitacao_titular', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
  end if;
  -- O AAD só pode ser conferido depois de ler a linha: ele amarra o envelope ao paciente e à
  -- versão que a resposta vai criar.
  if e->'aad' is distinct from jsonb_build_object('tabela', 'cadastro.solicitacao_titular',
    'paciente_id', paciente_alvo::text, 'registro_id', alvo::text, 'versao', esperada + 1,
    'campo', 'resposta', 'formato', 1) then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.responder_solicitacao_titular', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, esperada + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator
      and r.operacao = 'api.responder_solicitacao_titular' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia'
      or anterior.estado is distinct from 'concluida' or anterior.resultado_id is distinct from alvo
      or anterior.resultado_versao is distinct from esperada + 1
      or versao_atual is distinct from esperada + 1 then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'solicitacao_titular', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    if versao_atual is distinct from esperada or estado_atual is distinct from 'recebida' then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'solicitacao_titular', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    update cadastro.solicitacao_titular
      set estado = 'respondida', medida = e->>'medida', resposta_cifrada = e->'resposta',
        respondida_por_usuario_id = ator, respondida_em = clock_timestamp(), versao = versao_atual + 1
      where id = alvo and versao = versao_atual;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'solicitacao_titular', alvo, 'permitido', req);
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object('solicitacao_id', t.id, 'paciente_id', t.paciente_id, 'tipo', t.tipo,
    'recebida_em', t.recebida_em, 'estado', t.estado, 'medida', t.medida, 'versao', t.versao,
    'registrada_por_usuario_id', t.registrada_por_usuario_id,
    'respondida_por_usuario_id', t.respondida_por_usuario_id, 'respondida_em', t.respondida_em)
    into resultado from cadastro.solicitacao_titular t where t.id = alvo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.solicitacao_titular_operacao_privada(jsonb) from public, anon, authenticated, service_role;

create function api.solicitacao_titular_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; acao text;
begin
  begin
    return operacao.solicitacao_titular_operacao_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'solicitacao_titular', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.solicitacao_titular_privado(jsonb) from public, anon, authenticated, service_role;

-- Owner dedicado, privilégios mínimos, sem grant de aplicação. Revisão independente pendente.
create role ffcmapp_solicitacao_titular_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_solicitacao_titular_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_solicitacao_titular_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_solicitacao_titular_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.solicitacao_titular_operacao_privada(jsonb) to ffcmapp_solicitacao_titular_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_solicitacao_titular_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_solicitacao_titular_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_solicitacao_titular_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_solicitacao_titular_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_solicitacao_titular_owner;
-- `for share` em cadastro.paciente exige UPDATE além de SELECT (comportamento do PostgreSQL),
-- daí o par grant update + policy `_lock` com check(false): trava a linha, não deixa alterá-la.
grant select (id), update (versao) on cadastro.paciente to ffcmapp_solicitacao_titular_owner;
-- Sem DELETE: o gatilho da tabela já recusaria, mas o privilégio também não existe.
grant select, insert, update (estado, medida, resposta_cifrada, respondida_por_usuario_id, respondida_em, versao) on cadastro.solicitacao_titular to ffcmapp_solicitacao_titular_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_solicitacao_titular_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_solicitacao_titular_owner;
create policy solicitacao_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_solicitacao_titular_owner using (true);
create policy solicitacao_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_solicitacao_titular_owner using (true) with check (false);
create policy solicitacao_usuario_select on public.usuario for select to ffcmapp_solicitacao_titular_owner using (id = (select auth_privado.uid()));
create policy solicitacao_usuario_lock on public.usuario for update to ffcmapp_solicitacao_titular_owner using (id = (select auth_privado.uid())) with check (false);
create policy solicitacao_concessao_select on identidade.concessao_equipe for select to ffcmapp_solicitacao_titular_owner using (usuario_id = (select auth_privado.uid()));
create policy solicitacao_concessao_lock on identidade.concessao_equipe for update to ffcmapp_solicitacao_titular_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy solicitacao_excecao_select on identidade.excecao_tecnica for select to ffcmapp_solicitacao_titular_owner using (usuario_id = (select auth_privado.uid()));
create policy solicitacao_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_solicitacao_titular_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy solicitacao_sessao_select on identidade.sessao for select to ffcmapp_solicitacao_titular_owner using (usuario_id = (select auth_privado.uid()));
create policy solicitacao_sessao_lock on identidade.sessao for update to ffcmapp_solicitacao_titular_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy solicitacao_paciente_select on cadastro.paciente for select to ffcmapp_solicitacao_titular_owner using (true);
create policy solicitacao_paciente_lock on cadastro.paciente for update to ffcmapp_solicitacao_titular_owner using (true) with check (false);
create policy solicitacao_titular_rw on cadastro.solicitacao_titular for all to ffcmapp_solicitacao_titular_owner using (true) with check (true);
create policy solicitacao_requisicao on operacao.requisicao to ffcmapp_solicitacao_titular_owner
  using (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_solicitacao_titular', 'api.responder_solicitacao_titular'))
  with check (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_solicitacao_titular', 'api.responder_solicitacao_titular'));
create policy solicitacao_auditoria on auditoria.evento for insert to ffcmapp_solicitacao_titular_owner with check (ator_usuario_id = (select auth_privado.uid()));
alter function api.solicitacao_titular_privado(jsonb) owner to ffcmapp_solicitacao_titular_owner;
select set_config('ffcmapp.solicitacao_titular_migrador', current_user, false);
set role ffcmapp_solicitacao_titular_owner;
revoke all on function api.solicitacao_titular_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.solicitacao_titular_migrador'), false);
revoke create on schema api from ffcmapp_solicitacao_titular_owner;
revoke ffcmapp_solicitacao_titular_owner from current_user;

select set_config('ffcmapp.solicitacao_titular_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.solicitacao_titular_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_solicitacao_titular_owner;
reset role;
select set_config('role', current_setting('ffcmapp.solicitacao_titular_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.solicitacao_titular_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
