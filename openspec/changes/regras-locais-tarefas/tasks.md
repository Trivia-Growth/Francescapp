# Tasks

## 1. Regras locais e prévia

- [ ] 1.1 Implementar regras locais dos estados e conclusão de FR-017, sem transições adicionais presumidas; dependência: nenhuma. Evidência: testes positivos com ação ou justificativa e negativos com ambos vazios, preservando estado anterior.
- [ ] 1.2 Exibir prévia fictícia identificada dos quatro estados de FR-017; dependência: 1.1. Evidência: exercício local observável e teste pertinente; não persistir nem enviar dados.
- [ ] 1.3 Revisar a fatia quanto aos padrões e ao delta FR-017; dependência: 1.1 e 1.2. Evidência: registrar resultados e limitações, incluindo que FR-017 conectado e suas permissões, prioridade e persistência permanecem pendentes.

## 2. Recorte conectado decidido em 04/11/2026

- [ ] 2.1 Definir quem concede e revoga o vínculo profissional-paciente registrado em `cadastro.acesso_paciente`; não inferir vínculo da concessão geral de equipe ou de relação pessoal.
- [ ] 2.2 Implementar persistência e interface de FR-017 com prioridade baixa, média ou alta, restritas a profissionais vinculados; usar vínculos ativos preexistentes; controles efetivos de autorização, cifra e auditoria são necessários antes da ativação. Manter acesso desativado até revisão e provas.
- [ ] 2.3 Revisar e comprovar acesso permitido e negado, outro paciente, revogação, acesso direto e falhas de auditoria/cifra. Testes não executados por instrução do solicitante; integração e ativação permanecem sem evidência.

Preparação local: contrato com descrição e prioridades, tabelas versionadas, operações privadas e composição de cifra no servidor foram escritos. A interface de consulta e a rota GET foram ligadas no código, com serviço desativado; criação, idempotência, grants e ativação permanecem pendentes. Lint e typecheck passaram. Não foram executados testes ou migrations dessas tarefas.
