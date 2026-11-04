# Spec Delta

## ADDED Requirements

### Requirement: Preparação de armazenamento privado do relato (FR-008 e FR-012, fase Inicial)

A estrutura de rascunho textual SHALL manter conteúdo cifrado associado a paciente e autor, sem conceder acesso de aplicação antes da autorização por identidade, vínculo e audiência ser implementada e verificada.

#### Scenario: Acesso direto não habilitado
- **WHEN** papéis de aplicação tentam acessar a estrutura preparada
- **THEN** o acesso é negado; a existência da estrutura não publica o relato nem comprova autorização.

#### Scenario: Vínculo revogado
- **WHEN** uma futura operação autorizada verifica vínculo revogado
- **THEN** ela nega acesso, ainda que exista rascunho anterior.
