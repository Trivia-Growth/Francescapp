# Spec Delta

## Purpose

Sinalizar dentro do aplicativo o que exige atenção da pessoa — pendências, sinalizações e passagem de turno aguardando ciência — com indicador de não lido, sem enviar nada para fora do produto e sem transformar a leitura de um aviso em confirmação de conteúdo.

## ADDED Requirements

### Requirement: FR-072 — Apresentar avisos no aplicativo com indicador de não lido, sem notificação externa e sem registrar ciência

**Fase de origem**: Evolução.

O produto SHALL apresentar, dentro do aplicativo, a lista de avisos dirigidos à pessoa autenticada, com indicador de quantidade não lida. Os avisos SHALL ser derivados dos quatro eventos confirmados em 17/11/2026 — passagem pendente de ciência de FR-057, pendências por atraso de FR-027, sinalizações clínicas de FR-028 e conteúdo marcado como necessitando atenção em FR-014 — e NÃO SHALL constituir uma fila de mensagens própria com conteúdo novo.

O aviso SHALL ser dirigido **à pessoa** responsável. Quando houver substituição registrada de case manager conforme FR-037, os avisos em aberto dirigidos a quem está ausente SHALL passar a ser apresentados também a quem substitui, enquanto a substituição vigorar, sem deixar de pertencer ao destinatário original.

Marcar como lido SHALL retirar o aviso do indicador de não lidos e SHALL mantê-lo na lista até que o evento de origem seja resolvido ou a ciência registrada. Nenhum aviso SHALL sair da lista por decurso de prazo com a origem ainda aberta.

Cada aviso SHALL respeitar a audiência de quem o recebe: o texto do aviso NÃO SHALL revelar conteúdo fora da audiência do destinatário, e um aviso NÃO SHALL ser dirigido a quem não tem acesso ao que ele aponta. Marcar um aviso como lido SHALL ser ato local do destinatário e NÃO SHALL registrar ciência de FR-013 nem encerrar a pendência de origem. Nenhuma notificação SHALL ser enviada por push, e-mail, SMS ou WhatsApp.

#### Scenario: Aviso apresentado com indicador de não lido
- **WHEN** existe pendência, sinalização ou passagem aguardando ciência dirigida à pessoa autenticada
- **THEN** o indicador apresenta a quantidade não lida e a lista apresenta cada aviso com origem, caso quando aplicável e instante

#### Scenario: Ler o aviso não registra ciência
- **WHEN** o destinatário abre a lista de avisos e marca como lido um aviso de passagem pendente de ciência
- **THEN** nenhuma ciência de FR-013 é registrada, a passagem permanece pendente, e a ciência continua exigindo o ato explícito previsto em FR-057

#### Scenario: Ler o aviso não encerra a pendência
- **WHEN** o destinatário marca como lido um aviso originado de pendência de FR-027
- **THEN** a pendência permanece aberta até ser resolvida no seu próprio fluxo

#### Scenario: Aviso não revela conteúdo fora da audiência
- **WHEN** um aviso aponta para conteúdo cuja audiência é restrita
- **THEN** o texto do aviso identifica apenas o que o destinatário já pode ver, sem revelar teor, nome de terceiro ou conteúdo clínico fora da sua audiência

#### Scenario: Aviso não é dirigido a quem não tem acesso
- **WHEN** o evento de origem aponta para conteúdo ao qual uma pessoa não tem acesso
- **THEN** nenhum aviso é criado para ela, e a ausência não revela a existência do conteúdo

#### Scenario: Substituição alcança os avisos em aberto
- **WHEN** existe substituição registrada de case manager e há avisos em aberto dirigidos a quem está ausente
- **THEN** quem substitui passa a ver esses avisos enquanto a substituição vigorar, o destinatário original continua sendo quem é, e a substituição não concede acesso a conteúdo fora da sua audiência

#### Scenario: Fim da substituição retira os avisos do substituto
- **WHEN** a substituição é encerrada
- **THEN** os avisos do destinatário original deixam de ser apresentados a quem substituía, e o indicador do substituto é recalculado

#### Scenario: Aviso lido permanece até a origem ser resolvida
- **WHEN** o destinatário marca um aviso como lido e o evento de origem continua aberto
- **THEN** o aviso sai do indicador de não lidos, permanece na lista identificado como lido, e não desaparece por decurso de prazo

#### Scenario: Aviso sai da lista quando a origem é resolvida
- **WHEN** a pendência de origem é resolvida ou a ciência correspondente é registrada
- **THEN** o aviso deixa de ser apresentado na lista, e o histórico do evento permanece consultável no seu próprio fluxo

#### Scenario: Revogação retira os avisos
- **WHEN** o vínculo ou o fundamento de autorização do destinatário é revogado
- **THEN** os avisos correspondentes deixam de ser apresentados imediatamente, inclusive por acesso direto, e o indicador é recalculado

#### Scenario: Lido é por pessoa
- **WHEN** duas pessoas recebem avisos originados do mesmo evento e uma delas marca o seu como lido
- **THEN** o aviso da outra permanece não lido, e o indicador de cada uma reflete apenas os seus

#### Scenario: Nenhuma notificação sai do aplicativo
- **WHEN** qualquer aviso é criado
- **THEN** nenhuma mensagem é enviada por push, e-mail, SMS ou WhatsApp, e nenhum token de dispositivo é registrado

#### Scenario: Sem avisos
- **WHEN** não há aviso dirigido à pessoa autenticada
- **THEN** o estado vazio é apresentado após consulta real bem-sucedida, sem indicador de quantidade e sem confundir vazio com falha

#### Scenario: Falha ao carregar avisos
- **WHEN** a consulta de avisos falha
- **THEN** a interface informa falha, não apresenta lista vazia como se não houvesse avisos e não apresenta contagem de uma consulta anterior

#### Scenario: Auditoria do acesso ao aviso
- **WHEN** a lista de avisos é consultada
- **THEN** o evento é registrado conforme FR-039, sem gravar conteúdo clínico no registro de auditoria
