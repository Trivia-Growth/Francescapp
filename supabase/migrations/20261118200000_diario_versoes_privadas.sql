-- Diário e evolução (FR-008, FR-009, FR-012, FR-013, FR-014).
--
-- Por que tabela nova e não `cadastro.diario_rascunho_textual` (20261108120000): aquela tabela
-- guarda um rascunho por paciente+autor, sem identidade de registro, sem estado de publicação,
-- sem audiência e sem versão encadeada. FR-012 exige retificação com histórico identificado e
-- FR-013 exige estados distintos por registro; as duas coisas são a chave da linha, não um
-- campo extra. Estender aquela tabela significaria reescrever chave primária, unicidade e
-- imutabilidade — ou seja, uma tabela nova com o nome antigo. A antiga permanece fechada
-- (nenhuma função, grant ou policy a alcança) e sai de cena quando a fatia for arquivada.
--
-- O que fica em claro e por quê: `estado`, `audiencia`, `tipo` e `autor_usuario_id` são
-- controles de autorização — a RLS decide com eles quem enxerga a linha, e decidir isso
-- decifrando conteúdo seria decidir depois de ler. `atencao`, `retorno_solicitado` e
-- `tarefa_id` são estado operacional consultável (FR-013/FR-014: o remetente precisa achar o
-- que pediu retorno; a coordenação precisa achar o que foi sinalizado) e não descrevem o
-- acontecimento. Tudo o que descreve a pessoa ou o acontecimento — data do acontecimento,
-- categoria, descrição, contexto, ação tomada, síntese profissional e a justificativa da
-- retificação — viaja cifrado e o banco nunca vê em claro.
--
-- REVISADO EM 12/11/2026, não leia o parágrafo acima como o estado atual. Por decisão do
-- solicitante, a DATA DO ACONTECIMENTO e o RÓTULO DA ÁREA saíram do envelope e viraram as
-- colunas `aconteceu_em` e `area`, acrescentadas por
-- `20261120360000_diario_acontecimento_area_em_claro.sql`. Motivo: FR-007 exige linha do
-- tempo pesquisável por período e área e a distinção entre acontecimento e registro, e
-- nenhuma das duas é possível sobre um envelope sem decifrar tudo no servidor. A reversão
-- para por aí: descrição, contexto, ação tomada, síntese profissional, o texto do relato e
-- a justificativa da retificação CONTINUAM cifrados. Ampliar além desses dois campos exige
-- nova decisão registrada.

create table cadastro.diario_registro (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  -- Quem originou o registro decide a audiência possível e quem pode retificá-lo (FR-012).
  tipo text not null check (tipo in ('relato_familiar', 'evolucao_profissional')),
  autor_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp()
);

create index diario_registro_paciente_idx on cadastro.diario_registro (paciente_id, criado_em desc);
create index diario_registro_autor_idx on cadastro.diario_registro (autor_usuario_id);

create table cadastro.diario_registro_versao (
  id uuid primary key,
  diario_registro_id uuid not null references cadastro.diario_registro (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  -- FR-012: rascunho é privado do autor; publicado é visível à audiência; retificado substitui
  -- o publicado sem apagá-lo, porque a versão anterior continua existindo nesta mesma tabela.
  estado text not null check (estado in ('rascunho', 'publicado', 'retificado')),
  -- `equipe` = autor e colaboradores vinculados ao paciente. `equipe_e_familia` acrescenta os
  -- familiares com acesso vigente. Nenhuma audiência inclui familiares de outro vínculo.
  audiencia text not null check (audiencia in ('equipe', 'equipe_e_familia')),
  -- FR-014: sinalização humana de atenção, consultável sem decifrar nada.
  atencao boolean not null default false,
  -- FR-008: solicitação de retorno. FR-013 exige distingui-la de consulta e de retorno dado.
  retorno_solicitado boolean not null default false,
  -- Preparado para FR-010 sem antecipá-lo: o áudio e sua transcrição são outra fatia, mas um
  -- texto que veio de transcrição não pode ser apresentado como digitado pelo autor.
  origem_conteudo text not null default 'texto'
    check (origem_conteudo in ('texto', 'audio_transcrito')),
  -- FR-013: o retorno é outro registro que aponta para o original; consulta não é retorno.
  responde_registro_id uuid references cadastro.diario_registro (id) on delete no action,
  -- FR-014: tarefa gerada a partir do registro. Sem chave estrangeira de propósito: a tarefa
  -- pertence a outra fatia, com owner próprio, e este owner não recebe privilégio sobre ela.
  -- A existência da tarefa é comprovada por quem a lê, não por esta coluna.
  tarefa_id uuid,
  conteudo_cifrado jsonb not null,
  -- FR-012: retificar exige justificativa. A presença é obrigação do banco; o texto é cifrado.
  justificativa_cifrada jsonb,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint diario_versao_uq unique (diario_registro_id, versao),
  constraint diario_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint diario_anterior_fk foreign key (diario_registro_id, versao_esperada)
    references cadastro.diario_registro_versao (diario_registro_id, versao) on delete no action,
  constraint diario_justificativa_chk check (
    (estado = 'retificado') = (justificativa_cifrada is not null)
  ),
  constraint diario_rascunho_sem_retorno_chk check (
    estado <> 'rascunho' or responde_registro_id is null
  ),
  constraint diario_envelope_chk check ((
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
  ) is true),
  constraint diario_justificativa_envelope_chk check ((
    justificativa_cifrada is null
    or (
      jsonb_typeof(justificativa_cifrada) = 'object'
      and justificativa_cifrada - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
      and justificativa_cifrada -> 'formato' = '1'::jsonb
      and jsonb_typeof(justificativa_cifrada -> 'key_id') = 'string'
      and jsonb_typeof(justificativa_cifrada -> 'nonce') = 'string'
      and jsonb_typeof(justificativa_cifrada -> 'ciphertext') = 'string'
      and jsonb_typeof(justificativa_cifrada -> 'tag') = 'string'
      and nullif(justificativa_cifrada ->> 'key_id', '') is not null
      and nullif(justificativa_cifrada ->> 'nonce', '') is not null
      and nullif(justificativa_cifrada ->> 'ciphertext', '') is not null
      and nullif(justificativa_cifrada ->> 'tag', '') is not null
    )
  ) is true)
);

create index diario_versao_autor_idx on cadastro.diario_registro_versao (criado_por_usuario_id);
-- Sustenta "última versão de cada registro" sem varrer o histórico.
create index diario_versao_corrente_idx
  on cadastro.diario_registro_versao (diario_registro_id, versao desc);
create index diario_versao_resposta_idx
  on cadastro.diario_registro_versao (responde_registro_id) where responde_registro_id is not null;

-- FR-013: consulta é situação distinta de envio e de retorno, e não encerra a solicitação.
-- Guardamos a primeira consulta de cada leitor que não é o autor; nada mais. Registrar toda
-- leitura transformaria o diário em vigilância de leitura sem exigência do requisito.
create table cadastro.diario_consulta (
  diario_registro_id uuid not null references cadastro.diario_registro (id) on delete no action,
  usuario_id uuid not null references public.usuario (id) on delete no action,
  consultado_em timestamptz not null default clock_timestamp(),
  primary key (diario_registro_id, usuario_id)
);

alter table cadastro.diario_registro enable row level security;
alter table cadastro.diario_registro_versao enable row level security;
alter table cadastro.diario_consulta enable row level security;
revoke all on cadastro.diario_registro, cadastro.diario_registro_versao, cadastro.diario_consulta
  from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_diario() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Registros e versões do diário são imutáveis';
end;
$$;
revoke all on function cadastro.impedir_alteracao_diario() from public, anon, authenticated, service_role;
create trigger diario_registro_imutavel before update or delete on cadastro.diario_registro
  for each row execute function cadastro.impedir_alteracao_diario();
create trigger diario_versao_imutavel before update or delete on cadastro.diario_registro_versao
  for each row execute function cadastro.impedir_alteracao_diario();
-- A consulta também não se reescreve: a primeira leitura é a que FR-013 mostra ao remetente.
create trigger diario_consulta_imutavel before update or delete on cadastro.diario_consulta
  for each row execute function cadastro.impedir_alteracao_diario();
