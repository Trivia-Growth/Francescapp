# Spec Delta

## MODIFIED Requirements

### Requirement: FR-006 — Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Deve mostrar responsável, data da revisão e informação ainda não incorporada. Os blocos disponíveis SHALL conduzir à informação de origem ou à ação permitida e distinguir dado ausente, não carregado, falha e falta de acesso.

#### Scenario: Condição de aceite FR-006

- **WHEN** a funcionalidade FR-006 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Deve mostrar responsável, data da revisão e informação ainda não incorporada.

#### Scenario: Resumo de caso preenchido

- **WHEN** a pessoa autorizada abrir um caso fictício com registros, objetivos, pendências e compromissos que os serviços conectados lhe permitem consultar
- **THEN** o resumo exibirá esses dados ou sínteses autorizadas, sua atualização conhecida e caminhos para as respectivas seções, sem atribuir revisão humana a uma composição automática.

#### Scenario: Percurso visual do mock

- **WHEN** a coordenação autorizada consultar um caso preenchido
- **THEN** encontrará em composição reconhecível do mock a identificação, contexto, mudanças, registros recentes, objetivos, próximos passos, compromissos e caminhos para equipe, documentos e orientações, conforme disponibilidade e audiência.

#### Scenario: Fonte ainda não conectada ou falha parcial

- **WHEN** uma fonte exigida por FR-006 ainda não estiver disponível ou falhar
- **THEN** o resumo identificará a indisponibilidade ou erro do bloco e preservará os demais; não preencherá a lacuna com dados do mock nem dirá “sem registros” antes de consultar com sucesso.

#### Scenario: Conteúdo restrito e revogação

- **WHEN** uma fonte ou um caso não for autorizado para a sessão, inclusive após revogação
- **THEN** o resumo e a navegação não mostrarão conteúdo, trecho, título ou contagem protegida; o servidor e o banco manterão a negativa no acesso direto.
