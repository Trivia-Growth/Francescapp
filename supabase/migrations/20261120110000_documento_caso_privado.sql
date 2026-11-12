-- FR-029 a FR-031: anexos do caso guardados no Google Drive institucional.
--
-- Modelo: identidade do documento separada das suas versões, como em `saude_versao` e
-- `objetivo_cuidado_versao`. A versão é imutável; "documento atual" é a maior versão, e
-- "documento indisponível" é um ESTADO de versão, nunca uma linha apagada. Isso atende
-- diretamente FR-029 ("identificar o documento atual e o indisponível") e o cenário 2 da
-- User Story 8 ("o documento não será apresentado como disponível") sem perder a trilha.
--
-- O que fica EM CLARO e por quê. FR-029 manda organizar por "pessoa acompanhada, categoria,
-- origem, data, autor do envio e versão", e manda a busca respeitar audiência. Um eixo de
-- organização dentro do envelope cifrado não é pesquisável pelo banco: a filtragem cairia no
-- processo do servidor, que teria de baixar e decifrar tudo para descartar o que a pessoa não
-- pode ver — exatamente o vazamento que a audiência existe para evitar. Então ficam legíveis
-- apenas os eixos de organização e controle: `categoria`, `origem`, `data_documento`,
-- `audiencia`, `estado`, autor e versão.
--
-- Custo assumido e registrado: `origem` é texto livre curto e pode conter o nome de uma
-- instituição. É o preço de FR-029 exigir busca por origem. Nome visível, identificador do
-- arquivo no Drive e descrição — que carregam o conteúdo sensível de verdade — viajam no
-- envelope cifrado. O identificador do Drive é cifrado de propósito: ele é uma capacidade,
-- quem o tem e tenha acesso à pasta abre o arquivo sem passar por esta autorização.
--
-- `audiencia` reusa o vocabulário já estabelecido pelo diário (`20261118200000`): 'equipe' e
-- 'equipe_e_familia'. Um terceiro vocabulário para a mesma pergunta de negócio seria dívida.
create table cadastro.documento_caso (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp()
);

create index documento_caso_paciente_idx on cadastro.documento_caso (paciente_id);

create table cadastro.documento_caso_versao (
  id uuid primary key,
  documento_id uuid not null references cadastro.documento_caso (id) on delete no action,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  versao integer not null check (versao > 0),
  versao_esperada integer,
  categoria text not null check (char_length(btrim(categoria)) between 1 and 120),
  origem text check (origem is null or char_length(btrim(origem)) between 1 and 120),
  data_documento date,
  audiencia text not null check (audiencia in ('equipe', 'equipe_e_familia')),
  estado text not null check (estado in ('disponivel', 'indisponivel', 'removido')),
  conteudo_cifrado jsonb not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint documento_versao_uq unique (documento_id, versao),
  constraint documento_versao_sequencia_chk check ((
    (versao = 1 and versao_esperada is null)
    or (versao > 1 and versao_esperada = versao - 1)
  ) is true),
  constraint documento_versao_anterior_fk foreign key (documento_id, versao_esperada)
    references cadastro.documento_caso_versao (documento_id, versao) on delete no action,
  -- A data do documento é do documento, não do envio: aceitar o futuro seria aceitar erro de
  -- digitação como fato. O piso evita data absurda por engano de século.
  constraint documento_versao_data_chk check (
    data_documento is null or data_documento between date '1900-01-01' and date '2200-01-01'
  ),
  constraint documento_conteudo_cifrado_formato_chk check ((
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

create index documento_versao_paciente_idx on cadastro.documento_caso_versao (paciente_id, documento_id, versao desc);
create index documento_versao_autor_idx on cadastro.documento_caso_versao (criado_por_usuario_id);

alter table cadastro.documento_caso enable row level security;
alter table cadastro.documento_caso_versao enable row level security;
revoke all on cadastro.documento_caso from public, anon, authenticated, service_role;
revoke all on cadastro.documento_caso_versao from public, anon, authenticated, service_role;

create function cadastro.impedir_alteracao_documento_caso() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Documentos do caso são imutáveis; registre uma nova versão';
end;
$$;
revoke all on function cadastro.impedir_alteracao_documento_caso() from public, anon, authenticated, service_role;
create trigger documento_caso_imutavel
  before update or delete on cadastro.documento_caso
  for each row execute function cadastro.impedir_alteracao_documento_caso();
create trigger documento_caso_versao_imutavel
  before update or delete on cadastro.documento_caso_versao
  for each row execute function cadastro.impedir_alteracao_documento_caso();

-- Configuração em banco, conforme a diretriz de 11/11/2026 ("tudo que é variável deve ser
-- preenchida no front e guardada no banco de dados"). Três chaves, e nenhuma delas é o
-- ENDEREÇO do provedor: o endereço do Google fica fixo no código, pelo mesmo critério já
-- aplicado na frente de transcrição — endereço editável pela tela vira alavanca para
-- redirecionar a credencial do Vault para um servidor escolhido por quem editou.
--
-- `ffcm.documentos.categorias` resolve, da forma que o solicitante determinou, o bloqueador
-- "lista fechada de categorias" que o design de `documentos-institucionais-integracao` deixou
-- aberto: em vez de inventar a lista aqui, ela nasce com os tipos que a própria User Story 8
-- enumera ("laudos, exames, relatórios, imagens e termos") e passa a ser editável na tela de
-- administração. Exposição 'publica' porque a tela de envio precisa oferecer as opções a
-- qualquer profissional autenticado, não só a administrador.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (
    gen_random_uuid(),
    'ffcm.documentos.ativo',
    'false'::jsonb,
    'booleano',
    'Documentos do caso',
    'Disponibiliza o envio e a consulta de anexos guardados no Google Drive institucional. Não altera quem tem permissão: a autorização continua sendo verificada no servidor e no banco.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.documentos.drive_pasta_raiz',
    '""'::jsonb,
    'texto',
    'Pasta raiz no Google Drive',
    'Identificador da pasta do Drive compartilhado institucional onde as pastas de cada pessoa acompanhada são criadas. Enquanto estiver em branco, o envio de anexos fica indisponível — nunca é substituído por outro local de guarda.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.documentos.categorias',
    '["Laudo","Exame","Relatório","Imagem","Termo","Outro"]'::jsonb,
    'lista',
    'Categorias de anexo',
    'Classificações oferecidas a quem envia um anexo. A lista nasce com os tipos citados na jornada de origem e pode ser ajustada aqui.',
    'publica'
  );
