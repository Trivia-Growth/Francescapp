# Spec Delta

## MODIFIED Requirements

### Requirement: FR-035 — Permitir entrada com conta individual ativa do Google Workspace da

**Fase de origem**: Inicial. **Decisão aplicável**: DF-023, 18/11/2026.

O produto SHALL permitir entrada individual pelo Google Workspace institucional ou por login interno previamente criado por Administrador. O método aprovado, a função ativa, a sessão e as autorizações por caso, finalidade e audiência SHALL ser conferidos no servidor e no banco. Identidade Google ou função genérica não concede carteira.

#### Scenario: Condição de aceite FR-035

- **WHEN** uma pessoa previamente cadastrada entrar com o método autorizado
- **THEN** o sistema SHALL identificá-la individualmente e permitir somente os casos e ações atribuídos, inclusive para login interno.

#### Scenario: Conta sem cadastro ou método divergente

- **WHEN** uma conta Google não aprovada, domínio externo ou login por método não autorizado tentar entrar
- **THEN** o sistema SHALL negar admissão sem criar conta de negócio ou acesso por inferência.

#### Scenario: Revogação e outro caso

- **WHEN** uma sessão válida tentar acessar caso sem vínculo ativo ou cuja autorização foi revogada
- **THEN** o sistema SHALL negar conteúdo e metadados protegidos, por acesso direto e pelo servidor, independentemente do método de login.

### Requirement: FR-052 — Permitir ao familiar definir sua própria senha após validar o

**Fase de origem**: Inicial. **Decisão aplicável**: DF-023, 18/11/2026.

O produto SHALL preservar definição de senha após convite familiar e permitir, alternativamente, conta interna com senha inicial criada por Administrador. Autenticação e ativação não concedem vínculo de caso. A equipe também SHALL poder usar conta interna previamente autorizada; Google institucional permanece disponível conforme o método aprovado.

#### Scenario: Condição de aceite FR-052

- **WHEN** o familiar concluir convite válido ou entrar com conta interna previamente criada
- **THEN** o sistema SHALL admitir somente a identidade autorizada e exibir apenas os casos com vínculo válido; sem vínculo, SHALL exibir carteira vazia.

## ADDED Requirements

### Requirement: Administração de contas com quatro funções

O produto SHALL permitir somente ao Administrador criar e consultar acessos com nome, e-mail de login, método e uma função: Administrador, Case Manager, Familiar ou Profissional. Senha SHALL ser exigida somente para conta interna. Criar conta SHALL manter responsável, data e motivo, sem atribuir vínculos ou habilitação clínica automaticamente.

#### Scenario: Criação administrativa

- **WHEN** Administrador vigente cadastrar dados válidos de pessoa fictícia
- **THEN** o sistema SHALL confirmar o estado persistido e permitir consultar nome, login, função e método sem senha.

#### Scenario: Negação nos dois limites

- **WHEN** Profissional, Familiar, Case Manager sem administração, sessão expirada ou ator revogado tentar criar ou listar contas
- **THEN** servidor e banco SHALL negar a operação, inclusive chamada direta e repetição de operação antiga.

#### Scenario: Case Manager não recebe acesso global

- **WHEN** uma conta com função Case Manager for criada
- **THEN** a conta SHALL permanecer sem acesso a casos não atribuídos; aprovações SHALL exigir responsabilidade no caso, vínculo e habilitação aplicável conforme DF-021.

### Requirement: Senha sem superfície de leitura

O produto SHALL encaminhar senha inicial somente ao serviço nativo de autenticação, por transporte seguro e memória transitória. Senha SHALL estar ausente de persistência de negócio, logs, auditoria, recibos, consultas, armazenamento do navegador e repetição automática. Dados administrativos SHALL estar restritos ao Administrador.

#### Scenario: Consulta após criação

- **WHEN** qualquer consulta, erro, recibo ou auditoria for produzido após cadastro interno
- **THEN** a resposta SHALL omitir a senha e seus derivados reutilizáveis; o formulário SHALL limpar o valor antes do envio.

#### Scenario: Confirmação do e-mail da conta interna

- **WHEN** uma conta interna nova ainda não tiver endereço confirmado
- **THEN** o destinatário SHALL poder validar código nativo enviado ao endereço antes do login por senha; código e sessão de confirmação SHALL permanecer fora de logs, persistência de negócio e sessão da aplicação, sem criar conta ou acesso por solicitação pública.

### Requirement: Provisionamento com resultado recuperável

O produto SHALL distinguir reservado, pendente, confirmado, conflito, recusa definitiva e resultado incerto. Repetição SHALL consultar a operação aprovada, sem criar nova identidade, redefinir senha ou adotar conta existente pelo e-mail. Falha parcial SHALL manter acesso de negócio fechado até confirmação reautorizada.

#### Scenario: Resposta perdida do provedor

- **WHEN** a criação no provedor tiver resultado desconhecido
- **THEN** o sistema SHALL mostrar pendência e permitir conferência pelo identificador da operação sem reenviar senha ou declarar criação concluída.

#### Scenario: Colisão de identidade

- **WHEN** o login informado já pertencer a identidade não pertencente à operação
- **THEN** o sistema SHALL indicar conflito sem sobrescrever senha, fundir identidades ou alterar acesso existente.

#### Scenario: Senha recusada definitivamente pelo provedor

- **WHEN** o provedor confirmar recusa de senha e a ausência da identidade reservada for conferida
- **THEN** a operação SHALL terminar como falha confirmada sem criar conta; o Administrador SHALL poder iniciar novo cadastro manual com senha novamente digitada, preservando a operação anterior e sem repetir criação automaticamente. Timeout ou resultado desconhecido SHALL continuar pendente.
