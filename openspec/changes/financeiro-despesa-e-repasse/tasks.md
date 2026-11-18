# Tasks

Cada tarefa indica requisito/cenário, dependência e evidência de aceite. A política de verificação é a de `AGENTS.md — Execução enxuta`: durante o desenvolvimento, somente `pnpm run verificar:rapido`; ao escrever um teste novo, executar uma vez apenas o arquivo afetado; `pnpm run verificar:ativacao` só na ativação da fatia.

**Implementação suspensa em 17/11/2026** por decisão do solicitante, até o encerramento de uma frente de ajuste de frontend em andamento. Este arquivo é planejamento; nenhuma tarefa executa antes da liberação explícita.

Nenhuma tarefa autoriza deploy, migração remota, concessão de acesso, integração bancária, movimentação de dinheiro ou uso de dados reais. Todos os dados de teste são fictícios.

## 0. Pré-condições

- [x] 0.1 (17/11/2026) Financeiro entra no produto, inclusive repasse por profissional. Substitui a exclusão registrada em 11/11/2026.
- [x] 0.2 (17/11/2026) Base do repasse: turno realizado multiplicado por valor acordado por profissional.
- [x] 0.3 (17/11/2026) Audiência: Administrador e perfil financeiro. Profissional não vê valores, nem os próprios. Família não vê nada do financeiro.
- [ ] 0.4 Confirmar com o solicitante se o valor acordado é **por turno** ou **por hora** com duração prevista pela escala. **Bloqueia 1.1 e 3.1.** Evidência: resposta registrada aqui e refletida no contrato.
- [ ] 0.5 Confirmar o tratamento de **turno não encerrado** na apuração: valor zero, pendente de resolução ou excluído do período. **Bloqueia 3.2.** Evidência: resposta registrada aqui e coberta por teste.
- [ ] 0.6 Confirmar se existe **ciclo de apuração fechado** com travamento (quinzena, mês) ou se a apuração é consulta aberta por período. **Bloqueia 3.5.** Evidência: resposta registrada aqui; o contrato de 1.2 não pode impedir um fechamento futuro (design D3).
- [ ] 0.7 Confirmar se a **despesa pertence ao caso ou à instituição** e se há teto ou alçada de autorização. **Bloqueia 2.1.** Evidência: resposta registrada aqui.
- [ ] 0.8 Auditar os mecanismos de concessão de equipe existentes e confirmar que admitem uma permissão nova sem alterar as trilhas de cuidado já provadas. Evidência: arquivos e migrações conferidos, e a lacuna aberta como tarefa própria se existir. **Bloqueia o grupo 1.**

## 1. Audiência financeira e valor acordado

Depende de 0.4 e 0.8.

- [ ] 1.1 Criar `packages/contracts/src/financeiro.ts` com os schemas Zod `strict()` de valor acordado (profissional, valor, vigência) na unidade confirmada em 0.4, seguindo o padrão de `tarefa-cuidado.ts`. Evidência: teste de contrato cobrindo entrada válida e rejeição de campo desconhecido (FR-068).
- [ ] 1.2 Modelar o contrato de apuração de forma que um fechamento futuro não exija quebra de contrato (design D3). Evidência: contrato revisado com a decisão de 0.6 registrada; se 0.6 ainda estiver aberta, registrar o bloqueio em vez de supor.
- [ ] 1.3 Criar a concessão de perfil financeiro como permissão distinta, conferida no servidor e no banco, sem consultar vínculo de caso. Evidência: migração local e teste SQL cobrindo concessão vigente, ausente e revogada (FR-068, design D1).
- [ ] 1.4 Implementar persistência do valor acordado em tabela própria, com restrição de banco contra vigências sobrepostas. Evidência: teste SQL cobrindo o cenário "Vigência sobreposta é recusada", inclusive com duas escritas concorrentes (FR-068, design D4).
- [ ] 1.5 Implementar RPC privada de criação, alteração e leitura do valor acordado, com auditoria obrigatória na mesma transação. Evidência: teste cobrindo "Alteração cria nova vigência" e "Auditoria do valor acordado" (FR-068, FR-039).
- [ ] 1.6 Garantir que o valor **não** apareça no cadastro de usuário, na escala, nos turnos ou em qualquer retorno de cuidado — por ausência na RPC, não por filtro de serialização. Evidência: testes negativos cobrindo "Profissional não consulta o próprio valor" e "Familiar não acessa valores", inclusive por acesso direto ao banco (FR-068, design D2).
- [ ] 1.7 Provar a separação nas duas direções: audiência de cuidado não alcança financeiro, audiência financeira não alcança conteúdo clínico. Evidência: dois testes negativos distintos (FR-047 modificado, cenário "Separação provada nas duas direções", design D1).

## 2. Despesa e comprovante

Depende de 0.7 e 1.3.

- [ ] 2.1 Criar o contrato de despesa com descrição, valor, data, responsável, autorização aplicável e comprovante, conforme o escopo confirmado em 0.7. Evidência: teste cobrindo despesa sem autorização rejeitada (FR-069, cenário "Despesa sem autorização registrada é recusada").
- [ ] 2.2 Implementar persistência e RPC privada de despesa com auditoria obrigatória na mesma transação. Evidência: teste cobrindo registro válido e auditoria do evento (FR-069, FR-039).
- [ ] 2.3 Guardar o comprovante no repositório privado do Supabase com política ligada à concessão financeira, não à autorização do caso. Evidência: migração local e teste cobrindo leitura autorizada e negada (FR-069, design D5).
- [ ] 2.4 Implementar entrega do comprovante por fluxo autorizado a cada leitura, sem URL pública e sem URL assinada de longa duração. Evidência: teste cobrindo "Comprovante não é público" e revogação da concessão negando a leitura seguinte (FR-069).
- [ ] 2.5 Provar que profissional com vínculo no caso e familiar com fundamento de autorização não acessam despesas. Evidência: teste cobrindo "Audiência de cuidado não alcança despesa", inclusive por acesso direto (FR-069, FR-047 modificado).
- [ ] 2.6 Implementar retificação preservando o lançamento original com autor, motivo e data. Evidência: teste comprovando que nada é apagado (FR-069).
- [ ] 2.7 Tratar falha de persistência sem apresentar sucesso e sem repetição silenciosa que duplique o lançamento. Evidência: teste cobrindo o cenário "Falha de persistência na despesa" (FR-069).

## 3. Apuração de repasse

Depende de 1.5 e de FR-055 implementado e verificado em `turno-e-execucao-do-cuidado`. **Não inicia antes disso.**

- [ ] 3.1 Implementar a apuração como consulta derivada de turnos encerrados, aplicando o valor vigente na data de cada turno, com cada linha referenciando turno e vigência. Evidência: teste cobrindo "Repasse apurado por período" e "Valor alterado no meio do período" (FR-070, design D3).
- [ ] 3.2 Aplicar o tratamento de turno não encerrado confirmado em 0.5. Evidência: teste cobrindo o caso confirmado; se 0.5 estiver aberta, registrar bloqueio em vez de escolher.
- [ ] 3.3 Implementar a linha pendente de valor para turno sem vigência aplicável, sem valor presumido. Evidência: teste cobrindo "Turno sem valor vigente" (FR-070).
- [ ] 3.4 Garantir que a apuração não crie, altere nem encerre turno. Evidência: teste cobrindo "Apuração não altera o turno" (FR-070).
- [ ] 3.5 Apresentar o instante da apuração e refletir retificação de turno na apuração seguinte, preservando o histórico da anterior. Evidência: teste cobrindo "Retificação de turno reflete na apuração" (FR-070, design D3). Se 0.6 definir ciclo travado, estender esta tarefa ao fechamento em vez de criar outro modelo.
- [ ] 3.6 Restringir o retorno da apuração a turno, data, profissional e valor, sem passagem, aferição, medicação, rotina ou ocorrência. Evidência: teste de contrato e de RPC cobrindo "Apuração não expõe conteúdo de saúde" (FR-070, design D6).
- [ ] 3.7 Provar a negativa de audiência, incluindo o próprio profissional apurado. Evidência: teste cobrindo "Apuração restrita à audiência financeira", inclusive por acesso direto ao banco (FR-070).
- [ ] 3.8 Auditar execução, consulta e exportação da apuração. Evidência: teste cobrindo os três eventos (FR-070, FR-039).
- [ ] 3.9 Apresentar estado vazio honesto para período sem turno encerrado. Evidência: teste cobrindo consulta real bem-sucedida sem dados de exemplo (FR-070).

## 4. Interface financeira no celular

Depende de 2.7 e 3.9.

- [ ] 4.1 Implementar as telas de valor acordado, despesa com comprovante e apuração por período em `web/`, com estados de carregamento, vazio, erro e sucesso. Evidência: teste de interface cobrindo os quatro estados sem fallback de dados de exemplo em erro.
- [ ] 4.2 Garantir que nenhuma superfície financeira apareça para perfil profissional sem concessão financeira ou para perfil familiar. Evidência: teste de interface mais os testes de servidor e banco de 1.6 e 2.5 — ocultar na interface não é autorização.
- [ ] 4.3 Garantir uso confortável no celular, com teclado, foco visível e entrada de valor adequada. Evidência: verificação registrada em viewport de celular, conforme `AGENTS.md — Qualidade e experiência`.

## 5. Verificação integrada

Depende de 4.3.

- [ ] 5.1 Executar a matriz de autorização do recorte: perfil financeiro, Administrador, profissional com vínculo, profissional sem vínculo, familiar com fundamento, familiar sem fundamento e acesso revogado, em cada superfície financeira. Evidência: testes positivos e negativos no servidor e no banco (FR-068, FR-069, FR-070, FR-047 modificado).
- [ ] 5.2 Provar que nenhuma trilha de cuidado existente foi alterada por este recorte. Evidência: testes de autorização de cuidado já existentes executados sem alteração de resultado (design D1).
- [ ] 5.3 Executar `pnpm run verificar:ativacao` uma única vez e o roteiro "Como testar" do PR na retirada do draft, com os testes positivos e negativos de autorização e RLS obrigatórios. Evidência: saída registrada; se algum gate não executar, registrar o bloqueio aqui em vez de presumir sucesso.
- [ ] 5.4 Solicitar revisão independente da fatia com `code-review`, informando a revisão-base, esta mudança OpenSpec e o diff exato, incluindo arquivos novos. Evidência: achados registrados e tratados; correções seguidas apenas pelos testes afetados pelo diff.

## Workflow follow-up

- Sincronizar os deltas com `openspec/specs/` e arquivar a mudança somente após a revisão independente e os critérios de aceite atendidos. A capacidade `financeiro-do-cuidado` é nova: conferir que `Purpose` e requisitos chegaram à spec principal.
- Atualizar `docs/projeto/roteiro-especificacoes.md` com a posição desta capacidade entre as fatias, sem marcar fatias alheias como concluídas.
- Registrar em `evolucoes-propostas` que FR-047 deixou de ser evolução proposta, para que a spec principal não continue descrevendo-o como hipótese.
