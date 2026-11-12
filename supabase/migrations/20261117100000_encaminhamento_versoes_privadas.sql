-- Armazenamento privado de encaminhamentos (FR-018). Sem grant de aplicação nesta migration.
-- A etapa fica em claro, como `cadastro.acompanhamento_caso.situacao`: é estado operacional,
-- não conteúdo clínico, e precisa ser consultável no banco para localizar encaminhamentos
-- sem retorno sem decifrar nada. Destino, motivo e responsável vão no envelope cifrado.
create table cadastro.encaminhamento (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action
);

create index encaminhamento_paciente_idx on cadastro.encaminhamento (paciente_id);

create table cadastro.encaminhamento_versao (
  id uuid primary key,
  encaminhamento_id uuid not null references cadastro.encaminhamento (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  etapa text not null check (
    etapa in ('sugerido', 'agendado', 'realizado', 'retorno_pendente', 'concluido')
  ),
  conteudo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint encaminhamento_versao_uq unique (encaminhamento_id, versao),
  constraint encaminhamento_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint encaminhamento_anterior_fk foreign key (encaminhamento_id, versao_esperada)
    references cadastro.encaminhamento_versao (encaminhamento_id, versao) on delete no action,
  constraint encaminhamento_envelope_chk check ((
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

create index encaminhamento_versao_autor_idx on cadastro.encaminhamento_versao (criado_por_usuario_id);
-- Sustenta a consulta "sem retorno" sem varrer versões antigas.
create index encaminhamento_versao_etapa_idx on cadastro.encaminhamento_versao (encaminhamento_id, versao desc, etapa);

alter table cadastro.encaminhamento enable row level security;
alter table cadastro.encaminhamento_versao enable row level security;
revoke all on cadastro.encaminhamento, cadastro.encaminhamento_versao from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_encaminhamento() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Encaminhamentos e versões são imutáveis';
end;
$$;
revoke all on function cadastro.impedir_alteracao_encaminhamento() from public, anon, authenticated, service_role;
create trigger encaminhamento_imutavel before update or delete on cadastro.encaminhamento
  for each row execute function cadastro.impedir_alteracao_encaminhamento();
create trigger encaminhamento_versao_imutavel before update or delete on cadastro.encaminhamento_versao
  for each row execute function cadastro.impedir_alteracao_encaminhamento();
