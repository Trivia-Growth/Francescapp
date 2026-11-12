-- Diretriz do solicitante (11/11/2026): "tudo que é variável deve ser preenchida no front e
-- guardada no banco de dados". Configuração do sistema deixa de viver só em variável de ambiente
-- e passa a ter registro no banco, editável por tela de administração.
--
-- Recorte desta migration: só a tabela. Operação privada, leitor do servidor e grants ficam nas
-- migrations seguintes. Não é conteúdo clínico (é parâmetro operacional), por isso não entra em
-- envelope cifrado — é metadado organizacional, como `cadastro.campo_extra_plano_catalogo`.
--
-- Decisões registradas aqui porque mudam o modelo de ameaça:
-- 1. O CATÁLOGO de chaves é definido por migration, nunca pela tela. Quem lê a configuração é o
--    código; chave que ninguém lê é configuração morta e chave inventada pela tela não teria
--    leitor. A administração edita VALOR, não cria nem renomeia chave, nem muda tipo/rótulo.
-- 2. `exposicao` limita quem pode ler. 'servidor' é lido pelo processo do servidor por uma cadeia
--    de papéis restrita (ver migration de leitor); 'administracao' só aparece na tela de
--    administração autenticada. Assim o papel de baixo privilégio do pool não enxerga tudo.
-- 3. Ligar uma rota por configuração NUNCA substitui autorização: a rota continua validando
--    sessão, concessão e atestado. Configuração decide disponibilidade do serviço, não permissão.
-- 4. A chave é o endereço estável e legível (o código lê por chave), mas a identidade da linha
--    é um uuid: `auditoria.evento.objeto_id` e `operacao.requisicao.resultado_id` são uuid, e a
--    trilha tem que apontar para a linha sem depender de texto editável.
create table identidade.configuracao_sistema (
  id uuid primary key,
  chave text not null unique check (chave ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  valor jsonb not null,
  tipo text not null check (tipo in ('booleano', 'texto', 'numero', 'lista')),
  rotulo text not null check (char_length(btrim(rotulo)) between 1 and 160),
  descricao text check (descricao is null or char_length(btrim(descricao)) between 1 and 600),
  exposicao text not null default 'administracao' check (exposicao in ('administracao', 'servidor')),
  versao integer not null default 1 check (versao between 1 and 2147483647),
  atualizado_por_usuario_id uuid references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint configuracao_sistema_valor_tipo_chk check ((
    (tipo = 'booleano' and jsonb_typeof(valor) = 'boolean')
    or (tipo = 'texto' and jsonb_typeof(valor) = 'string')
    or (tipo = 'numero' and jsonb_typeof(valor) = 'number')
    or (tipo = 'lista' and jsonb_typeof(valor) = 'array')
  ) is true)
);

create index configuracao_sistema_exposicao_idx on identidade.configuracao_sistema (exposicao);

alter table identidade.configuracao_sistema enable row level security;
revoke all on identidade.configuracao_sistema from public, anon, authenticated, service_role;

-- Semente das duas chaves usadas como prova de migração de rota (ver
-- `netlify/functions/contato.ts` e `netlify/functions/campo-extra-plano.ts`). O valor semeado é
-- igual ao da variável de ambiente correspondente em produção hoje, para que a troca de leitura
-- não mude comportamento. `atualizado_por_usuario_id` fica nulo: ninguém editou ainda, e atribuir
-- autoria a uma pessoa que não agiu seria falsear a trilha.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (
    gen_random_uuid(),
    'ffcm.contato.ativo',
    'true'::jsonb,
    'booleano',
    'Contatos do paciente',
    'Disponibiliza a consulta e a edição de contatos do paciente. Não altera quem tem permissão: a autorização continua sendo verificada no servidor e no banco.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.campo_extra_plano.ativo',
    'true'::jsonb,
    'booleano',
    'Campos extras do plano de cuidado',
    'Disponibiliza o catálogo de campos extras do objetivo, administrado por Administrador. Não altera quem tem permissão.',
    'servidor'
  );
