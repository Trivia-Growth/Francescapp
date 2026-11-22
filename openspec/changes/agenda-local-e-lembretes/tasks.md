# Tasks

Cada tarefa indica requisito/cenário, dependência e evidência de aceite. A política de
verificação é a de `AGENTS.md — Execução enxuta`: durante o desenvolvimento, somente
`pnpm run verificar:rapido` (lint e typecheck); ao escrever um teste novo, executar uma
vez apenas o arquivo afetado e, se falhar, corrigir e repetir apenas ele;
`pnpm run verificar:ativacao` uma única vez, na ativação da fatia, junto do roteiro "Como
testar" do PR. Testes positivos e negativos de autorização/RLS são obrigatórios na
ativação e nunca podem ser pulados; se não executarem, registrar o bloqueio aqui, não
sucesso presumido.

Nenhuma tarefa autoriza deploy, push, merge, migração remota, concessão de acesso ou uso
de dados reais. Todos os dados de teste são fictícios.

**Leitura do recorte.** Os grupos 1 a 4 são **fatia nova**: tabela própria, owner próprio,
operação própria. O grupo 5 é **apresentação**, e é onde a origem deixa de ser rótulo e
vira roteamento. O grupo 6 **consome** o sino de FR-072 sem criar fila de mensagens. O
grupo 7 é o único que toca **caminho já provado** — `cadastro.realizacao_compromisso` de
FR-024 — e por isso o seu critério de aceite inclui provar que o ramo Google não mudou de
comportamento. Nenhum grupo toca a integração Google.

## 0. Pré-condições e pendências

Nenhuma tarefa dos grupos 1 a 8 começa antes de 0.1 e 0.2. As pendências P1 a P6
**bloqueiam** a tarefa indicada; não são supostas pelo executor.

- [ ] 0.1 Conferir no esquema local o estado real do que esta fatia pressupõe:
  `cadastro.realizacao_compromisso` (colunas, CHECKs, índices de unicidade e o bloco de
  autorização da operação), `identidade.agenda_google_vinculo_paciente`, o catálogo de
  owners e o envelope de `supabase/functions/_shared/cifra-autenticada.ts`.
  **Evidência:** consulta de esquema local registrada; divergência relevante volta à
  coordenação antes de qualquer escrita (`design.md — D5`).
- [ ] 0.2 Auditar a base de autorização que a agenda local vai reusar: sessão válida,
  perfil, método de acesso (`google_workspace` / `interno`) e revogação de FR-037.
  **Evidência:** matriz positiva e negativa existente reexecutada, com saída registrada.
  Não cria controle novo; confirma o que FR-090 vai pressupor.
- [ ] 0.3 **BLOQUEADA — P1.** Quem, além do perfil Administrador, administra a agenda de
  outra pessoa. Adotado enquanto não houver decisão: **somente Administrador**. Se a case
  manager do caso também cadastrar, a matriz de autorização muda, a concessão nominal
  descartada em `design.md — D3` volta à mesa e as provas positivas e negativas precisam
  ser refeitas. Bloqueia 3.2.
- [ ] 0.4 **BLOQUEADA — P2.** Se o compromisso local se vincula a paciente ou caso. Adotado
  enquanto não houver decisão: **não se vincula**, e a tabela não tem `paciente_id`
  (`design.md — D6`). Se vincular, entram audiência de caso, título genérico por ausência
  de acesso clínico e FR-023 inteiro — o recorte deixa de ser "agenda da pessoa". Bloqueia
  5.3.
- [ ] 0.5 **BLOQUEADA — P3.** Se o titular cria ou edita compromisso próprio, além de pôr
  lembretes. O pedido de 22/11/2026 lhe dá lembretes, não compromissos. Adotado enquanto
  não houver decisão: **o titular não cria nem edita compromisso**; registra realização e
  pede mudança fora do produto. Bloqueia 3.3.
- [ ] 0.6 **BLOQUEADA — P4.** Se lembrete vencido e não aberto tem consequência operacional
  para quem cadastrou. Adotado enquanto não houver decisão: **não tem**, porque seria
  confirmação de leitura disfarçada e contradiz a distinção de FR-072 entre aviso lido e
  ciência registrada. Bloqueia 6.4.
- [ ] 0.7 **BLOQUEADA — P5.** Contingência da extensão de FR-024. Se 7.1 demonstrar que a
  extensão aditiva não preserva o comportamento provado do ramo Google, a escolha entre
  tabela paralela com dívida registrada e adiamento da realização do compromisso local é
  **da coordenação, não do executor**. Bloqueia 7.1.
- [ ] 0.8 **BLOQUEADA — P6.** Catálogo inicial de propósitos do compromisso local: quais
  termos a agenda nasce conhecendo. O catálogo é administrado justamente para crescer, mas
  a semeadura é regra de negócio da cliente. Bloqueia 2.2.

## 1. Contratos

Depende de 0.1.

- [ ] 1.1 Criar `packages/contracts/src/agenda-local.ts` com os schemas Zod `.strict()` do
  compromisso local: titular, janela com fuso, propósito de catálogo, local ou modalidade,
  observação, situação de vigência, motivo e versão. **Evidência:** teste novo em
  `packages/contracts/test/`, executado uma vez, cobrindo entrada válida, rejeição de campo
  desconhecido, rejeição de propósito fora do conjunto, rejeição de fim anterior ao início
  e **ausência de qualquer campo de título livre ou de paciente** (FR-089, FR-093).
- [ ] 1.2 Acrescentar ao mesmo arquivo o schema do lembrete: compromisso, antecedência e
  situação de leitura, **sem canal, sem destinatário externo e sem token de dispositivo**.
  **Evidência:** teste cobrindo rejeição de qualquer campo de canal ou destinatário externo
  (FR-092, cenário "Nenhuma mensagem sai do produto").
- [ ] 1.3 Acrescentar o schema da projeção unificada de agenda, com `origem` em conjunto
  fechado de dois valores e a data de atualização **por origem**, com significados
  distintos. **Evidência:** teste cobrindo item sem origem rejeitado e a distinção entre
  instante de consulta e instante de versão (FR-091, FR-025).
- [ ] 1.4 Registrar os AAD das tabelas novas (`compromisso_local`,
  `compromisso_local_lembrete`) na união de `packages/contracts/src/rpc.ts` e no ramo de
  `supabase/functions/_shared/cifra-autenticada.ts`. **Evidência:** teste cobrindo AAD de
  outra tabela recusado (FR-093). **Nota de integração:** esses dois arquivos são
  compartilhados; a alteração é aditiva.

## 2. Banco — compromisso local

Depende de 1.1.

- [ ] 2.1 Migração aditiva: `cadastro.compromisso_local`, append-only no desenho das demais
  tabelas versionadas (chave `(registro_id, versao)`, auto-FK `anterior`, motivo obrigatório
  a partir da versão 2, trigger bloqueando UPDATE e DELETE, RLS ligada, `revoke all` dos
  papéis de aplicação), com `titular_usuario_id` e `autor_usuario_id` como colunas
  **distintas** e **sem `paciente_id`**. **Evidência:** teste SQL provando UPDATE e DELETE
  bloqueados, versão 2 sem motivo recusada, e ausência de privilégio para `anon`,
  `authenticated` e `service_role` (FR-089, cenários "Correção preserva a versão anterior",
  "Correção sem motivo é recusada" e "Exclusão é desativação versionada").
- [ ] 2.2 **BLOQUEADA por P6 quanto aos termos.** Migração aditiva do catálogo administrado
  de propósitos, com `ativo`/`versao` e sem grant de DELETE. **Evidência:** teste SQL
  provando que propósito fora do catálogo é recusado pelo banco e que desativar um propósito
  mantém legível o compromisso antigo que o usa (FR-093, cenário "Propósito fora do catálogo
  é recusado").
- [ ] 2.3 Owner dedicado `ffcmapp_compromisso_local_owner`, com ACL mínima explícita e
  **nenhum privilégio** sobre `cadastro.paciente`,
  `identidade.agenda_google_vinculo_paciente` ou tabelas de conteúdo clínico. **Evidência:**
  teste SQL que enumera a ACL exata do owner e falha se ela crescer (FR-093, cenário "Agenda
  não concede acesso clínico"; `design.md — D3`).

## 3. Banco — autorização da agenda administrada

Depende de 0.2, 2.1 e 2.3.

- [ ] 3.1 Policies de leitura: titular lê a própria agenda; Administrador lê a agenda que
  administra. **Evidência:** teste SQL positivo e negativo com três atores fictícios —
  titular, Administrador e profissional com vínculo ativo no mesmo caso que não é nenhum dos
  dois —, provando que o terceiro não lê (FR-090, cenário "Agenda alheia é negada a outro
  profissional do mesmo caso").
- [ ] 3.2 **BLOQUEADA — P1.** Policies de escrita e a operação
  `operacao.compromisso_local_privada` sob wrapper `api.compromisso_local_privado`, com a
  condição de autorização **repetida na operação** antes de gravar. **Evidência:** teste SQL
  e teste de servidor provando negação por chamada direta ao wrapper, por perfil indevido e
  após revogação, com auditoria da negação (FR-090, cenários de negação e revogação).
- [ ] 3.3 **BLOQUEADA — P3.** Caminho de escrita do titular sobre a própria agenda. Enquanto
  P3 não for decidida, **não implementar**: o titular lê e põe lembretes, e nada mais.
  **Evidência quando desbloqueada:** matriz de autorização atualizada e provas refeitas, não
  reaproveitadas.
- [ ] 3.4 Autoria individual preservada: titular e autor gravados e apresentados como
  identidades distintas. **Evidência:** teste provando que a agenda administrada não é
  apresentada como agenda de quem administra e que o autor aparece no item (FR-090, cenário
  "Quem administra cadastra em nome do titular").
- [ ] 3.5 Auditoria obrigatória na mesma transação de cada escrita e de cada negação,
  conforme FR-039, **sem gravar conteúdo cifrado no registro de auditoria**. **Evidência:**
  teste SQL provando que a escrita sem auditoria é impossível e que o registro de auditoria
  não contém texto livre (FR-090).

## 4. Servidor — operações do compromisso local

Depende de 1.1, 1.4 e 3.2.

- [ ] 4.1 Rota HTTP própria do compromisso local, atrás de flag própria desligada por
  padrão e **independente** da flag da integração Google, no padrão já adotado por
  `ffcm.realizacao_compromisso.ativo`. **Evidência:** teste de rota com a flag desligada
  recusando, e com a flag ligada localmente exercitando o caminho; `pnpm run
  verificar:rapido` limpo (FR-089).
- [ ] 4.2 Cifra de `local_modalidade` e `observacao` com AAD próprio, decifra apenas no
  servidor para quem a operação autorizou. **Evidência:** teste provando que o conteúdo sai
  cifrado do banco e que AAD trocado falha a decifra (FR-093, cenário "Texto livre é
  cifrado").
- [ ] 4.3 Garantir que **nenhuma** chamada ao Google Calendar é feita por este caminho, em
  nenhuma direção. **Evidência:** teste com o cliente Google instrumentado, falhando se
  qualquer chamada de criação, alteração ou cancelamento ocorrer durante uma escrita local
  (FR-089, cenário "Compromisso local é persistido no produto e não vai ao Google";
  `design.md — D2.4`).

## 5. Apresentação — uma agenda só, com origem

Depende de 1.3 e 4.1.

- [ ] 5.1 Projeção unificada no servidor: lista única ordenada por instante, com `origem` em
  cada item e a data de atualização **por origem**, com os dois significados distintos.
  **Evidência:** teste cobrindo item sem origem rejeitado, ordenação entre origens e o
  rótulo de instante de consulta não apresentado como instante de atualização (FR-091,
  FR-025, FR-050).
- [ ] 5.2 Roteamento por origem na fronteira do servidor: alteração enviada para a origem
  errada é recusada. **Evidência:** teste com os dois cruzamentos — local pelo caminho
  Google e Google pelo caminho local —, provando recusa sem alterar nenhuma das origens e
  sem revelar conteúdo da outra (FR-091, cenário "Operação é roteada pela origem").
- [ ] 5.3 **BLOQUEADA — P2.** Qualquer vínculo entre compromisso local e paciente ou caso.
  Enquanto P2 não for decidida, **não implementar**, e a projeção não expõe campo de
  paciente. **Evidência quando desbloqueada:** o recorte muda e volta à coordenação antes de
  qualquer escrita.
- [ ] 5.4 Falha de uma origem não derruba nem disfarça a outra. **Evidência:** teste com a
  consulta Google falhando e compromissos locais no período, provando que os locais aparecem,
  que a indisponibilidade é informada e que a lista parcial não é apresentada como completa
  (FR-091, cenário correspondente).
- [ ] 5.5 Superfície de agenda na aplicação web: a parte Google continua condicionada ao modo
  `google`; a parte local é apresentada a qualquer pessoa autenticada sobre a própria agenda
  e a quem administra. **Evidência:** teste de interface cobrindo titular `interno` vendo sua
  agenda local, e registro explícito de que a condição de `web/main.ts:2082` é montagem de
  tela e **não** autorização — a prova de autorização é a de 3.1 e 3.2 (`design.md — D7`).
  **Nota de integração:** este arquivo é disputado por outras frentes de frontend; conferir
  antes de iniciar.

## 6. Lembretes dentro do aplicativo

Depende de 1.2, 2.1 e 3.1. Consome FR-072 sem alterá-lo.

- [ ] 6.1 Migração aditiva: `cadastro.compromisso_local_lembrete`, uma linha por
  (compromisso, titular), com antecedência e situação de leitura, RLS restrita ao titular.
  **Evidência:** teste SQL positivo e negativo provando que ninguém além do titular lê ou
  escreve, inclusive quem cadastrou o compromisso (FR-092, cenários "Lembrete é da pessoa" e
  "Lembrete alheio é negado por acesso direto").
- [ ] 6.2 Derivação do aviso na consulta de FR-072, **sem agendador e sem fila de mensagens
  com texto próprio**: lembrete vencido e não lido entra na lista de avisos do titular.
  **Evidência:** teste cobrindo lembrete não vencido ausente da lista, vencido presente, e
  ausência de qualquer texto de aviso gravado na criação (FR-092; `design.md — D4` e
  `pwa-e-avisos-no-app/design.md — D6`).
- [ ] 6.3 Lembrete atrasado apresentado como atrasado, com o instante do vencimento.
  **Evidência:** teste provando que o aviso aberto horas depois é identificado como atrasado
  e não como pontual (FR-092, cenário "Lembrete atrasado é apresentado como atrasado").
- [ ] 6.4 **BLOQUEADA — P4.** Qualquer consequência operacional de lembrete não aberto, por
  exemplo apresentá-la a quem cadastrou. Enquanto P4 não for decidida, **não implementar**.
  **Evidência quando desbloqueada:** a decisão precisa dizer como isso convive com a
  distinção de FR-072 entre aviso lido e ciência registrada.
- [ ] 6.5 Marcar lembrete como lido não registra ciência nem encerra pendência. **Evidência:**
  teste provando que nenhuma ciência de FR-013 é persistida e que nenhuma pendência muda de
  situação (FR-092, cenário correspondente).
- [ ] 6.6 Compromisso desativado não gera aviso de lembrete. **Evidência:** teste cobrindo
  desativação antes do vencimento e ausência do aviso (FR-092, cenário correspondente).
- [ ] 6.7 Prova negativa de canal externo: nenhuma chamada de push, e-mail, SMS ou WhatsApp e
  nenhum registro de token de dispositivo em todo o ciclo do lembrete. **Evidência:** teste
  observável sobre os clientes de rede e o armazenamento, falhando se qualquer envio ocorrer
  (FR-092, cenário "Nenhuma mensagem sai do produto").

## 7. Realização do compromisso local — extensão de FR-024

Depende de 0.1, 0.7 e 2.1. **É o único grupo que toca caminho já provado.**

- [ ] 7.1 **BLOQUEADA por P5 quanto à contingência.** Migração aditiva em
  `cadastro.realizacao_compromisso`: coluna `origem` em conjunto fechado,
  `compromisso_local_id` nullable, CHECK de exclusividade entre o par
  `(subject_google, evento_id)` e `compromisso_local_id`, e `subject_google` nullable
  **apenas** no ramo local. **Evidência obrigatória:** as provas existentes de FR-024
  reexecutadas e passando sem alteração de comportamento do ramo Google — unicidade por
  versão com duas conexões reais, recusa de remarcação sem destino, recusa de destino
  apontando para si mesmo, e `realizacao_nao_confirmada` não gravável. Se a demonstração
  falhar, **parar** e devolver a P5 à coordenação; não escolher a contingência sozinho
  (`design.md — D5`).
- [ ] 7.2 Dois ramos de autorização **explícitos e separados** dentro da mesma operação, um
  por origem, com predicado de `origem` em **todas** as policies. **Evidência:** teste SQL
  provando que o ator do ramo local não alcança nenhuma linha de origem Google e vice-versa,
  inclusive por chamada direta ao wrapper, e que família continua negada nos dois ramos
  (FR-089, FR-024).
- [ ] 7.3 Derivação da situação no ramo local lê o `fim` persistido e **ignora** instante de
  término enviado pelo cliente. **Evidência:** teste provando que um término mentiroso no
  pedido não altera o resultado da derivação (FR-089, cenário "Registro de realização do
  compromisso local não aceita o término informado pelo cliente").
- [ ] 7.4 Ausência de registro continua não virando falta no ramo local. **Evidência:** teste
  provando que compromisso local passado sem registro aparece como realização não confirmada
  e nunca como falta, em nenhuma contagem (FR-089, cenário correspondente).

## 8. Fechamento da fatia

- [ ] 8.1 Revisão independente da fatia, nos dois eixos de `AGENTS.md` — padrões do projeto
  e aderência à especificação —, informando a revisão-base, esta mudança OpenSpec e o diff
  exato. **Checkpoint:** a implementação crítica de 3.2, 6.1 e 7.2 **não** é aceita pelo
  próprio executor.
- [ ] 8.2 Na ativação, executar uma única vez `pnpm run verificar:ativacao` e o roteiro "Como
  testar" do PR, com os testes positivos e negativos de autorização/RLS dos grupos 3, 6 e 7.
  **Evidência:** saída registrada. Teste de autorização pulado equivale a evidência ausente,
  não a aprovação; se não executar, registrar o bloqueio aqui.
- [ ] 8.3 Registrar no fechamento as limitações declaradas da fatia, em texto, não em
  checkbox: o lembrete alcança apenas quem abre o aplicativo; não há recorrência; não há
  vínculo com paciente; o lembrete não alcança compromisso do Google. **Evidência:** resumo
  operacional curto atualizado neste arquivo, sem documento novo.
- [ ] 8.4 Devolver à coordenação a decisão pendente de **alcance do lembrete**: se a operação
  exigir alcançar a pessoa sem que ela abra o aplicativo, isso é push ou WhatsApp e é recorte
  próprio, com canal, consentimento, conteúdo mínimo e retenção a decidir. **Nenhuma tarefa
  desta fatia entrega esse alcance**, e nenhuma deve ser apresentada como se entregasse
  (`design.md — Contradições, item 1`).
