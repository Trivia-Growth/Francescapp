-- Preparação privada. Sem grants de aplicação; exige revisão independente e provas reais antes de exposição.
-- FR-041 (openspec/specs/sigilo-e-governanca/spec.md): "Informar regras de funcionamento,
-- períodos de acompanhamento, canais de retorno e uso do diário. Paciente e família devem
-- encontrar essas regras sem precisar ler termos extensos para saber onde pedir ajuda."
--
-- É conteúdo institucional variável, logo vale a diretriz do solicitante de 11/11/2026: "tudo que
-- é variável deve ser preenchida no front e guardada no banco de dados". Reaproveita
-- `identidade.configuracao_sistema` (20261117400000) em vez de criar uma segunda tabela de
-- configuração — o catálogo de chaves continua vindo de migration e a tela existente
-- (`web/configuracao-sistema.ts`) já edita VALOR de qualquer chave, sem mudança nenhuma.
--
-- O que esta migration acrescenta é uma TERCEIRA exposição. Até aqui havia 'administracao' (só a
-- tela autenticada de administração) e 'servidor' (o processo do servidor, por cadeia de papéis).
-- Faltava "texto que a equipe escreve uma vez e que o paciente e a família precisam conseguir
-- ler". Chamar isso de 'servidor' misturaria conteúdo de leitura ampla com interruptores de
-- serviço no mesmo blob de `ler_configuracao_sistema_publica()`; chamar de 'administracao'
-- esconderia das pessoas exatamente quem o requisito manda alcançar.
--
-- 'publica' NÃO significa anônimo. Significa: legível por qualquer sessão autenticada e válida,
-- porque é o mesmo texto para todo mundo e não contém dado pessoal. Quem pode ESCREVER continua
-- sendo só Administrador, pela operação já existente `api.configuracao_sistema_privado`.
alter table identidade.configuracao_sistema drop constraint configuracao_sistema_exposicao_check;
alter table identidade.configuracao_sistema add constraint configuracao_sistema_exposicao_check
  check (exposicao in ('administracao', 'servidor', 'publica'));

-- Catálogo de FR-041. Os quatro itens do requisito viram quatro chaves, porque são editados e
-- lidos separadamente. O valor semeado é um texto de partida que diz o que a Edilaine precisa
-- substituir: deixar vazio faria a tela nascer com buraco, e inventar aqui uma regra de
-- funcionamento que ninguém aprovou seria pior.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (
    gen_random_uuid(),
    'ffcm.regras.funcionamento',
    '"Preencha aqui como o acompanhamento funciona: o que a equipe faz, o que a família pode esperar e o que não entra neste serviço."'::jsonb,
    'texto',
    'Como o acompanhamento funciona',
    'Texto que paciente e família veem na tela de regras. Escreva em linguagem direta, sem jargão.',
    'publica'
  ),
  (
    gen_random_uuid(),
    'ffcm.regras.periodos',
    '"Preencha aqui a periodicidade dos encontros e das revisões do plano de cuidado."'::jsonb,
    'texto',
    'Períodos de acompanhamento',
    'Com que frequência há encontros e revisões. Visível para paciente e família.',
    'publica'
  ),
  (
    gen_random_uuid(),
    'ffcm.regras.canais',
    '"Preencha aqui por onde pedir ajuda: telefone, e-mail e horário de atendimento."'::jsonb,
    'texto',
    'Onde pedir ajuda',
    'Canais de retorno e horários. É o que a pessoa procura primeiro numa urgência — mantenha curto e atualizado.',
    'publica'
  ),
  (
    gen_random_uuid(),
    'ffcm.regras.diario',
    '"Preencha aqui para que serve o diário, quem lê o que é escrito nele e o que não deve ser registrado por ali."'::jsonb,
    'texto',
    'Uso do diário',
    'Explica o diário para quem escreve nele. Deve deixar claro quem lê cada registro.',
    'publica'
  );

-- Leitura. Mesmo esqueleto das demais operações privadas (atestado de 30s assinado no servidor,
-- sessão revalidada sob FOR SHARE), mas SEM o bloco admin-only: aqui basta ser um usuário ativo
-- com sessão válida. Esse é o ponto do requisito — a pessoa não deveria ter que ser da equipe
-- para descobrir onde pedir ajuda.
create function operacao.consultar_regras_atendimento_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; inicio timestamptz; fim timestamptz;
  autorizado boolean := false; resultado jsonb;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or a->>'operacao' is distinct from 'api.consultar_regras_atendimento'
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio
    or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Usuário ativo com sessão viva, do lado da aplicação e do lado do Auth. Sem exigência de
  -- perfil: o conteúdo é o mesmo para profissional, paciente e familiar.
  if bloqueios_auth.travar(ator, sessao) is true then
    perform 1 from public.usuario u where u.id = ator and u.ativo for share;
    if found then
      perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator
        and s.revogada_em is null and s.encerrada_em is null for share;
      if found then
        perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator
          and (s.not_after is null or s.not_after > clock_timestamp());
        autorizado := found;
      end if;
    end if;
  end if;
  if autorizado then
    select coalesce(jsonb_agg(jsonb_build_object('chave', c.chave, 'valor', c.valor,
      'rotulo', c.rotulo, 'versao', c.versao, 'atualizado_em', c.atualizado_em)
      order by c.chave), '[]'::jsonb)
      into resultado from identidade.configuracao_sistema c where c.exposicao = 'publica';
  end if;
  autorizado := autorizado and fim > clock_timestamp() and exists(select 1 from auth_privado.sessoes() s
    where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()));
  if exists(select 1 from public.usuario where id = ator) then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, 'api.consultar_regras_atendimento', 'configuracao_sistema', null,
        case when autorizado then 'permitido' else 'negado' end, req);
  end if;
  if not autorizado then
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.consultar_regras_atendimento_privado(jsonb) from public, anon, authenticated, service_role;

create function api.consultar_regras_atendimento(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid;
begin
  begin
    return operacao.consultar_regras_atendimento_privado(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), 'api.consultar_regras_atendimento', 'configuracao_sistema', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.consultar_regras_atendimento(jsonb) from public, anon, authenticated, service_role;

-- Owner dedicado, privilégios mínimos, sem grant de aplicação. Revisão independente pendente.
create role ffcmapp_regras_atendimento_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_regras_atendimento_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_regras_atendimento_owner;
grant usage on schema public, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_regras_atendimento_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.consultar_regras_atendimento_privado(jsonb) to ffcmapp_regras_atendimento_owner;
grant select (id, ativo), update (versao) on public.usuario to ffcmapp_regras_atendimento_owner;
grant select (session_id, usuario_id, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_regras_atendimento_owner;
-- Sem UPDATE/INSERT/DELETE em `configuracao_sistema`: este owner só lê, e a policy restringe à
-- exposição 'publica'. Quem edita é `ffcmapp_configuracao_sistema_owner`, que não ganha nada aqui.
grant select (chave, valor, rotulo, versao, atualizado_em, exposicao) on identidade.configuracao_sistema to ffcmapp_regras_atendimento_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_regras_atendimento_owner;
create policy regras_usuario_select on public.usuario for select to ffcmapp_regras_atendimento_owner using (id = (select auth_privado.uid()));
create policy regras_usuario_lock on public.usuario for update to ffcmapp_regras_atendimento_owner using (id = (select auth_privado.uid())) with check (false);
create policy regras_sessao_select on identidade.sessao for select to ffcmapp_regras_atendimento_owner using (usuario_id = (select auth_privado.uid()));
create policy regras_sessao_lock on identidade.sessao for update to ffcmapp_regras_atendimento_owner using (usuario_id = (select auth_privado.uid())) with check (false);
-- A policy é a barreira real: mesmo que a função fosse alterada para tirar o `where`, nenhuma
-- chave de 'servidor' ou 'administracao' seria devolvida por este caminho.
create policy regras_configuracao_publica on identidade.configuracao_sistema for select to ffcmapp_regras_atendimento_owner using (exposicao = 'publica');
create policy regras_auditoria on auditoria.evento for insert to ffcmapp_regras_atendimento_owner with check (ator_usuario_id = (select auth_privado.uid()));
alter function api.consultar_regras_atendimento(jsonb) owner to ffcmapp_regras_atendimento_owner;
select set_config('ffcmapp.regras_atendimento_migrador', current_user, false);
set role ffcmapp_regras_atendimento_owner;
revoke all on function api.consultar_regras_atendimento(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.regras_atendimento_migrador'), false);
revoke create on schema api from ffcmapp_regras_atendimento_owner;
revoke ffcmapp_regras_atendimento_owner from current_user;

select set_config('ffcmapp.regras_atendimento_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.regras_atendimento_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_regras_atendimento_owner;
reset role;
select set_config('role', current_setting('ffcmapp.regras_atendimento_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.regras_atendimento_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
