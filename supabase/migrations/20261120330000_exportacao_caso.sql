-- FR-032/FR-033: registro das exportações de caso. Esta migration cria só o armazenamento;
-- a autorização, a auditoria e a exposição HTTP ficam na migration seguinte.
--
-- MODELO DE AMEAÇA, antes do desenho (a exportação é fronteira de confiança):
--
-- 1. Caminho de abuso central: CONCENTRAR A DECIFRAGEM. Se a exportação decifrasse conteúdo
--    de todas as fatias num só componente, esse componente passaria a poder ler o caso
--    inteiro de qualquer paciente — exatamente o poder que a arquitetura distribuiu de
--    propósito (o banco nunca vê claro; o servidor é proxy; quem decifra é o navegador de
--    quem está autorizado àquele item). Mitigação verificável: ESTA FATIA NÃO DECIFRA NADA
--    e não recebe privilégio sobre coluna cifrada alguma — veja os grants da migration
--    seguinte. O servidor autoriza, deriva o MANIFESTO (que itens entram, com autoria e
--    datas) e registra; o artefato consultável é montado no navegador, onde o texto claro
--    já existe para aquele leitor e só do que ele pode ver.
--
-- 2. Exportação como canal lateral de audiência. "Identificar conteúdo indisponível"
--    (FR-032) NÃO pode virar "existem 3 itens que você não pode ver". Mitigação: o que a
--    pessoa não pode ver é descartado na derivação e não é contado em lugar nenhum;
--    `indisponivel` é estado de documento (FR-029 e cenário 2 da User Story 8) ou falha de
--    busca do anexo, nunca item filtrado por audiência.
--
-- 3. Elegibilidade divergir da leitura comum. Mitigação por construção: o manifesto sai de
--    `cadastro.linha_tempo_caso`, a mesma função já provada da FR-007, com a mesma regra de
--    audiência. Não existe segunda regra de visibilidade para manter em sincronia.
--
-- 4. Identificador do Drive vazando no pacote. Ele é uma capacidade: quem o tem e tenha
--    acesso à pasta abre o arquivo sem passar por esta autorização. A relação de anexos
--    leva categoria, data e autoria; `drive_file_id` continua cifrado e fora daqui.
--
-- 5. Exportação sem rastro. Mitigação: registro append-only com destinatário e propósito
--    gravados ANTES de o manifesto ser devolvido, e auditoria nos dois caminhos.
--
-- Destinatário e propósito são dados pessoais de terceiro e viajam cifrados; o banco guarda
-- só a finalidade, que é vocabulário fechado e precisa ser pesquisável.
--
-- Reversão: as três tabelas guardam trilha de exportação e não são apagadas sem
-- procedimento aprovado.

create table cadastro.exportacao_caso (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  -- FR-032 permite exportar "por caso ou período"; o período é opcional e, quando existe,
  -- recorta pela data de REGISTRO, que é a única presente em claro em todas as fontes.
  periodo_de timestamptz,
  periodo_ate timestamptz,
  -- 'acompanhamento' cobre FR-032. 'portabilidade_titular' atende pedido do titular
  -- (FR-040). 'encerramento_uso' é o caso de FR-033, que exige entrega e conferência.
  finalidade text not null check (finalidade in ('acompanhamento', 'portabilidade_titular', 'encerramento_uso')),
  destinatario_cifrado jsonb not null,
  proposito_cifrado jsonb not null,
  ator_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint exportacao_periodo_chk check (
    (periodo_de is null and periodo_ate is null)
    or (periodo_de is not null and periodo_ate is not null and periodo_ate > periodo_de)
  ),
  constraint exportacao_destinatario_chk check ((
    jsonb_typeof(destinatario_cifrado) = 'object'
    and destinatario_cifrado ? 'formato' and destinatario_cifrado ? 'key_id'
    and destinatario_cifrado ? 'nonce' and destinatario_cifrado ? 'ciphertext'
    and destinatario_cifrado ? 'tag'
  ) is true),
  constraint exportacao_proposito_chk check ((
    jsonb_typeof(proposito_cifrado) = 'object'
    and proposito_cifrado ? 'formato' and proposito_cifrado ? 'key_id'
    and proposito_cifrado ? 'nonce' and proposito_cifrado ? 'ciphertext'
    and proposito_cifrado ? 'tag'
  ) is true)
);

create index exportacao_caso_paciente_idx on cadastro.exportacao_caso (paciente_id, criado_em desc);

-- O que entrou no pacote, com autoria e datas preservadas (FR-032). Uma linha por item
-- elegível; `disponibilidade` separa o que foi incluído do que existe mas não pôde ser
-- entregue — e essa distinção nunca decorre de audiência.
create table cadastro.exportacao_item (
  id uuid primary key,
  exportacao_id uuid not null references cadastro.exportacao_caso (id) on delete no action,
  fonte text not null check (fonte in (
    'diario', 'documento', 'anamnese', 'saude', 'contexto', 'rede',
    'situacao', 'objetivo', 'tarefa', 'encaminhamento', 'orientacao', 'pendencia'
  )),
  registro_id uuid not null,
  versao_item integer not null check (versao_item > 0),
  tipo_evento text not null check (tipo_evento in ('registro', 'atualizacao', 'retificacao', 'rascunho')),
  autor_usuario_id uuid references public.usuario (id) on delete no action,
  registrado_em timestamptz not null,
  aconteceu_em date,
  disponibilidade text not null check (disponibilidade in ('incluido', 'indisponivel')),
  -- Vocabulário fechado: motivo de indisponibilidade NUNCA é "sem audiência".
  motivo_indisponibilidade text check (motivo_indisponibilidade in ('documento_indisponivel', 'anexo_nao_recuperado')),
  constraint exportacao_item_motivo_chk check (
    (disponibilidade = 'indisponivel') = (motivo_indisponibilidade is not null)
  ),
  constraint exportacao_item_uq unique (exportacao_id, fonte, registro_id, versao_item)
);

create index exportacao_item_exportacao_idx on cadastro.exportacao_item (exportacao_id);

-- FR-033: entrega e conferência registradas. Append-only: conferir não altera a entrega,
-- acrescenta o ato de conferir.
create table cadastro.exportacao_entrega (
  id uuid primary key,
  exportacao_id uuid not null references cadastro.exportacao_caso (id) on delete no action,
  ato text not null check (ato in ('entregue', 'conferida')),
  observacao_cifrada jsonb,
  ator_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint exportacao_entrega_uq unique (exportacao_id, ato),
  constraint exportacao_entrega_observacao_chk check (
    observacao_cifrada is null or (
      jsonb_typeof(observacao_cifrada) = 'object'
      and observacao_cifrada ? 'formato' and observacao_cifrada ? 'key_id'
      and observacao_cifrada ? 'nonce' and observacao_cifrada ? 'ciphertext'
      and observacao_cifrada ? 'tag'
    ) is true
  )
);

alter table cadastro.exportacao_caso enable row level security;
alter table cadastro.exportacao_item enable row level security;
alter table cadastro.exportacao_entrega enable row level security;
revoke all on cadastro.exportacao_caso, cadastro.exportacao_item, cadastro.exportacao_entrega
  from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_exportacao() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'REGISTRO_IMUTAVEL';
end $$;
revoke all on function cadastro.impedir_alteracao_exportacao() from public, anon, authenticated, service_role;

create trigger exportacao_caso_imutavel before update or delete on cadastro.exportacao_caso
  for each row execute function cadastro.impedir_alteracao_exportacao();
create trigger exportacao_caso_imutavel_truncate before truncate on cadastro.exportacao_caso
  for each statement execute function cadastro.impedir_alteracao_exportacao();
create trigger exportacao_item_imutavel before update or delete on cadastro.exportacao_item
  for each row execute function cadastro.impedir_alteracao_exportacao();
create trigger exportacao_item_imutavel_truncate before truncate on cadastro.exportacao_item
  for each statement execute function cadastro.impedir_alteracao_exportacao();
create trigger exportacao_entrega_imutavel before update or delete on cadastro.exportacao_entrega
  for each row execute function cadastro.impedir_alteracao_exportacao();
create trigger exportacao_entrega_imutavel_truncate before truncate on cadastro.exportacao_entrega
  for each statement execute function cadastro.impedir_alteracao_exportacao();
