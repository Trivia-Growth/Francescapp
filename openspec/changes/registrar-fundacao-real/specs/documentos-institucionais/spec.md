# Spec Delta

## ADDED Requirements

### Requirement: Guarda em Drive compartilhado institucional

Anexos do produto SHALL ser guardados no Google Drive compartilhado institucional da Francescato, classificados e vinculados ao paciente. A escolha MUST NOT ser substituída silenciosamente por Meu Drive pessoal ou institucional. Identificação do Drive, raiz e organização interna ainda serão definidas. Fase Inicial; complementa FR-029/030.

#### Scenario: Anexo confirmado na origem institucional

- **WHEN** um envio autorizado de anexo for concluído e confirmado pela integração
- **THEN** o arquivo está no Drive compartilhado configurado, com vínculo, classificação e audiência aplicáveis, sem depender da guarda pessoal do remetente.

#### Scenario: Drive compartilhado ausente ou inacessível

- **WHEN** o local institucional não estiver configurado ou o acesso for recusado
- **THEN** o app informa configuração pendente ou falha real e não salva em Meu Drive ou em outro local como substituição silenciosa.

#### Scenario: Conteúdo institucional anterior ao produto

- **WHEN** o Drive compartilhado contiver documentos institucionais preexistentes
- **THEN** compartilhar o local de guarda não publica automaticamente esses documentos nos pacientes nem os inclui no alcance da limpeza de testes.

### Requirement: Canais autorizados de acesso aos documentos

Participantes institucionais da Francescato SHALL poder consultar documentos pelo app e diretamente pelo Drive conforme suas autorizações. Familiares SHALL utilizar somente o app; o vínculo familiar MUST NOT conceder acesso direto ao Drive. Os canais SHALL respeitar a audiência e a revogação aplicáveis. Fase Inicial; complementa FR-029 a FR-031 e SC-007/SC-010.

#### Scenario: Acesso institucional pelos dois canais

- **WHEN** um participante institucional autorizado consultar um documento pelo app ou pelo Drive
- **THEN** pode acessar somente o conteúdo permitido para sua atuação e audiência; acesso institucional não equivale a liberação indiscriminada de todos os pacientes.

#### Scenario: Familiar consulta seu anexo pelo app

- **WHEN** um familiar autorizado abrir um documento disponibilizado no seu caso
- **THEN** consulta ou obtém o arquivo pela jornada do app, sem precisar entrar no Drive nem receber compartilhamento direto da pasta institucional.

#### Scenario: Vínculo familiar sem compartilhamento direto

- **WHEN** o familiar for convidado ou receber acesso a um documento no app
- **THEN** essa concessão não cria acesso direto ao Drive; não oferece a navegação pelo Drive como alternativa ao portal.

#### Scenario: Revogação nos canais aplicáveis

- **WHEN** a autorização de documento de um participante for revogada
- **THEN** o sistema e o compartilhamento Drive gerido pelo projeto deixam de conceder esse acesso, conforme FR-031, sem prometer recolher cópias já obtidas.

#### Scenario: Arquivo indisponível

- **WHEN** o Drive recusar o arquivo ou ele estiver indisponível
- **THEN** o app informa a falha ou indisponibilidade real e não entrega arquivo fictício, link público ou documento de outro paciente como substituição.
