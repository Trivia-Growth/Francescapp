# Agenda e carteira

## Purpose

Preservar os requisitos de agenda e carteira do projeto Francescapp aprovado, com rastreabilidade e sem alterar seu escopo na migração para OpenSpec.

**Migração**: 14/10/2026. **Estado**: referência funcional; não comprova implementação.

As fases Inicial/Evolução são as da proposta de origem. Evolução continua a validar; Inicial não confirma por si só recorte de entrega, hipóteses ou decisões técnicas pendentes. Consultar [fundação](../../../docs/projeto/fundacao.md) e [contexto de negócio](../../../docs/projeto/contexto-negocio.md).

## Requirements

### Requirement: FR-023 — Consolidar compromissos do caso, da agenda individual na própria conta

**Fase de origem**: Inicial.

O produto SHALL atender a este comportamento: Consolidar compromissos do caso, da agenda individual na própria conta Google do profissional e, quando seu acesso estiver marcado na configuração, da agenda global da Francescato em e-mail compartilhado.

#### Scenario: Condição de aceite FR-023

- **WHEN** a funcionalidade FR-023 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Consolidar compromissos do caso, da agenda individual na própria conta Google do profissional e, quando seu acesso estiver marcado na configuração, da agenda global da Francescato em e-mail compartilhado. As agendas individuais não ficam concentradas nessa conta compartilhada. Exibir origem, profissional, data, duração, local ou modalidade e participantes autorizados. Deve permitir recorrência e sinalizar sobreposições, sem impedir exceções justificadas.

### Requirement: FR-024 — Registrar realizado, faltou, cancelado, remarcado ou realização não confirmada, com

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar realizado, faltou, cancelado, remarcado ou realização não confirmada, com motivo e vínculo entre datas. Deve distinguir falta de cancelamento e de ausência de confirmação.

#### Scenario: Condição de aceite FR-024

- **WHEN** a funcionalidade FR-024 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar realizado, faltou, cancelado, remarcado ou realização não confirmada, com motivo e vínculo entre datas. Deve distinguir falta de cancelamento e de ausência de confirmação.

### Requirement: FR-025 — Exibir a origem de cada compromisso e a data da

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Exibir a origem de cada compromisso e a data da última atualização da agenda. Oferecer lembretes e avisos de mudança segundo preferência do destinatário. Mensagens externas devem usar conteúdo mínimo e não incluir diagnóstico, transcrição ou trecho de evolução.

#### Scenario: Condição de aceite FR-025

- **WHEN** a funcionalidade FR-025 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Exibir a origem de cada compromisso e a data da última atualização da agenda. Oferecer lembretes e avisos de mudança segundo preferência do destinatário. Mensagens externas devem usar conteúdo mínimo e não incluir diagnóstico, transcrição ou trecho de evolução.

### Requirement: FR-026 — Mostrar carteira filtrável por responsável, situação do acompanhamento, revisão e

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Mostrar carteira filtrável por responsável, situação do acompanhamento, revisão e pendências. Sinais operacionais devem ter motivo visível e estado “informação insuficiente”; não representar classificação clínica automática.

#### Scenario: Condição de aceite FR-026

- **WHEN** a funcionalidade FR-026 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Mostrar carteira filtrável por responsável, situação do acompanhamento, revisão e pendências. Sinais operacionais devem ter motivo visível e estado “informação insuficiente”; não representar classificação clínica automática.

### Requirement: FR-027 — Gerar pendências por atraso de tarefa, ausência de atualização esperada

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Gerar pendências por atraso de tarefa, ausência de atualização esperada ou revisão próxima, usando periodicidades acordadas por caso. Deve permitir reconhecer, atribuir e resolver o alerta sem apagar sua origem.

#### Scenario: Condição de aceite FR-027

- **WHEN** a funcionalidade FR-027 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Gerar pendências por atraso de tarefa, ausência de atualização esperada ou revisão próxima, usando periodicidades acordadas por caso. Deve permitir reconhecer, atribuir e resolver o alerta sem apagar sua origem.

### Requirement: FR-028 — Diferenciar situações operacionais das sinalizações clínicas feitas por profissional. Verde

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Diferenciar situações operacionais das sinalizações clínicas feitas por profissional. Verde ou “em dia” significa compromissos operacionais em dia, não ausência de risco clínico.

#### Scenario: Condição de aceite FR-028

- **WHEN** a funcionalidade FR-028 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Diferenciar situações operacionais das sinalizações clínicas feitas por profissional. Verde ou “em dia” significa compromissos operacionais em dia, não ausência de risco clínico.

### Requirement: FR-049 — Consultar compromissos existentes no Google Agenda e permitir atualizá-los pelo

**Fase de origem**: Inicial.

O produto SHALL atender a este comportamento: Consultar compromissos existentes no Google Agenda e permitir atualizá-los pelo sistema nas agendas com autorização de edição, refletindo a alteração na origem.

#### Scenario: Condição de aceite FR-049

- **WHEN** a funcionalidade FR-049 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Consultar compromissos existentes no Google Agenda e permitir atualizá-los pelo sistema nas agendas com autorização de edição, refletindo a alteração na origem. Integrar a agenda individual e a agenda global institucional conforme a configuração de acesso; visualizar a agenda global não autoriza editá-la. Alterações devem preservar a autoria individual mesmo na conta compartilhada. Cada compromisso deve exibir origem e respeitar o escopo de pessoa, caso e audiência. Só indicar atualização concluída após confirmação da integração; regras de criação, cancelamento, edição de séries e conflito ainda serão detalhadas.

### Requirement: FR-050 — Permitir que responsáveis autorizados reconheçam falha de atualização de agenda

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir que responsáveis autorizados reconheçam falha de atualização de agenda ou arquivo e encontrem uma ação de regularização, sem apresentar dados possivelmente desatualizados como atuais.

#### Scenario: Condição de aceite FR-050

- **WHEN** a funcionalidade FR-050 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir que responsáveis autorizados reconheçam falha de atualização de agenda ou arquivo e encontrem uma ação de regularização, sem apresentar dados possivelmente desatualizados como atuais.

## Jornadas e testes independentes preservados

As jornadas abaixo foram migradas sem alteração dos exemplos de aceite. Não indicam execução de testes ou aprovação de hipóteses.

### User Story 6 - Acompanhar agenda e continuidade do cuidado (Priority: P1)

Como case manager ou participante autorizado, consulto no sistema a agenda do caso e minha agenda na própria conta Google, atualizo compromissos pelo próprio sistema e registro realização, falta, cancelamento ou remarcação. A agenda global da Francescato, vinculada a um e-mail compartilhado separado das contas individuais, fica disponível conforme a configuração individual de acesso.

**Why this priority**: Ajuda a enxergar rotina, adesão e barreiras antes que compromissos se percam.

**Independent Test**: Consultar uma semana fictícia, atualizar um compromisso pelo sistema e conferir o resultado no Google Agenda, usando três usuários: sem acesso global, com consulta global e com consulta e edição global.

**Acceptance Scenarios**:

1. Dado um atendimento recorrente, quando houver remarcação de uma ocorrência, então as demais serão preservadas e o compromisso original ficará relacionado à nova data.
2. Dado um atendimento que passou do horário e não foi confirmado, quando for exibido no acompanhamento, então aparecerá como “realização não confirmada”, sem ser contado automaticamente como falta.
3. Dada uma falta, quando registrar o motivo, então será possível identificar barreiras de transporte, custo, disponibilidade ou outras; a ausência não produzirá um diagnóstico de risco.
4. Dada uma agenda Google autorizada ou a agenda geral da Francescato, quando houver compromissos no período consultado, então a pessoa autorizada verá no sistema a origem, data, horário e participantes permitidos, sem revelar detalhes de calendários não autorizados.
5. Dado um compromisso da própria agenda com edição autorizada, quando o usuário atualizá-lo pelo sistema, então a alteração será refletida na agenda Google de origem; o sistema só indicará atualização concluída após confirmação da integração.
6. Dado um usuário sem “Pode visualizar” na agenda global, quando consultar a agenda ou tentar acessar diretamente um compromisso global, então não obterá os dados dessa agenda nem poderá alterá-los. Entrar pelo Google não concede essa permissão automaticamente.
7. Dado um usuário com “Pode visualizar” na agenda global, quando consultar o calendário do sistema, então verá a agenda global junto de sua agenda, com origem identificada e sem receber por isso autorização para dados protegidos dos casos.
8. Dada uma falha ao atualizar um compromisso no Google, quando o sistema apresentar o resultado, então indicará a falha ou confirmação pendente, sem afirmar que a agenda de origem foi alterada.
9. Dado um usuário com “Pode visualizar” e sem “Pode editar” na agenda global, quando consultar seus compromissos, então poderá acompanhá-los, mas qualquer tentativa de alteração será negada, inclusive fora da interface.
10. Dado um usuário com consulta e edição autorizadas na agenda global, quando atualizar um compromisso pelo sistema, então a alteração será refletida na agenda global de origem após confirmação da integração e terá autoria individual registrada.
11. Dado um usuário cuja permissão “Pode editar” foi removida, mantendo “Pode visualizar”, quando utilizar a agenda global, então continuará consultando os compromissos permitidos, mas novas alterações serão negadas.

### User Story 7 - Priorizar a carteira de casos (Priority: P1)

Como case manager, vejo quais casos precisam de revisão, quais pendências estão vencidas e quais registros solicitam retorno.

**Why this priority**: Permite coordenar vários casos com menos cobrança e busca manual.

**Independent Test**: Comparar casos fictícios em dia, com dados insuficientes, com pendências e com atenção sinalizada pela equipe.

**Acceptance Scenarios**:

1. Dada uma pendência vencida, quando aparecer uma sinalização, então será exibido o motivo, prazo e responsável.
2. Dado um caso sem dados suficientes, quando aparecer na carteira, então terá situação explícita de “informação insuficiente”, sem parecer saudável por ausência de registros.
3. Dado um alerta operacional encerrado, quando o responsável concluir a ação, então registrará o encaminhamento e o alerta poderá ser reaberto se surgir nova pendência.
