# Spec Delta

## ADDED Requirements

### Requirement: Cadastro mínimo do paciente sem CPF obrigatório

O sistema SHALL permitir cadastro do paciente com nome obrigatório; nome de preferência, nascimento e contatos SHALL ser opcionais. Não SHALL exigir CPF, familiar ou anamnese completa para salvar esse cadastro mínimo. Campos opcionais informados SHALL ser validados e protegidos. Fase Inicial; complementa FR-001/002 e SC-002/007/009. Confirmado em 16/10/2026.

#### Scenario: Cadastro somente com nome
- **WHEN** um Administrador cadastrar paciente com nome válido e sem os campos opcionais
- **THEN** o cadastro é persistido e identificado de forma estável, sem exigir CPF ou preenchimento clínico fictício.

#### Scenario: Nome vazio
- **WHEN** o cadastro não contiver nome ou informar somente espaços
- **THEN** a operação é rejeitada com indicação do campo, sem criar paciente parcial.

#### Scenario: Campos opcionais ausentes
- **WHEN** o cadastro for consultado sem nascimento ou contato informado
- **THEN** apresenta ausência de informação, sem inventar data, idade ou meio de contato.

### Requirement: Relação pessoal não é concessão de acesso

Familiares e responsáveis SHALL ser vinculados separadamente ao paciente. Registrar relação, responsabilidade ou contato MUST NOT criar conta, perfil ou acesso ao caso. O acesso de Profissional ou Família SHALL depender de concessão e vínculo de acesso vigentes, distintos dessas relações. Fase Inicial; complementa FR-002/035/037/051 e SC-007/011.

#### Scenario: Responsável sem conta
- **WHEN** um Administrador registrar uma pessoa como responsável de paciente sem convidá-la ao produto
- **THEN** a relação fica registrada sem conta Auth ou acesso automático.

#### Scenario: Vínculo de acesso revogado
- **WHEN** um familiar mantiver relação com o paciente mas perder seu vínculo de acesso
- **THEN** a relação continua documentada e o caso permanece inacessível a essa conta.

#### Scenario: Pacientes autorizados e não autorizados
- **WHEN** um não administrador vinculado ao paciente A consultar a carteira ou o identificador do paciente B
- **THEN** não recebe cadastro, contatos ou metadados protegidos do paciente B.

### Requirement: Identificador estável não equivale a deduplicação clínica

O sistema SHALL distinguir pacientes por identificador próprio, sem usar nome, data de nascimento ou CPF como chave de identidade. Coincidência de nome MUST NOT mesclar históricos nem restaurar acessos. Fase Inicial; complementa FR-001/002 e o histórico contínuo aprovado; regras de resolução de duplicidade continuam a definir.

#### Scenario: Homônimos
- **WHEN** dois cadastros distintos tiverem o mesmo nome
- **THEN** mantêm identificadores, históricos e vínculos separados; o sistema não os funde automaticamente.
