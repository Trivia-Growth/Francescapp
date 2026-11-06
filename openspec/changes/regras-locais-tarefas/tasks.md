# Tasks

## 1. Regras locais e prévia

- [ ] 1.1 Implementar regras locais dos estados e conclusão de FR-017, sem transições adicionais presumidas; dependência: nenhuma. Evidência: testes positivos com ação ou justificativa e negativos com ambos vazios, preservando estado anterior.
- [ ] 1.2 Exibir prévia fictícia identificada dos quatro estados de FR-017; dependência: 1.1. Evidência: exercício local observável e teste pertinente; não persistir nem enviar dados.
- [ ] 1.3 Revisar a fatia quanto aos padrões e ao delta FR-017; dependência: 1.1 e 1.2. Evidência: registrar resultados e limitações, incluindo que FR-017 conectado e suas permissões, prioridade e persistência permanecem pendentes.

## 2. Recorte conectado decidido em 04/11/2026

- [x] 2.1 Definir quem concede e revoga o vínculo profissional-paciente registrado em `cadastro.acesso_paciente`; não inferir vínculo da concessão geral de equipe ou de relação pessoal. Decisão: administrador, conforme D-02 da fundação; vínculo e concessão de equipe permanecem distintos.
- [ ] 2.2 Implementar persistência e interface de FR-017 com prioridade baixa, média ou alta, restritas a profissionais vinculados; usar vínculos ativos preexistentes; controles efetivos de autorização, cifra e auditoria são necessários antes da ativação. Manter acesso desativado até revisão e provas.
- [ ] 2.3 Revisar e comprovar acesso permitido e negado, outro paciente, revogação, acesso direto e falhas de auditoria/cifra. Testes não executados por instrução do solicitante; integração e ativação permanecem sem evidência.

Preparação local: contrato com descrição e prioridades, tabelas versionadas, operações privadas e composição de cifra no servidor foram escritos. A interface de consulta e a rota GET foram ligadas no código, com serviço desativado; criação, idempotência, grants e ativação permanecem pendentes. Lint e typecheck passaram. Não foram executados testes ou migrations dessas tarefas.

Preparação posterior: formulário de criação e handler privado foram escritos, com proteção contra repetição preparada em migration local. O formulário e POST ainda não estão ligados; revisão da idempotência, grants e provas reais continuam pendentes. Não executar a migration como se a integração estivesse concluída.

Atualização: as migrations privadas de tarefas foram aplicadas no Supabase de teste, sem liberação da operação. Integração e provas de autorização e idempotência seguem pendentes; nenhum teste foi executado nesta etapa.

O formulário agora usa o cliente HTTP de criação e o POST é encaminhado atrás de flag separada, desativada por padrão. Grants, revisão do fluxo completo e provas reais seguem pendentes; a ligação do código não significa que a jornada esteja disponível.

Atualização de estados preparada na interface e no servidor, com versão esperada e chave de idempotência. Conflitos e respostas incertas preservam os campos para cópia e oferecem consulta após confirmação. Não há ativação ou testes; autorização, concorrência e reconciliação real permanecem pendentes.

Edição de descrição, responsável, prazo e prioridade adicionada ao formulário existente. A interface permanece dependente do serviço e das permissões protegidas ainda desativados.

A leitura do corpo HTTP foi limitada por cancelamento e prazo; teste de regressão passou. Fixture SQL adicional gravou três versões por profissional vinculado com dados fictícios; não comprova semântica completa nem integração Auth/Vault real.
