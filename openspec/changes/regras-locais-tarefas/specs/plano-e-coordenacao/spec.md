# Spec Delta

## MODIFIED Requirements

### Requirement: FR-017 — Criar tarefas com responsável, prazo, prioridade operacional e estados pendente

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Criar tarefas com responsável, prazo, prioridade operacional e estados pendente, em andamento, concluída ou cancelada. A conclusão deve registrar a ação realizada ou a justificativa.

#### Scenario: Condição de aceite FR-017

- **WHEN** a funcionalidade FR-017 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Criar tarefas com responsável, prazo, prioridade operacional e estados pendente, em andamento, concluída ou cancelada. A conclusão deve registrar a ação realizada ou a justificativa.

#### Scenario: Prévia fictícia dos estados

- **WHEN** uma pessoa examinar a demonstração local de tarefas fictícias
- **THEN** SHALL poder observar os estados pendente, em andamento, concluída e cancelada, com identificação de que se trata de prévia fictícia.

#### Scenario: Conclusão informada

- **WHEN** a regra local receber uma conclusão com ação realizada ou justificativa não vazia
- **THEN** SHALL aceitar a conclusão preservando a informação fornecida.

#### Scenario: Conclusão sem informação

- **WHEN** a regra local receber uma conclusão sem ação realizada e sem justificativa
- **THEN** SHALL rejeitar a conclusão e manter o estado anterior.

#### Scenario: Prioridade e acesso por vínculo profissional

- **WHEN** uma tarefa for criada ou acompanhada no recorte conectado
- **THEN** sua prioridade SHALL ser baixa, média ou alta, e a operação SHALL ser restrita a profissional vinculado ao paciente, com vínculo verificado no servidor e banco.
- **AND** a revogação do vínculo SHALL impedir novas operações.
