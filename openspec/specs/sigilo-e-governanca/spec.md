# Sigilo e governança

## Purpose

Preservar os requisitos de sigilo e governança do projeto Francescapp aprovado, com rastreabilidade e sem alterar seu escopo na migração para OpenSpec.

**Migração**: 14/10/2026. **Estado**: referência funcional; não comprova implementação.

As fases Inicial/Evolução são as da proposta de origem. Evolução continua a validar; Inicial não confirma por si só recorte de entrega, hipóteses ou decisões técnicas pendentes. Consultar [fundação](../../../docs/projeto/fundacao.md) e [contexto de negócio](../../../docs/projeto/contexto-negocio.md).

## Requirements

### Requirement: FR-036 — Distinguir informação de coordenação compartilhável, conteúdo disponibilizado ao paciente/família e

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Distinguir informação de coordenação compartilhável, conteúdo disponibilizado ao paciente/família e conteúdo profissional restrito. O autor deve ver a audiência antes de publicar; rascunhos permanecem privados.

#### Scenario: Condição de aceite FR-036

- **WHEN** a funcionalidade FR-036 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Distinguir informação de coordenação compartilhável, conteúdo disponibilizado ao paciente/família e conteúdo profissional restrito. O autor deve ver a audiência antes de publicar; rascunhos permanecem privados.

### Requirement: FR-037 — Permitir revogar vínculos, definir substituição temporária da case manager e

**Fase de origem**: Inicial.

O produto SHALL atender a este comportamento: Permitir revogar vínculos, definir substituição temporária da case manager e revisar autorizações.

#### Scenario: Condição de aceite FR-037

- **WHEN** a funcionalidade FR-037 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir revogar vínculos, definir substituição temporária da case manager e revisar autorizações. A configuração individual da agenda global deve separar “Pode visualizar” e “Pode editar”: sem consulta autorizada, negar acesso; com apenas consulta, negar alterações; para atualizar, exigir consulta e edição autorizadas. Revogar edição não revoga consulta ainda válida. Conferir permissões ao executar a ação, não somente na interface. Todas as alterações de acesso devem manter data, responsável e motivo; permissões de agenda não concedem acesso clínico aos casos.

### Requirement: FR-038 — Manter evidências de autorização ou fundamento aplicável, finalidade, audiência e

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Manter evidências de autorização ou fundamento aplicável, finalidade, audiência e versão dos termos. Quando houver consentimento, registrar concessão e revogação; não usar uma única autorização genérica para toda utilização futura.

#### Scenario: Condição de aceite FR-038

- **WHEN** a funcionalidade FR-038 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter evidências de autorização ou fundamento aplicável, finalidade, audiência e versão dos termos. Quando houver consentimento, registrar concessão e revogação; não usar uma única autorização genérica para toda utilização futura.

### Requirement: FR-039 — Registrar consultas, alterações, downloads/exportações e mudanças de acesso com identidade

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Registrar consultas, alterações, downloads/exportações e mudanças de acesso com identidade, data e objeto. Apenas responsáveis autorizados podem consultar a auditoria, que deve evitar repetir conteúdo clínico desnecessariamente.

#### Scenario: Condição de aceite FR-039

- **WHEN** a funcionalidade FR-039 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar consultas, alterações, downloads/exportações e mudanças de acesso com identidade, data e objeto. Apenas responsáveis autorizados podem consultar a auditoria, que deve evitar repetir conteúdo clínico desnecessariamente.

### Requirement: FR-040 — Receber e acompanhar solicitações de acesso, correção, portabilidade ou exclusão

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Receber e acompanhar solicitações de acesso, correção, portabilidade ou exclusão. A resposta deve indicar medida adotada ou razão de guarda/restrição aplicável; revogar consentimento não significa apagar automaticamente todos os registros.

#### Scenario: Condição de aceite FR-040

- **WHEN** a funcionalidade FR-040 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Receber e acompanhar solicitações de acesso, correção, portabilidade ou exclusão. A resposta deve indicar medida adotada ou razão de guarda/restrição aplicável; revogar consentimento não significa apagar automaticamente todos os registros.

### Requirement: FR-041 — Informar regras de funcionamento, períodos de acompanhamento, canais de retorno

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Informar regras de funcionamento, períodos de acompanhamento, canais de retorno e uso do diário. Paciente e família devem encontrar essas regras sem precisar ler termos extensos para saber onde pedir ajuda.

#### Scenario: Condição de aceite FR-041

- **WHEN** a funcionalidade FR-041 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Informar regras de funcionamento, períodos de acompanhamento, canais de retorno e uso do diário. Paciente e família devem encontrar essas regras sem precisar ler termos extensos para saber onde pedir ajuda.

### Requirement: FR-042 — Proteger dados identificáveis e de saúde, incluindo textos livres, áudios

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Proteger dados identificáveis e de saúde, incluindo textos livres, áudios, imagens, documentos e cópias de recuperação, contra consulta não autorizada. Antes do uso real, a operação deve demonstrar restauração autorizada e conferência de integridade após perda simulada.

#### Scenario: Condição de aceite FR-042

- **WHEN** a funcionalidade FR-042 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Proteger dados identificáveis e de saúde, incluindo textos livres, áudios, imagens, documentos e cópias de recuperação, contra consulta não autorizada. Antes do uso real, a operação deve demonstrar restauração autorizada e conferência de integridade após perda simulada.

## Jornadas e testes independentes preservados

As jornadas abaixo foram migradas sem alteração dos exemplos de aceite. Não indicam execução de testes ou aprovação de hipóteses.

### User Story 9 - Preservar sigilo, direitos e responsabilidade (Priority: P1)

Como responsável pela operação, mantenho cada participante no escopo autorizado e consigo identificar consultas, alterações e compartilhamentos.

**Why this priority**: É condição de funcionamento desde o primeiro caso real.

**Independent Test**: Realizar exercícios de acesso com usuários fictícios de papéis distintos e uma solicitação de acesso aos próprios dados.

**Acceptance Scenarios**:

1. Dado um profissional vinculado somente ao caso A, quando tentar consultar o caso B por qualquer caminho, então não obterá dados do caso B.
2. Dada a saída de um membro da equipe, quando o vínculo for encerrado, então o acesso será revogado e a autoria histórica dos registros será mantida.
3. Dada uma solicitação de exclusão, quando analisada, então terá resposta registrada; eventual guarda necessária terá fundamento e acesso limitado, em vez de eliminação indiscriminada.
4. Dado um rascunho produzido por assistência automática, quando alguém tentar publicá-lo, então será exigida revisão humana identificada.
