-- Preparação privada local: lista de aprovadores do plano de cuidado e evento de aprovação
-- (carimbo, não portão — decisão do solicitante de 10/11/2026, ver design.md
-- "Decisões do solicitante"). Edilaine (Administrador) é aprovadora por padrão (checado na
-- autorização, não precisa estar nesta lista) e pode indicar qualquer colaborador específico
-- como aprovador extra, mesmo não sendo Administrador.
--
-- Aprovação referencia uma VERSÃO específica do objetivo (`registro_id`), nunca o objetivo
-- inteiro: objetivo_cuidado_versao é imutável (sem UPDATE/DELETE), então o carimbo de
-- aprovação é um evento à parte, insert-only, igual auditoria — nunca muta a versão aprovada.
create table identidade.aprovador_plano_cuidado (
  usuario_id uuid primary key references public.usuario (id) on delete no action,
  ativo boolean not null default true,
  versao integer not null default 1 check (versao between 1 and 2147483647),
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp()
);

alter table identidade.aprovador_plano_cuidado enable row level security;
revoke all on identidade.aprovador_plano_cuidado from public, anon, authenticated, service_role;

create table cadastro.objetivo_cuidado_aprovacao (
  id uuid primary key,
  registro_id uuid not null references cadastro.objetivo_cuidado_versao (id) on delete no action,
  aprovador_usuario_id uuid not null references public.usuario (id) on delete no action,
  aprovado_em timestamptz not null default clock_timestamp(),
  constraint objetivo_cuidado_aprovacao_uq unique (registro_id, aprovador_usuario_id)
);

create index objetivo_cuidado_aprovacao_registro_idx on cadastro.objetivo_cuidado_aprovacao (registro_id);

alter table cadastro.objetivo_cuidado_aprovacao enable row level security;
revoke all on cadastro.objetivo_cuidado_aprovacao from public, anon, authenticated, service_role;

create trigger objetivo_cuidado_aprovacao_imutavel before update or delete on cadastro.objetivo_cuidado_aprovacao
  for each row execute function cadastro.impedir_alteracao_objetivo_cuidado();
