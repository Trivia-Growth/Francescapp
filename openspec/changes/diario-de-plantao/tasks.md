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

**Leitura do recorte.** Os grupos 5 e 6 são **generalização de mecanismo já existente e
provado** (catálogo de campos extras do Plano, `web/campo-extra-plano-administracao.ts`):
o critério de aceite inclui provar que o comportamento do Plano não mudou. Os grupos 2,
3, 4 e 7 são **fatia nova** sobre as tabelas canônicas de turno. O grupo 8 é
apresentação, reusando a projeção autorizada de FR-062 sem reimplementá-la.

## 0. Pré-condições

Nenhuma tarefa dos grupos 1 a 9 começa antes de 0.1 e 0.2. As pendências P1 a P6
**bloqueiam** a tarefa indicada; não são supostas pelo executor.

- [ ] 0.1 Conferir que a entrega de `turno-e-execucao` (FR-055 a FR-067) está disponível
  localmente e que as tabelas `cadastro.turno`, `turno_execucao_registro`,
  `turno_medida_versao`, `turno_prescricao_versao`, `turno_administracao_versao` e
  `turno_ocorrencia_versao` existem no esquema local com o comportamento descrito no
  `design.md`. **Evidência:** consulta de esquema local registrada; divergência relevante
  volta à coordenação antes de qualquer escrita.
- [ ] 0.2 Auditar a base de autorização que a ficha vai reusar: vínculo ativo no caso,
  perfil, fundamento de autorização familiar de FR-038 e revogação de FR-037.
  **Evidência:** matriz positiva e negativa existente reexecutada, com saída registrada.
  Não cria controle novo; confirma o que a ficha vai pressupor (FR-073, FR-080).
- [x] 0.3 (20/11/2026) **P1 RESOLVIDA.** O catálogo de papéis nasce com exatamente dois
  termos: **Acompanhante terapêutico** e **Enfermeira** — os que aparecem na ficha e no
  documento da cliente. Os demais o Administrador acrescenta pela tela quando precisar; o
  catálogo é administrado justamente para isso. Desbloqueia 6.1.
- [ ] 0.4 **BLOQUEADA — P2.** Quais campos de fábrica da ficha nascem **obrigatórios**.
  Regra de negócio da cliente, não decidida em 20/11/2026. **Padrão conservador enquanto
  não houver decisão: nenhum campo da ficha nasce obrigatório**, porque obrigar um campo
  que a equipe não consegue preencher no plantão empurra o preenchimento para texto
  inventado, e porque o único conteúdo já obrigatório do turno — a síntese de passagem do
  encerramento (FR-057) — continua valendo sem mudança. Marcar obrigatório é ato do
  Administrador pela tela. Bloqueia apenas a escolha de um padrão diferente deste em 5.2.
- [x] 0.5 (20/11/2026) **P3 RESOLVIDA.** A pendência escrita **aparece na carteira** ao
  lado das quatro derivadas, marcada com **origem visível**: declarada por pessoa, com
  autor e turno identificados, distinguível na tela de uma pendência calculada. Não gera
  aviso no sino — foi considerado e descartado pelo solicitante por ruído, já que o AT pode
  escrever pendência a cada plantão. Desbloqueia 4.3.
- [x] 0.6 (20/11/2026) **P4 RESOLVIDA.** Nascem **compartilháveis** exatamente três:
  **Rotina**, **Alimentação** e **Atividades** — o que a família costuma querer saber do
  dia, e os de menor teor clínico. Todos os demais nascem **internos**, incluindo
  Observações e Estado emocional, que são os de maior chance de conter juízo profissional,
  nome de terceiro, ou de serem lidos como diagnóstico por quem não é da área. Isso revoga
  a suposição S3 do `design.md`, que fazia todo campo nascer interno. Continua valendo que
  a família só alcança qualquer conteúdo com fundamento de autorização vigente (FR-062).
  Desbloqueia 7.2.
- [x] 0.7 (20/11/2026) **P5 RESOLVIDA, recorte mantido.** **Não** existe ficha sem turno.
  O esquecimento se resolve por **abertura retroativa declarada**: o profissional declara a
  janela real e o sistema guarda **os dois instantes lado a lado** — o declarado e o do
  servidor —, com teto na tolerância já administrada, e quem lê o relatório vê que foi
  retroativo. O solicitante descartou explicitamente a ficha vinculada só a caso e data,
  por criar um segundo caminho de escrita clínica fora do turno, o que abriria buraco em
  check-in, check-out, escala e apuração de repasse. Desbloqueia 3.4.
- [x] 0.8 (20/11/2026) **P6 RESOLVIDA — contingência definida pela coordenação.** Se 5.1
  demonstrar que a revalidação de snapshot do Plano **não** pode ser extraída preservando o
  comportamento provado, a regra é: **não mexer no Plano**. A generalização para por ali, o
  modelo da ficha passa a consumir uma função própria com a mesma semântica, e a
  duplicação fica registrada como dívida explícita nesta mudança, com o motivo técnico
  concreto. O Plano é trilha de cuidado já provada; arriscá-lo por elegância de mecanismo
  não se justifica. Desbloqueia 5.1.

## 1. Contratos

Depende de 0.1.

- [ ] 1.1 Criar `packages/contracts/src/ficha-plantao.ts` com os schemas Zod `.strict()`
  da ficha: período do plantão, papel declarado, estado emocional, atividades,
  observações do plantão, pendências escritas, e as respostas dos campos configuráveis
  com `fonte` e `visibilidade` por resposta. **Evidência:** teste novo em
  `packages/contracts/test/`, executado uma vez, cobrindo entrada válida, rejeição de
  campo desconhecido, rejeição de `fonte` fora do conjunto fechado e rejeição de
  `visibilidade` fora de `interna`/`compartilhavel` (FR-073, FR-081).
- [ ] 1.2 Estender o contrato HTTP do turno com a submissão única da ficha, em arquivo
  próprio, sem alterar o significado das rotas existentes. **Evidência:** `pnpm run
  verificar:rapido` limpo; teste de contrato cobrindo o par `chave`/`digest` de
  idempotência (FR-073).
- [ ] 1.3 Registrar os AAD das tabelas novas (`turno_plantao_versao`,
  `turno_plantao_pendencia_versao`, `ficha_plantao_rascunho`) na união de
  `packages/contracts/src/rpc.ts` e no ramo de
  `supabase/functions/_shared/cifra-autenticada.ts`. **Evidência:** teste cobrindo AAD de
  outra tabela recusado (FR-073, FR-074). **Nota de integração:** esses dois arquivos são
  compartilhados; a alteração é aditiva.

## 2. Banco — campos do plantão

Depende de 1.1.

- [ ] 2.1 Migração aditiva: coluna `periodo` em `cadastro.turno`, nullable, com CHECK em
  conjunto administrado. **Evidência:** migração aplicada no PostgreSQL local; teste SQL
  provando que valor fora do conjunto é recusado e que turnos existentes permanecem
  válidos com `periodo` nulo (FR-075, cenários "Valor fora do conjunto administrado é
  recusado" e "Período não é inferido do horário").
- [ ] 2.2 Migração aditiva: tipo `estado_emocional` em `cadastro.turno_catalogo_medida`,
  classe `rotina`, **sem unidade e sem `valor`**, com o CHECK de `turno_medida_versao`
  estendido para exigir `valor is null` nesse tipo. **Evidência:** teste SQL provando que
  gravar `valor` em `estado_emocional` é recusado pelo banco, e que o registro válido é
  persistido com autor e instante (FR-076, cenários 1 e 3; D3 do `design.md`).
- [ ] 2.3 Migração aditiva: `cadastro.turno_plantao_versao`, append-only, no desenho das
  demais `*_versao` (chave `(registro_id, versao)`, auto-FK `anterior`, motivo obrigatório
  a partir da versão 2, trigger bloqueando UPDATE e DELETE, RLS ligada, `revoke all` dos
  quatro papéis de aplicação). **Evidência:** teste SQL provando UPDATE e DELETE
  bloqueados, versão 2 sem motivo recusada, e ausência de privilégio para `anon`,
  `authenticated` e `service_role` (FR-074, FR-076).
- [ ] 2.4 Migração aditiva: `cadastro.turno_plantao_pendencia_versao`, mesmo desenho, com
  situação `aberta`/`resolvida` e carimbo de resolução. **Evidência:** teste SQL provando
  que a resolução preserva texto e autoria originais e que não há caminho de fechamento
  sem ator identificado (FR-077, cenários 3 e 4).

## 3. Banco — submissão atômica da ficha

Depende de 2.1 a 2.4.

- [ ] 3.1 Implementar `operacao.ficha_plantao_operacao_privada` e o wrapper
  `api.ficha_plantao_privado`, sob owner dedicado `ffcmapp_ficha_plantao_owner`, gravando
  **na mesma transação** os registros em todas as tabelas canônicas envolvidas, com
  auditoria obrigatória no mesmo caminho. **Evidência:** teste SQL provando que a falha de
  qualquer gravação, inclusive da auditoria, aborta tudo e não deixa nenhuma linha (FR-073,
  cenário "Falha parcial não deixa meia-ficha"; D1).
- [ ] 3.2 Idempotência pelo par `chave`/`digest`, reusando o padrão de
  `operacao.turno_execucao_recibo`. **Evidência:** teste SQL provando que reenvio com o
  mesmo digest devolve o mesmo resultado sem duplicar linha, e que digest diferente devolve
  `conflito_idempotencia` (FR-073).
- [ ] 3.3 Retificação por versão quando a ficha altera um registro já existente do mesmo
  turno, em vez de criar segunda linha. **Evidência:** teste SQL com refeição registrada
  avulsa antes da ficha, provando que a ficha gera versão 2 do mesmo `registro_id` e não um
  `registro_id` novo (FR-073, cenário "Ficha não duplica conteúdo já registrado
  isoladamente").
- [ ] 3.4 **BLOQUEADA — P5 (0.7).** Exigência de turno aberto e caminho da abertura
  retroativa declarada, com o instante do servidor preservado ao lado da janela declarada e
  o teto da tolerância administrada (S1). Não implementar enquanto P5 não for respondida:
  a resposta pode mudar o recorte de "superfície do turno" para registro independente.
- [ ] 3.5 Grant mínimo dos wrappers para `authenticated`, com asserções defensivas de owner,
  ACL inicial e ausência de acesso direto às tabelas. **Evidência:** matriz de ACL
  positiva e negativa executada antes de qualquer aplicação remota (FR-073, FR-063).
- [ ] 3.6 Provas negativas de autorização da submissão. **Evidência:** teste SQL direto
  cobrindo perfil familiar, profissional sem vínculo, profissional de outro caso, acesso
  revogado durante o plantão e INSERT direto nas tabelas, todos negados sem persistir nada e
  com a tentativa auditada (FR-073, cenário "Ficha sem vínculo ativo é negada").

## 4. Pendência escrita

Depende de 2.4 e 3.1.

- [ ] 4.1 Operação de registrar e resolver pendência escrita, com autor e instante do
  servidor. **Evidência:** teste cobrindo registro, resolução por pessoa autorizada e
  recusa de resolução por quem não tem vínculo (FR-077).
- [ ] 4.2 Garantir que nenhum caminho fecha pendência escrita por tempo, consulta ou troca
  de turno. **Evidência:** teste que avança o relógio, consulta a pendência, encerra e abre
  turno novo, e verifica que a situação permanece `aberta` (FR-077, cenário "Resolução é ato
  explícito").
- [ ] 4.3 **BLOQUEADA — P3 (0.5).** Apresentação da pendência escrita ao lado das quatro
  pendências derivadas da carteira, com origem declarada. Não implementar enquanto P3 não
  for respondida (FR-077, cenário 2; FR-028).

## 5. Generalização do catálogo de campos extras

Depende de 0.1. **Mexe em caminho do Plano de cuidado já em uso:** o critério de aceite
inclui provar que o comportamento do Plano não mudou.

- [ ] 5.1 Migração aditiva no catálogo: coluna `escopo` com `default 'plano_cuidado'` e
  CHECK fechado; colunas `ordem`, `obrigatorio` e `de_fabrica` com defaults que reproduzem
  o comportamento atual; CHECK de `tipo` ampliado com `booleano` e `texto_longo`. Extrair a
  revalidação do retrato id→versão, hoje **injetada no corpo de
  `api.plano_cuidado_operacao_privada` por substituição de âncora textual**, para
  `operacao.campo_extra_revalidar_snapshot(escopo, snapshot)`, chamada pelos dois caminhos
  com o mesmo `for share` e a mesma recusa com `conflito`. **Evidência:**
  `supabase/tests/plano_campos_extras_local.sql` reexecutado com saída 0 **e**
  `pnpm exec vitest run web/plano-cuidado.test.ts` passando, provando que o Plano não mudou
  de comportamento; mais teste novo provando a recusa com `conflito` no escopo da ficha
  (FR-078, cenário "Modelo alterado durante o preenchimento gera conflito"; D2).
  **Se a extração não preservar o comportamento do Plano, parar e acionar P6 (0.8).**
- [ ] 5.2 **BLOQUEADA — P2 (0.4) para a semeadura.** Semear os campos de fábrica da ficha
  com `de_fabrica = true`, ordem definida e obrigatoriedade conforme a resposta de P2. A
  estrutura pode ser preparada; a semeadura dos valores de obrigatoriedade não.
  **Evidência prevista:** teste provando que campo de fábrica pode ser desativado e
  reordenado como qualquer outro (FR-078, decisão 3 do solicitante).
- [ ] 5.3 Ações parametrizadas por escopo, mantendo as literais
  `api.listar_campo_extra_plano` e `api.gravar_campo_extra_plano` com o significado
  atual. **Evidência:** teste provando que a ação literal antiga continua devolvendo
  exatamente o catálogo do Plano e que a ação com escopo da ficha não enxerga os campos do
  Plano (FR-078; D2).
- [ ] 5.4 Provar a preservação de resposta antiga sob modelo mudado, no escopo da ficha:
  sem grant de `DELETE`; desativar é `ativo = false` com bump de `versao`; respostas vivem
  no envelope cifrado da versão append-only. **Evidência:** teste SQL com ficha gravada,
  campo desativado em seguida e leitura posterior provando que a resposta antiga continua
  legível e marcada como de campo desativado, e que nenhuma linha foi tocada (FR-078,
  cenário "Campo desativado preserva a resposta antiga"; seção 9 do documento da cliente).
- [ ] 5.5 Provas negativas da administração do modelo. **Evidência:** teste SQL direto
  provando que profissional e familiar recebem `sem_permissao` ao acrescentar, reordenar,
  marcar obrigatório ou desativar campo, que o modelo permanece inalterado e que a
  tentativa é auditada (FR-078, último cenário).

## 6. Papel declarado

Depende de 0.1.

- [ ] 6.1 **BLOQUEADA — P1 (0.3) para a semeadura.** Criar
  `cadastro.papel_declarado_catalogo` com `ativo`/`versao`, administrado pelo
  Administrador. A tabela e a operação podem ser preparadas; a lista inicial de papéis
  não é inventada pelo executor. **Evidência prevista:** teste cobrindo criação,
  desativação e recusa de administração por não Administrador (FR-079).
- [ ] 6.2 Gravar o papel declarado **no registro** (`turno_plantao_versao`), não na pessoa.
  **Evidência:** teste provando que renomear ou desativar o papel no catálogo não altera
  ficha já gravada (FR-079, último cenário).
- [ ] 6.3 Provar que o papel declarado **não** é caminho de autorização: os owners que
  decidem acesso não recebem grant em `cadastro.papel_declarado_catalogo`. **Evidência:**
  teste SQL provando (a) que `ffcmapp_turno_owner` e os demais owners de autorização não
  alcançam a tabela, e (b) que enviar um papel de maior alcance aparente sem o vínculo
  exigido continua sendo negado pelos controles de FR-063, com a tentativa auditada
  (FR-079, cenários 2 e 3; D4).
- [ ] 6.4 Confirmar que o enum `usuario.perfil` permanece
  `check (perfil in ('administrador','profissional','familia'))`. **Evidência:** asserção
  no teste SQL do grupo; qualquer alteração aqui é desvio do recorte e volta à coordenação
  (decisão 2 do solicitante).

## 7. Rascunho, fonte e visibilidade

Depende de 3.1.

- [ ] 7.1 Criar `cadastro.ficha_plantao_rascunho`, uma linha por `(turno, autor)`, com
  conteúdo no envelope cifrado autenticado e AAD próprio, RLS restringindo leitura e
  escrita ao próprio autor com vínculo ativo, e remoção na publicação bem-sucedida dentro
  da transação de 3.1. **Evidência:** teste SQL provando que outro profissional do caso,
  o familiar autorizado e os owners de relatório **não** alcançam a tabela, e que a
  publicação remove o rascunho na mesma transação (FR-074, cenários 1 e 2; D6).
  **Limitação deliberada:** o rascunho não é versionado e não entra na trilha de versões;
  o histórico exigido é o das versões publicadas.
- [ ] 7.2 **BLOQUEADA — P4 (0.6) para os padrões.** Implementar `fonte` (conjunto fechado)
  e `visibilidade` **por resposta**, com o padrão vindo do modelo administrado. O padrão
  conservador `interna` (S3) vale enquanto P4 não for respondida; a lista do que nasce
  compartilhável não é suposta. **Evidência prevista:** teste provando que `fonte` fora do
  conjunto é recusada e que a fonte aparece junto do conteúdo em toda superfície (FR-081,
  cenário 1).
- [ ] 7.3 Aplicar a segregação **na projeção do servidor**: a consulta familiar não decifra
  conteúdo interno, em vez de decifrar e esconder. **Evidência:** teste provando que o
  conteúdo interno não chega ao cliente familiar em nenhuma forma, e que a omissão não
  indica o teor do omitido (FR-081, cenário 2; FR-062).
- [ ] 7.4 Mudança de visibilidade de resposta gravada como ato registrado com autor,
  instante e motivo, preservando a visibilidade anterior no histórico (S4). **Evidência:**
  teste cobrindo a mudança nos dois sentidos e a recusa sem motivo (FR-081, cenário 3).
- [ ] 7.5 Edição após publicação exige motivo e cria versão nova. **Evidência:** teste
  cobrindo correção com motivo gerando versão 2 consultável e correção sem motivo recusada
  sem alterar nada (FR-074, cenários 3 e 4).

## 8. Apresentação: ficha e consolidado diário

Depende de 3.1, 5.3, 6.2 e 7.3.

- [ ] 8.1 Tela da ficha de plantão como superfície única de registro, com os campos de
  fábrica na ordem do modelo vigente, os campos acrescentados, obrigatoriedade aplicada,
  campos desativados ocultos em ficha nova e visíveis em ficha antiga. **Evidência:** teste
  de tela cobrindo estados de carregamento, vazio, erro e sucesso; submissão bloqueada por
  campo obrigatório vazio; e campo desativado ainda legível na ficha antiga (FR-073,
  FR-078; `AGENTS.md — Qualidade e experiência`).
- [ ] 8.2 Apresentar o **Consolidado diário no formato da ficha**, reusando a projeção
  autorizada de FR-062 sem consulta própria, agrupando por plantão, com período, papel
  declarado e autores identificados, em ordem cronológica e indicando lacunas de cobertura.
  **Evidência:** teste cobrindo dia com dois plantões, dia com lacuna e dia sem plantão
  (estado vazio após consulta real, sem dado de exemplo) (FR-080, cenários 1 e 4; D8).
  **Nota:** o seletor de `web/turno-execucao-relatorios.ts` mantém as quatro opções; muda o
  layout de "Consolidado diário", não o conjunto de relatórios.
- [ ] 8.3 PDF do consolidado no formato da ficha, pelo mesmo caminho de
  `netlify/functions/_shared/turno-execucao-pdf.ts`, com a mesma autorização da consulta e
  evento de exportação registrado conforme FR-039. **Evidência:** teste provando que o PDF
  do familiar autorizado não contém conteúdo interno nem conteúdo fora da sua audiência, e
  que a exportação é registrada (FR-080, cenário 2; FR-066, FR-032).
- [ ] 8.4 Provas negativas de audiência na apresentação. **Evidência:** teste cobrindo
  familiar **sem** fundamento de autorização vigente consultando e exportando a ficha e o
  consolidado, negado nos dois casos, e revogação durante a sessão retirando o acesso
  imediatamente (FR-080, cenário 3; FR-037, FR-038, FR-062).
- [ ] 8.5 Provar que nenhuma superfície deriva leitura clínica. **Evidência:** teste
  varrendo ficha, consolidado e PDF para ausência de pontuação, classificação de gravidade,
  alerta, tendência ou sugestão de conduta a partir de estado emocional, rotina ou qualquer
  campo (FR-081, cenário 4; FR-064, FR-028; seção 1 do documento da cliente).

## 9. Verificação e fechamento

- [ ] 9.1 `pnpm run verificar:rapido` durante o desenvolvimento. **Evidência:** saída
  registrada; falha em arquivo de outra frente é identificada como tal antes de ser
  descartada.
- [ ] 9.2 Revisão formal de dois eixos — padrões do projeto e aderência à especificação —
  sobre o diff da fatia demonstrável, informando revisão-base, mudança OpenSpec e diff
  exato, incluindo arquivos novos. **Evidência:** relatório da revisão com achados e
  tratamento. Após correções, reexecutar somente os testes afetados pelo diff.
- [ ] 9.3 Na ativação, executar uma única vez `pnpm run verificar:ativacao` e o roteiro
  "Como testar" do PR. **Evidência:** saída registrada. Os testes positivos e negativos de
  autorização e RLS dos grupos 3.6, 5.5, 6.3, 7.1 e 8.4 são obrigatórios neste momento e
  **não podem ser pulados**; se não executarem, registrar o bloqueio aqui.
- [ ] 9.4 Registrar resultados, achados e **limitações** — incluindo o que as provas locais
  **não** comprovam: integração remota, Auth real, Vault e qualquer ativação publicada.
  Nenhuma migração aplicada remotamente, nenhuma flag ligada por este recorte.
