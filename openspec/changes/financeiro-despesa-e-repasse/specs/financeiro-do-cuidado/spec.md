# Spec Delta

## Purpose

Controlar o financeiro do acompanhamento sem misturá-lo ao conteúdo de saúde: valor acordado de repasse por profissional, apuração do repasse a partir do turno realizado, despesa com autorização e comprovante, e uma audiência própria que não decorre do vínculo de cuidado. O produto registra e apura; não paga, não calcula obrigação trabalhista e não precifica serviço.

## ADDED Requirements

### Requirement: FR-068 — Registrar valor acordado de repasse por profissional com vigência

**Fase de origem**: Evolução.

O produto SHALL permitir que Administrador ou perfil financeiro registre o valor acordado de repasse de um profissional, com período de vigência, autor e data. A alteração do valor SHALL criar nova vigência e NÃO SHALL alterar períodos já apurados. O valor SHALL ser dado da instituição sobre a pessoa, não um campo do cadastro de usuário exposto ao próprio profissional.

#### Scenario: Valor acordado registrado
- **WHEN** Administrador ou perfil financeiro registra valor acordado fictício para profissional fictício, com início de vigência
- **THEN** o valor é persistido com profissional, vigência, autor e data, e passa a valer para as apurações do período

#### Scenario: Alteração cria nova vigência
- **WHEN** o valor acordado de um profissional é alterado
- **THEN** a vigência anterior permanece consultável com autor, data e motivo, e as apurações já realizadas continuam referenciando o valor vigente à época

#### Scenario: Profissional não consulta o próprio valor
- **WHEN** profissional sem perfil financeiro consulta seu cadastro, sua escala ou seus turnos, inclusive por acesso direto ao servidor ou ao banco
- **THEN** nenhum valor acordado é retornado, e a ausência não revela a existência do registro

#### Scenario: Familiar não acessa valores
- **WHEN** familiar autenticado, com ou sem fundamento de autorização no caso, tenta consultar valores
- **THEN** a operação é negada no servidor e no banco, independentemente do que a interface apresenta

#### Scenario: Vigência sobreposta é recusada
- **WHEN** um valor é registrado com vigência que se sobrepõe a uma vigência existente do mesmo profissional
- **THEN** o registro é recusado e nenhuma vigência é criada, para que a apuração nunca encontre dois valores aplicáveis

#### Scenario: Auditoria do valor acordado
- **WHEN** um valor acordado é criado, consultado, alterado ou exportado
- **THEN** o evento é registrado com identidade, ação e instante, conforme FR-039

### Requirement: FR-069 — Registrar despesa do cuidado com autorização, comprovante e responsável

**Fase de origem**: Evolução.

O produto SHALL permitir que Administrador ou perfil financeiro registre despesa relacionada ao cuidado com descrição, valor, data, responsável pelo gasto, autorização aplicável e comprovante anexado. O comprovante SHALL ser guardado em repositório privado sujeito à autorização aplicável, nunca público. Despesa SHALL ser dado financeiro: a sua audiência NÃO SHALL decorrer do vínculo de cuidado nem do fundamento de autorização de saúde do caso.

#### Scenario: Despesa registrada com comprovante
- **WHEN** perfil financeiro registra despesa fictícia com descrição, valor, data, responsável e comprovante
- **THEN** a despesa é persistida com autor e data, e o comprovante fica acessível somente pela audiência financeira

#### Scenario: Despesa sem autorização registrada é recusada
- **WHEN** a despesa é enviada sem a autorização aplicável
- **THEN** o registro é recusado e nada é persistido

#### Scenario: Comprovante não é público
- **WHEN** alguém tenta obter o comprovante por endereço direto, sem audiência financeira vigente
- **THEN** o acesso é negado, nenhuma URL pública ou assinada de longa duração é emitida, e a tentativa é auditada

#### Scenario: Audiência de cuidado não alcança despesa
- **WHEN** profissional com vínculo ativo no caso, ou familiar com fundamento de autorização vigente, consulta as despesas do caso
- **THEN** a operação é negada, e o acesso ao conteúdo de saúde não concede acesso ao financeiro

#### Scenario: Retificação preserva o lançamento original
- **WHEN** uma despesa registrada é retificada com motivo
- **THEN** o lançamento original permanece consultável com autor e data, e nada é apagado

#### Scenario: Falha de persistência na despesa
- **WHEN** o registro da despesa ou do comprovante não é confirmado
- **THEN** a interface informa falha, não apresenta sucesso e não oferece repetição silenciosa que duplique o lançamento

### Requirement: FR-070 — Apurar repasse a partir do turno encerrado, referenciando turno e valor vigente

**Fase de origem**: Evolução.

O produto SHALL apurar o repasse de um profissional em um período a partir dos turnos encerrados de FR-055, aplicando o valor acordado vigente na data de cada turno. Cada linha de apuração SHALL referenciar o turno que a originou e a vigência de valor aplicada, de modo que a conta seja reconstituível. A apuração SHALL ser derivada dos registros existentes e NÃO SHALL alterar, encerrar ou criar turno.

#### Scenario: Repasse apurado por período
- **WHEN** perfil financeiro apura o repasse de um profissional fictício em um período com turnos encerrados
- **THEN** cada turno encerrado gera uma linha referenciando o turno e a vigência de valor aplicada, e o total do período é apresentado

#### Scenario: Valor alterado no meio do período
- **WHEN** o valor acordado muda dentro do período apurado
- **THEN** cada turno é apurado pelo valor vigente na sua data, sem retroagir sobre os turnos anteriores

#### Scenario: Apuração não altera o turno
- **WHEN** a apuração é executada
- **THEN** nenhum turno é criado, alterado ou encerrado, e a execução do cuidado permanece intacta

#### Scenario: Turno sem valor vigente
- **WHEN** existe turno encerrado de profissional sem valor acordado vigente naquela data
- **THEN** a linha é apresentada como pendente de valor, com o turno identificado, e não recebe valor presumido

#### Scenario: Período sem turno encerrado
- **WHEN** a apuração é consultada para período sem turno encerrado
- **THEN** o estado vazio é apresentado após consulta real bem-sucedida, sem dados de exemplo e sem confundir vazio com falha

#### Scenario: Apuração restrita à audiência financeira
- **WHEN** profissional sem perfil financeiro, inclusive o próprio profissional apurado, ou familiar consulta a apuração, inclusive por acesso direto ao servidor ou ao banco
- **THEN** a operação é negada e nenhum valor é exposto na resposta

#### Scenario: Apuração não expõe conteúdo de saúde
- **WHEN** a apuração é apresentada ou exportada
- **THEN** ela contém turno, data, profissional e valor, e NÃO SHALL conter passagem, aferição, medicação, rotina, ocorrência ou qualquer conteúdo clínico do turno

#### Scenario: Retificação de turno reflete na apuração
- **WHEN** um turno encerrado é retificado após a apuração
- **THEN** a apuração seguinte reflete a retificação, e o histórico da apuração anterior permanece consultável com a sua data

#### Scenario: Auditoria da apuração
- **WHEN** uma apuração é executada, consultada ou exportada
- **THEN** o evento é registrado com identidade, ação, período e instante, conforme FR-039
