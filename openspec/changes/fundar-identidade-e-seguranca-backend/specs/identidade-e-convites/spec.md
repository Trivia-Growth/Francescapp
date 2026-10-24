# Spec Delta

## ADDED Requirements

### Requirement: Identidade autenticada depende de concessão vigente

O sistema SHALL separar autenticação de autorização local. Uma conta Auth sem concessão válida MUST NOT obter perfil, carteira ou dados protegidos. A equipe SHALL usar identidade Workspace verificada e previamente cadastrada; informações editáveis pelo usuário não constituem concessão. Fase Inicial; complementa FR-035/037 e SC-007/011.

#### Scenario: Entrada da equipe previamente cadastrada
- **WHEN** uma identidade Workspace verificada corresponder a uma concessão prévia ativa
- **THEN** o sistema estabelece a sessão individual com seu único perfil vigente e somente os acessos correspondentes.

#### Scenario: Login sem concessão
- **WHEN** uma conta válida no provedor não possuir concessão local ativa
- **THEN** nenhum dado protegido é liberado; a pessoa recebe orientação para solicitar acesso sem conhecer a carteira.

#### Scenario: Pré-concessão revogada antes da primeira entrada
- **WHEN** um Administrador revogar por identificador uma pré-concessão ainda sem UUID Auth vinculado
- **THEN** a identidade correspondente não é admitida, a decisão é auditada e nenhuma conta é criada ou transferida.

#### Scenario: Tentativa de autopromoção
- **WHEN** o navegador enviar perfil, domínio ou identificação administrativa autodeclarados
- **THEN** esses valores não substituem a identidade verificada nem alteram a concessão persistida.

### Requirement: Exceção técnica de autenticação delimitada

O sistema SHALL admitir o acesso técnico por senha explicitamente autorizado somente para a identidade aprovada e com concessão local válida. A exceção MUST NOT habilitar senha para toda a equipe ou recriar a conta Auth já existente. Credenciais MUST NOT constar em specs, seeds ou logs. Fase Inicial; complementa FR-035/042 sem substituir o login Workspace da equipe.

#### Scenario: Identidade técnica autorizada
- **WHEN** a conta técnica aprovada autenticar e tiver concessão local ativa
- **THEN** utiliza seu perfil individual autorizado, com auditoria e os mesmos controles de sessão das demais contas.

#### Scenario: Outra conta tenta usar a exceção
- **WHEN** outra conta da equipe tentar entrar por senha sem exceção explícita
- **THEN** a entrada no produto é negada mesmo que o provedor aceite a senha.

### Requirement: Sessão e falhas de identidade verificáveis

O sistema SHALL verificar sessão e autorização vigentes nas operações protegidas. Logout, revogação e falhas do provedor SHALL ter resultado explícito; JWT antigo MUST NOT restaurar acesso revogado. Configuração ausente MUST NOT gerar login simulado ou sucesso fictício. Fase Inicial; complementa FR-035/037/042 e SC-011/012.

#### Scenario: Revogação com token ainda válido
- **WHEN** uma conta perder sua concessão e reutilizar um token ainda não expirado
- **THEN** as novas operações protegidas são negadas, sem aguardar a expiração do token para aplicar a revogação local.

#### Scenario: Admissão concorre com revogação
- **WHEN** a primeira entrada válida e a revogação da mesma concessão forem processadas concorrentemente
- **THEN** a operação ordenada por último observa o estado vigente e nenhuma sessão permanece utilizável após a revogação confirmada.

#### Scenario: Logout e indisponibilidade externa
- **WHEN** a sessão local for encerrada e o encerramento no provedor falhar
- **THEN** a sessão local continua bloqueada e a pendência externa é informada sem reabrir o acesso.

#### Scenario: Configuração obrigatória ausente
- **WHEN** uma entrada depender de configuração de identidade indisponível
- **THEN** retorna indisponibilidade identificável, sem sessão simulada, dados de exemplo ou exposição de segredos.
