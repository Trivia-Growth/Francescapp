# Spec Delta

## Purpose

Permitir que administração cadastre credenciais de integrações pela aplicação sem expor novamente os valores cadastrados, fase Inicial do objetivo noturno.

## ADDED Requirements

### Requirement: Cadastro administrativo somente escrita
O sistema SHALL permitir somente Administrador com sessão vigente cadastrar os quatro segredos aprovados no Vault. Valores MUST NOT aparecer em leitura, resposta, tela após envio, log ou auditoria.

#### Scenario: Administrador cadastra
- **WHEN** Administrador envia segredo válido de chave do catálogo
- **THEN** valor é guardado e resposta contém somente presença, versão, autoria e instante

#### Scenario: Perfis não administrativos ou sessão revogada
- **WHEN** Profissional, Família, anônimo ou sessão revogada tenta consultar ou gravar, inclusive diretamente no banco
- **THEN** acesso é negado sem devolver valor ou alterar versão

#### Scenario: Chave ou entrada inválida
- **WHEN** entrada contém chave não aprovada, corpo excessivo ou valor vazio
- **THEN** operação é recusada sem persistência

### Requirement: Substituição preserva versões
O sistema SHALL criar nova versão a cada substituição aceita, preservando valor anterior no Vault e mantendo leitura server-only vigente pelo nome canônico. Escritas concorrentes MUST validar versão esperada.

#### Scenario: Segunda versão
- **WHEN** Administrador substitui segredo cadastrado com versão esperada atual
- **THEN** nova versão torna-se vigente, anterior permanece armazenada e metadados identificam nova autoria e instante

#### Scenario: Concorrência ou replay
- **WHEN** versão esperada está obsoleta ou pedido confirmado é repetido
- **THEN** conflito não altera segredo e replay idêntico não cria versão adicional

#### Scenario: Segredo preexistente
- **WHEN** existe segredo canônico criado antes da tela
- **THEN** tela informa cadastrado sem inventar autoria e substituição preserva registro anterior

#### Scenario: Resposta perdida durante cadastro
- **WHEN** envio está em curso ou seu resultado não pôde ser confirmado
- **THEN** tela MUST NOT permitir outra escrita com os metadados antigos; durante envio a recarga fica bloqueada, e após falha exige recarregar metadados antes de nova tentativa, sem guardar ou reenviar o valor
