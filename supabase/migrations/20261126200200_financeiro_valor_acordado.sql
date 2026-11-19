-- FR-068 (design D4): valor acordado de repasse POR TURNO REALIZADO, versionado por vigência.
--
-- Moeda e precisão (Open Question do design.md, decidida aqui): inteiro em centavos de BRL,
-- `bigint`. Centavos dispensam aritmética de ponto flutuante e sobrevivem ao transporte JSON,
-- onde a escala de `numeric` não sobrevive. Não há coluna de moeda: o produto opera em uma só,
-- e multimoeda depois é coluna nova, aditiva.
--
-- NÃO existe coluna de duração, de valor-hora, de jornada nem de adicional. FR-068 e
-- `design.md — Non-Goals` proíbem derivar remuneração da duração do turno, e a proibição vale
-- mais como ausência de coluna do que como regra escrita em algum serviço.
--
-- A não sobreposição é restrição do banco, não checagem de aplicação (design D4): duas
-- requisições simultâneas passariam por qualquer checagem prévia e deixariam dois valores
-- aplicáveis à mesma data, e a apuração não teria como escolher. `exclude using gist` resolve
-- isso sob concorrência real, com `btree_gist` para a igualdade de uuid.
--
-- O motivo entra cifrado, como nos demais textos de negócio do produto: é justificativa sobre
-- a remuneração de pessoa identificada (FR-042), e o banco não precisa lê-la.
create extension if not exists btree_gist with schema extensions;

create table financeiro.valor_acordado_turno (
  id uuid primary key,
  profissional_usuario_id uuid not null references public.usuario (id) on delete no action,
  valor_turno_centavos bigint not null check (valor_turno_centavos between 1 and 1000000000),
  vigencia daterange not null,
  motivo_cifrado jsonb not null,
  autor_usuario_id uuid not null references public.usuario (id) on delete no action,
  registrado_em timestamptz not null default clock_timestamp(),
  encerrada_em timestamptz,
  encerrada_por_usuario_id uuid references public.usuario (id) on delete no action,
  constraint valor_acordado_vigencia_chk check (
    not isempty(vigencia) and lower(vigencia) is not null
  ),
  constraint valor_acordado_motivo_formato_chk check ((
    jsonb_typeof(motivo_cifrado) = 'object'
    and motivo_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and motivo_cifrado ->> 'formato' = '1'
    and nullif(motivo_cifrado ->> 'key_id', '') is not null
    and nullif(motivo_cifrado ->> 'nonce', '') is not null
    and nullif(motivo_cifrado ->> 'ciphertext', '') is not null
    and nullif(motivo_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint valor_acordado_encerramento_chk check (
    (encerrada_em is null) = (encerrada_por_usuario_id is null)
  ),
  constraint valor_acordado_sem_sobreposicao exclude using gist (
    profissional_usuario_id with =, vigencia with &&
  )
);
comment on constraint valor_acordado_sem_sobreposicao on financeiro.valor_acordado_turno is
  'FR-068: a apuração nunca pode encontrar dois valores aplicáveis à mesma data do mesmo profissional.';

-- O índice da própria exclusion constraint já atende a busca da apuração
-- (profissional_usuario_id = X and vigencia @> data). Nenhum índice adicional aqui.

alter table financeiro.valor_acordado_turno enable row level security;
alter table financeiro.valor_acordado_turno force row level security;
revoke all on financeiro.valor_acordado_turno from public, anon, authenticated, service_role;

-- Append-only, com uma única mutação admitida: fechar a ponta aberta de uma vigência quando
-- um valor novo entra. Nada é apagado e nenhum valor histórico é reescrito (FR-068).
create function financeiro.valor_acordado_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '0A000', message = 'VALOR_ACORDADO_IMUTAVEL';
  end if;
  if new.id is distinct from old.id
    or new.profissional_usuario_id is distinct from old.profissional_usuario_id
    or new.valor_turno_centavos is distinct from old.valor_turno_centavos
    or new.motivo_cifrado is distinct from old.motivo_cifrado
    or new.autor_usuario_id is distinct from old.autor_usuario_id
    or new.registrado_em is distinct from old.registrado_em
    or lower(new.vigencia) is distinct from lower(old.vigencia)
    or old.encerrada_em is not null
    or upper(old.vigencia) is not null
    or upper(new.vigencia) is null
    or new.encerrada_em is null then
    raise exception using errcode = '0A000', message = 'VALOR_ACORDADO_IMUTAVEL';
  end if;
  return new;
end $$;
create trigger valor_acordado_imutavel
  before update or delete on financeiro.valor_acordado_turno
  for each row execute function financeiro.valor_acordado_imutavel();
