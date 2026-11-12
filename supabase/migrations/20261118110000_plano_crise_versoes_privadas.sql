-- FR-020: plano de crise — responsáveis, contatos, limites do serviço e data de revisão.
-- Armazenamento privado versionado e imutável; todo o conteúdo viaja cifrado no envelope e
-- nunca em coluna legível. Integração e autorização ficam na migration seguinte.
create table cadastro.plano_crise_versao (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  conteudo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint plano_crise_paciente_versao_uq unique (paciente_id, versao),
  constraint plano_crise_versao_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint plano_crise_versao_anterior_fk foreign key (paciente_id, versao_esperada)
    references cadastro.plano_crise_versao (paciente_id, versao) on delete no action,
  constraint plano_crise_conteudo_cifrado_formato_chk check ((
    jsonb_typeof(conteudo_cifrado) = 'object'
    and conteudo_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and conteudo_cifrado -> 'formato' = '1'::jsonb
    and jsonb_typeof(conteudo_cifrado -> 'key_id') = 'string'
    and jsonb_typeof(conteudo_cifrado -> 'nonce') = 'string'
    and jsonb_typeof(conteudo_cifrado -> 'ciphertext') = 'string'
    and jsonb_typeof(conteudo_cifrado -> 'tag') = 'string'
    and nullif(conteudo_cifrado ->> 'key_id', '') is not null
    and nullif(conteudo_cifrado ->> 'nonce', '') is not null
    and nullif(conteudo_cifrado ->> 'ciphertext', '') is not null
    and nullif(conteudo_cifrado ->> 'tag', '') is not null
  ) is true)
);

create index plano_crise_versao_autor_idx on cadastro.plano_crise_versao (criado_por_usuario_id);

alter table cadastro.plano_crise_versao enable row level security;
revoke all on cadastro.plano_crise_versao from public, anon, authenticated, service_role;

-- A aprovação é um carimbo à parte, preso à versão aprovada, e não um campo do plano:
-- a versão é imutável, então registrar a aprovação dentro dela exigiria reescrevê-la, e
-- editar o plano passaria a carregar junto a aprovação anterior. `concessao_id` guarda qual
-- concessão habilitada autorizou o carimbo, para que a prova sobreviva à revisão da marca.
create table cadastro.plano_crise_aprovacao (
  id uuid primary key,
  registro_id uuid not null references cadastro.plano_crise_versao (id) on delete no action,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  aprovador_usuario_id uuid not null references public.usuario (id) on delete no action,
  concessao_id uuid not null references identidade.concessao_equipe (id) on delete no action,
  aprovado_em timestamptz not null default clock_timestamp(),
  constraint plano_crise_aprovacao_uq unique (registro_id, aprovador_usuario_id)
);

create index plano_crise_aprovacao_registro_idx on cadastro.plano_crise_aprovacao (registro_id);
create index plano_crise_aprovacao_paciente_idx on cadastro.plano_crise_aprovacao (paciente_id);

alter table cadastro.plano_crise_aprovacao enable row level security;
revoke all on cadastro.plano_crise_aprovacao from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_plano_crise() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Plano de crise e suas aprovações são imutáveis';
end;
$$;
revoke all on function cadastro.impedir_alteracao_plano_crise() from public, anon, authenticated, service_role;
create trigger plano_crise_versao_imutavel
  before update or delete on cadastro.plano_crise_versao
  for each row execute function cadastro.impedir_alteracao_plano_crise();
create trigger plano_crise_aprovacao_imutavel
  before update or delete on cadastro.plano_crise_aprovacao
  for each row execute function cadastro.impedir_alteracao_plano_crise();
