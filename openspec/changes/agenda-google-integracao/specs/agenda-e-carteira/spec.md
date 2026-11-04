# Spec Delta

## ADDED Requirements

### Requirement: Operações de agenda exigem autorização vigente
O sistema SHALL consultar, criar, alterar e cancelar compromissos somente nas agendas autorizadas, mantendo consulta e edição global separadas e autoria individual. Permissão de agenda MUST NOT conceder acesso clínico. Fase Inicial; complementa FR-023/049 e FR-037.

#### Scenario: Consulta global sem edição
- **WHEN** pessoa com consulta global vigente, sem edição, tenta criar, alterar ou cancelar inclusive por acesso direto
- **THEN** a consulta autorizada permanece disponível e a escrita é negada.

#### Scenario: Revogação de edição
- **WHEN** a edição global é revogada mantendo consulta
- **THEN** novas escritas são negadas e a consulta ainda autorizada permanece disponível.

#### Scenario: Sem consulta global
- **WHEN** pessoa sem consulta global tenta acessar compromisso global diretamente
- **THEN** não recebe os dados nem pode alterá-los.

### Requirement: Resultado da escrita depende da origem
O sistema SHALL identificar origem e autoria e informar sucesso de criação, alteração ou cancelamento somente após confirmação Google. Falha ou resultado incerto SHALL ser apresentados, sem sucesso presumido ou duplicação automática. Fase Inicial; complementa FR-025/049/050 e SC-011.

#### Scenario: Escrita confirmada
- **WHEN** pessoa com escrita vigente realiza operação autorizada e Google confirma
- **THEN** o sistema informa confirmação, origem e autoria individual.

#### Scenario: Resposta incerta
- **WHEN** uma escrita não recebe confirmação
- **THEN** o sistema informa falha ou pendência e não afirma que a operação ocorreu; nova tentativa exige conferir estado externo e permissão vigente.
