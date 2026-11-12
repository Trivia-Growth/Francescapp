-- FR-040 (openspec/specs/sigilo-e-governanca/spec.md): "Receber e acompanhar solicitações de
-- acesso, correção, portabilidade ou exclusão. A resposta deve indicar medida adotada ou razão de
-- guarda/restrição aplicável; revogar consentimento não significa apagar automaticamente todos os
-- registros."
--
-- LEITURA DO REQUISITO, porque muda o que esta migration é e o que ela NÃO é:
-- isto é um LIVRO DE SOLICITAÇÕES, não um motor de eliminação. O requisito manda RECEBER,
-- ACOMPANHAR e RESPONDER; e diz literalmente que revogar consentimento não apaga registro. O
-- cenário de aceite 3 da User Story 9 reforça: "eventual guarda necessária terá fundamento e
-- acesso limitado, em vez de eliminação indiscriminada". Uma solicitação do tipo 'exclusao' é
-- registrada e respondida com medida e fundamento; nenhum dado de paciente é apagado por aqui.
-- Apagamento físico exigiria requisito explícito, decisão do solicitante sobre o que é anonimizado
-- em vez de apagado, e trilha do que foi eliminado — nada disso existe hoje (ver tasks.md).
--
-- Decisões que mudam o modelo de ameaça:
-- 1. A descrição do pedido e a resposta são TEXTO LIVRE SOBRE PESSOA IDENTIFICADA. Vão em
--    envelope cifrado com AAD, igual ao conteúdo clínico — não em coluna legível. Quem tem a
--    linha não tem o texto.
-- 2. `medida` é coluna legível de propósito: é o que a tela precisa listar e filtrar, e não
--    revela conteúdo ("atendida" / "atendida_parcialmente" / "recusada"). O FUNDAMENTO da medida
--    é que vai cifrado.
-- 3. Linha nunca é apagada e `tipo`, `paciente_id` e `descricao_cifrada` nunca mudam depois de
--    registrados — é o acompanhamento de uma obrigação legal. O gatilho abaixo só deixa evoluir
--    as colunas de resposta, e só no sentido recebida -> respondida.
create table cadastro.solicitacao_titular (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  tipo text not null check (tipo in ('acesso', 'correcao', 'portabilidade', 'exclusao')),
  descricao_cifrada jsonb not null,
  recebida_em timestamptz not null,
  registrada_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criada_em timestamptz not null default clock_timestamp(),
  estado text not null default 'recebida' check (estado in ('recebida', 'respondida')),
  medida text check (medida in ('atendida', 'atendida_parcialmente', 'recusada')),
  resposta_cifrada jsonb,
  respondida_por_usuario_id uuid references public.usuario (id) on delete no action,
  respondida_em timestamptz,
  versao integer not null default 1 check (versao between 1 and 2147483647),
  -- "A resposta deve indicar medida adotada ou razão de guarda/restrição aplicável": respondida
  -- sem medida e sem fundamento não é resposta. O banco recusa o estado incompleto.
  constraint solicitacao_resposta_completa_chk check ((
    (estado = 'recebida' and medida is null and resposta_cifrada is null
      and respondida_por_usuario_id is null and respondida_em is null)
    or (estado = 'respondida' and medida is not null and resposta_cifrada is not null
      and respondida_por_usuario_id is not null and respondida_em is not null)
  ) is true),
  constraint solicitacao_recebida_nao_futura_chk check (recebida_em <= criada_em),
  constraint solicitacao_descricao_cifrada_formato_chk check ((
    jsonb_typeof(descricao_cifrada) = 'object'
    and descricao_cifrada - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and descricao_cifrada -> 'formato' = '1'::jsonb
    and jsonb_typeof(descricao_cifrada -> 'key_id') = 'string'
    and jsonb_typeof(descricao_cifrada -> 'nonce') = 'string'
    and jsonb_typeof(descricao_cifrada -> 'ciphertext') = 'string'
    and jsonb_typeof(descricao_cifrada -> 'tag') = 'string'
    and nullif(descricao_cifrada ->> 'key_id', '') is not null
    and nullif(descricao_cifrada ->> 'nonce', '') is not null
    and nullif(descricao_cifrada ->> 'ciphertext', '') is not null
    and nullif(descricao_cifrada ->> 'tag', '') is not null
  ) is true),
  constraint solicitacao_resposta_cifrada_formato_chk check ((
    resposta_cifrada is null
    or (jsonb_typeof(resposta_cifrada) = 'object'
      and resposta_cifrada - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and resposta_cifrada -> 'formato' = '1'::jsonb
      and jsonb_typeof(resposta_cifrada -> 'key_id') = 'string'
      and jsonb_typeof(resposta_cifrada -> 'nonce') = 'string'
      and jsonb_typeof(resposta_cifrada -> 'ciphertext') = 'string'
      and jsonb_typeof(resposta_cifrada -> 'tag') = 'string'
      and nullif(resposta_cifrada ->> 'key_id', '') is not null
      and nullif(resposta_cifrada ->> 'nonce', '') is not null
      and nullif(resposta_cifrada ->> 'ciphertext', '') is not null
      and nullif(resposta_cifrada ->> 'tag', '') is not null)
  ) is true)
);

create index solicitacao_titular_paciente_idx
  on cadastro.solicitacao_titular (paciente_id, recebida_em desc, id desc);
create index solicitacao_titular_pendente_idx
  on cadastro.solicitacao_titular (recebida_em desc, id desc) where estado = 'recebida';

-- Append + evolução controlada. DELETE nunca; UPDATE só nas colunas de resposta, só uma vez, e
-- só no sentido recebida -> respondida. Sem isso, "acompanhar" viraria "reescrever o histórico
-- da obrigação legal", que é exatamente o que uma trilha de LGPD não pode permitir.
create function cadastro.impedir_alteracao_solicitacao_titular() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'SOLICITACAO_TITULAR_NAO_APAGAVEL';
  end if;
  if old.id is distinct from new.id
    or old.paciente_id is distinct from new.paciente_id
    or old.tipo is distinct from new.tipo
    or old.descricao_cifrada is distinct from new.descricao_cifrada
    or old.recebida_em is distinct from new.recebida_em
    or old.registrada_por_usuario_id is distinct from new.registrada_por_usuario_id
    or old.criada_em is distinct from new.criada_em then
    raise exception using errcode = '55000', message = 'SOLICITACAO_TITULAR_PEDIDO_IMUTAVEL';
  end if;
  if old.estado <> 'recebida' or new.estado <> 'respondida' or new.versao <> old.versao + 1 then
    raise exception using errcode = '55000', message = 'SOLICITACAO_TITULAR_TRANSICAO_INVALIDA';
  end if;
  return new;
end $$;

create trigger solicitacao_titular_evolucao_controlada
before update or delete on cadastro.solicitacao_titular
for each row execute function cadastro.impedir_alteracao_solicitacao_titular();

alter table cadastro.solicitacao_titular enable row level security;
revoke all on cadastro.solicitacao_titular from public, anon, authenticated, service_role;
revoke all on function cadastro.impedir_alteracao_solicitacao_titular() from public, anon, authenticated, service_role;
