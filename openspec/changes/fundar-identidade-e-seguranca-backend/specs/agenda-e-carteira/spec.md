# Spec Delta

## ADDED Requirements

### Requirement: Primeira agenda inclui criação e cancelamento

O sistema SHALL permitir criar e cancelar compromissos, além de consultar e alterar os existentes, nas agendas com autorização de escrita vigente. SHALL registrar origem e autor individual, sem ampliar acesso clínico por permissão de calendário. Fase Inicial; complementa FR-023/024/037/049. Confirmado em 16/10/2026; resolve a pendência sobre essas duas operações, não as regras de séries ou conflitos.

#### Scenario: Criar compromisso autorizado
- **WHEN** uma pessoa com permissão vigente de escrita criar um compromisso numa agenda autorizada
- **THEN** o compromisso é criado na agenda Google escolhida e o sistema identifica origem, autoria e confirmação externa.

#### Scenario: Cancelar compromisso autorizado
- **WHEN** uma pessoa com permissão vigente cancelar um compromisso autorizado
- **THEN** o cancelamento é refletido na origem, mantendo a evidência operacional sem confundir cancelamento com falta.

#### Scenario: Consulta global sem escrita
- **WHEN** uma pessoa com consulta mas sem edição global tentar criar, alterar ou cancelar na agenda global
- **THEN** a operação é negada no servidor, mesmo que o controle da interface seja contornado.

### Requirement: Escrita da agenda não produz sucesso presumido

O sistema SHALL apresentar confirmação, falha ou resultado pendente nas operações de escrita da agenda. Resposta incerta do Google MUST NOT gerar duplicação automática de compromisso ou cancelamento fictício. Novas tentativas SHALL conferir estado externo e permissão vigente. Fase Inicial; complementa FR-025/049/050 e SC-011.

#### Scenario: Resposta perdida na criação
- **WHEN** uma criação enviada ao Google não tiver resposta conclusiva
- **THEN** o sistema sinaliza confirmação pendente e reconcilia a operação antes de repeti-la, sem declarar sucesso nem criar duplicata por tentativa cega.

#### Scenario: Permissão removida durante pendência
- **WHEN** uma escrita pendente for retomada após a remoção da autorização
- **THEN** a nova tentativa de escrita é negada; a regularização informa o estado sem restaurar o privilégio revogado.
