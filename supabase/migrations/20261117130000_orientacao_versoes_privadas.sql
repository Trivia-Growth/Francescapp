-- Armazenamento privado de orientações aprovadas (FR-019). Sem grant de aplicação nesta migration.
-- A situação fica em claro, como a etapa de encaminhamento: FR-019 exige que uma orientação
-- superada permaneça identificada como anterior e nunca pareça atual. Isso é filtro do banco,
-- não decisão de cliente. Texto, autor declarado, destinatários, data e validade vão no envelope
-- cifrado: só a situação precisa ser consultável sem decifrar.
create table cadastro.orientacao (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action
);

create index orientacao_paciente_idx on cadastro.orientacao (paciente_id);

create table cadastro.orientacao_versao (
  id uuid primary key,
  orientacao_id uuid not null references cadastro.orientacao (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  situacao text not null check (situacao in ('vigente', 'superada')),
  conteudo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint orientacao_versao_uq unique (orientacao_id, versao),
  constraint orientacao_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint orientacao_anterior_fk foreign key (orientacao_id, versao_esperada)
    references cadastro.orientacao_versao (orientacao_id, versao) on delete no action,
  constraint orientacao_envelope_chk check ((
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

create index orientacao_versao_autor_idx on cadastro.orientacao_versao (criado_por_usuario_id);
-- Sustenta a consulta "apenas vigentes" sem varrer versões antigas.
create index orientacao_versao_situacao_idx on cadastro.orientacao_versao (orientacao_id, versao desc, situacao);

alter table cadastro.orientacao enable row level security;
alter table cadastro.orientacao_versao enable row level security;
revoke all on cadastro.orientacao, cadastro.orientacao_versao from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_orientacao() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Orientações e versões são imutáveis';
end;
$$;
revoke all on function cadastro.impedir_alteracao_orientacao() from public, anon, authenticated, service_role;
create trigger orientacao_imutavel before update or delete on cadastro.orientacao
  for each row execute function cadastro.impedir_alteracao_orientacao();
create trigger orientacao_versao_imutavel before update or delete on cadastro.orientacao_versao
  for each row execute function cadastro.impedir_alteracao_orientacao();
