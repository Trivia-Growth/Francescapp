begin;
-- FR-076/FR-081 (diario-de-plantao). Catálogo administrado de ESTADO EMOCIONAL observado.
--
-- DEFEITO CORRIGIDO: `cadastro.turno_estado_emocional_catalogo` nasceu VAZIA em
-- `20261127200000_ficha_plantao.sql:54-57` e sem nenhum caminho de escrita — só
-- `grant select` ao owner da ficha (:208-209). Como a submissão da ficha é ATÔMICA, a
-- validação de `:428-429` levanta `invalid_parameter_value` com catálogo vazio e derruba a
-- transação inteira: período, papel, atividades, observações, pendências e todos os
-- transportes canônicos filhos. O usuário perdia a ficha inteira e recebia `entrada_invalida`
-- genérico. Esta migração dá as duas pontas que faltavam: semeadura inicial e administração.
--
-- SUPOSIÇÃO CONSERVADORA (coordenação, 20/11/2026): o catálogo nasce com oito termos
-- NEUTROS E OBSERVÁVEIS — `agitado`, `apático`, `choroso`, `comunicativo`, `irritado`,
-- `retraído`, `sonolento`, `tranquilo`. São termos de PARTIDA; o vocabulário final é regra de
-- negócio da cliente e o Administrador ajusta pela tela (acrescentar, renomear, desativar).
-- NENHUM termo sugere gravidade, risco, intensidade, nota ou escala, e a `ordem` é
-- alfabética/arbitrária estável, JAMAIS por gravidade. É o mesmo motivo pelo qual o registro
-- canônico de estado emocional não tem `valor`, `unidade` nem `contagem`
-- (`20261127200000:112`): sem número e sem ordem de gravidade não há como derivar média,
-- tendência, limiar ou risco a partir deste registro — FR-076 e FR-081 ficam inviáveis por
-- esquema, não apenas proibidos por texto.
--
-- DECISÃO DE ESTRUTURA: a tabela tem PK `estado text` (chave natural), diferente de
-- `cadastro.papel_declarado_catalogo`, que tem `id uuid`. Esta migração ACRESCENTA `id uuid`
-- e `versao integer` em alteração ADITIVA, com `default` que preserva o comportamento atual:
--   1. `versao` dá o `versao_esperada` do controle otimista do molde do papel declarado;
--   2. `id` dá identidade estável ao termo, para que RENOMEAR seja update e não
--      criar+desativar — a ficha grava o RÓTULO (`turno_medida_versao.qualidade`) e nunca
--      uma referência ao catálogo, então renomear o catálogo não reescreve ficha antiga.
-- `estado` continua sendo a PK e o valor que a RPC da ficha confere em `:428`; nada do
-- caminho da ficha muda. O `grant select` já existente ao owner da ficha é de TABELA, não
-- por coluna, então as colunas novas entram nele sem alteração e sem quebrar `select *`.
--
-- Rollback: drop das funções criadas abaixo, drop role ffcmapp_estado_emocional_owner e
-- drop das colunas acrescentadas em cadastro.turno_estado_emocional_catalogo.

-- 1. Colunas novas, todas com default que preserva o comportamento vigente.
alter table cadastro.turno_estado_emocional_catalogo
  add column id uuid not null default gen_random_uuid(),
  add column versao integer not null default 1 check (versao between 1 and 2147483647),
  add column de_fabrica boolean not null default false,
  add column criado_por_usuario_id uuid references public.usuario (id) on delete no action,
  add column criado_em timestamptz not null default clock_timestamp(),
  add column atualizado_em timestamptz not null default clock_timestamp(),
  add constraint turno_estado_emocional_criador_chk check (de_fabrica or criado_por_usuario_id is not null);
create unique index turno_estado_emocional_catalogo_id_uidx
  on cadastro.turno_estado_emocional_catalogo (id);
-- `estado` já é PK; o índice abaixo impede o MESMO termo com outra caixa ou espaço em volta.
create unique index turno_estado_emocional_catalogo_estado_uidx
  on cadastro.turno_estado_emocional_catalogo (lower(btrim(estado)));
create index turno_estado_emocional_catalogo_ativo_idx
  on cadastro.turno_estado_emocional_catalogo (ativo);

-- 3. FR-086. Interruptor da rota, no catálogo desde o primeiro dia: chave lida pelo código e
-- ausente do catálogo é defeito (ver `20261128110000`). Nasce `false`; ligar é decisão do
-- solicitante, pela tela, depois de provas e revisão independentes.
insert into identidade.configuracao_sistema(id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (gen_random_uuid(), 'ffcm.estado_emocional.ativo', 'false'::jsonb, 'booleano',
   'Estado emocional observado — catálogo',
   'Catálogo administrado dos termos de estado emocional observado na ficha de plantão. É vocabulário de observação, sem nota, escala ou gravidade (FR-076/FR-081), e não participa de nenhuma decisão de acesso. Ativar somente após provas e revisão independentes.',
   'servidor')
on conflict (chave) do nothing;

-- 4. Operação administrada. Mesmo desenho provado em
-- `20261127130000_papel_declarado_catalogo.sql`: contexto gerenciado DF-023 com autenticador
-- legado como alternativa, Administrador para gravar, e listar também para o profissional,
-- porque é ele quem escolhe o termo ao preencher a ficha. Família nunca lê o catálogo.
-- `ordem` NÃO é administrada por esta operação de propósito: ordenar é apresentação, e dar
-- ao Administrador um número por termo convidaria a lê-lo como escala.
create function operacao.estado_emocional_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; termo uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text; atual integer;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'estado_id', 'estado', 'ativo', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; termo := (e->>'estado_id')::uuid; auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_estado_emocional', 'api.gravar_estado_emocional')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado := identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' = 'administrador'
    or (acao = 'api.listar_estado_emocional' and contexto_gerenciado->>'perfil' = 'profissional') then
   autorizado := true;
   concessao := (contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
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
 end if;

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'turno_estado_emocional_catalogo', termo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_estado_emocional' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('estado_id', c.id, 'estado', c.estado, 'ativo', c.ativo, 'de_fabrica', c.de_fabrica, 'versao', c.versao) order by c.estado, c.id), '[]'::jsonb)
      into resultado from cadastro.turno_estado_emocional_catalogo c;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'turno_estado_emocional_catalogo', null, 'permitido', req);
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
  -- acao = 'api.gravar_estado_emocional'. Não há grant de DELETE: "remover" é ativo = false,
  -- que bumpa a versão. Ficha já gravada guarda o rótulo da época e não é reescrita.
  -- O teto de 80 caracteres é o MESMO da ficha (`20261127200000:57` e o contrato do registro
  -- canônico): termo que a tela mostra e a ficha recusaria seria defeito, não validação.
  if termo is null or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(length(btrim(e->>'estado')) between 1 and 80, false) is not true
    or jsonb_typeof(e->'ativo') is distinct from 'boolean'
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or auditoria_id is null then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.gravar_estado_emocional', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', termo, (e->>'versao_esperada')::integer + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = 'api.gravar_estado_emocional' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
      or anterior.resultado_id is distinct from termo or anterior.resultado_versao is distinct from (e->>'versao_esperada')::integer + 1
      or not exists(select 1 from cadastro.turno_estado_emocional_catalogo c where c.id = termo and c.versao = (e->>'versao_esperada')::integer + 1) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'turno_estado_emocional_catalogo', termo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    select c.versao into atual from cadastro.turno_estado_emocional_catalogo c where c.id = termo for update;
    if (coalesce((e->>'versao_esperada')::integer, 0) = 0 and found)
      or ((e->>'versao_esperada')::integer > 0 and (not found or atual <> (e->>'versao_esperada')::integer)) then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'turno_estado_emocional_catalogo', termo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    if (e->>'versao_esperada')::integer = 0 then
      begin
        insert into cadastro.turno_estado_emocional_catalogo(id, estado, ativo, ordem, versao, de_fabrica, criado_por_usuario_id)
          values(termo, btrim(e->>'estado'), (e->'ativo')::boolean, 0, 1, false, ator);
      exception when unique_violation then
        delete from operacao.requisicao where id = anterior.id;
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'turno_estado_emocional_catalogo', termo, 'negado', req);
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end;
    else
      begin
        update cadastro.turno_estado_emocional_catalogo
          set estado = btrim(e->>'estado'), ativo = (e->'ativo')::boolean,
            versao = atual + 1, atualizado_em = clock_timestamp()
          where id = termo and versao = atual;
      exception when unique_violation then
        delete from operacao.requisicao where id = anterior.id;
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'turno_estado_emocional_catalogo', termo, 'negado', req);
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end;
    end if;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'turno_estado_emocional_catalogo', termo, 'permitido', req);
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object('estado_id', c.id, 'estado', c.estado, 'ativo', c.ativo, 'de_fabrica', c.de_fabrica, 'versao', c.versao) into resultado
    from cadastro.turno_estado_emocional_catalogo c where c.id = termo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.estado_emocional_operacao_privada(jsonb) from public, anon, authenticated, service_role;

create function api.estado_emocional_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; termo uuid; acao text;
begin
  begin
    return operacao.estado_emocional_operacao_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    termo := (p_transporte#>>'{entrada,estado_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'turno_estado_emocional_catalogo', termo, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.estado_emocional_privado(jsonb) from public, anon, authenticated, service_role;

create role ffcmapp_estado_emocional_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_estado_emocional_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_estado_emocional_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_estado_emocional_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.estado_emocional_operacao_privada(jsonb) to ffcmapp_estado_emocional_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_estado_emocional_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_estado_emocional_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_estado_emocional_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_estado_emocional_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_estado_emocional_owner;
-- Sem DELETE, de propósito: desativar é ativo = false com bump de versão.
grant select, insert, update on cadastro.turno_estado_emocional_catalogo to ffcmapp_estado_emocional_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_estado_emocional_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_estado_emocional_owner;
create policy estado_emocional_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_estado_emocional_owner using (true);
create policy estado_emocional_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_estado_emocional_owner using (true) with check (false);
create policy estado_emocional_usuario_select on public.usuario for select to ffcmapp_estado_emocional_owner using (id = (select auth_privado.uid()));
create policy estado_emocional_usuario_lock on public.usuario for update to ffcmapp_estado_emocional_owner using (id = (select auth_privado.uid())) with check (false);
create policy estado_emocional_concessao_select on identidade.concessao_equipe for select to ffcmapp_estado_emocional_owner using (usuario_id = (select auth_privado.uid()));
create policy estado_emocional_concessao_lock on identidade.concessao_equipe for update to ffcmapp_estado_emocional_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy estado_emocional_excecao_select on identidade.excecao_tecnica for select to ffcmapp_estado_emocional_owner using (usuario_id = (select auth_privado.uid()));
create policy estado_emocional_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_estado_emocional_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy estado_emocional_sessao_select on identidade.sessao for select to ffcmapp_estado_emocional_owner using (usuario_id = (select auth_privado.uid()));
create policy estado_emocional_sessao_lock on identidade.sessao for update to ffcmapp_estado_emocional_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy estado_emocional_catalogo_rw on cadastro.turno_estado_emocional_catalogo for all to ffcmapp_estado_emocional_owner using (true) with check (true);
create policy estado_emocional_requisicao on operacao.requisicao to ffcmapp_estado_emocional_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_estado_emocional') with check (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_estado_emocional');
create policy estado_emocional_auditoria on auditoria.evento for insert to ffcmapp_estado_emocional_owner with check (ator_usuario_id = (select auth_privado.uid()));
select set_config('ffcmapp.estado_emocional_migrador', current_user, false);

-- 2. Semeadura inicial, feita PELO OWNER desta operação. A tabela tem `force row level
-- security` desde `20261127200000:206`, e com RLS forçada nem o dono da tabela escreve sem
-- policy: a semeadura passa pela mesma policy que a tela vai usar, sem ampliar nada.
-- Ver SUPOSIÇÃO CONSERVADORA no cabeçalho: termos observáveis, sem gravidade, em ordem
-- alfabética apenas para a tela ter uma sequência estável.
set role ffcmapp_estado_emocional_owner;
insert into cadastro.turno_estado_emocional_catalogo(id, estado, ativo, ordem, versao, de_fabrica, criado_por_usuario_id)
values
  ('7f2d0002-0000-4000-8000-000000000001', 'agitado',      true, 1, 1, true, null),
  ('7f2d0002-0000-4000-8000-000000000002', 'apático',      true, 2, 1, true, null),
  ('7f2d0002-0000-4000-8000-000000000003', 'choroso',      true, 3, 1, true, null),
  ('7f2d0002-0000-4000-8000-000000000004', 'comunicativo', true, 4, 1, true, null),
  ('7f2d0002-0000-4000-8000-000000000005', 'irritado',     true, 5, 1, true, null),
  ('7f2d0002-0000-4000-8000-000000000006', 'retraído',     true, 6, 1, true, null),
  ('7f2d0002-0000-4000-8000-000000000007', 'sonolento',    true, 7, 1, true, null),
  ('7f2d0002-0000-4000-8000-000000000008', 'tranquilo',    true, 8, 1, true, null);
-- Conferência AINDA sob o papel dono: com `force row level security` o migrador não enxerga
-- linha nenhuma desta tabela, então contar daqui de fora daria zero e passaria batido.
-- Nenhum termo semeado carrega nota, escala, número ou palavra de gravidade.
do $$ begin
  if (select count(*) from cadastro.turno_estado_emocional_catalogo where de_fabrica) <> 8
    or exists(select 1 from cadastro.turno_estado_emocional_catalogo
      where estado ~* '(grave|leve|moder|intens|risco|nota|nivel|nível|escala|crítico|critico|[0-9])') then
    raise exception 'SEMEADURA_SUGERE_GRAVIDADE';
  end if;
end $$;
reset role;
select set_config('role', current_setting('ffcmapp.estado_emocional_migrador'), false);

alter function api.estado_emocional_privado(jsonb) owner to ffcmapp_estado_emocional_owner;
set role ffcmapp_estado_emocional_owner;
revoke all on function api.estado_emocional_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.estado_emocional_migrador'), false);
revoke create on schema api from ffcmapp_estado_emocional_owner;
revoke ffcmapp_estado_emocional_owner from current_user;

-- Contexto gerenciado DF-023: a concessão de EXECUTE pertence a ffcmapp_acessos_owner.
select set_config('ffcmapp.estado_emocional_tinha_acessos', pg_has_role(current_user, 'ffcmapp_acessos_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.estado_emocional_tinha_acessos') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_acessos_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_ACESSOS_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_acessos_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_acessos_owner;
grant execute on function identidade.contexto_acesso_vigente(boolean), identidade.cadastro_gerenciado_proprio(boolean) to ffcmapp_estado_emocional_owner;
reset role;
select set_config('role', current_setting('ffcmapp.estado_emocional_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.estado_emocional_tinha_acessos') = 'false' then
    execute format('revoke ffcmapp_acessos_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

select set_config('ffcmapp.estado_emocional_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.estado_emocional_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_estado_emocional_owner;
reset role;
select set_config('role', current_setting('ffcmapp.estado_emocional_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.estado_emocional_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

-- 5. Barreira estrutural conferida na própria migração. Diferente do catálogo de papéis,
-- AQUI existe um segundo leitor legítimo: `ffcmapp_ficha_plantao_owner`, que já tinha
-- `grant select` desde `20261127200000:208` porque a RPC da ficha confere o termo. Esse é o
-- ÚNICO outro papel admitido, e somente em leitura; nenhum owner de autorização alcança a
-- tabela, e ninguém — nem o owner desta operação — tem DELETE.
do $$
declare r record;
begin
  for r in select rolname from pg_roles where rolname like 'ffcmapp\_%\_owner'
    and rolname not in ('ffcmapp_estado_emocional_owner', 'ffcmapp_ficha_plantao_owner') loop
    if has_table_privilege(r.rolname, 'cadastro.turno_estado_emocional_catalogo', 'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE') then
      raise exception 'OWNER_DE_AUTORIZACAO_ALCANCA_ESTADO_EMOCIONAL: %', r.rolname;
    end if;
  end loop;
  if has_table_privilege('ffcmapp_ficha_plantao_owner', 'cadastro.turno_estado_emocional_catalogo', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'FICHA_ESCREVE_NO_CATALOGO';
  end if;
  if not has_table_privilege('ffcmapp_ficha_plantao_owner', 'cadastro.turno_estado_emocional_catalogo', 'SELECT') then
    raise exception 'FICHA_PERDEU_LEITURA_DO_CATALOGO';
  end if;
  if has_table_privilege('anon', 'cadastro.turno_estado_emocional_catalogo', 'SELECT')
    or has_table_privilege('authenticated', 'cadastro.turno_estado_emocional_catalogo', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'cadastro.turno_estado_emocional_catalogo', 'SELECT') then
    raise exception 'CATALOGO_ESTADO_EMOCIONAL_EXPOSTO';
  end if;
  if has_table_privilege('ffcmapp_estado_emocional_owner', 'cadastro.turno_estado_emocional_catalogo', 'DELETE') then
    raise exception 'ESTADO_EMOCIONAL_COM_DELETE';
  end if;
  -- FR-076/FR-081: o registro canônico de estado emocional continua SEM número. Se algum dia
  -- `valor`, `unidade` ou `contagem` passar a ser admitido para este tipo, a proibição deixa
  -- de ser estrutural e esta migração falha fechada.
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'cadastro.turno_medida_versao'::regclass and contype = 'c'
        and conname = 'turno_medida_versao_forma_chk') !~
      'estado_emocional.{0,200}?valor IS NULL.{0,100}?unidade IS NULL' then
    raise exception 'ESTADO_EMOCIONAL_GANHOU_VALOR';
  end if;
end $$;
commit;
