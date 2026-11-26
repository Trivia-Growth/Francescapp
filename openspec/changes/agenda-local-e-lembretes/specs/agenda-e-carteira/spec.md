# Spec Delta

## Purpose

Dar agenda a quem não tem conta no domínio e, por isso, não tem agenda Google: um
compromisso que vive no produto, cadastrado por quem administra a agenda da pessoa, com a
origem declarada em cada item da mesma lista, e com lembretes que a própria pessoa declara
e que são apresentados **dentro do aplicativo**, sem que nenhuma mensagem saia do produto.
Ver agenda continua não concedendo acesso clínico.

## ADDED Requirements

### Requirement: FR-089 — Manter agenda local para a pessoa sem conta no domínio, com compromisso que vive no produto

**Fase de origem**: Evolução.

O produto SHALL manter uma agenda local por pessoa, destinada a quem não possui conta no
domínio. O compromisso local SHALL ser persistido no próprio produto, em registro
versionado que NÃO SHALL ser atualizado nem apagado. Ele NÃO SHALL ser criado, copiado,
espelhado nem sincronizado no Google Calendar, em nenhuma direção. A situação de sua
realização SHALL usar o mecanismo já definido em FR-024, sem desenho paralelo.

#### Scenario: Compromisso local é persistido no produto e não vai ao Google
- **WHEN** um compromisso local fictício é cadastrado para um titular sem conta no domínio
- **THEN** o compromisso é persistido no produto com titular, autor, janela de início e fim, propósito de catálogo administrado, situação de vigência e instante do servidor, e nenhuma chamada de criação, alteração ou cancelamento é feita ao Google Calendar

#### Scenario: Evento do Google não vira compromisso local
- **WHEN** a agenda Google do período é consultada
- **THEN** nenhum evento do Google é persistido como compromisso local, e nenhum espelho do evento é criado no produto

#### Scenario: Correção preserva a versão anterior
- **WHEN** um compromisso local já cadastrado é corrigido com motivo informado
- **THEN** uma versão nova é persistida com motivo, autor e instante, e a versão anterior permanece consultável e íntegra, sem atualização nem exclusão do registro

#### Scenario: Correção sem motivo é recusada
- **WHEN** a correção de um compromisso local é enviada sem motivo
- **THEN** a operação é recusada, nada é alterado e a versão vigente permanece a anterior

#### Scenario: Exclusão é desativação versionada
- **WHEN** um compromisso local é excluído da agenda
- **THEN** o compromisso deixa de ser apresentado na agenda, o registro é preservado como versão desativada com autor e motivo, e nenhuma linha é apagada

#### Scenario: Realização do compromisso local usa o mecanismo de FR-024
- **WHEN** a realização de um compromisso local é registrada como realizado, faltou, cancelado ou remarcado, com motivo de catálogo quando a situação for falta
- **THEN** o registro é gravado pelo mesmo mecanismo de FR-024, com autor, instante, versão e auditoria, e nenhum mecanismo paralelo de situação de realização é criado para o compromisso local

#### Scenario: Compromisso local passado sem registro não é falta
- **WHEN** um compromisso local já terminou e nenhuma situação foi registrada para ele
- **THEN** o sistema o apresenta como realização não confirmada e NÃO SHALL apresentá-lo, contá-lo ou gravá-lo como falta

#### Scenario: Registro de realização do compromisso local não aceita o término informado pelo cliente
- **WHEN** a derivação da situação de um compromisso local é calculada
- **THEN** o término usado é o fim persistido do próprio compromisso, e um instante de término enviado pelo cliente não altera o resultado

### Requirement: FR-090 — Cadastrar, corrigir e desativar compromisso na agenda de outra pessoa sob autorização de administração de agenda

**Fase de origem**: Evolução.

O produto SHALL permitir que quem administra a agenda cadastre, corrija e desative
compromisso local **em nome do titular**, preservando autoria individual. A autorização
SHALL ser decidida no servidor e no banco, inclusive por acesso direto à operação, e NÃO
SHALL decorrer de ocultação de controles na interface nem do método de acesso usado para
entrar. Quem não é o titular e não administra a agenda NÃO SHALL ler nem escrever nela,
ainda que tenha vínculo ativo com o mesmo caso.

#### Scenario: Quem administra cadastra em nome do titular
- **WHEN** quem administra a agenda cadastra um compromisso fictício para um titular sem conta no domínio
- **THEN** titular e autor são persistidos como identidades distintas, o compromisso aparece na agenda do titular com a indicação de quem cadastrou, e a agenda administrada não é apresentada como agenda de quem administra

#### Scenario: Tentativa negada é auditada
- **WHEN** uma leitura ou escrita na agenda local é negada
- **THEN** a tentativa é registrada conforme FR-039, sem gravar conteúdo cifrado no registro de auditoria

#### Scenario: Titular lê a própria agenda local
- **WHEN** o titular autenticado consulta sua agenda
- **THEN** os compromissos locais de que ele é titular são apresentados, inclusive os cadastrados por quem administra

#### Scenario: Agenda alheia é negada a outro profissional do mesmo caso
- **WHEN** profissional com vínculo ativo no mesmo caso, que não é o titular e não administra a agenda, consulta ou tenta escrever na agenda local de outra pessoa, inclusive por chamada direta à operação
- **THEN** a leitura e a escrita são negadas no servidor e no banco, nada é persistido nem revelado, e a tentativa é auditada

#### Scenario: Titular de perfil familiar tem a própria agenda e não alcança a de outro
- **WHEN** uma conta de perfil familiar, que é titular de uma agenda local, consulta a própria agenda e em seguida tenta alcançar a agenda local de outra pessoa
- **THEN** a própria agenda é apresentada e o acesso à agenda alheia é negado, sem revelar sua existência ou conteúdo

#### Scenario: Revogação retira o acesso imediatamente
- **WHEN** o vínculo ou a autorização de quem administra a agenda é revogada
- **THEN** a leitura e a escrita na agenda administrada passam a ser negadas imediatamente, inclusive por acesso direto, e os compromissos já registrados permanecem íntegros

### Requirement: FR-091 — Apresentar uma agenda só, com a origem declarada em cada compromisso e a atualização medida por origem

**Fase de origem**: Evolução.

O produto SHALL apresentar os compromissos do período em uma lista única ordenada por
instante. Cada compromisso SHALL declarar sua origem em conjunto fechado, e a origem NÃO
SHALL ser omitida nem inferida do agrupamento. Toda operação SHALL ser roteada pela origem
no servidor, e nenhum compromisso SHALL existir nas duas origens. A data da última
atualização SHALL ter o significado próprio de cada origem.

#### Scenario: Lista única com origem em cada item
- **WHEN** a pessoa consulta um período que contém compromissos da agenda Google e compromissos locais
- **THEN** todos são apresentados em uma lista única ordenada por instante, e cada item exibe sua origem em conjunto fechado de dois valores: agenda individual Google ou agenda local

#### Scenario: Operação é roteada pela origem
- **WHEN** uma alteração é enviada para um compromisso local pelo caminho da agenda Google, ou para um compromisso Google pelo caminho da agenda local
- **THEN** a operação é recusada no servidor, nada é alterado em nenhuma das origens e a recusa não revela conteúdo da outra origem

#### Scenario: Cada origem é alterada apenas pelo seu caminho
- **WHEN** um compromisso de origem Google e um compromisso local são alterados por quem tem autorização para cada um
- **THEN** o primeiro é alterado somente pelo caminho de FR-049, sob a autorização de agenda vigente, e o segundo somente pelo caminho de FR-090

#### Scenario: Falha de uma origem não derruba nem disfarça a outra
- **WHEN** a consulta à agenda Google falha e existem compromissos locais no período
- **THEN** os compromissos locais são apresentados, a indisponibilidade da parte Google é informada, e a lista parcial não é apresentada como completa

#### Scenario: Atualização da agenda Google é instante de consulta, não de origem
- **WHEN** a agenda Google foi consultada com sucesso e desde então não houve nova consulta
- **THEN** o que é apresentado é o instante daquela consulta, identificado como tal, sem afirmar que a agenda de origem está atualizada até ali

#### Scenario: Atualização da agenda local é a da última versão
- **WHEN** um compromisso local recebe uma versão nova
- **THEN** a data de atualização da agenda local passa a ser o instante dessa versão

### Requirement: FR-092 — Permitir que a pessoa declare lembretes do próprio compromisso, apresentados dentro do aplicativo

**Fase de origem**: Evolução.

O produto SHALL permitir que o titular declare lembretes para compromissos locais de que é
titular, informando a antecedência. O lembrete vencido SHALL ser apresentado como aviso
dentro do aplicativo, pela lista de avisos de FR-072, e NÃO SHALL constituir fila de
mensagens própria com conteúdo novo. Nenhuma notificação SHALL sair do produto. O lembrete
SHALL ser do titular, e marcá-lo como lido NÃO SHALL registrar ciência de FR-013 nem
encerrar pendência.

#### Scenario: Titular declara lembrete e o recebe no aplicativo
- **WHEN** o titular declara uma antecedência para um compromisso local seu e abre o aplicativo depois do vencimento do lembrete
- **THEN** o aviso correspondente é apresentado na lista de avisos de FR-072, com o compromisso que o originou

#### Scenario: Lembrete atrasado é apresentado como atrasado
- **WHEN** o titular abre o aplicativo horas depois do vencimento do lembrete
- **THEN** o aviso é apresentado identificado como atrasado, com o instante em que venceu, sem ser apresentado como pontual

#### Scenario: O alcance do lembrete é declarado a quem o usa
- **WHEN** o titular declara um lembrete
- **THEN** o produto declara que o lembrete alcança quem abre o aplicativo, e não afirma nem sugere que a pessoa será alcançada sem abri-lo

#### Scenario: Nenhuma mensagem sai do produto
- **WHEN** qualquer lembrete é declarado ou vence
- **THEN** nenhuma mensagem é enviada por push, e-mail, SMS, WhatsApp ou notificação do sistema operacional, e nenhum token de dispositivo é registrado

#### Scenario: Lembrete é da pessoa
- **WHEN** quem cadastrou o compromisso consulta a agenda administrada e a própria lista de avisos
- **THEN** os lembretes declarados pelo titular não são apresentados a ele, e sua situação de leitura não é revelada

#### Scenario: Lembrete alheio é negado por acesso direto
- **WHEN** qualquer pessoa que não seja o titular tenta declarar, consultar ou marcar como lido um lembrete de outra pessoa, inclusive por chamada direta à operação
- **THEN** a operação é negada no servidor e no banco, nada é persistido nem revelado, e a tentativa é auditada

#### Scenario: Marcar lembrete como lido não registra ciência
- **WHEN** o titular marca como lido o aviso de um lembrete
- **THEN** nenhuma ciência de FR-013 é registrada, nenhuma pendência é encerrada, e o ato não é apresentado como prova de que a pessoa foi avisada a tempo

#### Scenario: Compromisso desativado não gera lembrete
- **WHEN** um compromisso local com lembrete declarado é desativado antes do vencimento
- **THEN** nenhum aviso de lembrete é apresentado para ele, e nenhum aviso já apresentado passa a afirmar que o compromisso continua vigente

### Requirement: FR-093 — Limitar o conteúdo do compromisso local e impedir que a agenda conceda acesso clínico

**Fase de origem**: Evolução.

O compromisso local SHALL identificar-se por propósito de catálogo administrado e fechado,
e NÃO SHALL possuir título de texto livre. Ele NÃO SHALL conter identificação de paciente,
diagnóstico, trecho de evolução, transcrição, conteúdo de diário nem anexo. Os únicos
campos de texto livre SHALL ser local ou modalidade e observação, ambos cifrados conforme
FR-042. Permissão sobre a agenda local NÃO SHALL conceder acesso clínico, nem o contrário.

#### Scenario: Propósito fora do catálogo é recusado
- **WHEN** um compromisso local é enviado com propósito fora do catálogo administrado
- **THEN** o registro é recusado e nada é persistido

#### Scenario: Não há título livre
- **WHEN** a identificação do compromisso local é apresentada em qualquer superfície, inclusive exportação
- **THEN** o que aparece é o propósito do catálogo, e nenhum campo de título de texto livre existe no compromisso

#### Scenario: Texto livre é cifrado
- **WHEN** local ou modalidade e observação são persistidos
- **THEN** o conteúdo é gravado cifrado conforme FR-042, com vínculo criptográfico ao registro e à versão, e a decifra ocorre no servidor apenas para quem a operação autorizou

#### Scenario: Agenda não concede acesso clínico
- **WHEN** quem administra a agenda local de uma pessoa tenta acessar caso, plano, evolução, diário ou anamnese sem o acesso correspondente, inclusive por acesso direto
- **THEN** o acesso é negado, a permissão de agenda não é aceita como fundamento, e a tentativa é auditada

#### Scenario: Acesso clínico não concede permissão de agenda
- **WHEN** profissional com acesso clínico vigente ao caso tenta ler ou escrever na agenda local de outra pessoa sem ser titular nem administrar essa agenda
- **THEN** a operação é negada, e o acesso clínico não é aceito como fundamento de permissão de agenda

#### Scenario: Agenda local não revela vínculo com pessoa acompanhada
- **WHEN** a agenda local é consultada por quem não tem acesso ao caso
- **THEN** nenhum compromisso revela paciente, diagnóstico ou vínculo entre pessoa acompanhada e profissional

## MODIFIED Requirements

### Requirement: FR-025 — Exibir a origem de cada compromisso e a data da

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Exibir a origem de cada compromisso e a data da última atualização da agenda. Oferecer lembretes e avisos de mudança segundo preferência do destinatário. Mensagens externas devem usar conteúdo mínimo e não incluir diagnóstico, transcrição ou trecho de evolução.

A partir da existência de compromissos de duas origens — agenda individual Google e agenda
local —, a origem SHALL ser atributo declarado de cada compromisso, em conjunto fechado, e
NÃO SHALL ser omitida nem inferida do agrupamento. A data da última atualização SHALL ser
apresentada com o significado próprio de cada origem, conforme FR-091.

Conforme a decisão de 17/11/2026, NÃO existe canal externo de notificação no produto: a
preferência do destinatário SHALL ser exercida como a antecedência que ele declara para os
seus lembretes, e o lembrete SHALL ser apresentado dentro do aplicativo, pela lista de
avisos de FR-072, com o alcance declarado em FR-092. O limite sobre conteúdo mínimo de
mensagem externa permanece vigente para quando um canal externo for decidido, e NÃO
autoriza, por si, o envio de mensagem alguma.

#### Scenario: Condição de aceite FR-025

- **WHEN** a funcionalidade FR-025 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Exibir a origem de cada compromisso e a data da última atualização da agenda. Oferecer lembretes e avisos de mudança segundo preferência do destinatário. Mensagens externas devem usar conteúdo mínimo e não incluir diagnóstico, transcrição ou trecho de evolução.

#### Scenario: Origem declarada em compromisso de qualquer origem

- **WHEN** a agenda é consultada com compromissos da agenda individual Google e da agenda local no mesmo período
- **THEN** cada compromisso apresenta sua origem, e nenhum item é apresentado sem origem

#### Scenario: Preferência de lembrete é a antecedência declarada pelo destinatário

- **WHEN** o destinatário declara a antecedência do seu lembrete
- **THEN** o lembrete é apresentado dentro do aplicativo conforme FR-092, e nenhuma mensagem é enviada por push, e-mail, SMS ou WhatsApp
