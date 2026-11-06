# Spec Delta

## ADDED Requirements

### Requirement: Áudio original excluído após revisão confirmada

O sistema SHALL permitir ouvir o áudio enquanto a transcrição estiver em revisão e solicitar sua exclusão após a confirmação humana da revisão. A exclusão SHALL preservar texto revisado, autoria e histórico do registro. Apenas gerar ou salvar rascunho MUST NOT disparar exclusão por revisão. Fase Inicial; complementa FR-010/012/042. Confirmado em 16/10/2026.

#### Scenario: Transcrição ainda em revisão
- **WHEN** o autor abrir um rascunho transcrito ainda não confirmado
- **THEN** pode ouvir o original e corrigir o texto, respeitadas suas permissões; a transcrição automática não conta como revisão concluída.

#### Scenario: Revisão humana confirmada
- **WHEN** o autor confirmar a revisão e o texto revisado for salvo
- **THEN** o sistema solicita exclusão do original sob seu controle e mantém o texto e a evidência da revisão, sem prometer reprodução futura do áudio apagado.

### Requirement: Exclusão de áudio tem estado verificável e repetição segura

O sistema SHALL distinguir exclusão pendente, confirmada e falha. Indisponibilidade do armazenamento MUST NOT ser apresentada como exclusão concluída. Repetir a exclusão SHALL ser seguro e não apagar outros anexos. Limitações do Drive, de cópias de recuperação e do processador SHALL ser informadas antes do uso real, sem prometer eliminação fora do controle da aplicação. Fase Inicial; complementa FR-010/039/042/050.

#### Scenario: Falha ao excluir após revisão
- **WHEN** a revisão estiver salva e a exclusão do original não puder ser confirmada
- **THEN** o texto continua salvo e a exclusão fica pendente com erro e ação de regularização; o sistema não informa descarte concluído.

#### Scenario: Repetir exclusão confirmada
- **WHEN** a exclusão confirmada for repetida para o mesmo áudio
- **THEN** nenhum outro arquivo é removido e o resultado continua identificável sem duplicar a revisão ou publicação.

### Requirement: Áudio abandonado e fornecedor
Áudio abandonado SHALL ter prazo de 30 dias com aviso. O fornecedor e sua política SHALL ser definidos antes do uso real. Fase Inicial; complementa FR-010/012.

#### Scenario: Áudio abandonado
- **WHEN** um áudio permanecer abandonado
- **THEN** aplica-se o prazo de 30 dias com aviso.
