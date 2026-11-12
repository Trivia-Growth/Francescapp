# Spec Delta

## Purpose

Registrar a execução do cuidado em turno por profissional autorizado: abertura e encerramento de plantão, escala e substituição, passagem de turno, sinais vitais aferidos, medicação prescrita e administrada, ocorrências e relatório do período. O sistema registra o que foi executado por pessoas identificadas; não produz prescrição, diagnóstico, gravidade clínica nem decisão automática.

## ADDED Requirements

### Requirement: FR-055 — Abrir e encerrar turno de cuidado com profissional identificado e caso vinculado

**Fase de origem**: Evolução.

O produto SHALL permitir que profissional autenticado com vínculo ativo no caso abra e encerre turno, registrando caso, profissional, instante de abertura e instante de encerramento determinados pelo servidor. Um profissional SHALL ter no máximo um turno aberto por vez. Duração padrão, tolerância de atraso na abertura e tratamento de turno não encerrado SHALL ser configuração administrada, nunca valor fixo em código.

#### Scenario: Abertura de turno registrada
- **WHEN** profissional com vínculo ativo no caso fictício abre turno
- **THEN** o turno é persistido com caso, profissional, instante de abertura do servidor e situação aberto, e passa a ser o turno corrente desse profissional

#### Scenario: Encerramento de turno registrado
- **WHEN** o profissional que abriu o turno o encerra
- **THEN** o turno recebe instante de encerramento do servidor, muda para situação encerrado e deixa de aceitar novos registros vinculados a ele

#### Scenario: Segundo turno aberto é recusado
- **WHEN** profissional com turno já aberto tenta abrir outro turno, no mesmo caso ou em caso diferente
- **THEN** a abertura é recusada, o turno existente permanece inalterado e a interface informa qual turno está aberto

#### Scenario: Abertura sem vínculo é negada
- **WHEN** profissional sem vínculo ativo no caso, sem concessão aplicável ou com acesso revogado tenta abrir turno, inclusive por acesso direto ao servidor ou ao banco
- **THEN** a abertura é negada sem expor dados do caso e o evento de negação é registrado

#### Scenario: Instante informado pelo cliente é ignorado
- **WHEN** a requisição de abertura ou encerramento informa um instante próprio
- **THEN** o instante do cliente é descartado e o registro usa exclusivamente o instante do servidor

#### Scenario: Falha de persistência no turno
- **WHEN** a abertura ou o encerramento não é confirmado pela persistência
- **THEN** a interface informa falha, não apresenta sucesso e não trata o turno como aberto ou encerrado

#### Scenario: Parâmetros de turno alterados sem nova versão do produto
- **WHEN** pessoa autorizada altera a duração padrão, a tolerância de atraso ou o tratamento de turno não encerrado
- **THEN** os novos parâmetros passam a valer para turnos abertos a partir daí, sem alteração de código, e os turnos já registrados preservam os parâmetros vigentes à época

### Requirement: FR-056 — Planejar escala de turnos com substituição e cobertura registradas

**Fase de origem**: Evolução.

O produto SHALL permitir que pessoa autorizada planeje turnos previstos por caso, com profissional previsto e janela de início e fim. Substituição e cobertura de ausência SHALL preservar o profissional originalmente previsto, o profissional que assumiu, o motivo e o autor da alteração, mantendo as versões anteriores consultáveis.

#### Scenario: Turno previsto registrado na escala
- **WHEN** pessoa autorizada registra turno previsto com profissional e janela em caso fictício
- **THEN** o turno previsto é persistido e aparece na escala do caso e do profissional previsto

#### Scenario: Substituição preserva o previsto original
- **WHEN** pessoa autorizada substitui o profissional de um turno previsto informando motivo
- **THEN** o turno previsto passa a indicar o profissional que assumiu, e o profissional originalmente previsto, o motivo, a data e o autor permanecem consultáveis

#### Scenario: Substituição sem motivo é recusada
- **WHEN** a substituição é enviada sem motivo
- **THEN** a alteração é recusada e a escala permanece inalterada

#### Scenario: Substituições concorrentes
- **WHEN** duas substituições do mesmo turno previsto partem de versões diferentes
- **THEN** a que usa versão desatualizada é recusada, o histórico permanece íntegro e nenhuma substituição sobrescreve a outra

#### Scenario: Escala sem autorização é negada
- **WHEN** pessoa sem autorização aplicável tenta consultar ou alterar a escala do caso, inclusive por acesso direto
- **THEN** o acesso é negado sem expor os profissionais e as janelas registradas

### Requirement: FR-057 — Exigir síntese de passagem no encerramento do turno e apresentá-la ao turno seguinte

**Fase de origem**: Evolução.

O produto SHALL exigir síntese de passagem para encerrar um turno e SHALL apresentar essa síntese ao profissional do turno seguinte do mesmo caso como pendente de ciência, até que ele registre ciência. A ciência registrada SHALL preservar quem registrou e quando, e não SHALL ser inferida pela simples consulta.

#### Scenario: Encerramento sem síntese é recusado
- **WHEN** o profissional tenta encerrar o turno sem informar a síntese de passagem
- **THEN** o encerramento é recusado, o turno permanece aberto e a interface indica o que falta

#### Scenario: Passagem pendente de ciência no turno seguinte
- **WHEN** profissional abre turno em caso que possui passagem anterior sem ciência registrada
- **THEN** a passagem anterior é apresentada como pendente de ciência, identificando autor e instante do turno anterior

#### Scenario: Ciência registrada encerra a pendência
- **WHEN** o profissional do turno seguinte registra ciência da passagem
- **THEN** a pendência é encerrada preservando quem registrou a ciência e quando

#### Scenario: Consulta não registra ciência
- **WHEN** o profissional apenas consulta a passagem pendente sem confirmar ciência
- **THEN** a pendência permanece aberta e nenhuma ciência é registrada em seu nome

### Requirement: FR-058 — Registrar sinais vitais como medidas estruturadas sem interpretação clínica automática

**Fase de origem**: Evolução.

O produto SHALL registrar aferições com tipo de medida, valor, unidade, instante da aferição, autor identificado e turno vinculado, apresentando a série do caso em ordem cronológica. Os tipos SHALL seguir os padrões da medicina em conjunto configurável, com unidade própria por tipo. O sistema NÃO SHALL classificar gravidade, calcular risco, emitir alerta clínico nem recomendar conduta a partir dos valores.

#### Scenario: Aferição registrada e consultada na série
- **WHEN** profissional com turno aberto registra aferição fictícia com tipo, valor, unidade e instante
- **THEN** a medida é persistida com autor e turno, e aparece na série cronológica do caso

#### Scenario: Conjunto de tipos segue os padrões da medicina
- **WHEN** o profissional escolhe o tipo de medida a registrar
- **THEN** o conjunto configurado oferece ao menos pressão arterial sistólica e diastólica em mmHg, frequência cardíaca em bpm, frequência respiratória em irpm, temperatura em °C, saturação de oxigênio em %, glicemia capilar em mg/dL e dor em escala de 0 a 10, cada tipo com sua unidade

#### Scenario: Tipo fora do conjunto configurado é recusado
- **WHEN** a aferição informa tipo de medida que não consta do conjunto configurado
- **THEN** o registro é recusado e nenhuma medida é persistida

#### Scenario: Medida fora do formato é recusada
- **WHEN** a aferição é enviada sem tipo, sem unidade compatível com o tipo ou com valor não numérico
- **THEN** o registro é recusado e a interface indica o campo inválido, sem persistir medida parcial

#### Scenario: Instante de aferição anterior à abertura do turno
- **WHEN** a aferição informa instante anterior à abertura do turno vinculado ou posterior ao instante atual do servidor
- **THEN** o registro é recusado e a série permanece inalterada

#### Scenario: Sistema não interpreta o valor
- **WHEN** uma aferição registrada está fora de qualquer faixa de referência configurada
- **THEN** o sistema SHALL apenas exibir o valor e a faixa aplicável, sem rótulo de gravidade, sem alerta clínico e sem recomendação de conduta

#### Scenario: Aferição incorreta é retificada sem apagar o original
- **WHEN** o autor da aferição retifica valor, tipo ou instante informando motivo
- **THEN** a medida original permanece consultável, a retificação preserva autor, motivo e data, e a série passa a exibir a versão vigente sem ocultar que houve retificação

#### Scenario: Leitura de aferição sem autorização é negada
- **WHEN** pessoa sem autorização aplicável ou com acesso revogado tenta ler a série do caso, inclusive por acesso direto
- **THEN** o acesso é negado sem expor valores

### Requirement: FR-059 — Registrar itens de medicação prescrita com fonte documental e autor habilitado

**Fase de origem**: Evolução.

O produto SHALL permitir que pessoa de perfil habilitado — Administrador ou case manager com a concessão de execução de medicação vigente — registre itens de medicação prescrita do caso, com nome, dose prescrita, via, horários previstos, período de vigência, fonte documental da prescrição e autor do registro. O sistema SHALL apenas transcrever prescrição externa existente: NÃO SHALL sugerir, calcular, alterar ou suspender medicamento ou dose.

#### Scenario: Item de medicação prescrita registrado
- **WHEN** Administrador ou case manager com concessão vigente registra item fictício com nome, dose, via, horários, vigência e fonte documental
- **THEN** o item é persistido com autor e data e passa a constar na lista de medicação prescrita do caso

#### Scenario: Registro sem fonte documental é recusado
- **WHEN** o item é enviado sem fonte documental da prescrição
- **THEN** o registro é recusado e nenhum item é criado

#### Scenario: Perfil não habilitado é negado
- **WHEN** profissional sem a concessão de execução de medicação, familiar ou pessoa com acesso revogado tenta criar ou alterar item de medicação prescrita, inclusive por acesso direto ao servidor ou ao banco
- **THEN** a operação é negada, nada é persistido e a negação é registrada

#### Scenario: Alteração preserva histórico
- **WHEN** profissional habilitado altera ou encerra a vigência de um item
- **THEN** a versão anterior permanece consultável com autor, data e motivo, e administrações já registradas continuam referenciando a versão vigente à época

#### Scenario: Sistema não propõe medicamento nem dose
- **WHEN** o profissional abre o registro de medicação prescrita
- **THEN** nenhum medicamento, dose, via ou horário é preenchido automaticamente pelo sistema a partir de diagnóstico, histórico ou sugestão de modelo

### Requirement: FR-060 — Registrar administração de medicação distinguindo executor de registrador

**Fase de origem**: Evolução.

O produto SHALL registrar administração referenciando item de medicação prescrita vigente, com **executor** — quem administrou, identificado por nome e vínculo, podendo ser profissional externo sem conta no sistema — e **registrador** — quem gravou, autenticado e com a concessão de execução de medicação. O registro SHALL guardar instante do servidor, turno, e situação entre administrado, recusado, adiado e não administrado; situação diferente de administrado SHALL exigir motivo.

#### Scenario: Administração registrada com executor e registrador distintos
- **WHEN** Administrador ou case manager com concessão vigente e turno aberto registra administração de item prescrito fictício vigente, informando o executor que administrou
- **THEN** o registro é persistido com executor informado, registrador autenticado, instante do servidor, turno, item referenciado e situação administrado, e o relatório do turno apresenta executor e registrador como papéis distintos

#### Scenario: Registro sem executor identificado é recusado
- **WHEN** a administração é enviada sem identificação de quem administrou
- **THEN** o registro é recusado e nada é persistido

#### Scenario: Registrador não é apresentado como executor
- **WHEN** o relatório ou a exportação apresenta uma administração
- **THEN** o conteúdo NÃO SHALL atribuir o ato de administrar ao registrador, nem omitir quem administrou

#### Scenario: Situação não administrada exige motivo
- **WHEN** a administração é registrada como recusada, adiada ou não administrada sem motivo
- **THEN** o registro é recusado e nada é persistido

#### Scenario: Registrador sem concessão é negado
- **WHEN** profissional sem a concessão de execução de medicação, familiar ou pessoa com acesso revogado tenta registrar administração, inclusive por acesso direto ao servidor ou ao banco
- **THEN** a operação é negada, nada é persistido, o evento de negação é auditado e nenhum dado da prescrição é exposto na resposta

#### Scenario: Administração sem turno aberto é recusada
- **WHEN** registrador com concessão vigente e sem turno aberto tenta registrar administração
- **THEN** o registro é recusado e a interface indica que é necessário abrir turno

#### Scenario: Item inexistente ou fora de vigência
- **WHEN** a administração referencia item inexistente, de outro caso ou fora do período de vigência
- **THEN** o registro é recusado sem revelar a existência de itens de outro caso

#### Scenario: Retificação preserva o registro original
- **WHEN** registrador com concessão vigente retifica uma administração já registrada informando motivo
- **THEN** o registro original permanece consultável, a retificação preserva quem retificou, motivo e data, o executor originalmente informado continua visível, e nenhum registro de administração é apagado

#### Scenario: Falha de persistência na administração
- **WHEN** o registro de administração não é confirmado pela persistência ou pela auditoria
- **THEN** a interface informa falha, não apresenta sucesso, não exibe a administração como registrada e não oferece repetição silenciosa que duplique o lançamento

#### Scenario: Auditoria da administração
- **WHEN** uma administração é criada, consultada, retificada ou exportada
- **THEN** o evento é registrado com identidade, ação, caso e instante, conforme FR-039

### Requirement: FR-061 — Registrar ocorrência vinculada ao turno com providência tomada

**Fase de origem**: Evolução.

O produto SHALL permitir que o profissional do turno aberto registre ocorrência com descrição, instante, providência tomada e anexo opcional, vinculada ao turno e ao caso. A ocorrência SHALL poder ser convertida em ação com responsável conforme FR-014, preservando motivo, data e encaminhamento.

#### Scenario: Ocorrência registrada no turno
- **WHEN** profissional com turno aberto registra ocorrência fictícia com descrição, instante e providência
- **THEN** a ocorrência é persistida vinculada ao turno e ao caso, com autor identificado

#### Scenario: Ocorrência convertida em ação
- **WHEN** pessoa autorizada converte a ocorrência em ação indicando responsável
- **THEN** a ação é criada com motivo, data e encaminhamento, e a ocorrência mantém a referência à ação gerada

#### Scenario: Anexo da ocorrência segue as regras de documentos
- **WHEN** a ocorrência recebe imagem ou documento
- **THEN** o anexo é tratado pelas regras de FR-011 e FR-029 a FR-031, com audiência e revogação aplicáveis

#### Scenario: Ocorrência em turno encerrado é recusada
- **WHEN** o profissional tenta registrar ocorrência vinculada a turno já encerrado
- **THEN** o registro é recusado e a ocorrência não é persistida

### Requirement: FR-062 — Produzir relatório de turno e consolidado diário respeitando a audiência

**Fase de origem**: Evolução.

O produto SHALL apresentar relatório do turno reunindo passagem, aferições, administrações, ocorrências e horários de abertura e encerramento, e consolidado diário do caso reunindo os turnos do período. A audiência familiar SHALL alcançar todo o conteúdo do turno, condicionada ao fundamento de autorização registrado para o caso conforme FR-038 e revogável conforme FR-037. A exportação SHALL seguir FR-032 e ser registrada conforme FR-039.

#### Scenario: Relatório do turno apresentado à equipe
- **WHEN** profissional autorizado consulta um turno encerrado do caso
- **THEN** o relatório apresenta abertura, encerramento, passagem, aferições, administrações e ocorrências do período, com autores identificados

#### Scenario: Consolidado diário por caso
- **WHEN** pessoa autorizada consulta o consolidado de um dia do caso
- **THEN** os turnos do período são apresentados em ordem cronológica, indicando lacunas de cobertura quando existirem

#### Scenario: Familiar autorizado vê o conteúdo do turno
- **WHEN** familiar com fundamento de autorização vigente no caso consulta o relatório do turno
- **THEN** passagem com anotações e acontecimentos, sinais vitais e medicação administrada são apresentados, com executor e registrador identificados

#### Scenario: Familiar sem fundamento de autorização é negado
- **WHEN** familiar vinculado ao caso, porém sem fundamento de autorização vigente, consulta o relatório
- **THEN** o acesso ao conteúdo de saúde é negado, e o parentesco por si só não concede acesso

#### Scenario: Revogação retira o acesso familiar
- **WHEN** o fundamento de autorização do familiar é revogado
- **THEN** consultas seguintes são negadas imediatamente, inclusive por acesso direto, e os registros permanecem íntegros

#### Scenario: Audiência limita o conteúdo exibido
- **WHEN** pessoa cuja audiência não alcança conteúdo restrito consulta o relatório
- **THEN** somente o conteúdo da sua audiência é apresentado, sem indicar o teor do conteúdo omitido

#### Scenario: Exportação autorizada e auditada
- **WHEN** pessoa autorizada exporta relatório de turno ou consolidado do período
- **THEN** a exportação respeita FR-032, contém somente o conteúdo da audiência aplicável e é registrada conforme FR-039

#### Scenario: Período sem turno registrado
- **WHEN** o consolidado é consultado para um dia sem turno registrado
- **THEN** o estado vazio é apresentado após consulta real bem-sucedida, sem dados de exemplo e sem confundir vazio com falha

### Requirement: FR-063 — Condicionar a execução de turno a vínculo ativo e encerrá-la na revogação

**Fase de origem**: Evolução.

O produto SHALL autorizar abertura de turno, registro de aferição, medicação, ocorrência e leitura de relatório no servidor e no banco, exigindo vínculo ativo com o caso e o perfil aplicável a cada ação. A revogação do vínculo SHALL impedir novas ações imediatamente e SHALL preservar os registros já criados, sem apagá-los nem alterar sua autoria.

#### Scenario: Revogação impede novas ações
- **WHEN** o vínculo do profissional com o caso é revogado enquanto ele possui turno aberto
- **THEN** novas ações no turno são negadas, o turno deixa de aceitar registros e os registros anteriores permanecem íntegros e consultáveis pela equipe autorizada

#### Scenario: Acesso direto ao banco é negado
- **WHEN** uma consulta ou escrita é tentada diretamente no banco com identidade sem vínculo ativo aplicável ao caso
- **THEN** a operação retorna negada ou conjunto vazio, sem expor registros de turno de qualquer caso

#### Scenario: Profissional de outro caso não enxerga o turno
- **WHEN** profissional com vínculo ativo em outro caso consulta turnos, aferições, medicação ou ocorrências deste caso
- **THEN** nada do caso alheio é retornado e a negação não revela a existência do caso

#### Scenario: Perfil familiar não registra execução
- **WHEN** familiar autenticado tenta abrir turno, registrar aferição ou registrar administração
- **THEN** a operação é negada no servidor e no banco, independentemente do que a interface apresenta

#### Scenario: Registros preservados após encerramento do vínculo
- **WHEN** o vínculo do profissional é encerrado e um relatório anterior é consultado por pessoa autorizada
- **THEN** o relatório mantém o autor original de cada registro, sem anonimizar, reatribuir ou remover os lançamentos

## Jornadas e testes independentes preservados

As jornadas abaixo são novas, derivadas das decisões de 11/11/2026. Não indicam execução de testes nem aprovação de hipóteses.

### User Story 13 - Executar e passar um plantão (Priority: P2)

Como profissional com vínculo ativo no caso, abro o turno, registro o que foi executado e encerro com a passagem para quem assume.

**Why this priority**: Sem fronteira de turno, o registro de execução perde autoria, horário e responsável, e a passagem volta a depender do WhatsApp.

**Independent Test**: Um profissional fictício abre turno em caso fictício, registra uma aferição e uma ocorrência, encerra com passagem, e o profissional seguinte vê a passagem pendente de ciência.

**Acceptance Scenarios**:

1. Dado um profissional com vínculo ativo, quando abrir turno, então o turno constará com instante do servidor e será o único turno aberto desse profissional.
2. Dado um turno aberto, quando o profissional registrar aferição e ocorrência, então ambas ficarão vinculadas ao turno e ao autor.
3. Dado o encerramento do turno, quando faltar a síntese de passagem, então o encerramento será recusado e o turno permanecerá aberto.
4. Dado um turno encerrado com passagem, quando o profissional seguinte abrir turno no mesmo caso, então verá a passagem pendente de ciência, e apenas consultá-la não registrará ciência.

### User Story 14 - Registrar medicação administrada por terceiro (Priority: P2)

Como Administrador ou case manager com concessão vigente, registro o que a enfermagem administrou, identificando quem administrou e quem registrou.

**Why this priority**: O registro de medicação é o de maior risco de responsabilidade; atribuir o ato a quem não o praticou compromete a confiança no histórico.

**Independent Test**: Uma pessoa com concessão registra administração fictícia de item prescrito fictício, e o relatório apresenta executor e registrador como papéis distintos.

**Acceptance Scenarios**:

1. Dado um item de medicação prescrita vigente e um turno aberto, quando o registrador com concessão informar o executor e a situação, então o registro constará com executor informado, registrador autenticado e instante do servidor.
2. Dado um registro sem identificação de quem administrou, quando for enviado, então será recusado.
3. Dado um relatório com administração, quando for apresentado ou exportado, então não atribuirá o ato ao registrador nem omitirá quem administrou.
4. Dada uma pessoa sem a concessão de execução de medicação, quando tentar registrar administração pela interface, pelo servidor ou diretamente no banco, então será negada sem expor dados da prescrição.
5. Dada uma administração já registrada, quando for retificada com motivo, então o registro original e o executor originalmente informado permanecerão consultáveis.

### User Story 15 - Acompanhar o cuidado executado como familiar autorizado (Priority: P2)

Como familiar com fundamento de autorização vigente, acompanho o que foi executado no turno sem depender de pedir à equipe.

**Why this priority**: A dor relatada é não saber o que aconteceu; ao mesmo tempo, a pessoa acompanhada é adulta e o acesso precisa decorrer de autorização registrada, não de parentesco.

**Independent Test**: Um familiar fictício com fundamento vigente consulta o relatório de um turno fictício; um familiar vinculado sem fundamento é negado na mesma consulta.

**Acceptance Scenarios**:

1. Dado um familiar com fundamento de autorização vigente, quando consultar o relatório do turno, então verá passagem com anotações e acontecimentos, sinais vitais e medicação administrada, com executor e registrador identificados.
2. Dado um familiar vinculado ao caso e sem fundamento de autorização vigente, quando consultar o relatório, então o acesso ao conteúdo de saúde será negado, e o parentesco por si só não concederá acesso.
3. Dado um fundamento de autorização revogado, quando o familiar consultar novamente, inclusive por acesso direto, então será negado imediatamente e os registros permanecerão íntegros.
4. Dado um dia sem turno registrado, quando o consolidado for consultado, então o estado vazio virá de consulta real bem-sucedida, sem dados de exemplo.

## Rastreabilidade com as metas SC

As metas abaixo já existem como referência a validar; esta capacidade contribui para elas e não as transforma em garantia numérica.

| Meta | Como esta capacidade se relaciona | Requisitos |
| --- | --- | --- |
| SC-001 | Registro de aferição, administração e ocorrência precisa ser concluído pelo celular dentro do tempo observado, incluindo revisão | FR-058, FR-060, FR-061 |
| SC-002 | Relatório de turno e consolidado diário devem permitir identificar situação, mudança recente e próximo responsável | FR-062, FR-057 |
| SC-004 | Síntese de passagem publicada no encerramento do turno integra as sínteses combinadas | FR-057, FR-009 |
| SC-005 | Ocorrência convertida em ação entra na contagem de tarefas com responsável | FR-061 |
| SC-007 | Nenhum exercício de acesso indevido pode expor turno, aferição, medicação ou relatório, inclusive por exportação e acesso direto | FR-060, FR-062, FR-063 |
| SC-009 | Responsáveis, audiências e fundamento de autorização do caso precisam estar definidos antes de o turno registrar execução | FR-062, FR-063 |
