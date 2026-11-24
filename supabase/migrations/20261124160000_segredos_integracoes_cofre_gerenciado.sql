begin;
-- Corrige o cadastro de credencial de integração, que NUNCA funcionou contra um projeto
-- Supabase gerenciado. Observado em 24/11/2026 em produção: as quatro credenciais em
-- `versao = 0`, nenhuma linha em `identidade.segredo_integracao_versao`, nenhum segredo de
-- integração no cofre. A resposta era `pendencia_externa` e o banco devolvia 42501.
--
-- CAUSA. `vault.secrets` pertence a `supabase_admin`. O papel administrativo do projeto
-- (`postgres`) pode conceder SELECT nessa tabela, mas NÃO pode conceder UPDATE — e nem tem
-- UPDATE. O `grant select (id, name), update (name) on vault.secrets` da migration
-- `20261125020000` concedeu só o SELECT: GRANT sem privilégio emite AVISO, não erro, então
-- a migration passou e metade dela não existia no banco. Conferido no projeto:
-- `has_table_privilege('postgres','vault.secrets','UPDATE WITH GRANT OPTION')` = false.
--
-- Com isso, duas linhas eram impossíveis:
--   1. `select ... from vault.secrets ... for update` — bloqueio de linha exige UPDATE,
--      DELETE ou TRUNCATE de TABELA; privilégio de coluna não serve. Falhava já na PRIMEIRA
--      gravação, antes de qualquer auditoria, e era isso que derrubava tudo.
--   2. `update vault.secrets set name = ...` — falharia na segunda gravação da mesma chave.
--
-- Por que o teste local não pegou: `supabase/tests/segredos_integracoes_local.sql` roda com
-- papel privilegiado e assina com `assinar_anamnese_fixture`. O acordo com o Vault real,
-- sob os privilégios reais, nunca foi exercitado.
--
-- CORREÇÃO. O bloqueio de linha no cofre sai: a serialização já é feita pelo `for update` da
-- linha de `identidade.segredos_integracoes`, que é o ponto de corte declarado no próprio
-- comentário do código. A renomeação do registro anterior dá lugar a `vault.update_secret`,
-- que é `security definer` de `supabase_admin` e só precisa de EXECUTE — este sim concedível.
--
-- MUDANÇA DE COMPORTAMENTO, declarada: ao substituir uma credencial, o valor cifrado
-- anterior deixa de ser preservado no cofre. O histórico de QUEM trocou, QUANDO e em que
-- versão continua inteiro em `identidade.segredo_integracao_versao`. Credencial girada que
-- continua recuperável é passivo, não patrimônio — mas isto é uma troca de intenção em
-- relação ao desenho original e precisa de confirmação do solicitante.

create or replace function operacao.segredos_integracoes_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text;
  alvo uuid; versao_atual integer; esperada integer; cofre_anterior uuid; cofre_novo uuid;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'segredo_chave', 'valor', 'versao_esperada',
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
    or acao not in ('api.listar_segredos_integracoes', 'api.gravar_segredos_integracoes')
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
        values(gen_random_uuid(), ator, acao, 'segredos_integracoes', null, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_segredos_integracoes' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('chave', c.chave, 'cadastrado', exists(select 1 from vault.secrets v where v.name = c.chave), 'versao', c.versao, 'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em) order by c.chave), '[]'::jsonb) into resultado from identidade.segredos_integracoes c;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'segredos_integracoes', null, 'permitido', req);
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
  -- acao = 'api.gravar_segredos_integracoes'
  if jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^[0-9]+$'
    or coalesce(e->>'segredo_chave', '') !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
    or jsonb_typeof(e->'valor') is distinct from 'string'
    or coalesce(length(btrim(e->>'valor')) between 1 and 48000, false) is not true
    or length(e->>'valor') > 48000
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or auditoria_id is null then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  esperada := (e->>'versao_esperada')::integer;
  -- Trava a linha antes do recibo: serializa duas administrações na mesma chave e dá o uuid que
  -- o recibo de idempotência e a auditoria precisam referenciar.
  select c.id, c.versao into alvo, versao_atual
    from identidade.segredos_integracoes c where c.chave = e->>'segredo_chave' for update;
  if not found then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'segredos_integracoes', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.gravar_segredos_integracoes', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, esperada + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = 'api.gravar_segredos_integracoes' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
      or anterior.resultado_id is distinct from alvo or anterior.resultado_versao is distinct from esperada + 1
      or versao_atual is distinct from esperada + 1 then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'segredos_integracoes', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    if versao_atual is distinct from esperada then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'segredos_integracoes', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    -- Sem `for update` e sem `update`: nenhum dos dois é possível aqui. Ver cabeçalho.
    -- A serialização de duas administrações na mesma chave já acontece no `for update` da
    -- linha de `identidade.segredos_integracoes`, logo acima, que é o ponto de corte real.
    select v.id into cofre_anterior from vault.secrets v where v.name = e->>'segredo_chave';
    if cofre_anterior is not null then
      -- Substitui o valor no mesmo registro, pela função do próprio Vault. O nome não muda.
      perform vault.update_secret(cofre_anterior, e->>'valor', e->>'segredo_chave', 'Integração gerenciada pelo FFCMApp');
      cofre_novo := cofre_anterior;
    else
      select vault.create_secret(e->>'valor', e->>'segredo_chave', 'Integração gerenciada pelo FFCMApp') into cofre_novo;
    end if;
    insert into identidade.segredo_integracao_versao(id, segredo_id, versao, vault_id, cadastrado_por_usuario_id)
      values(gen_random_uuid(), alvo, versao_atual + 1, cofre_novo, ator);
    update identidade.segredos_integracoes set versao = versao_atual + 1,
      atualizado_por_usuario_id = ator, atualizado_em = clock_timestamp() where id = alvo;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'segredos_integracoes', alvo, 'permitido', req);
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object('chave', c.chave, 'cadastrado', exists(select 1 from vault.secrets v where v.name = c.chave), 'versao', c.versao, 'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em) into resultado from identidade.segredos_integracoes c where c.id = alvo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;

revoke all on function operacao.segredos_integracoes_operacao_privada(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.segredos_integracoes_operacao_privada(jsonb) to ffcmapp_segredos_integracoes_owner;
-- EXECUTE é o bastante: a função é `security definer` de `supabase_admin`. Nenhum privilégio
-- novo sobre a tabela `vault.secrets` é concedido, nem seria possível concedê-lo aqui.
grant execute on function vault.update_secret(uuid,text,text,text,uuid) to ffcmapp_segredos_integracoes_owner;
-- O dono continua sendo o migrador, como em `20261125020000`: `create or replace` preserva o
-- dono, e o papel da fatia não tem CREATE em `operacao` — trocar o dono aqui falharia.

commit;
