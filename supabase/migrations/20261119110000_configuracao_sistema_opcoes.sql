-- Decisão do solicitante (11/11/2026): o modelo de transcrição é escolhido "na plataforma".
-- Escolher pressupõe uma lista: digitar o identificador de um modelo de memória não é
-- escolha, é adivinhação, e um identificador errado só apareceria como falha em produção.
--
-- `opcoes` é o conjunto de valores aceitos de uma chave de texto. Continua valendo a regra
-- de `20261117400000`: o CATÁLOGO (chave, tipo, rótulo, descrição, exposição e agora opções)
-- é definido por migration; a tela edita VALOR. O owner da operação administrativa não tem
-- UPDATE nesta coluna, então nem uma falha na função conseguiria ampliar a lista.
-- CHECK não aceita subconsulta, e a lista precisa ser percorrida elemento a elemento.
-- Uma função IMMUTABLE resolve isso sem abrir espaço para a validação ficar só no código:
-- a restrição vale para qualquer caminho de escrita, inclusive um defeito futuro na função
-- administrativa.
create function identidade.opcoes_configuracao_validas(p_opcoes jsonb) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select p_opcoes is null or (
    jsonb_typeof(p_opcoes) = 'array'
    and jsonb_array_length(p_opcoes) between 1 and 50
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_opcoes) o
      where jsonb_typeof(o.value) is distinct from 'string'
        or pg_catalog.btrim(o.value #>> '{}') = ''
        or pg_catalog.length(o.value #>> '{}') > 200
    )
  );
$$;
revoke all on function identidade.opcoes_configuracao_validas(jsonb) from public, anon, authenticated, service_role;
-- Função usada em CHECK roda como quem escreve: sem este EXECUTE, QUALQUER update na tabela
-- falharia com "permission denied for function". O owner da operação administrativa é o
-- único que escreve aqui.
grant execute on function identidade.opcoes_configuracao_validas(jsonb) to ffcmapp_configuracao_sistema_owner;

alter table identidade.configuracao_sistema
  add column opcoes jsonb,
  add constraint configuracao_sistema_opcoes_formato_chk
    check (identidade.opcoes_configuracao_validas(opcoes) is true),
  -- Lista só faz sentido para texto, e o valor corrente tem de pertencer a ela: uma opção
  -- removida do catálogo não pode deixar para trás um valor órfão passando por válido.
  add constraint configuracao_sistema_opcoes_valor_chk check ((
    opcoes is null
    or (tipo = 'texto' and opcoes @> jsonb_build_array(valor))
  ) is true);

comment on column identidade.configuracao_sistema.opcoes is
  'Valores aceitos quando a chave é escolhida numa lista. Definido por migration; a tela só escolhe entre eles.';

-- A operação administrativa passa a devolver `opcoes` e a recusar valor fora da lista.
-- Única mudança de comportamento: a validação extra e o campo a mais na saída. O bloco de
-- autorização, a idempotência e a auditoria continuam idênticos a `20261117410000`.
create or replace function operacao.configuracao_sistema_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text;
  alvo uuid; tipo_atual text; versao_atual integer; esperada integer; item jsonb; opcoes_atuais jsonb;
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
      'opcoes', c.opcoes,
      'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em)
      order by c.chave), '[]'::jsonb)
      into resultado from identidade.configuracao_sistema c;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'configuracao_sistema', null, 'permitido', req);
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
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
  select c.id, c.tipo, c.versao, c.opcoes into alvo, tipo_atual, versao_atual, opcoes_atuais
    from identidade.configuracao_sistema c where c.chave = e->>'configuracao_chave' for update;
  if not found then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'configuracao_sistema', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
  end if;
  if (tipo_atual = 'booleano' and jsonb_typeof(e->'valor') is distinct from 'boolean')
    or (tipo_atual = 'numero' and jsonb_typeof(e->'valor') is distinct from 'number')
    or (tipo_atual = 'texto' and (jsonb_typeof(e->'valor') is distinct from 'string'
      or coalesce(length(e->>'valor') between 1 and 600, false) is not true))
    or (tipo_atual = 'lista' and (jsonb_typeof(e->'valor') is distinct from 'array'
      or jsonb_array_length(e->'valor') not between 1 and 50)) then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  -- Chave com catálogo de opções só aceita um dos valores do catálogo. A tela escolhe,
  -- não inventa: um identificador de modelo digitado errado seria falha só em produção.
  if opcoes_atuais is not null and not (opcoes_atuais @> jsonb_build_array(e->'valor')) then
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
    'descricao', c.descricao, 'exposicao', c.exposicao, 'versao', c.versao, 'opcoes', c.opcoes,
    'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em)
    into resultado from identidade.configuracao_sistema c where c.id = alvo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.configuracao_sistema_operacao_privada(jsonb) from public, anon, authenticated, service_role;
