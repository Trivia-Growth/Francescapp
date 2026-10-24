# Spec Delta

## ADDED Requirements

### Requirement: Autoridade local atual prevalece sobre credenciais antigas

O sistema SHALL usar o único perfil vigente e os vínculos atuais para autorizar no servidor e banco. Revogar perfil, sessão ou vínculo SHALL impedir novas ações no respectivo escopo sem apagar autoria histórica. Permissão de agenda MUST NOT conferir acesso clínico. Fase Inicial; complementa FR-035 a FR-037/042 e os deltas da fundação real.

#### Scenario: Mudança de perfil durante sessão
- **WHEN** uma concessão administrativa for substituída por outro perfil
- **THEN** ações posteriores deixam de usar o privilégio antigo, inclusive com token emitido antes da alteração.

#### Scenario: Vínculo removido
- **WHEN** um não administrador perder vínculo com um paciente
- **THEN** novas consultas e alterações desse paciente são negadas no servidor e banco; autoria anterior é preservada.

#### Scenario: Rascunho não é carteira compartilhada
- **WHEN** um Administrador consultar a carteira que contém rascunho de outra pessoa
- **THEN** a abrangência administrativa não torna esse rascunho visível; prevalece a privacidade de FR-036.

### Requirement: Concessão administrativa inicial fora do acesso público

O primeiro acesso administrativo SHALL ser concedido por operação restrita, explícita e auditada sobre identidade previamente aprovada. Nenhum endpoint público ou primeiro login MUST poder escolher o primeiro Administrador. Repetir a operação MUST NOT recriar contas ou redefinir senha. Fase Inicial; complementa FR-035/037/039.

#### Scenario: Bootstrap sobre conta existente
- **WHEN** a operação restrita conceder administração à identidade técnica já aprovada
- **THEN** preserva seu identificador Auth e credencial, registra o responsável operacional e não amplia a exceção a outras contas.

#### Scenario: Tentativa pelo navegador
- **WHEN** um visitante tentar executar ou reproduzir o bootstrap pela API pública
- **THEN** nenhuma concessão é criada e nenhum segredo operacional é retornado.

### Requirement: Mudanças de acesso e consultas deixam evidência mínima

O sistema SHALL registrar autor, data, objeto, ação e resultado das operações protegidas, sem copiar senhas, tokens ou conteúdo clínico desnecessário. Alteração de acesso e sua auditoria SHALL ser indivisíveis. Somente responsáveis autorizados SHALL consultar a auditoria. Fase Inicial; complementa FR-037/039/042.

#### Scenario: Auditoria indisponível em alteração de acesso
- **WHEN** não for possível persistir a evidência obrigatória de uma concessão ou revogação
- **THEN** a alteração não é confirmada nem fica parcialmente concedida.

#### Scenario: Chamada direta não contorna a proteção de campo
- **WHEN** um cliente autenticado chamar uma RPC de escrita diretamente, sem o atestado de operação emitido pelo servidor após validar o DTO
- **THEN** a RPC rejeita a operação sem aceitar texto claro, ator/perfil autodeclarado ou envelope associado a outro registro.

#### Scenario: Consulta autorizada
- **WHEN** um participante consultar dados protegidos pela aplicação
- **THEN** a consulta registra identidade, escopo e resultado sem duplicar o conteúdo retornado na trilha operacional.

#### Scenario: Consulta indevida à auditoria
- **WHEN** um Profissional ou Familiar tentar ler ou alterar a trilha de auditoria
- **THEN** não obtém os eventos nem modifica o histórico, inclusive por acesso direto.

### Requirement: Concorrência e repetição não ampliam autorização

O sistema SHALL rejeitar alterações baseadas em versão desatualizada e conferir autorização novamente em repetições. Repetir a mesma operação identificada MUST NOT duplicar cadastros, concessões ou efeitos; reutilizar a identificação com conteúdo diferente SHALL ser conflito. Fase Inicial; complementa FR-001/037/039/042.

#### Scenario: Dois administradores editam a mesma concessão
- **WHEN** a segunda alteração se basear na versão anterior à primeira
- **THEN** recebe conflito e precisa recarregar a situação vigente, sem sobrescrever silenciosamente a primeira decisão.

#### Scenario: Repetição após revogação
- **WHEN** uma operação antes autorizada for repetida depois da perda de acesso
- **THEN** a repetição não retorna dados protegidos em cache nem restaura privilégios, mesmo com identificador de operação conhecido.
