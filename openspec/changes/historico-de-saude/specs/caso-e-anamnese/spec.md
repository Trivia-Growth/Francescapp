# Spec Delta

## MODIFIED Requirements

### Requirement: FR-004 — Registrar histórico de saúde, avaliações e diagnósticos ou hipóteses com

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar histórico de saúde, avaliações e diagnósticos ou hipóteses com autor/origem, data e situação de confirmação. Um relato leigo deve manter sua origem visível.

#### Scenario: Condição de aceite FR-004

- **WHEN** a funcionalidade FR-004 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar histórico de saúde, avaliações e diagnósticos ou hipóteses com autor/origem, data e situação de confirmação. Um relato leigo deve manter sua origem visível.

#### Scenario: Origem leiga preservada
- **WHEN** um histórico, avaliação ou diagnóstico informado por familiar for registrado e consultado por pessoa autorizada
- **THEN** o sistema SHALL manter visíveis a origem leiga, a fonte, a data e a situação informada, sem transformar automaticamente o relato em parecer profissional ou diagnóstico confirmado.

#### Scenario: Alteração sem autorização vigente
- **WHEN** uma pessoa sem permissão vigente, inclusive após revogação do vínculo com o caso, tentar consultar ou alterar a saúde do paciente
- **THEN** o sistema SHALL negar o acesso no servidor e no banco sem expor conteúdo clínico.

#### Scenario: Resposta de salvamento perdida
- **WHEN** uma gravação autorizada for repetida com a mesma identificação e conteúdo após perda da resposta
- **THEN** o sistema SHALL reconhecer a operação anterior sem duplicar a versão e conferir novamente a autorização vigente.
