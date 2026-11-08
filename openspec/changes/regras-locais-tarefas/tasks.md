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

Preparação de leitura conectada: wrapper SQL separado aceita somente ação assinada de leitura; escrita permanece na RPC anterior sem grant. Cliente seleciona wrapper de leitura; teste local com fixtures cobriu profissional vinculado, outro paciente, vínculo revogado e escrita negada. Revisão independente não encontrou defeito concreto; Auth/Vault e autorização reais, grant e publicação seguem pendentes.

Atualização de 06/11/2026: migrations `20261112270000` e `20261112280000` aplicadas ao Supabase de teste para auditar Auth sem perfil e criar wrapper de leitura de tarefas. Wrapper permanece sem grant; cliente preparado localmente, prova real e ativação ainda pendentes. Escrita segue fechada.

Atualização de 06/11/2026: conta Auth fictícia `40a8cd5e-ba6e-470f-8ed6-0d0fa54591ea` sem perfil recebeu negativa de leitura via JWT e atestado Vault reais; evento de auditoria confirmado. Grant temporário foi removido e, após revisão, migration `20261112290000` habilitou somente o wrapper de leitura no Supabase de teste. Flag de leitura configurada exclusivamente na branch privada; escrita continua fechada. Tela preparada para consulta sem formulários de escrita; prova por interface e profissional vinculado ainda pendente.

Prévia privada deploy `6aee6ad6ef2c5d0a3cb14458`, commit `40579c1`, publicada `ready` com 16 funções Node 22; somente consulta de tarefas, ainda sem prova positiva pela interface. Produção preservada.

Preparação local da barreira: preservada auditoria de Auth sem perfil ao substituir a operação e na composição da barreira. Teste SQL de regressão passou em PostgreSQL 17.11 descartável (exit 0): a mensagem `MEMBERSHIP_PLANO_CONCEDENTE_EXISTENTE_SEM_SET` vem de cenário negativo esperado na fixture anterior e é revertida. A prova cobre leitura negada e auditoria de Auth sem perfil após substituir a RPC; não cobre composição ou integração real. A barreira permanece rascunho sem owner/grants de aplicação; integração transacional, revisão independente, provas de autorização, concorrência e reconciliação seguem pendentes. Nenhuma migration remota ou ativação de escrita foi feita nesta preparação.

Preparação local adicional: owner isolado, privilégios internos e RLS da composição preparados em draft, sem grant à aplicação. PostgreSQL descartável executou teste direcionado com wrapper SECURITY DEFINER sob owner restrito: consulta, reconhecimento, reserva para profissional vinculado, negativa para paciente sem vínculo e ausência de EXECUTE externo passaram; teste anterior também cobre escrita, replay e rollback de auditoria sob fixture privilegiada. Corrigida ambiguidade de coluna na reserva. Permanecem pendentes revisão independente, prova de escrita e revogação sob papéis reais, corrida entre consulta pendente e revogação, integração Auth/Vault real e ativação. Não aplicar draft remotamente.

Correção local após revisão: composição identifica pacientes afetados, bloqueia vínculos ativos antes da barreira e revalida o conjunto após bloqueá-la; divergência retorna negativa auditada. Teste SQL direcionado em PostgreSQL descartável passou (exit 0), incluindo negativa após revogação para encerramento aberto, replay, consulta e reconhecimento, sem alterar a barreira. Prova concorrente em sessões separadas e revisão do diff permanecem pendentes; operação segue desativada.

Revisão adicional: consulta de reserva aberta também exige vínculo ativo, usando a mesma ordem de locks e revalidação. Teste SQL direcionado passou em PostgreSQL descartável (exit 0), incluindo negativa sem dados após revogação. Concorrência e revisão permanecem pendentes.

Prova local adicional: reserva pelo wrapper restrito seguida de escrita e replay pela RPC `SECURITY DEFINER` com owner sem superuser/BYPASSRLS passou em PostgreSQL 17 descartável; revogação negou nova tentativa. Teste com duas sessões também confirmou que consulta espera revogação em curso e, após commit, retorna negativa sem dados. A fixture de atestado é simulada; permanecem pendentes corrida de escrita/encerramento, Auth/Vault reais, revisão independente e migration revisada. Escrita permanece desativada; nenhum grant externo ou aplicação remota.

Preparação posterior: corrida de escrita e encerramento passou com sessões separadas: encerramento aguardou commit e observou confirmação e versão persistida. Migration privada `20261112300000` foi preparada e executada somente em PostgreSQL descartável, com sequência integrada, replay e revogação; não concede EXECUTE externo. Revisão independente, prova Auth/Vault real e aplicação no ambiente de teste seguem pendentes; escrita permanece fechada.

Atualização Supabase de teste: migration `20261112300000_barreira_tarefa_cuidado_privada` aplicada após revisão independente e teste local; catálogo confirmou `api.tarefa_barreira_composicao` sem EXECUTE para authenticated e anon. Nenhuma flag ou grant externo de escrita foi ativado. Auth/Vault reais e a jornada de escrita continuam pendentes.

Integração preparada: rota first-party da barreira, cliente, ciclo e transporte assinado com reserva e geração. Revisão corrigiu recuperação após falha de consulta e novo resultado entre abas; testes focados passaram. Interface permanece somente leitura por capability desativada, servidor sem grant externo e flags fechadas. Faltam integração Auth/Vault/RLS real e revisão/ativação da fatia.

Prova real no Supabase de teste: conta Auth fictícia sem perfil, JWT real e assinatura HMAC com chave Vault real receberam sem_permissao na consulta da barreira; um evento negado com ator Auth e request_id correspondente foi confirmado. Grant temporário de EXECUTE foi revogado e catálogo confirmou anon/authenticated sem EXECUTE; membership original preservada. A chave foi lida como postgres, portanto não comprova leitura pelo executor restrito. Duas contas fictícias foram criadas e preservadas. Prova positiva, demais perfis e integração HTTP continuam pendentes.
