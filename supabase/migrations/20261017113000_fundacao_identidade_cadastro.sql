-- Fundação FFCMApp — D-05: modelo físico local da primeira fatia.
-- Esta migração não altera objetos internos de auth, não cria políticas/RPCs
-- e não concede privilégios. Grants, RLS, auditoria append-only e funções
-- pertencem às tarefas posteriores da mesma mudança OpenSpec.

create schema identidade;
create schema cadastro;
create schema auditoria;
create schema operacao;

create table public.usuario (
  id uuid primary key references auth.users (id) on delete no action,
  perfil text not null check (perfil in ('administrador', 'profissional', 'familia')),
  ativo boolean not null default true,
  versao integer not null default 1 check (versao > 0),
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp()
);

create table identidade.concessao_equipe (
  id uuid primary key,
  email_cifrado jsonb not null,
  email_hmac text not null check (length(btrim(email_hmac)) > 0),
  perfil text not null check (perfil in ('administrador', 'profissional')),
  metodo text not null check (metodo = 'google_workspace'),
  estado text not null check (estado in ('pendente', 'vinculada', 'revogada')),
  usuario_id uuid references auth.users (id) on delete no action,
  subject_google text,
  versao integer not null default 1 check (versao > 0),
  criado_por_usuario_id uuid references public.usuario (id) on delete no action,
  motivo_cifrado jsonb not null,
  criada_em timestamptz not null default clock_timestamp(),
  vinculada_em timestamptz,
  revogada_em timestamptz,
  revogada_por_usuario_id uuid references public.usuario (id) on delete no action,
  motivo_revogacao_cifrado jsonb,
  atualizada_em timestamptz not null default clock_timestamp(),
  constraint concessao_email_cifrado_formato_chk check ((
    jsonb_typeof(email_cifrado) = 'object'
    and email_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and email_cifrado ->> 'formato' = '1'
    and nullif(email_cifrado ->> 'key_id', '') is not null
    and nullif(email_cifrado ->> 'nonce', '') is not null
    and nullif(email_cifrado ->> 'ciphertext', '') is not null
    and nullif(email_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint concessao_motivo_cifrado_formato_chk check ((
    jsonb_typeof(motivo_cifrado) = 'object'
    and motivo_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and motivo_cifrado ->> 'formato' = '1'
    and nullif(motivo_cifrado ->> 'key_id', '') is not null
    and nullif(motivo_cifrado ->> 'nonce', '') is not null
    and nullif(motivo_cifrado ->> 'ciphertext', '') is not null
    and nullif(motivo_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint concessao_motivo_revogacao_formato_chk check (
    motivo_revogacao_cifrado is null or (
      jsonb_typeof(motivo_revogacao_cifrado) = 'object'
      and motivo_revogacao_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and motivo_revogacao_cifrado ->> 'formato' = '1'
      and nullif(motivo_revogacao_cifrado ->> 'key_id', '') is not null
      and nullif(motivo_revogacao_cifrado ->> 'nonce', '') is not null
      and nullif(motivo_revogacao_cifrado ->> 'ciphertext', '') is not null
      and nullif(motivo_revogacao_cifrado ->> 'tag', '') is not null
    ) is true
  ),
  constraint concessao_estado_datas_chk check (((
    estado = 'pendente'
    and usuario_id is null
    and subject_google is null
    and vinculada_em is null
    and revogada_em is null
    and revogada_por_usuario_id is null
    and motivo_revogacao_cifrado is null
  ) or (
    estado = 'vinculada'
    and usuario_id is not null
    and nullif(btrim(subject_google), '') is not null
    and vinculada_em is not null
    and revogada_em is null
    and revogada_por_usuario_id is null
    and motivo_revogacao_cifrado is null
  ) or (
    estado = 'revogada'
    and revogada_em is not null
    and revogada_por_usuario_id is not null
    and motivo_revogacao_cifrado is not null
  )) is true),
  constraint concessao_ordem_datas_chk check (
    (vinculada_em is null or vinculada_em >= criada_em)
    and (revogada_em is null or revogada_em >= criada_em)
    and (vinculada_em is null or revogada_em is null or revogada_em >= vinculada_em)
  )
);

create unique index concessao_equipe_email_metodo_vigente_uq
  on identidade.concessao_equipe (email_hmac, metodo)
  where estado in ('pendente', 'vinculada');

create unique index concessao_equipe_usuario_vinculado_uq
  on identidade.concessao_equipe (usuario_id)
  where estado = 'vinculada';

create unique index concessao_equipe_subject_vinculado_uq
  on identidade.concessao_equipe (subject_google)
  where estado = 'vinculada';

create index concessao_equipe_estado_criada_idx
  on identidade.concessao_equipe (estado, criada_em, id);

create table identidade.excecao_tecnica (
  usuario_id uuid primary key references auth.users (id) on delete no action,
  concessao_id uuid not null unique references identidade.concessao_equipe (id) on delete no action,
  autorizado_por_usuario_id uuid references public.usuario (id) on delete no action,
  motivo_cifrado jsonb not null,
  criada_em timestamptz not null default clock_timestamp(),
  constraint excecao_tecnica_motivo_formato_chk check ((
    jsonb_typeof(motivo_cifrado) = 'object'
    and motivo_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and motivo_cifrado ->> 'formato' = '1'
    and nullif(motivo_cifrado ->> 'key_id', '') is not null
    and nullif(motivo_cifrado ->> 'nonce', '') is not null
    and nullif(motivo_cifrado ->> 'ciphertext', '') is not null
    and nullif(motivo_cifrado ->> 'tag', '') is not null
  ) is true)
);

create table identidade.desafio_login (
  id uuid primary key,
  nonce_hash text not null check (length(btrim(nonce_hash)) > 0),
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default clock_timestamp(),
  constraint desafio_login_ordem_datas_chk check (
    expira_em > criado_em and (consumido_em is null or consumido_em >= criado_em)
  )
);

create index desafio_login_expira_em_idx on identidade.desafio_login (expira_em);

create table identidade.sessao (
  session_id uuid primary key,
  usuario_id uuid not null references public.usuario (id) on delete no action,
  concessao_id uuid not null references identidade.concessao_equipe (id) on delete no action,
  concessao_versao_admissao integer not null check (concessao_versao_admissao > 0),
  metodo text not null check (metodo in ('google_workspace', 'tecnica')),
  admitida_em timestamptz not null default clock_timestamp(),
  revogada_em timestamptz,
  revogada_por_usuario_id uuid references public.usuario (id) on delete no action,
  motivo_revogacao_cifrado jsonb,
  constraint sessao_revogacao_chk check (((
    revogada_em is null
    and revogada_por_usuario_id is null
    and motivo_revogacao_cifrado is null
  ) or (
    revogada_em >= admitida_em
    and revogada_por_usuario_id is not null
    and jsonb_typeof(motivo_revogacao_cifrado) = 'object'
    and motivo_revogacao_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and motivo_revogacao_cifrado ->> 'formato' = '1'
    and nullif(motivo_revogacao_cifrado ->> 'key_id', '') is not null
    and nullif(motivo_revogacao_cifrado ->> 'nonce', '') is not null
    and nullif(motivo_revogacao_cifrado ->> 'ciphertext', '') is not null
    and nullif(motivo_revogacao_cifrado ->> 'tag', '') is not null
  )) is true)
);

create index sessao_usuario_ativa_idx
  on identidade.sessao (usuario_id, admitida_em desc)
  where revogada_em is null;

create index sessao_concessao_ativa_idx
  on identidade.sessao (concessao_id, admitida_em desc)
  where revogada_em is null;

create table operacao.lote_teste (
  id uuid primary key,
  identificacao text not null check (length(btrim(identificacao)) > 0),
  responsavel_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  encerrado_em timestamptz,
  constraint lote_teste_ordem_datas_chk check (encerrado_em is null or encerrado_em >= criado_em)
);

create unique index lote_teste_identificacao_aberto_uq
  on operacao.lote_teste (identificacao)
  where encerrado_em is null;

create table cadastro.paciente (
  id uuid primary key,
  nome_cifrado jsonb not null,
  nome_preferencia_cifrado jsonb,
  data_nascimento_cifrada jsonb,
  versao integer not null default 1 check (versao > 0),
  lote_teste_id uuid references operacao.lote_teste (id) on delete no action,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint paciente_nome_formato_chk check ((
    jsonb_typeof(nome_cifrado) = 'object'
    and nome_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and nome_cifrado ->> 'formato' = '1'
    and nullif(nome_cifrado ->> 'key_id', '') is not null
    and nullif(nome_cifrado ->> 'nonce', '') is not null
    and nullif(nome_cifrado ->> 'ciphertext', '') is not null
    and nullif(nome_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint paciente_nome_preferencia_formato_chk check (
    nome_preferencia_cifrado is null or (
      jsonb_typeof(nome_preferencia_cifrado) = 'object'
      and nome_preferencia_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and nome_preferencia_cifrado ->> 'formato' = '1'
      and nullif(nome_preferencia_cifrado ->> 'key_id', '') is not null
      and nullif(nome_preferencia_cifrado ->> 'nonce', '') is not null
      and nullif(nome_preferencia_cifrado ->> 'ciphertext', '') is not null
      and nullif(nome_preferencia_cifrado ->> 'tag', '') is not null
    ) is true
  ),
  constraint paciente_nascimento_formato_chk check (
    data_nascimento_cifrada is null or (
      jsonb_typeof(data_nascimento_cifrada) = 'object'
      and data_nascimento_cifrada - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and data_nascimento_cifrada ->> 'formato' = '1'
      and nullif(data_nascimento_cifrada ->> 'key_id', '') is not null
      and nullif(data_nascimento_cifrada ->> 'nonce', '') is not null
      and nullif(data_nascimento_cifrada ->> 'ciphertext', '') is not null
      and nullif(data_nascimento_cifrada ->> 'tag', '') is not null
    ) is true
  )
);

create index paciente_lote_teste_idx on cadastro.paciente (lote_teste_id) where lote_teste_id is not null;
create index paciente_criado_em_id_idx on cadastro.paciente (criado_em, id);

create table cadastro.contato_paciente (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  tipo text not null check (tipo in ('email', 'telefone')),
  valor_cifrado jsonb not null,
  versao integer not null default 1 check (versao > 0),
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint contato_paciente_valor_formato_chk check ((
    jsonb_typeof(valor_cifrado) = 'object'
    and valor_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and valor_cifrado ->> 'formato' = '1'
    and nullif(valor_cifrado ->> 'key_id', '') is not null
    and nullif(valor_cifrado ->> 'nonce', '') is not null
    and nullif(valor_cifrado ->> 'ciphertext', '') is not null
    and nullif(valor_cifrado ->> 'tag', '') is not null
  ) is true)
);

create index contato_paciente_paciente_idx on cadastro.contato_paciente (paciente_id, criado_em, id);

create table cadastro.pessoa_relacionada (
  id uuid primary key,
  nome_cifrado jsonb not null,
  contatos_cifrados jsonb,
  versao integer not null default 1 check (versao > 0),
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint pessoa_relacionada_nome_formato_chk check ((
    jsonb_typeof(nome_cifrado) = 'object'
    and nome_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and nome_cifrado ->> 'formato' = '1'
    and nullif(nome_cifrado ->> 'key_id', '') is not null
    and nullif(nome_cifrado ->> 'nonce', '') is not null
    and nullif(nome_cifrado ->> 'ciphertext', '') is not null
    and nullif(nome_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint pessoa_relacionada_contatos_formato_chk check (
    contatos_cifrados is null or (
      jsonb_typeof(contatos_cifrados) = 'object'
      and contatos_cifrados - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and contatos_cifrados ->> 'formato' = '1'
      and nullif(contatos_cifrados ->> 'key_id', '') is not null
      and nullif(contatos_cifrados ->> 'nonce', '') is not null
      and nullif(contatos_cifrados ->> 'ciphertext', '') is not null
      and nullif(contatos_cifrados ->> 'tag', '') is not null
    ) is true
  )
);

create table cadastro.relacao_paciente (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  pessoa_relacionada_id uuid not null references cadastro.pessoa_relacionada (id) on delete no action,
  descricao_relacao_cifrada jsonb not null,
  responsabilidade_cifrada jsonb,
  versao integer not null default 1 check (versao > 0),
  criada_em timestamptz not null default clock_timestamp(),
  atualizada_em timestamptz not null default clock_timestamp(),
  constraint relacao_descricao_formato_chk check ((
    jsonb_typeof(descricao_relacao_cifrada) = 'object'
    and descricao_relacao_cifrada - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and descricao_relacao_cifrada ->> 'formato' = '1'
    and nullif(descricao_relacao_cifrada ->> 'key_id', '') is not null
    and nullif(descricao_relacao_cifrada ->> 'nonce', '') is not null
    and nullif(descricao_relacao_cifrada ->> 'ciphertext', '') is not null
    and nullif(descricao_relacao_cifrada ->> 'tag', '') is not null
  ) is true),
  constraint relacao_responsabilidade_formato_chk check (
    responsabilidade_cifrada is null or (
      jsonb_typeof(responsabilidade_cifrada) = 'object'
      and responsabilidade_cifrada - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and responsabilidade_cifrada ->> 'formato' = '1'
      and nullif(responsabilidade_cifrada ->> 'key_id', '') is not null
      and nullif(responsabilidade_cifrada ->> 'nonce', '') is not null
      and nullif(responsabilidade_cifrada ->> 'ciphertext', '') is not null
      and nullif(responsabilidade_cifrada ->> 'tag', '') is not null
    ) is true
  )
);

create index relacao_paciente_paciente_idx on cadastro.relacao_paciente (paciente_id, criada_em, id);
create index relacao_paciente_pessoa_idx on cadastro.relacao_paciente (pessoa_relacionada_id);

create table auditoria.evento (
  id uuid primary key,
  instante timestamptz not null default clock_timestamp(),
  ator_usuario_id uuid references public.usuario (id) on delete no action,
  operador_restrito text,
  acao text not null check (length(btrim(acao)) > 0),
  tipo_objeto text not null check (length(btrim(tipo_objeto)) > 0),
  objeto_id uuid,
  resultado text not null check (resultado in ('permitido', 'negado', 'falhou')),
  request_id uuid not null,
  constraint evento_ator_ou_operador_chk check (
    num_nonnulls(ator_usuario_id, operador_restrito) = 1
  ),
  constraint evento_operador_restrito_chk check (
    operador_restrito is null or length(btrim(operador_restrito)) > 0
  )
);

create index evento_objeto_instante_idx on auditoria.evento (tipo_objeto, objeto_id, instante desc, id);
create index evento_ator_instante_idx on auditoria.evento (ator_usuario_id, instante desc, id)
  where ator_usuario_id is not null;

create table cadastro.acesso_paciente (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  usuario_id uuid not null references public.usuario (id) on delete no action,
  concedido_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  concedido_em timestamptz not null default clock_timestamp(),
  motivo_concessao_cifrado jsonb not null,
  revogado_por_usuario_id uuid references public.usuario (id) on delete no action,
  revogado_em timestamptz,
  motivo_revogacao_cifrado jsonb,
  versao integer not null default 1 check (versao > 0),
  constraint acesso_motivo_concessao_formato_chk check ((
    jsonb_typeof(motivo_concessao_cifrado) = 'object'
    and motivo_concessao_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and motivo_concessao_cifrado ->> 'formato' = '1'
    and nullif(motivo_concessao_cifrado ->> 'key_id', '') is not null
    and nullif(motivo_concessao_cifrado ->> 'nonce', '') is not null
    and nullif(motivo_concessao_cifrado ->> 'ciphertext', '') is not null
    and nullif(motivo_concessao_cifrado ->> 'tag', '') is not null
  ) is true),
  constraint acesso_revogacao_chk check (((
    revogada_em is null
    and revogado_por_usuario_id is null
    and motivo_revogacao_cifrado is null
  ) or (
    revogada_em >= concedido_em
    and revogado_por_usuario_id is not null
    and jsonb_typeof(motivo_revogacao_cifrado) = 'object'
    and motivo_revogacao_cifrado - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and motivo_revogacao_cifrado ->> 'formato' = '1'
    and nullif(motivo_revogacao_cifrado ->> 'key_id', '') is not null
    and nullif(motivo_revogacao_cifrado ->> 'nonce', '') is not null
    and nullif(motivo_revogacao_cifrado ->> 'ciphertext', '') is not null
    and nullif(motivo_revogacao_cifrado ->> 'tag', '') is not null
  )) is true)
);

create unique index acesso_paciente_usuario_ativo_uq
  on cadastro.acesso_paciente (usuario_id, paciente_id)
  where revogada_em is null;

create index acesso_paciente_paciente_ativo_idx
  on cadastro.acesso_paciente (paciente_id, usuario_id)
  where revogada_em is null;

create table operacao.requisicao (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario (id) on delete no action,
  operacao text not null check (length(btrim(operacao)) > 0),
  chave_idempotencia text not null check (length(btrim(chave_idempotencia)) > 0),
  digest_entrada text not null check (length(btrim(digest_entrada)) > 0),
  estado text not null check (length(btrim(estado)) > 0),
  resultado_id uuid,
  resultado_versao integer check (resultado_versao is null or resultado_versao > 0),
  criada_em timestamptz not null default clock_timestamp(),
  atualizada_em timestamptz not null default clock_timestamp(),
  unique (ator_usuario_id, operacao, chave_idempotencia)
);

create index requisicao_atualizada_idx on operacao.requisicao (ator_usuario_id, atualizada_em desc, id);
