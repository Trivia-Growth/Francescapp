# Spec Delta

## ADDED Requirements

### Requirement: Guarda e canais institucionais de anexos

O produto SHALL guardar anexos no Drive compartilhado institucional e vincular cada documento ao paciente, classificação e audiência aplicáveis. Familiares SHALL acessar somente pelo app; participantes institucionais autorizados poderão acessar também pelo Drive. Fase Inicial; complementa FR-029 a FR-031 e SC-007/010.

#### Scenario: Anexo autorizado
- **WHEN** um anexo é concluído com classificação e audiência confirmadas
- **THEN** ele é vinculado ao paciente e guardado no Drive compartilhado institucional configurado.

#### Scenario: Drive indisponível
- **WHEN** o Drive configurado estiver ausente ou inacessível
- **THEN** o produto informa falha ou configuração pendente e não substitui silenciosamente o local de guarda.

#### Scenario: Família autorizada
- **WHEN** familiar autorizado acessa documento disponível
- **THEN** o acesso ocorre pelo app sem compartilhamento direto da pasta institucional.

#### Scenario: Revogação
- **WHEN** acesso aplicável é revogado
- **THEN** o app e o compartilhamento gerido pelo projeto deixam de conceder acesso, sem prometer recolher cópias já obtidas.

#### Scenario: Conteúdo preexistente
- **WHEN** o Drive contém documentos institucionais preexistentes
- **THEN** eles não são automaticamente publicados em pacientes nem incluídos na limpeza de testes.
