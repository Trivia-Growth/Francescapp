-- FR-069: despesa do cuidado vinculada a caso, com autorização, responsável e comprovante.
--
-- Sem teto e sem aprovação em duas etapas: não existe coluna de aprovação, de alçada nem de
-- estado "pendente". Quem tem a audiência financeira registra qualquer valor, e o valor alto
-- entra como qualquer outro. O único limite é o de sanidade de entrada (1..1.000.000.000
-- centavos), que recusa digitação impossível, não decide alçada.
--
-- Despesa sem caso vinculado está fora do requisito, e a recusa é do banco: `paciente_id` é
-- NOT NULL com chave estrangeira. Despesa sem autorização aplicável idem: `autorizacao_cifrada`
-- é NOT NULL. Nenhuma das duas depende de validação de aplicação para valer.
--
-- Retificação não apaga: a tabela é append-only por (despesa_id, versao) e o gatilho recusa
-- UPDATE e DELETE. A versão 1 é o lançamento original e permanece consultável com autor, data
-- e motivo da retificação que veio depois.
--
-- A audiência NÃO decorre do vínculo de cuidado: nenhuma consulta aqui lê
-- `cadastro.acesso_paciente`, e o papel dono não tem privilégio para lê-la (design D1).
create table financeiro.despesa_lancamento (
  id uuid primary key,
  despesa_id uuid not null,
  versao integer not null check (versao between 1 and 2147483647),
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  descricao_cifrada jsonb not null,
  valor_centavos bigint not null check (valor_centavos between 1 and 1000000000),
  data date not null,
  responsavel_usuario_id uuid not null references public.usuario (id) on delete no action,
  autorizacao_cifrada jsonb not null,
  comprovante_objeto_nome text unique,
  comprovante_mime text,
  comprovante_tamanho_bytes integer,
  comprovante_digest text,
  motivo_retificacao_cifrado jsonb,
  autor_usuario_id uuid not null references public.usuario (id) on delete no action,
  registrado_em timestamptz not null default clock_timestamp(),
  unique (despesa_id, versao),
  constraint despesa_original_tem_comprovante_chk check (
    (versao = 1) = (comprovante_objeto_nome is not null)
  ),
  constraint despesa_retificacao_tem_motivo_chk check (
    (versao > 1) = (motivo_retificacao_cifrado is not null)
  ),
  constraint despesa_comprovante_completo_chk check (
    num_nonnulls(comprovante_objeto_nome, comprovante_mime, comprovante_tamanho_bytes, comprovante_digest) in (0, 4)
  ),
  constraint despesa_comprovante_formato_chk check (
    comprovante_mime is null
    or (comprovante_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and comprovante_tamanho_bytes between 1 and 5242880)
  )
);
create index despesa_caso_idx on financeiro.despesa_lancamento (paciente_id, despesa_id, versao);

alter table financeiro.despesa_lancamento enable row level security;
alter table financeiro.despesa_lancamento force row level security;
revoke all on financeiro.despesa_lancamento from public, anon, authenticated, service_role;

create function financeiro.despesa_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '0A000', message = 'DESPESA_IMUTAVEL';
end $$;
create trigger despesa_imutavel
  before update or delete on financeiro.despesa_lancamento
  for each row execute function financeiro.despesa_imutavel();

grant select, insert on financeiro.despesa_lancamento to ffcmapp_financeiro_owner;
create policy financeiro_owner_despesa on financeiro.despesa_lancamento to ffcmapp_financeiro_owner using (true) with check (true);
create policy financeiro_owner_requisicao_despesa on operacao.requisicao to ffcmapp_financeiro_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao like 'api.%despesa') with check (ator_usuario_id = (select auth_privado.uid()) and operacao like 'api.%despesa');

create function operacao.financeiro_despesa_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada';
  ctx jsonb; ator uuid; sessao uuid; req uuid; acao text; fim timestamptz;
  auditoria_id uuid; alvo uuid; lancamento uuid; paciente uuid; versao integer;
  anterior operacao.requisicao; repeticao boolean := false; conflito boolean := false;
  resultado jsonb; corrente financeiro.despesa_lancamento;
begin
  ctx := operacao.financeiro_atestado_privada(p_transporte, array[
    'api.registrar_despesa', 'api.retificar_despesa', 'api.consultar_despesas']);
  if ctx is null then raise exception using errcode = '42501', message = 'SEM_PERMISSAO'; end if;
  ator := (ctx->>'ator')::uuid; sessao := (ctx->>'sessao')::uuid;
  req := (ctx->>'request_id')::uuid; acao := ctx->>'operacao';
  fim := (ctx->>'expira_em')::timestamptz;
  if not operacao.financeiro_audiencia_privada(ator, sessao) then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'despesa', null, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;

  if acao = 'api.consultar_despesas' then
    if e - array['request_id', 'paciente_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    begin paciente := (e->>'paciente_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA'; end;
    if paciente is null then raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA'; end if;
    -- `id` (chave primária da linha) entra na projeção de propósito: é ele que o AAD da
    -- despesa amarra como `registro_id`, e sem ele na listagem o texto cifrado seria
    -- indecifrável na leitura. Não é segredo — é o identificador que a própria aplicação
    -- escolheu ao gravar (`despesa_id` na versão 1, `retificacao_id` na retificação).
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'despesa_id', d.despesa_id, 'versao', d.versao, 'paciente_id', d.paciente_id,
        'descricao_cifrada', d.descricao_cifrada, 'valor_centavos', d.valor_centavos,
        'data', d.data, 'responsavel_usuario_id', d.responsavel_usuario_id,
        'autorizacao_cifrada', d.autorizacao_cifrada,
        'comprovante_objeto_nome', d.comprovante_objeto_nome,
        'motivo_retificacao_cifrado', d.motivo_retificacao_cifrado,
        'autor_usuario_id', d.autor_usuario_id, 'registrado_em', d.registrado_em)
      order by d.registrado_em, d.id), '[]'::jsonb)
      into resultado
      from (select q.* from financeiro.despesa_lancamento q where q.paciente_id = paciente
        order by q.registrado_em, q.id limit 500) d;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'despesa', paciente, 'permitido', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;

  if acao = 'api.registrar_despesa' then
    if e - array['request_id', 'despesa_id', 'paciente_id', 'descricao_cifrada', 'valor_centavos',
      'data', 'responsavel_usuario_id', 'autorizacao_cifrada', 'comprovante',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
      or jsonb_typeof(e->'comprovante') is distinct from 'object'
      or jsonb_typeof(e->'autorizacao_cifrada') is distinct from 'object'
      or e->>'paciente_id' is null then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  else
    if e - array['request_id', 'despesa_id', 'retificacao_id', 'descricao_cifrada', 'valor_centavos',
      'data', 'responsavel_usuario_id', 'autorizacao_cifrada', 'motivo_retificacao_cifrado',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
      or jsonb_typeof(e->'motivo_retificacao_cifrado') is distinct from 'object'
      or jsonb_typeof(e->'autorizacao_cifrada') is distinct from 'object' then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  end if;
  begin
    alvo := (e->>'despesa_id')::uuid;
    lancamento := coalesce((e->>'retificacao_id')::uuid, alvo);
    paciente := (e->>'paciente_id')::uuid;
    auditoria_id := (e->>'auditoria_id')::uuid;
    perform (e->>'data')::date, (e->>'responsavel_usuario_id')::uuid;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or data_exception then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end;
  if alvo is null or lancamento is null or auditoria_id is null
    or e->>'responsavel_usuario_id' is null or e->>'data' is null
    or jsonb_typeof(e->'descricao_cifrada') is distinct from 'object'
    or jsonb_typeof(e->'valor_centavos') is distinct from 'number'
    or coalesce(e->>'valor_centavos', '') !~ '^[1-9][0-9]*$'
    or (e->>'valor_centavos')::bigint > 1000000000
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;

  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, acao, e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', lancamento, 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator
      and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia'
      or anterior.estado is distinct from 'concluida' or anterior.resultado_id is distinct from lancamento
      or not exists(select 1 from financeiro.despesa_lancamento d where d.id = lancamento) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'despesa', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    if acao = 'api.registrar_despesa' then
      versao := 1;
    else
      -- Retificação: lê a versão corrente e grava a seguinte. Sem `for share` de propósito —
      -- a tabela é append-only, não há privilégio de UPDATE para travar linha, e duas
      -- retificações concorrentes colidem no `unique (despesa_id, versao)`, que é recusa do
      -- banco e cai no tratamento de conflito abaixo.
      select * into corrente from financeiro.despesa_lancamento d where d.despesa_id = alvo
        and d.versao = (select max(z.versao) from financeiro.despesa_lancamento z where z.despesa_id = alvo);
      if not found then conflito := true; else versao := corrente.versao + 1; paciente := corrente.paciente_id; end if;
    end if;
    if not conflito then
      begin
        insert into financeiro.despesa_lancamento(id, despesa_id, versao, paciente_id, descricao_cifrada,
          valor_centavos, data, responsavel_usuario_id, autorizacao_cifrada,
          comprovante_objeto_nome, comprovante_mime, comprovante_tamanho_bytes, comprovante_digest,
          motivo_retificacao_cifrado, autor_usuario_id)
          values(lancamento, alvo, versao, paciente, e->'descricao_cifrada',
            (e->>'valor_centavos')::bigint, (e->>'data')::date, (e->>'responsavel_usuario_id')::uuid,
            e->'autorizacao_cifrada',
            e#>>'{comprovante,objeto_nome}', e#>>'{comprovante,mime_type}',
            (e#>>'{comprovante,tamanho_bytes}')::integer, e#>>'{comprovante,digest}',
            e->'motivo_retificacao_cifrado', ator);
      exception when unique_violation or check_violation or foreign_key_violation or not_null_violation or invalid_text_representation then
        conflito := true;
      end;
    end if;
    if conflito then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'despesa', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'despesa', alvo, 'permitido', req);
  if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object(
      'id', d.id,
      'despesa_id', d.despesa_id, 'versao', d.versao, 'paciente_id', d.paciente_id,
      'descricao_cifrada', d.descricao_cifrada, 'valor_centavos', d.valor_centavos,
      'data', d.data, 'responsavel_usuario_id', d.responsavel_usuario_id,
      'autorizacao_cifrada', d.autorizacao_cifrada,
      'comprovante_objeto_nome', d.comprovante_objeto_nome,
      'motivo_retificacao_cifrado', d.motivo_retificacao_cifrado,
      'autor_usuario_id', d.autor_usuario_id, 'registrado_em', d.registrado_em)
    into resultado from financeiro.despesa_lancamento d where d.id = lancamento;
  return jsonb_build_object('ok', true, 'repeticao', repeticao, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.financeiro_despesa_privada(jsonb) from public, anon, authenticated, service_role;

create function api.financeiro_despesa_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; alvo uuid; acao text;
begin
  begin
    return operacao.financeiro_despesa_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    alvo := (p_transporte#>>'{entrada,despesa_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'despesa', alvo, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.financeiro_despesa_privado(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.financeiro_despesa_privada(jsonb) to ffcmapp_financeiro_owner;
select set_config('ffcmapp.financeiro_despesa_migrador', current_user, false);
grant usage, create on schema api to ffcmapp_financeiro_owner;
grant ffcmapp_financeiro_owner to current_user with inherit false, set true;
alter function api.financeiro_despesa_privado(jsonb) owner to ffcmapp_financeiro_owner;
set role ffcmapp_financeiro_owner;
revoke all on function api.financeiro_despesa_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.financeiro_despesa_migrador'), false);
revoke create on schema api from ffcmapp_financeiro_owner;
revoke ffcmapp_financeiro_owner from current_user;
