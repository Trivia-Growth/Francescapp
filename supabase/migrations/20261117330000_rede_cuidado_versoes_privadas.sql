-- FR-002: mapa de pessoas da rede de cuidado com vínculos distintos (paciente, familiar,
-- cuidador, responsável legal, contato de emergência, profissional, responsável financeiro).
-- Uma pessoa pode acumular vínculos. Vínculo é DESCRITIVO: não concede acesso nem soma
-- permissão. A autorização continua em cadastro.acesso_paciente e na concessão de equipe,
-- e por isso nenhuma permissão é derivada desta tabela.
-- Nomes e contatos são dados pessoais: vão cifrados em envelope AEAD, o banco nunca vê claro.
-- As tabelas cadastro.pessoa_relacionada / cadastro.relacao_paciente (20261017113000) não
-- atendem o requisito (relação em texto livre, uma linha por par) e seguem sem uso; esta
-- migration é aditiva e não as altera.
create table cadastro.rede_cuidado_versao (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  conteudo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint rede_cuidado_paciente_versao_uq unique (paciente_id, versao),
  constraint rede_cuidado_versao_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint rede_cuidado_versao_anterior_fk foreign key (paciente_id, versao_esperada)
    references cadastro.rede_cuidado_versao (paciente_id, versao) on delete no action,
  constraint rede_cuidado_conteudo_cifrado_formato_chk check ((
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

create index rede_cuidado_versao_autor_idx on cadastro.rede_cuidado_versao (criado_por_usuario_id);

alter table cadastro.rede_cuidado_versao enable row level security;
revoke all on cadastro.rede_cuidado_versao from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_rede_cuidado() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Versões de rede de cuidado são imutáveis';
end;
$$;
revoke all on function cadastro.impedir_alteracao_rede_cuidado() from public, anon, authenticated, service_role;
create trigger rede_cuidado_versao_imutavel
  before update or delete on cadastro.rede_cuidado_versao
  for each row execute function cadastro.impedir_alteracao_rede_cuidado();
