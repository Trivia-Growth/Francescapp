# Proposal

## Why

Em 22/11/2026 o solicitante pediu, literalmente: *"Pessoas que não possuem acesso ao
domínio devem ter uma agenda local, servirá para Edilaine cadastrar os compromissos,
pessoa colocar os lembretes."*

São três coisas, e nenhuma delas existe hoje.

**A agenda do produto é do Google, e é individual.** `agenda-google-integracao` fixou a
V1 em "somente evento único na agenda individual do profissional"; a agenda global
compartilhada ficou fora (`agenda-google-integracao/tasks.md:7`). O código segue isso
literalmente: `web/main.ts:2082` só monta a agenda quando `perfil === 'profissional'`
**e** `sessionStorage['modo-acesso'] === 'google'`, e `web/agenda-individual.ts:121`
recusa montar fora do modo `google`. Quem entra pelo método `interno` não vê agenda
nenhuma — não por restrição de autorização, mas porque não há o que mostrar.

**Quem entra pelo método `interno` é justamente quem o pedido nomeia.**
`packages/contracts/src/acessos.ts:10` conhece exatamente dois métodos,
`google_workspace` e `interno`, e `docs/projeto/contexto-negocio.md:53` registra que a
família entra por e-mail e senha porque não tem conta institucional. Uma conta `interno`
não tem conta Google Workspace, logo não tem Google Calendar, logo não tem agenda. A
lacuna não é de permissão: é de ausência de origem.

**O produto, por decisão de 19/11/2026, não é dono do compromisso.**
`registrar-realizacao-do-compromisso` guarda a **situação de realização** (FR-024) em
tabela local chaveada por `evento_id`, e o compromisso continua vivendo no Google. Essa
decisão foi tomada sobre o compromisso **do Google**, e continua valendo inteira. O que
esta mudança acrescenta é um segundo tipo de compromisso, **sem origem externa**, do qual
o produto é dono porque não há mais ninguém para ser. É a distinção mais fácil de perder
na implementação, e é por isso que a origem deixa de ser um rótulo e vira o eixo do
desenho.

**Lembrete externo está descartado.** A decisão de 17/11/2026 em `pwa-e-avisos-no-app`
(decisão "Sem notificação externa") excluiu push, e-mail, SMS e WhatsApp; só existe o sino
dentro do aplicativo (FR-072). O solicitante pediu lembrete; o lembrete possível é o do
sino, e seu alcance é **de quem abre o aplicativo**. Isso precisa estar escrito no
requisito, não descoberto na operação.

FR-025 já manda "exibir a origem de cada compromisso e a data da última atualização da
agenda". Enquanto havia uma origem só, era um rótulo redundante. Com duas, é o que
impede o produto de parecer dono do que é do Google e de parecer intermediário do que é
seu.

## What Changes

- Adicionar FR-089 a FR-093 à capacidade `agenda-e-carteira` e ajustar FR-025 para as duas
  origens e para o lembrete sem canal externo.
- **Agenda local do titular** (FR-089): compromisso que vive no produto, em tabela própria
  append-only versionada, **uma agenda por pessoa**, para quem não tem conta no domínio.
  Nada é criado, copiado ou sincronizado no Google.
- **Administração por terceiro** (FR-090): quem administra a agenda cadastra, corrige e
  desativa compromisso **em nome do titular**, com autoria individual preservada. Agenda
  administrada não é agenda do administrador.
- **Uma agenda só, com origem declarada** (FR-091): a pessoa vê uma lista única por
  instante; cada item carrega sua origem (`google_individual` ou `local`) e **cada operação
  é roteada pela origem**. A "última atualização" tem significado próprio por origem e é
  apresentada como tal.
- **Lembrete dentro do aplicativo** (FR-092): o titular declara a antecedência sobre um
  compromisso seu; o lembrete vencido vira aviso no sino de FR-072, **marcado como
  atrasado quando a pessoa abre depois do vencimento**. Nenhuma mensagem sai do produto.
- **Limites do compromisso local** (FR-093): propósito de catálogo fechado em vez de
  título livre, sem paciente, sem conteúdo clínico, texto livre cifrado; e a regra já
  escrita em FR-023 de que permissão de agenda **não** concede acesso clínico vale igual
  para a agenda local.
- **FR-024 é reusado, não duplicado**: a situação de realização do compromisso local entra
  no mecanismo que já existe, por extensão aditiva. Ver `design.md — D5`.

### Decisões do solicitante — 22/11/2026

Do pedido literal, e não ampliadas aqui.

1. **Existe agenda local para quem não tem acesso ao domínio.**
2. **Quem administra cadastra os compromissos nela.** O pedido nomeia a Edilaine, que no
   produto é o perfil **Administrador** (`docs/projeto/especificacoes-para-joao.md:41`:
   "Edilaine pode delegar esse perfil").
3. **A pessoa coloca os lembretes.** O lembrete é do titular, não de quem cadastrou.

### Decisões anteriores que esta mudança **não** reabre

- A agenda do Google é **individual, por profissional**. Permanece.
- **Não há notificação externa.** Permanece. O lembrete é o sino de FR-072 e nada mais.
- **Agenda institucional compartilhada** continua fora da V1. A agenda local é **da
  pessoa**, uma por titular; não é um calendário comum onde a equipe se vê.
- **O produto não é dono do compromisso do Google.** Permanece inteira. O compromisso
  local é outro objeto, de outra origem, e nunca é espelho de um evento do Google.

### Exclusões deste recorte

- Push, e-mail, SMS, WhatsApp e notificação do sistema operacional pelo service worker.
  Esta última é notificação externa ao aplicativo e exige registro de dispositivo e
  permissão, ambos excluídos em `pwa-e-avisos-no-app`.
- Criar, espelhar ou sincronizar compromisso local no Google Calendar, em qualquer direção.
- Agenda global ou institucional compartilhada, e qualquer audiência coletiva de agenda.
- Recorrência e séries. A V1 do Google começou por evento único; a local começa igual.
- Lembrete sobre compromisso **do Google**. Fora por YAGNI, não por impedimento: a extensão
  é aditiva e cabe numa fatia posterior se a operação pedir.
- Convite, participante externo, confirmação de presença e qualquer envio de mensagem a
  terceiro.
- Vínculo do compromisso local a paciente ou caso. É a pendência P2; nesta fatia o
  compromisso local não tem paciente.
- Alteração de FR-023, FR-026, FR-027, FR-028, FR-049 e FR-050, e de qualquer artefato de
  `openspec/changes/agenda-google-integracao/**`.
- Ativação remota: nenhuma migração aplicada, nenhuma flag ligada, nada comitado por esta
  proposta.

### Pendências que não podem ser inferidas

Estas **bloqueiam** a tarefa indicada em `tasks.md`; não são supostas pelo executor.

- **P1 — Quem mais administra a agenda de outra pessoa.** Adotado: somente perfil
  Administrador. Se a case manager do caso também cadastrar, a matriz de autorização muda
  e as provas positivas e negativas precisam ser refeitas. Bloqueia 3.2.
- **P2 — Se o compromisso local se vincula a paciente ou caso.** Adotado: **não**, nesta
  fatia. Se vincular, entram audiência de caso, título genérico por ausência de acesso
  clínico e FR-023 inteiro — o recorte muda, deixa de ser "agenda da pessoa" e passa a ser
  agenda do caso. Bloqueia 5.3.
- **P3 — Se o titular cria ou edita compromisso próprio.** O pedido só lhe dá lembretes.
  Adotado: o titular **não** cria nem edita compromisso. Bloqueia 3.3.
- **P4 — Se o lembrete não aberto tem consequência operacional** — por exemplo, aparecer
  para quem cadastrou que a pessoa não viu. Adotado: **não**. Seria confirmação de leitura
  disfarçada e contradiz a distinção de FR-072 entre aviso lido e ciência registrada.
  Bloqueia 6.4.
- **P5 — Contingência da extensão de FR-024.** Se a extensão aditiva de
  `cadastro.realizacao_compromisso` (D5) não puder preservar o comportamento provado do
  ramo Google, escolher entre tabela paralela com dívida registrada e adiar a realização do
  compromisso local. Bloqueia 7.1.
- **P6 — Catálogo inicial de propósitos do compromisso local.** Quais termos a agenda
  local nasce conhecendo. Bloqueia 2.2.

## Capabilities

### Modified Capabilities

- `agenda-e-carteira`: ganha a agenda local do titular sem conta no domínio (FR-089), a
  administração da agenda por terceiro (FR-090), a apresentação de uma agenda só com origem
  declarada por compromisso (FR-091), o lembrete declarado pelo titular e apresentado
  dentro do aplicativo (FR-092) e os limites de conteúdo do compromisso local (FR-093);
  FR-025 passa a tratar explicitamente as duas origens e o lembrete sem canal externo.

## Impact

Alterações futuras em contratos, autorização no servidor e no banco, esquema e políticas
RLS no Supabase, na superfície de agenda da aplicação web e na lista de avisos de FR-072.
O conteúdo tocado inclui texto livre cifrado, o que mantém as exigências de FR-042 e a
auditoria de FR-039.

Esta mudança **não** altera a integração Google, **não** cria caminho de escrita no
Calendar, **não** altera o enum `usuario.perfil` e **não** amplia a audiência de nenhum
conteúdo clínico. Ela **toca** um caminho já provado, `cadastro.realizacao_compromisso`
(FR-024), por extensão aditiva, com o custo e a contingência registrados em
`design.md — D5` e em P5.

A superfície de agenda em `web/main.ts` hoje é montada apenas para `profissional` em modo
`google`; essa condição precisará mudar. Fica registrado que ela **nunca foi autorização** —
é escolha de montagem de tela —, e que a autorização da agenda local nasce no servidor e no
banco, como manda `AGENTS.md`.

Esta proposta não autoriza deploy, migração remota, concessão de acesso, uso de dados reais
ou qualquer operação externa.
