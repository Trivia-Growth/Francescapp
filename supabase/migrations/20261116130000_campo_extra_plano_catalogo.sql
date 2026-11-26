-- Preparação privada local: catálogo de campos extras do objetivo de cuidado (FR-015/016).
-- Decisão do solicitante (10/11/2026): Edilaine (Administrador) pode criar campos extras pela
-- plataforma, globais (mesma lista em todo objetivo de todo caso), com tipo texto, número, data
-- ou lista de opções (opções definidas pela própria Edilaine). Não é conteúdo clínico do paciente
-- (é definição de esquema, não dado de caso), por isso não entra no envelope cifrado do objetivo;
-- é metadado organizacional análogo a `identidade.concessao_equipe`/`public.usuario`, com estado
-- atual mutável sob versão esperada, não histórico imutável. Não expõe operações nem comprova
-- autorização: isso fica para a migration seguinte.
create table cadastro.campo_extra_plano_catalogo (
  id uuid primary key,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  tipo text not null check (tipo in ('texto', 'numero', 'data', 'lista')),
  opcoes jsonb,
  ativo boolean not null default true,
  versao integer not null default 1 check (versao between 1 and 2147483647),
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint campo_extra_plano_opcoes_chk check ((
    (tipo = 'lista' and opcoes is not null and jsonb_typeof(opcoes) = 'array')
    or (tipo <> 'lista' and opcoes is null)
  ) is true)
);

create index campo_extra_plano_catalogo_ativo_idx on cadastro.campo_extra_plano_catalogo (ativo);

alter table cadastro.campo_extra_plano_catalogo enable row level security;
revoke all on cadastro.campo_extra_plano_catalogo from public, anon, authenticated, service_role;
