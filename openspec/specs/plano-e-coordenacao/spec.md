# Plano e coordenação

## Purpose

Preservar os requisitos de plano e coordenação do projeto Francescapp aprovado, com rastreabilidade e sem alterar seu escopo na migração para OpenSpec.

**Migração**: 14/10/2026. **Estado**: referência funcional; não comprova implementação.

As fases Inicial/Evolução são as da proposta de origem. Evolução continua a validar; Inicial não confirma por si só recorte de entrega, hipóteses ou decisões técnicas pendentes. Consultar [fundação](../../../docs/projeto/fundacao.md) e [contexto de negócio](../../../docs/projeto/contexto-negocio.md).

## Requirements

### Requirement: FR-015 — Manter plano de cuidado por caso com objetivos da pessoa

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Manter plano de cuidado por caso com objetivos da pessoa e da equipe, área, responsável, situação inicial, forma de observar progresso e data de revisão. O nome PTS só será usado se corresponder à prática validada da equipe.

#### Scenario: Condição de aceite FR-015

- **WHEN** a funcionalidade FR-015 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter plano de cuidado por caso com objetivos da pessoa e da equipe, área, responsável, situação inicial, forma de observar progresso e data de revisão. O nome PTS só será usado se corresponder à prática validada da equipe.

### Requirement: FR-016 — Acompanhar objetivos como proposto, em andamento, atingido, pausado, revisar ou

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Acompanhar objetivos como proposto, em andamento, atingido, pausado, revisar ou encerrado. Revisões devem manter motivo, data e versões anteriores.

#### Scenario: Condição de aceite FR-016

- **WHEN** a funcionalidade FR-016 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Acompanhar objetivos como proposto, em andamento, atingido, pausado, revisar ou encerrado. Revisões devem manter motivo, data e versões anteriores.

### Requirement: FR-017 — Criar tarefas com responsável, prazo, prioridade operacional e estados pendente

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Criar tarefas com responsável, prazo, prioridade operacional e estados pendente, em andamento, concluída ou cancelada. A conclusão deve registrar a ação realizada ou a justificativa.

#### Scenario: Condição de aceite FR-017

- **WHEN** a funcionalidade FR-017 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Criar tarefas com responsável, prazo, prioridade operacional e estados pendente, em andamento, concluída ou cancelada. A conclusão deve registrar a ação realizada ou a justificativa.

### Requirement: FR-018 — Registrar encaminhamentos com destino, motivo, responsável e etapas: sugerido, agendado

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar encaminhamentos com destino, motivo, responsável e etapas: sugerido, agendado, realizado, retorno pendente ou concluído. Deve ser possível localizar encaminhamentos sem retorno.

#### Scenario: Condição de aceite FR-018

- **WHEN** a funcionalidade FR-018 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar encaminhamentos com destino, motivo, responsável e etapas: sugerido, agendado, realizado, retorno pendente ou concluído. Deve ser possível localizar encaminhamentos sem retorno.

### Requirement: FR-019 — Manter orientações aprovadas com autor, data, destinatários e validade/revisão quando

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Manter orientações aprovadas com autor, data, destinatários e validade/revisão quando pertinente. Uma orientação superada deve permanecer identificada como anterior, sem parecer atual.

#### Scenario: Condição de aceite FR-019

- **WHEN** a funcionalidade FR-019 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter orientações aprovadas com autor, data, destinatários e validade/revisão quando pertinente. Uma orientação superada deve permanecer identificada como anterior, sem parecer atual.

### Requirement: FR-020 — Registrar plano de crise aprovado pelo profissional habilitado, com responsáveis

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar plano de crise aprovado pelo profissional habilitado, com responsáveis, contatos, limites do serviço e data de revisão. O diário deve informar que não garante resposta imediata; a case manager não emite conduta clínica por assumir a coordenação.

#### Scenario: Condição de aceite FR-020

- **WHEN** a funcionalidade FR-020 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar plano de crise aprovado pelo profissional habilitado, com responsáveis, contatos, limites do serviço e data de revisão. O diário deve informar que não garante resposta imediata; a case manager não emite conduta clínica por assumir a coordenação.

### Requirement: FR-021 — Registrar reuniões com pauta, participantes, decisões e ações; cada ação

**Fase de origem**: Evolução.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar reuniões com pauta, participantes, decisões e ações; cada ação deve ficar vinculada ao responsável e ao prazo.

#### Scenario: Condição de aceite FR-021

- **WHEN** a funcionalidade FR-021 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar reuniões com pauta, participantes, decisões e ações; cada ação deve ficar vinculada ao responsável e ao prazo.

### Requirement: FR-022 — Permitir passagem e encerramento de acompanhamento com síntese revisada, pendências

**Fase de origem**: Evolução.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir passagem e encerramento de acompanhamento com síntese revisada, pendências, próximos responsáveis e destinatários autorizados; caso encerrado não reabre silenciosamente.

#### Scenario: Condição de aceite FR-022

- **WHEN** a funcionalidade FR-022 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir passagem e encerramento de acompanhamento com síntese revisada, pendências, próximos responsáveis e destinatários autorizados; caso encerrado não reabre silenciosamente.

## Jornadas e testes independentes preservados

As jornadas abaixo foram migradas sem alteração dos exemplos de aceite. Não indicam execução de testes ou aprovação de hipóteses.

### User Story 5 - Transformar informações em plano e ações (Priority: P1)

Como case manager e equipe, defino objetivos relevantes para a pessoa acompanhada e converto observações em ações com responsáveis e prazos.

**Why this priority**: O histórico só entrega coordenação quando leva a decisões e acompanhamento dos combinados.

**Independent Test**: Criar um objetivo fictício, registrar uma ação e revisar seu andamento com evidências.

**Acceptance Scenarios**:

1. Dado um objetivo como retomar uma atividade de rotina, quando for incluído no plano, então terá descrição, responsável, situação inicial, evidência de progresso e data de revisão.
2. Dada uma recomendação na evolução, quando gerar uma tarefa, então a tarefa manterá referência ao registro e a audiência adequada.
3. Dado um objetivo alterado, quando a revisão for confirmada, então o plano anterior permanecerá consultável e a mudança terá motivo e responsável.

### User Story 10 - Reunir a equipe e transferir ou encerrar o acompanhamento (Priority: P2)

Como case manager, preparo reuniões com mudanças, decisões e pendências e deixo uma passagem organizada quando a equipe ou o acompanhamento mudar.

**Why this priority**: Aprofunda a continuidade após o diário, o plano e as pendências já estarem em uso.

**Independent Test**: Preparar uma revisão de caso fictício e gerar uma síntese autorizada para o próximo responsável.

**Acceptance Scenarios**:

1. Dada uma reunião, quando registrar as decisões, então cada encaminhamento terá responsável, prazo e vínculo com o objetivo ou pendência correspondente.
2. Dada uma transferência de acompanhamento, quando a síntese for aprovada, então incluirá situação atual, orientações autorizadas, próximos passos e responsável que recebeu a passagem.
3. Dado um caso encerrado, quando um novo participante for convidado, então o acesso não será reativado sem uma decisão explícita de reabertura e nova definição de vínculos.
