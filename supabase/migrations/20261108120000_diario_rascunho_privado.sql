-- Preparação local apenas: não habilita operações nem acesso de aplicação.
create table cadastro.diario_rascunho_textual (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  autor_usuario_id uuid not null references public.usuario (id) on delete no action,
  conteudo_cifrado jsonb not null,
  versao integer not null default 1 check (versao > 0),
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint diario_rascunho_conteudo_formato_chk check ((
    jsonb_typeof(conteudo_cifrado) = 'object'
    and conteudo_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and conteudo_cifrado ->> 'formato' = '1'
    and nullif(conteudo_cifrado ->> 'key_id', '') is not null
    and nullif(conteudo_cifrado ->> 'nonce', '') is not null
    and nullif(conteudo_cifrado ->> 'ciphertext', '') is not null
    and nullif(conteudo_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint diario_rascunho_ordem_datas_chk check (atualizado_em >= criado_em)
);

alter table cadastro.diario_rascunho_textual enable row level security;
alter table cadastro.diario_rascunho_textual force row level security;
revoke all on cadastro.diario_rascunho_textual from public, anon, authenticated, service_role;
