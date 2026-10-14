# Caso e anamnese

## Purpose

Preservar os requisitos de caso e anamnese do projeto Francescapp aprovado, com rastreabilidade e sem alterar seu escopo na migração para OpenSpec.

**Migração**: 14/10/2026. **Estado**: referência funcional; não comprova implementação.

As fases Inicial/Evolução são as da proposta de origem. Evolução continua a validar; Inicial não confirma por si só recorte de entrega, hipóteses ou decisões técnicas pendentes. Consultar [fundação](../../../docs/projeto/fundacao.md) e [contexto de negócio](../../../docs/projeto/contexto-negocio.md).

## Requirements

### Requirement: FR-001 — Cadastrar caso com identificação necessária, nome de preferência, contatos, case

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Cadastrar caso com identificação necessária, nome de preferência, contatos, case manager e situação: entrada, ativo, pausado, encerrado ou transferido. Mudanças de situação devem ter data e motivo.

#### Scenario: Condição de aceite FR-001

- **WHEN** a funcionalidade FR-001 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Cadastrar caso com identificação necessária, nome de preferência, contatos, case manager e situação: entrada, ativo, pausado, encerrado ou transferido. Mudanças de situação devem ter data e motivo.

### Requirement: FR-002 — Manter mapa de pessoas com vínculos distintos: paciente, familiar, cuidador

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Manter mapa de pessoas com vínculos distintos: paciente, familiar, cuidador, responsável legal, contato de emergência, profissional e responsável financeiro. Deve permitir uma pessoa com mais de um vínculo sem somar permissões automaticamente.

#### Scenario: Condição de aceite FR-002

- **WHEN** a funcionalidade FR-002 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter mapa de pessoas com vínculos distintos: paciente, familiar, cuidador, responsável legal, contato de emergência, profissional e responsável financeiro. Deve permitir uma pessoa com mais de um vínculo sem somar permissões automaticamente.

### Requirement: FR-003 — Oferecer anamnese de coordenação em seções, com preenchimento gradual e

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Oferecer anamnese de coordenação em seções, com preenchimento gradual e estados “informado”, “desconhecido”, “não se aplica” ou “pendente”, fonte e data. A case manager deve localizar as seções incompletas.

#### Scenario: Condição de aceite FR-003

- **WHEN** a funcionalidade FR-003 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Oferecer anamnese de coordenação em seções, com preenchimento gradual e estados “informado”, “desconhecido”, “não se aplica” ou “pendente”, fonte e data. A case manager deve localizar as seções incompletas.

### Requirement: FR-004 — Registrar histórico de saúde, avaliações e diagnósticos ou hipóteses com

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar histórico de saúde, avaliações e diagnósticos ou hipóteses com autor/origem, data e situação de confirmação. Um relato leigo deve manter sua origem visível.

#### Scenario: Condição de aceite FR-004

- **WHEN** a funcionalidade FR-004 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar histórico de saúde, avaliações e diagnósticos ou hipóteses com autor/origem, data e situação de confirmação. Um relato leigo deve manter sua origem visível.

### Requirement: FR-005 — Registrar rotina, recursos, barreiras, preferências, pontos fortes e o que

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar rotina, recursos, barreiras, preferências, pontos fortes e o que o paciente considera importante. Deve permitir vincular esses elementos a objetivos do plano.

#### Scenario: Condição de aceite FR-005

- **WHEN** a funcionalidade FR-005 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar rotina, recursos, barreiras, preferências, pontos fortes e o que o paciente considera importante. Deve permitir vincular esses elementos a objetivos do plano.

### Requirement: FR-006 — Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Deve mostrar responsável, data da revisão e informação ainda não incorporada.

#### Scenario: Condição de aceite FR-006

- **WHEN** a funcionalidade FR-006 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Deve mostrar responsável, data da revisão e informação ainda não incorporada.

### Requirement: FR-007 — Manter linha do tempo pesquisável por período, tipo de registro

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Manter linha do tempo pesquisável por período, tipo de registro, autor, área, objetivo e pendência. Deve distinguir acontecimento, registro e retificação e respeitar audiência em todos os resultados.

#### Scenario: Condição de aceite FR-007

- **WHEN** a funcionalidade FR-007 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter linha do tempo pesquisável por período, tipo de registro, autor, área, objetivo e pendência. Deve distinguir acontecimento, registro e retificação e respeitar audiência em todos os resultados.

## Jornadas e testes independentes preservados

As jornadas abaixo foram migradas sem alteração dos exemplos de aceite. Não indicam execução de testes ou aprovação de hipóteses.

### User Story 1 - Entender o caso antes de agir (Priority: P1)

Como case manager, Edilaine abre um caso e encontra a situação atual, mudanças recentes, equipe, objetivos, pendências e próximos compromissos.

**Why this priority**: É o principal ganho da centralização e o ponto de partida para coordenar o cuidado.

**Independent Test**: Demonstrar um caso fictício com registros, objetivos e pendências previamente cadastrados; pedir à case manager que prepare uma reunião.

**Acceptance Scenarios**:

1. Dado um caso com registros de diferentes autores, quando Edilaine consultar a linha do tempo, então verá os registros autorizados ordenados pela data do acontecimento, com autor, origem, data de publicação e audiência.
2. Dado um resumo revisado há uma semana e novos registros posteriores, quando abrir o resumo, então verá a data e o responsável pela revisão e um aviso de mudanças ainda não incorporadas.
3. Dado conteúdo restrito sem autorização para a case manager, quando pesquisar, filtrar, exportar ou consultar o resumo, então o conteúdo e seus trechos não serão expostos.

### User Story 4 - Conhecer a pessoa e organizar a entrada no acompanhamento (Priority: P1)

Como case manager, organizo a entrada do caso com informações da pessoa, contexto familiar, prioridades, documentos e avaliações da equipe.

**Why this priority**: Cria uma base reutilizável e reduz a repetição das mesmas perguntas a cada profissional.

**Independent Test**: Concluir a entrada de um caso fictício, inclusive com informações desconhecidas e documentos ainda pendentes.

**Acceptance Scenarios**:

1. Dado um caso novo, quando a anamnese for preenchida em etapas, então respostas desconhecidas ou ainda não obtidas poderão ser identificadas sem inventar informação e o progresso será preservado.
2. Dado um diagnóstico informado pela família, quando for registrado, então aparecerá como relato da família, com fonte e data, sem se tornar diagnóstico confirmado.
3. Dado um familiar que também é responsável financeiro, quando seus vínculos forem cadastrados, então o vínculo financeiro não concederá acesso ao diário ou a dados de saúde.
