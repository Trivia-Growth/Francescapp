-- Armazenamento privado; integração, autorização e auditoria permanecem pendentes.
create table cadastro.anamnese_versao (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  conteudo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint anamnese_paciente_versao_uq unique (paciente_id, versao),
  constraint anamnese_versao_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint anamnese_versao_anterior_fk foreign key (paciente_id, versao_esperada)
    references cadastro.anamnese_versao (paciente_id, versao) on delete no action,
  constraint anamnese_conteudo_cifrado_formato_chk check ((
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

create index anamnese_versao_autor_idx on cadastro.anamnese_versao (criado_por_usuario_id);

alter table cadastro.anamnese_versao enable row level security;
revoke all on cadastro.anamnese_versao from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_anamnese_versao() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Versões de anamnese são imutáveis';
end;
$$;
revoke all on function cadastro.impedir_alteracao_anamnese_versao() from public, anon, authenticated, service_role;
create trigger anamnese_versao_imutavel
  before update or delete on cadastro.anamnese_versao
  for each row execute function cadastro.impedir_alteracao_anamnese_versao();
