# Tasks

Cada tarefa indica requisito/cenário, dependência e evidência de aceite. A política de
verificação é a de `AGENTS.md — Execução enxuta`: durante o desenvolvimento, somente
`pnpm run verificar:rapido` (lint e typecheck); ao escrever um teste novo, executar uma vez
apenas o arquivo afetado e, se falhar, corrigir e repetir apenas ele;
`pnpm run verificar:ativacao` uma única vez, na ativação da fatia, junto do roteiro "Como
testar" do PR. Testes positivos e negativos de autorização/RLS são obrigatórios na ativação
e nunca podem ser pulados; se não executarem, registrar o bloqueio aqui, não sucesso
presumido.

Nenhuma tarefa autoriza deploy, push, merge, migração remota, concessão de acesso ou uso de
dados reais. Todos os dados de teste são fictícios.

**Leitura do recorte.** O grupo 2 é **correção de defeito** em mecanismo já existente e
provado: barato, de risco quase nulo, e é o que tem valor imediato para a operação. O grupo
3 é **fatia nova pequena** (a faixa), e dela dependem todos os limites. Os grupos 4 e 5 são
**reuso de mecanismo** (M3, M2 e M1), e o critério de aceite inclui provar que o
comportamento já existente não mudou. O grupo 6 são as duas invariantes negativas, que não
acrescentam função e sim prova.

## 0. Pré-condições

Nenhuma tarefa dos grupos 1 a 7 começa antes de 0.1. As pendências P1 a P5 **bloqueiam** a
tarefa indicada; não são supostas pelo executor.

- [x] 0.1 Conferir que `identidade.configuracao_sistema`, a operação
  `api.configuracao_sistema_privado`, o leitor `identidade.ler_configuracao_sistema_publica`
  e o catálogo `cadastro.turno_catalogo_medida` existem no esquema local com o comportamento
  descrito no `design.md`. **Evidência:** consulta de esquema local registrada; divergência
  relevante volta à coordenação antes de qualquer escrita.
- [ ] 0.2 **BLOQUEADA — P1.** Faixa aceita de `ffcm.turno.tolerancia_atraso_minutos` e
  `ffcm.turno.duracao_padrao_minutos`. Regra de negócio da casa, não decidida em 20/11/2026.
  Hoje ambas aceitam até 999.999.999 (`20261125130000_turno_consulta_atual.sql:132`).
  **Padrão conservador enquanto não houver decisão: não semear faixa para essas duas chaves**
  — a faixa existe como mecanismo (3.1) e só é aplicada a chave cujo intervalo o solicitante
  confirmou. Bloqueia 3.2.
- [ ] 0.3 **BLOQUEADA — P2.** `ffcm.equipe.vinculos_ativa`: migrar
  `netlify/functions/vinculos-profissionais.ts:35` para ler a chave, ou remover a chave do
  catálogo? Bloqueia 2.4.
- [ ] 0.4 **BLOQUEADA — P3.** Texto institucional dentro de pacote entregue a terceiro pode
  mudar? Se sim, exige histórico de versão de texto em M1, que não existe hoje
  (`20261117400000:21-41`). **Suposição conservadora S3: permanecem fixos.** Bloqueia 5.4.
- [ ] 0.5 **BLOQUEADA — P4.** Acrescentar vocabulário (momento de refeição, tipo de escala,
  vínculo de rede) é necessidade real da operação ou possibilidade teórica? Mecanismo de
  catálogo tem custo. Bloqueia 4.1.
- [ ] 0.6 **P5 — suposição registrada, não bloqueante por si.** Parâmetros de turno
  permanecem **globais**, como hoje, e não passam a ser por caso (S4). Bloqueia apenas a
  escolha de um desenho diferente deste.

## 1. Contratos

Depende de 0.1.

- [x] 1.1 Estender `packages/contracts/src/configuracao-sistema.ts` com `minimo` e `maximo`
  anuláveis em `configuracaoSistemaSchema`, mantendo `.strict()` e sem alterar o significado
  das chaves existentes. `gravarConfiguracaoSistemaSchema` **não** recebe os dois campos: a
  faixa não é editável pela tela. **Evidência:** teste novo executado uma vez, cobrindo
  entrada válida, rejeição de campo desconhecido e rejeição de tentativa de enviar `minimo`
  ou `maximo` na gravação (FR-085, cenário "A tela não altera a própria faixa").
- [ ] 1.2 Acrescentar em `rotas.ts` as rotas de consulta e administração do catálogo de
  medidas do turno, sem alterar o significado das rotas existentes. **Evidência:**
  `pnpm run verificar:rapido` limpo; teste de contrato cobrindo o par `chave`/`digest` de
  idempotência (FR-083).

## 2. Correção dos defeitos de configuração

Depende de 0.1. É o grupo de maior valor por menor risco; não depende do grupo 3.

- [x] 2.1 Migration corrigindo a `exposicao` de `ffcm.financeiro.ativo` e
  `ffcm.avisos.ativos` de `administracao` para `servidor`
  (`20261127300000_configuracao_financeiro_avisos.sql:16-23`), para que
  `identidade.ler_configuracao_sistema_publica` as enxergue
  (`20261117420000_configuracao_sistema_leitor_servidor.sql:19,25`). **Evidência:** prova SQL
  local mostrando que o leitor do servidor devolve as duas chaves depois da migration e não
  devolvia antes; e que alterar o valor pela operação administrativa muda o que
  `servicoAtivo` lê (FR-086, cenário "Interruptor alterado na tela tem efeito observável").
- [x] 2.2 Migration semeando `ffcm.papel_declarado.ativo` e `ffcm.substituicao_cm.ativo` com
  `exposicao='servidor'` e valor `false`, no padrão de `20261127300000`
  (`on conflict (chave) do nothing`). Valor semeado desligado porque as duas fatias seguem a
  regra já registrada: ligar só após provas e revisão independentes. **Evidência:** prova SQL
  local; e teste confirmando que `netlify/functions/papel-declarado.ts:25` e
  `substituicao-case-manager.ts:38` passam a enxergar a chave (FR-086, cenário "Fatia com
  leitor e sem chave passa a ser administrável").
- [x] 2.3 Teste de integridade do catálogo que **falhe** quando existir chave semeada sem
  leitor, leitor sem chave semeada, ou chave cuja `exposicao` o seu leitor não alcança.
  Este é o teste que detecta a classe inteira de defeito, não cada caso. **Evidência:** o
  teste roda contra o esquema local e aponta nominalmente as divergências; executado uma vez
  (FR-086, cenário "Chave cuja exposição o leitor não alcança é tratada como defeito").
- [x] 2.4 **BLOQUEADA — P2 (0.3).** Resolver `ffcm.equipe.vinculos_ativa`: migrar o leitor
  em `netlify/functions/vinculos-profissionais.ts:35` ou remover a chave. **Evidência:** 2.3
  deixa de apontar essa chave.

## 3. A faixa dos limites

Depende de 1.1. Nenhum limite de tamanho de arquivo entra antes deste grupo estar provado
(S5).

- [x] 3.1 Migration aditiva acrescentando `minimo` e `maximo` a
  `identidade.configuracao_sistema`, com CHECK recusando `valor` fora da faixa quando
  `tipo='numero'`, **sem** incluir as colunas no grant de coluna do owner administrativo —
  mesmo desenho de `opcoes` em `20261119110000_configuracao_sistema_opcoes.sql:9-12,31-40`.
  **Evidência:** prova SQL local positiva e negativa — valor dentro da faixa aceito, valor
  fora **recusado** (não aceito e ignorado), e tentativa de `UPDATE` em `minimo`/`maximo`
  pelo owner administrativo negada por falta de privilégio de coluna (FR-085, cenários 1, 2
  e 3).
- [ ] 3.2 **BLOQUEADA — P1 (0.2).** Semear a faixa confirmada para
  `ffcm.turno.tolerancia_atraso_minutos` e `ffcm.turno.duracao_padrao_minutos`, e trocar o
  `tipo` dessas duas chaves de `texto` para `numero`, hoje incoerente
  (`20261125080000_turno_execucao_privada.sql:22-23` guarda inteiro em `texto`).
  **Evidência:** prova SQL de que a abertura de turno continua recusando configuração
  ausente ou fora de faixa com `conflito`, como hoje
  (`20261125130000_turno_consulta_atual.sql:132`), e que turnos já abertos mantêm os
  parâmetros congelados em `cadastro.turno.parametros` (FR-085, cenário "Registro antigo
  permanece julgado pela regra da sua época").
- [x] 3.3 Conferir, para toda chave numérica do catálogo, que o `maximo` semeado não excede
  o teto definido em código — começando por `ffcm.transcricao.duracao_maxima_segundos`
  contra `AUDIO_SEGUNDOS_MAXIMO` (`packages/contracts/src/transcricao.ts:31`).
  **Evidência:** teste que falha se alguma faixa admitir valor mais permissivo que o teto do
  código (FR-085, cenário "Configuração não ultrapassa o teto do código"). Implementa S2.
- [x] 3.4 Fazer `numeroConfigurado`
  (`netlify/functions/_shared/configuracao-servidor.ts:149-166`) usar a faixa que agora vem
  do banco, mantendo o comportamento de falha-fechada: leitura que falha continua caindo no
  padrão, nunca em "sem limite". **Evidência:** `configuracao-servidor-falha.test.ts`
  estendido e executado uma vez (FR-086, cenário "Falha de leitura não liga serviço").

## 4. Vocabulário administrado

Depende de 0.1. 4.1 depende de 0.5.

- [ ] 4.1 **BLOQUEADA — P4 (0.5).** Estender M3 para os conjuntos classificados como
  vocabulário no inventário e acoplados a CHECK: `momento`/`aceitacao`/`qualidade`/
  `eliminacao` da rotina do turno (`packages/contracts/src/turno-execucao.ts:15,16,36,46`),
  período do plantão (`ficha-plantao.ts:19`), tipo de escala (`turno-escala.ts:34`), motivo
  de barreira (`realizacao-compromisso.ts:29`), momento e motivo de ausência da localização.
  **Evidência:** prova SQL de que desativar um termo com registros gravados não apaga nada e
  os registros antigos continuam legíveis; e de que escrita sob catálogo alterado é recusada
  com `conflito` (FR-082, cenários 2 e 3).
- [ ] 4.2 Estender M2 com escopo novo para `CATEGORIAS_CONTEXTO`
  (`packages/contracts/src/contexto-cuidado.ts:8`) e `VINCULOS_REDE` (`rede-cuidado.ts:9`),
  aditivamente, sem alterar o comportamento provado do Plano nem da ficha de plantão.
  **Evidência:** os testes existentes de `plano_campos_extras_local.sql` e
  `web/plano-cuidado.test.ts` continuam passando sem alteração; teste novo para o escopo
  acrescentado, executado uma vez (FR-082, cenário 1).
- [ ] 4.3 Teste negativo de autorização para toda administração de vocabulário: profissional
  e familiar, inclusive por acesso direto ao servidor e ao banco, não acrescentam, renomeiam,
  reordenam nem desativam termo. **Evidência:** matriz positiva e negativa executada, com
  saída registrada e auditoria conferida (FR-082, cenário 4).

## 5. Alcance pela interface e textos institucionais

Depende de 1.2.

- [x] 5.1 Rota e tela de administração do catálogo de medidas do turno, reusando
  `web/servico-catalogo-administrado-http.ts`, que já serve o modelo da ficha e o catálogo
  de papéis. A tela oferece **somente** `ativo` e `referencia_informativa` — o que
  `api.configurar_catalogo_turno` admite —, sem campo para o que ela não admite.
  **Evidência:** teste de tela cobrindo estado de carregamento, vazio, erro e sucesso; e
  teste de que o envio de atributo não admitido é recusado no banco (FR-083, cenários 1 e 2).
- [ ] 5.2 Teste negativo de acesso à rota nova: profissional e familiar, inclusive por acesso
  direto, não alcançam a administração do catálogo e nenhum termo é revelado.
  **Evidência:** matriz positiva e negativa, com auditoria conferida (FR-083, cenário 3).
- [ ] 5.3 Trocar o controle de `tipo='texto'` em `web/configuracao-sistema.ts:135-139` de
  `<input type="text">` de uma linha para `<textarea>`, e preservar a separação de parágrafos
  na apresentação em `web/regras-atendimento.ts:65`, hoje um único `<p>`. **Evidência:**
  teste de que um texto com mais de um parágrafo é gravado e reapresentado sem truncamento
  nem perda de quebra (FR-084, cenário "Texto de várias linhas é preservado").
- [ ] 5.4 **BLOQUEADA — P3 (0.4) para tudo além dos textos de marca.** Semear as chaves de
  texto institucional de marca com `exposicao='publica'` — assinatura da casa
  (`web/index.html:221`, `netlify/functions/_shared/turno-execucao-nativo.ts:569`,
  `web/documentos-caso.ts:488`) e cabeçalho da tela de regras (`web/index.html:206`) — e
  passar a lê-las. **Evidência:** alterar o texto pela tela muda o apresentado, sem deploy
  (FR-084, cenário 1). **Não** inclui os textos de `web/pacote-exportacao.ts` nem de
  `_shared/turno-execucao-caso-pdf.ts`, que ficam fixos por S3.
- [x] 5.5 Teste que falhe se alguma das ressalvas obrigatórias deixar de ser constante de
  código: avisos de FR-020 (`web/plano-crise.ts:22,24`), ressalvas de "sem interpretação
  clínica automática" (`web/turno-execucao-editor.ts:105,123,389`,
  `_shared/turno-execucao-pdf.ts:53`), avisos de audiência (`web/diario.ts:338,345`) e texto
  de consentimento da localização (`web/turno-execucao-localizacao.ts:121`). Estende a
  garantia que `web/plano-crise.test.ts` já dá para dois desses textos. **Evidência:** o
  teste falha se algum desses textos virar configuração ou sumir (FR-084, cenário "Texto que
  descreve controle não é editável").

## 6. Invariantes negativas

Depende dos grupos 2 a 5. Não acrescentam função; acrescentam prova.

- [ ] 6.1 Prova de que ligar uma fatia por configuração não concede permissão: com a fatia
  ligada, ator sem vínculo ativo, com acesso revogado e de perfil familiar é negado no
  servidor **e** no banco, e a tentativa é auditada. **Evidência:** matriz positiva e
  negativa executada, com saída registrada (FR-087, cenário 1).
- [ ] 6.2 Teste que falhe se alguma chave administrável passar a decidir audiência,
  autorização, forma de payload, AAD de cifra ou código de erro — conferindo o catálogo
  contra a lista de categoria C do inventário. **Evidência:** o teste aponta nominalmente a
  chave infratora (FR-087, cenários 2 e 4).
- [ ] 6.3 Prova de que a administração não se tranca por fora: gravar um valor que torne
  indisponível a própria administração mantém a superfície alcançável pelo Administrador,
  como já decidido em `configuracao-no-banco/proposal.md`, decisão 4. **Evidência:** teste
  executado uma vez (FR-087, cenário 3).
- [ ] 6.4 Prova de que mudança de vocabulário ou de texto não reescreve o passado: pacote já
  exportado permanece idêntico, e relatório de período anterior apresenta o termo declarado à
  época. **Evidência:** teste com exportação fictícia emitida antes da mudança, conferida
  byte a byte depois dela (FR-088, cenários 1 e 2).
- [ ] 6.5 Prova de que toda gravação de configuração é auditada com autor, instante e chave,
  no caminho permitido e no negado. **Evidência:** consulta de auditoria registrada
  (FR-088, cenário 4).

## 7. Verificação e fechamento

- [ ] 7.1 Executar `pnpm run verificar:ativacao` uma única vez na retirada do PR de draft,
  junto do roteiro "Como testar". Testes positivos e negativos de autorização/RLS são
  obrigatórios aqui e não podem ser pulados; se não executarem, registrar o bloqueio nesta
  tarefa, não sucesso presumido.
- [ ] 7.2 Revisão independente de dois eixos — padrões do projeto e aderência à
  especificação — sobre o diff da fatia, informando a revisão-base e esta mudança OpenSpec.
  Não aceitar a própria implementação dos grupos 3 e 6 sem essa revisão.
- [ ] 7.3 Registrar no `proposal.md` as pendências que permanecerem abertas e as limitações
  conhecidas. Não declarar conclusão por checkbox: conferir os critérios de aceite de cada
  requisito e registrar resultados, achados e limitações.


## Registro de execução — 20/11/2026

Executado nesta passagem (grupos 1 a 3 e parte do 5). O que não foi feito está abaixo, com
o motivo; nenhuma tarefa é dada por concluída por checkbox.

**Concluídas.** 0.1, 1.1, 2.1 (já estava, por `20261127320000`), 2.2, 2.3, 2.4, 3.1, 3.3,
3.4, 5.1 (já estava — ver achado abaixo) e 5.5.

**Decisões da coordenação aplicadas.** P1 respondida com faixa 0–120 (tolerância) e
60–1440 (duração padrão), marcadas na migration como **SUPOSIÇÃO CONSERVADORA DA
COORDENAÇÃO**, não decisão do cliente: trocar a faixa é uma linha. P2 respondida migrando o
leitor de `vinculos-profissionais.ts`. P5 mantida (parâmetros globais).

**3.2 — parcialmente feita, e o resto não deve ser feito assim.** A faixa das duas chaves de
turno foi semeada e é recusada pelo banco. A troca de `tipo` de `texto` para `numero` NÃO foi
feita: `''` é a sentinela de "ainda não configurado — abertura de turno indisponível"
(`20261125080000:22-24`), e `jsonb` numérico não tem equivalente. Trocar o tipo obrigaria a
semear um número concreto, o que LIGARIA a abertura de turno com um valor suposto. A faixa
foi desenhada para valer também sobre `tipo='texto'`, preservando a sentinela, e o defeito
("a tela aceita 999999999") está corrigido sem essa troca.

**Abertas, com motivo.**

- 4.1 — segue bloqueada por P4 para os vocabulários sem demanda escrita. A coordenação
  confirmou necessidade real apenas para **campo de formulário**, que M2 já atende.
- 4.2, 4.3 — não executadas nesta passagem (escopo; prioridade da coordenação era 1 a 3).
- 5.2 — a matriz negativa de acesso ao catálogo do turno depende do grupo de provas de
  autorização do turno, não executada aqui.
- 5.3 — **não executada de propósito.** Trocar o `<input type="text">` por `<textarea>` em
  `web/configuracao-sistema.ts` quebra `web/configuracao-sistema.test.ts`, que consulta
  `raiz.querySelector('input')` para uma chave `tipo='texto'`. Alterar teste existente para
  fazer passar não é permitido nesta passagem; a troca precisa vir junto da revisão desse
  teste, em uma passagem que possa tocá-lo.
- 5.4 — segue bloqueada por P3 (S3) para texto dentro de pacote emitido. Os textos de marca
  não foram semeados nesta passagem.
- 6.1 a 6.5 — não executadas; dependem dos grupos 4 e 5.
- 7.1 a 7.3 — ativação, revisão independente e fechamento pela coordenação.

**Achados que corrigem a proposta.**

1. São **quatro** chaves com leitor e sem semente, não duas: `ffcm.papel_declarado.ativo`,
   `ffcm.substituicao_cm.ativo` e, novas, `ffcm.ficha_plantao.ativo`
   (`netlify/functions/ficha-plantao.ts:33`). Semeadas em `20261128110000`.
2. `ffcm.documentos.categorias` nasceu `exposicao='publica'`
   (`20261120110000:131,136`) e é lida pelo leitor do SERVIDOR
   (`netlify/functions/documentos.ts:34`): a lista editada na tela nunca chegava, e
   `web/documentos-caso.ts:131-133` informava "Nenhuma categoria de anexo está configurada"
   para sempre. Pior, `api.consultar_regras_atendimento` devolve TODAS as chaves `'publica'`
   (`20261119320000:122`) e `regraAtendimentoSchema` exige texto
   (`packages/contracts/src/regras-atendimento.ts:13`): uma chave `lista` com exposição
   pública derruba a tela inteira de Regras (FR-041). Corrigido em `20261128120000`, com
   CHECK impedindo a recorrência.
3. **FR-083 já está entregue para o catálogo de medidas do turno.** A proposta diz que
   `api.configurar_catalogo_turno` "não tem rota nem tela". Tem: rota
   `packages/contracts/src/turno-execucao-http.ts:364`, servidor
   `netlify/functions/_shared/turno-execucao-nativo.ts:337`, serviço
   `web/servico-turno-execucao-http.ts:248` e formulário com `ativo` e
   `referencia_informativa` em `web/turno-execucao-gestao.ts:355-385`, montado por
   `web/turno-execucao.ts:252`. Construir uma segunda tela seria duplicação.
4. A operação administrativa **já recusava texto vazio** antes desta fatia
   (`20261119110000`: `length(e->>'valor') between 1 and 600`), embora
   `valorConfiguracaoSchema` e `web/configuracao-sistema.ts` tratem vazio como valor
   legítimo. Divergência pré-existente, registrada em `supabase/tests/configuracao_faixa_local.sql`.
5. `FFCM_CONVITE_FAMILIAR_ATIVO` e `FFCM_CANCELAR_PREAUTORIZACAO_ATIVO` **não** foram
   migrados para o banco, de propósito: as rotas que os leem têm `integracaoComprovada =
   false` fixo no código (`convites-familiares.ts:22`, `consulta-convite-familiar.ts:23`,
   `cancelar-convite-familiar.ts:23`, `preautorizacoes-familiares.ts:15` e
   `supabase/functions/preautorizacoes-familiares/index.ts:23`), então nenhum valor da chave
   pode ligar a rota — criar a chave fabricaria exatamente o interruptor que mente que esta
   fatia remove. Além disso, `FFCM_CONVITE_FAMILIAR_ATIVO` também é lida por
   `netlify/functions/auth.ts:49`, que por decisão de 13/11/2026 não pode ler configuração
   do banco. A migração correta acontece junto com a retirada do gate fixo.
