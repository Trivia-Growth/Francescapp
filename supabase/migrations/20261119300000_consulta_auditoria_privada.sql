-- Preparação privada. Sem grants de aplicação; exige revisão independente e provas reais antes de exposição.
-- FR-039 (openspec/specs/sigilo-e-governanca/spec.md): "Registrar consultas, alterações,
-- downloads/exportações e mudanças de acesso com identidade, data e objeto. Apenas responsáveis
-- autorizados podem consultar a auditoria, que deve evitar repetir conteúdo clínico
-- desnecessariamente."
--
-- O REGISTRO já existia: toda operação privada grava em `auditoria.evento` nos caminhos
-- `permitido` e `negado`, e o gatilho `evento_append_only` (20261026150000) recusa UPDATE/DELETE.
-- O que faltava é a CONSULTA. O contrato já estava escrito e sem implementação:
-- `contratosRotas.consultarAuditoria` e `contratosRpc.consultarAuditoria` (administrador,
-- `api.consultar_auditoria`). Esta migration implementa o que esses contratos já prometiam.
--
-- Decisões que mudam o modelo de ameaça:
-- 1. "evitar repetir conteúdo clínico" vira GRANT DE COLUNA, não disciplina de quem escreve a
--    consulta. O owner recebe `select` apenas em (id, instante, ator_usuario_id, ator_auth_id,
--    operador_restrito, acao, tipo_objeto, objeto_id, resultado). `motivo_cifrado`
--    (20261109100000) é texto livre sobre pessoa identificada e NÃO entra no grant: mesmo que
--    esta função tivesse defeito, o envelope cifrado não é alcançável por este caminho.
--    `request_id` também fica de fora — correlaciona chamadas e não é o que a tela precisa.
-- 2. Consultar a auditoria é, ela própria, um evento auditável (o requisito manda registrar
--    "consultas"). Grava nos dois caminhos, como as demais operações.
-- 3. Não há filtro por CASO. `auditoria.evento` não tem `paciente_id`: guarda `tipo_objeto` +
--    `objeto_id`, e `objeto_id` é a linha alvo (uma versão, um contato, uma concessão), não o
--    paciente. Resolver objeto para caso exigiria juntar com cada tabela de domínio dentro de uma
--    função admin-only — ou seja, dar a este owner leitura de todo o domínio clínico para montar
--    um filtro. Isso contraria o item 1. Fica registrado como limitação em tasks.md, com decisão
--    pendente do solicitante; não é escolhida aqui uma semântica de "caso" que a trilha não tem.
-- 4. Paginação por cursor na mesma forma de `operacao.listar_concessoes_equipe_privado`
--    (20261112080000): chave composta (instante, id), `limite+1` para saber se há próxima página.
--    A ordem é DECRESCENTE — auditoria se lê do mais recente para o mais antigo.
create function operacao.consultar_auditoria_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false;
  limite integer; cursor_id uuid; cursor_instante timestamptz;
  filtro_ator uuid; filtro_objeto uuid; filtro_acao text; filtro_resultado text;
  de timestamptz; ate timestamptz; pagina jsonb;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'limite', 'cursor', 'ator_id', 'objeto_id', 'acao',
      'resultado', 'instante_de', 'instante_ate', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object'
    or jsonb_typeof(e->'limite') is distinct from 'number'
    or coalesce(e->>'limite', '') !~ '^(100|[1-9][0-9]?)$'
    or (e ? 'cursor' and jsonb_typeof(e->'cursor') is distinct from 'string')
    or (e ? 'ator_id' and jsonb_typeof(e->'ator_id') is distinct from 'string')
    or (e ? 'objeto_id' and jsonb_typeof(e->'objeto_id') is distinct from 'string')
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
        v.acao, v.tipo_objeto, v.objeto_id, v.resultado
      from auditoria.evento v
      where (filtro_ator is null or v.ator_usuario_id = filtro_ator or v.ator_auth_id = filtro_ator)
        and (filtro_objeto is null or v.objeto_id = filtro_objeto)
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
      'resultado', n.resultado) order by instante desc, id desc) filter(where ordem <= limite), '[]'::jsonb),
      'proximo_cursor', case when count(*) > limite then max(id::text) filter(where ordem = limite) end)
      into pagina from n;
  end if;
  autorizado := autorizado and fim > clock_timestamp() and exists(select 1 from auth_privado.sessoes() s
    where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()));
  -- A consulta da auditoria é ela própria auditada (FR-039 manda registrar "consultas").
  if exists(select 1 from public.usuario where id = ator) then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, 'api.consultar_auditoria', 'evento', null,
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
revoke all on function operacao.consultar_auditoria_privado(jsonb) from public, anon, authenticated, service_role;

create function api.consultar_auditoria(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid;
begin
  begin
    return operacao.consultar_auditoria_privado(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), 'api.consultar_auditoria', 'evento', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.consultar_auditoria(jsonb) from public, anon, authenticated, service_role;

-- Owner dedicado, privilégios mínimos, sem grant de aplicação. Revisão independente pendente.
create role ffcmapp_consulta_auditoria_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_consulta_auditoria_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_consulta_auditoria_owner;
grant usage on schema public, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_consulta_auditoria_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.consultar_auditoria_privado(jsonb) to ffcmapp_consulta_auditoria_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_consulta_auditoria_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_consulta_auditoria_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_consulta_auditoria_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_consulta_auditoria_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_consulta_auditoria_owner;
-- O grant de coluna É o controle de "não repetir conteúdo clínico" (ver nota 1 no topo).
-- `motivo_cifrado` e `request_id` ficam deliberadamente de fora.
grant select (id, instante, ator_usuario_id, ator_auth_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado) on auditoria.evento to ffcmapp_consulta_auditoria_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_consulta_auditoria_owner;
create policy consulta_auditoria_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_consulta_auditoria_owner using (true);
create policy consulta_auditoria_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_consulta_auditoria_owner using (true) with check (false);
create policy consulta_auditoria_usuario_select on public.usuario for select to ffcmapp_consulta_auditoria_owner using (id = (select auth_privado.uid()));
create policy consulta_auditoria_usuario_lock on public.usuario for update to ffcmapp_consulta_auditoria_owner using (id = (select auth_privado.uid())) with check (false);
create policy consulta_auditoria_concessao_select on identidade.concessao_equipe for select to ffcmapp_consulta_auditoria_owner using (usuario_id = (select auth_privado.uid()));
create policy consulta_auditoria_concessao_lock on identidade.concessao_equipe for update to ffcmapp_consulta_auditoria_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy consulta_auditoria_excecao_select on identidade.excecao_tecnica for select to ffcmapp_consulta_auditoria_owner using (usuario_id = (select auth_privado.uid()));
create policy consulta_auditoria_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_consulta_auditoria_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy consulta_auditoria_sessao_select on identidade.sessao for select to ffcmapp_consulta_auditoria_owner using (usuario_id = (select auth_privado.uid()));
create policy consulta_auditoria_sessao_lock on identidade.sessao for update to ffcmapp_consulta_auditoria_owner using (usuario_id = (select auth_privado.uid())) with check (false);
-- Leitura da trilha inteira: é o ponto da operação, e a autorização admin-only já foi verificada
-- acima. Sem policy de UPDATE/DELETE: o gatilho `evento_append_only` recusaria, mas também não há
-- grant nem policy que permita sequer tentar.
create policy consulta_auditoria_evento_select on auditoria.evento for select to ffcmapp_consulta_auditoria_owner using (true);
create policy consulta_auditoria_evento_insert on auditoria.evento for insert to ffcmapp_consulta_auditoria_owner with check (ator_usuario_id = (select auth_privado.uid()));
alter function api.consultar_auditoria(jsonb) owner to ffcmapp_consulta_auditoria_owner;
select set_config('ffcmapp.consulta_auditoria_migrador', current_user, false);
set role ffcmapp_consulta_auditoria_owner;
revoke all on function api.consultar_auditoria(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.consulta_auditoria_migrador'), false);
revoke create on schema api from ffcmapp_consulta_auditoria_owner;
revoke ffcmapp_consulta_auditoria_owner from current_user;

select set_config('ffcmapp.consulta_auditoria_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.consulta_auditoria_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_consulta_auditoria_owner;
reset role;
select set_config('role', current_setting('ffcmapp.consulta_auditoria_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.consulta_auditoria_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
