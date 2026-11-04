-- Preparação privada local: não expõe operações nem comprova cifra ou autorização.
create table cadastro.tarefa_cuidado (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action
);

create index tarefa_cuidado_paciente_idx on cadastro.tarefa_cuidado (paciente_id);

create table cadastro.tarefa_cuidado_versao (
  id uuid primary key,
  tarefa_id uuid not null references cadastro.tarefa_cuidado (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  conteudo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint tarefa_cuidado_versao_uq unique (tarefa_id, versao),
  constraint tarefa_cuidado_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint tarefa_cuidado_anterior_fk foreign key (tarefa_id, versao_esperada)
    references cadastro.tarefa_cuidado_versao (tarefa_id, versao) on delete no action,
  constraint tarefa_cuidado_envelope_chk check ((
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

create index tarefa_cuidado_versao_autor_idx on cadastro.tarefa_cuidado_versao (criado_por_usuario_id);

alter table cadastro.tarefa_cuidado enable row level security;
alter table cadastro.tarefa_cuidado_versao enable row level security;
revoke all on cadastro.tarefa_cuidado, cadastro.tarefa_cuidado_versao from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_tarefa_cuidado() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Tarefas e versões são imutáveis';
end;
$$;
revoke all on function cadastro.impedir_alteracao_tarefa_cuidado() from public, anon, authenticated, service_role;
create trigger tarefa_cuidado_imutavel before update or delete on cadastro.tarefa_cuidado
  for each row execute function cadastro.impedir_alteracao_tarefa_cuidado();
create trigger tarefa_cuidado_versao_imutavel before update or delete on cadastro.tarefa_cuidado_versao
  for each row execute function cadastro.impedir_alteracao_tarefa_cuidado();
