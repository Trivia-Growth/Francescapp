# Spec Delta

## Purpose

Permitir feedback sobre uma demonstração local com pessoas fictícias persistidas, sem representar o acesso institucional de produção.

## ADDED Requirements

### Requirement: Acesso local protegido
A demonstração SHALL exigir autenticação conferida pelo servidor antes de consultar ou gravar cadastros fictícios, e operar somente localmente.

#### Scenario: Entrada válida
- **WHEN** a senha local configurada for informada corretamente
- **THEN** a sessão permite consultar e cadastrar pessoas fictícias.

#### Scenario: Acesso não autorizado ou sessão encerrada
- **WHEN** uma requisição protegida não tiver sessão válida, inclusive após saída
- **THEN** o servidor nega acesso aos dados e às alterações.

#### Scenario: Senha incorreta
- **WHEN** a senha informada estiver incorreta
- **THEN** a entrada é negada sem expor os cadastros.

### Requirement: Cadastro fictício persistente
A demonstração SHALL permitir criar e listar pessoas fictícias, preservando cadastros válidos entre reinícios locais.

#### Scenario: Cadastro e reinício
- **WHEN** uma pessoa fictícia com nome válido for cadastrada e o serviço reiniciado
- **THEN** o cadastro aparece na consulta após nova autenticação.

#### Scenario: Entrada inválida ou falha de gravação
- **WHEN** o nome obrigatório estiver ausente ou a gravação falhar
- **THEN** o cadastro não é apresentado como concluído e a falha é comunicada.

### Requirement: Limite da demonstração
A interface SHALL identificar o uso exclusivo de dados fictícios e não representar a demonstração como sistema de produção conectado.

#### Scenario: Uso da demonstração
- **WHEN** alguém acessa a demonstração
- **THEN** encontra aviso de que somente dados fictícios são permitidos.

### Requirement: Relato fictício local por paciente
A demonstração SHALL permitir revisar e guardar relatos fictícios por paciente no armazenamento local, sem representar envio à equipe ou publicação.

#### Scenario: Guardar e consultar após reinício
- **WHEN** um relato fictício válido for guardado para um paciente e o serviço reiniciado
- **THEN** o relato permanece disponível na prévia daquele paciente após autenticação.

#### Scenario: Conflito ou falha ao guardar
- **WHEN** ocorrer conflito de revisão ou falha na gravação
- **THEN** a interface não afirma sucesso e mantém o rascunho para conferência.

### Requirement: Revisão local de objetivos fictícios
A demonstração SHALL permitir revisar objetivos fictícios por paciente, mantendo versões anteriores e motivo da alteração no armazenamento local.

#### Scenario: Revisar e consultar
- **WHEN** um objetivo fictício é revisado com motivo válido
- **THEN** a versão atual e as anteriores ficam disponíveis para o mesmo paciente.

#### Scenario: Conflito ou falha
- **WHEN** houver conflito ou falha na gravação
- **THEN** a interface não afirma sucesso e preserva o rascunho para conferência.


### Requirement: Agenda geral fictícia
A demonstração SHALL reunir compromissos locais de todos os pacientes fictícios autenticados, sem integração com Google Agenda.

#### Scenario: Consultar e abrir agenda individual
- **WHEN** a pessoa abre a agenda geral
- **THEN** vê data, horário, paciente, descrição e situação de cada compromisso, e pode abrir a agenda do paciente.

#### Scenario: Agenda vazia ou indisponível
- **WHEN** não há compromissos ou ocorre falha na leitura
- **THEN** a interface apresenta o estado correspondente sem afirmar que a consulta foi concluída em caso de erro.

### Requirement: Anexos fictícios locais
A demonstração SHALL permitir anexar, listar e baixar arquivos fictícios por paciente, sem representar integração com Drive ou armazenamento de produção.

#### Scenario: Guardar e consultar
- **WHEN** um arquivo fictício permitido for anexado ao paciente
- **THEN** uma sessão local válida poderá listá-lo e baixá-lo para aquele paciente.

#### Scenario: Acesso sem sessão ou em outro paciente
- **WHEN** uma requisição não possuir sessão válida ou solicitar o anexo em outro paciente
- **THEN** o servidor negará o acesso.
