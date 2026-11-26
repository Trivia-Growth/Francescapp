## MODIFIED Requirements

### Requirement: FR-024 — Registrar realizado, faltou, cancelado, remarcado ou realização não confirmada, com

**Fase de origem**: Inicial.

Registrar realizado, faltou, cancelado, remarcado ou realização não confirmada, com motivo
e vínculo entre datas. Deve distinguir falta de cancelamento e de ausência de confirmação.

Conforme a decisão de 19/11/2026, a situação SHALL ser registrada em tabela local própria
chaveada pelo identificador do evento; o compromisso permanece no Google Calendar e o
produto não assume sua propriedade. As situações registráveis SHALL ser exatamente
`realizado`, `faltou`, `cancelado` e `remarcado`. `realizacao_nao_confirmada` SHALL ser
estado derivado de compromisso já passado sem registro e NÃO SHALL ser gravável.
O motivo SHALL vir de catálogo fechado de barreiras — transporte, custo, disponibilidade e
outras — que NÃO SHALL produzir nem insinuar diagnóstico de risco; texto livre adicional é
opcional e cifrado. A remarcação SHALL nomear o evento de destino, relacionando o
compromisso original à nova data. O registro NÃO SHALL revelar o paciente vinculado ao
compromisso.

#### Scenario: Condição de aceite FR-024

- **WHEN** a funcionalidade FR-024 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar realizado, faltou, cancelado, remarcado ou realização não confirmada, com motivo e vínculo entre datas. Deve distinguir falta de cancelamento e de ausência de confirmação.

#### Scenario: Dono da agenda registra realizado, faltou, cancelado e remarcado

- **WHEN** o profissional dono daquela agenda individual, com concessão vigente e sessão
  válida, registra a situação de um compromisso seu, informando motivo de catálogo quando
  a situação for falta
- **THEN** o sistema SHALL gravar o registro com autor, instante, versão e auditoria na
  mesma transação, e SHALL recusar falta sem motivo

#### Scenario: Compromisso passado sem registro não é contado como falta

- **WHEN** um compromisso já terminou e nenhuma situação foi registrada para ele
- **THEN** o sistema SHALL apresentá-lo como realização não confirmada e NÃO SHALL
  apresentá-lo, contá-lo ou gravá-lo como falta

#### Scenario: Remarcação relaciona o compromisso original à nova data

- **WHEN** a situação registrada é remarcado, com evento de destino
- **THEN** a consulta SHALL relacionar original e destino nas duas direções, e o banco
  SHALL recusar remarcação sem destino, destino apontando para o próprio evento e
  destino informado em situação que não seja remarcação

#### Scenario: Retificação preserva o registro anterior

- **WHEN** a situação de um compromisso já registrado é corrigida
- **THEN** o sistema SHALL gravar versão nova e SHALL preservar a versão anterior, sem
  atualizar nem apagar registro existente

#### Scenario: Registros contraditórios concorrentes são recusados pelo banco

- **WHEN** duas transações concorrentes tentam gravar situação para o mesmo compromisso a
  partir da mesma versão
- **THEN** o banco SHALL recusar a segunda, deixando uma única situação vigente

#### Scenario: Agenda alheia e familiar são negados, inclusive por acesso direto

- **WHEN** outro profissional que não é dono daquela agenda, ou um familiar, tenta ler ou
  registrar a situação, inclusive chamando a operação diretamente no banco
- **THEN** o sistema SHALL negar sem gravar, SHALL registrar a negação em auditoria e NÃO
  SHALL revelar o paciente vinculado ao compromisso
