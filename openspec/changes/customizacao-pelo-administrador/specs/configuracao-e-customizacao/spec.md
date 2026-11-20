# Spec Delta

## Purpose

Permitir que o Administrador ajuste pela plataforma o que a operação muda no dia a dia —
vocabulário de registro, rótulo, limite operacional, texto institucional e disponibilidade
de fatia — sem esperar deploy, e sem que essa capacidade se torne um caminho para ampliar
acesso, enfraquecer um controle ou reescrever o que já foi registrado.

## ADDED Requirements

### Requirement: FR-082 — Administrar o vocabulário de registro por catálogo, sem reescrever registro antigo

**Fase de origem**: Evolução.

O produto SHALL permitir que o Administrador autorizado acrescente, renomeie, reordene e
desative termos dos vocabulários de registro que não decidem autorização, audiência,
validação nem forma de payload. Desativar um termo NÃO SHALL apagá-lo nem remover o
conteúdo já gravado com ele. Nenhuma operação do catálogo SHALL alterar, reescrever ou
reinterpretar registro existente.

#### Scenario: Termo acrescentado passa a ser oferecido

- **WHEN** o Administrador autorizado acrescenta um termo ao vocabulário de rotina do turno
- **THEN** o termo passa a ser oferecido nos registros novos, na posição definida, e nenhum registro existente é alterado

#### Scenario: Termo desativado preserva o registro que o usou

- **WHEN** um termo com registros gravados é desativado
- **THEN** ele deixa de ser oferecido em registros novos, nenhum conteúdo é apagado, e os registros antigos continuam legíveis exibindo o termo que foi declarado à época

#### Scenario: Escrita sob catálogo alterado é recusada com conflito

- **WHEN** um registro é enviado sob um retrato do catálogo que deixou de ser o vigente
- **THEN** a gravação é recusada com `conflito`, nada é persistido, e a interface apresenta o catálogo vigente para nova confirmação, sem ajustar o valor em silêncio

#### Scenario: Administração do vocabulário por quem não é Administrador é negada

- **WHEN** profissional ou familiar tenta acrescentar, renomear, reordenar ou desativar termo, inclusive por acesso direto ao servidor ou ao banco
- **THEN** a operação é negada no servidor e no banco, o catálogo permanece inalterado e a tentativa é auditada

#### Scenario: Conjunto que decide comportamento não é oferecido à administração

- **WHEN** a tela de administração de vocabulário é apresentada
- **THEN** conjuntos que decidem autorização, audiência, validação, forma de payload, AAD de cifra ou código de erro não aparecem como administráveis em nenhuma superfície

### Requirement: FR-083 — Alcançar pela interface todo catálogo administrável que já existe no banco

**Fase de origem**: Evolução.

Todo catálogo cuja operação administrativa já exista no banco SHALL ser alcançável pelo
Administrador autorizado por uma superfície da plataforma. O alcance pela interface NÃO
SHALL ampliar o que a operação do banco já permite alterar.

#### Scenario: Catálogo de medidas do turno administrado pela tela

- **WHEN** o Administrador autorizado abre a administração do catálogo de medidas do turno
- **THEN** os termos vigentes são apresentados após consulta real, e ele pode alterar exatamente o que a operação do banco permite, sem campo para o que ela não permite

#### Scenario: Interface não amplia o que o banco permite

- **WHEN** a interface envia alteração de um atributo que a operação do banco não admite alterar
- **THEN** a operação é recusada no banco, nada é persistido e a tentativa é auditada

#### Scenario: Acesso à administração do catálogo por perfil não autorizado é negado

- **WHEN** profissional ou familiar alcança a rota de administração do catálogo, inclusive por acesso direto
- **THEN** o acesso é negado no servidor e no banco, nenhum termo é revelado ou alterado, e a tentativa é auditada

### Requirement: FR-084 — Administrar os textos institucionais da plataforma

**Fase de origem**: Evolução.

O produto SHALL permitir que o Administrador autorizado edite os textos institucionais de
identificação e apresentação da casa. Texto que descreva um controle de acesso, uma
ressalva clínica obrigatória ou o conteúdo de um consentimento NÃO SHALL ser editável pela
tela. A superfície de edição SHALL comportar texto de mais de uma linha.

#### Scenario: Texto institucional de marca editado sem deploy

- **WHEN** o Administrador autorizado altera a assinatura institucional apresentada na plataforma
- **THEN** o texto novo passa a ser apresentado nas superfícies que o exibem, sem alteração de código

#### Scenario: Texto de várias linhas é preservado

- **WHEN** o Administrador escreve um texto institucional com mais de um parágrafo
- **THEN** o conteúdo é gravado e apresentado preservando a separação de parágrafos, sem truncamento silencioso

#### Scenario: Texto que descreve controle não é editável

- **WHEN** a tela de configuração é apresentada
- **THEN** as ressalvas clínicas obrigatórias, os avisos que descrevem quem lê o quê e o texto de consentimento não aparecem como editáveis em nenhuma superfície

#### Scenario: Edição de texto institucional por quem não é Administrador é negada

- **WHEN** profissional ou familiar tenta gravar um texto institucional, inclusive por acesso direto
- **THEN** a operação é negada no servidor e no banco, o texto vigente permanece e a tentativa é auditada

### Requirement: FR-085 — Administrar limite operacional somente dentro de faixa declarada no catálogo

**Fase de origem**: Evolução.

Toda chave de configuração numérica SHALL declarar no catálogo o valor mínimo e o máximo
aceitos. A faixa SHALL ser definida por migration e NÃO SHALL ser editável pela tela. Valor
fora da faixa SHALL ser recusado na gravação, e NÃO SHALL ser aceito e substituído em
silêncio pelo padrão. A faixa de um limite que exista para proteger um controle NÃO SHALL
admitir valor mais permissivo que o teto definido em código.

#### Scenario: Valor dentro da faixa é aceito e passa a valer

- **WHEN** o Administrador autorizado grava um limite operacional dentro da faixa declarada
- **THEN** o valor é persistido, passa a ser aplicado pelo servidor, e a tela apresenta o valor efetivamente vigente

#### Scenario: Valor fora da faixa é recusado, não ignorado

- **WHEN** o Administrador grava um valor fora da faixa declarada
- **THEN** a gravação é recusada no banco, o valor anterior permanece vigente, e a interface informa a faixa aceita, sem apresentar sucesso falso

#### Scenario: A tela não altera a própria faixa

- **WHEN** uma gravação tenta alterar o mínimo ou o máximo de uma chave, inclusive por acesso direto
- **THEN** a operação é recusada, a faixa permanece a definida pela migration, e a tentativa é auditada

#### Scenario: Configuração não ultrapassa o teto do código

- **WHEN** a faixa declarada de um limite de proteção é confrontada com o teto definido em código
- **THEN** nenhum valor aceito pela faixa é mais permissivo que esse teto, e a configuração só pode tornar o limite mais restritivo

#### Scenario: Registro antigo permanece julgado pela regra da sua época

- **WHEN** um limite é alterado depois de registros já terem sido criados sob o valor anterior
- **THEN** os registros existentes continuam válidos e são apresentados conforme o parâmetro vigente quando foram criados, sem serem marcados como irregulares nem recalculados

### Requirement: FR-086 — Manter a integridade do catálogo de chaves de configuração

**Fase de origem**: Evolução.

Toda chave presente no catálogo SHALL ter um leitor que a consulte, e todo leitor de
configuração SHALL ter a sua chave presente no catálogo, com a exposição que o seu leitor
alcança. Chave sem leitor e leitor sem chave SHALL ser tratados como defeito, não como
configuração desligada.

#### Scenario: Interruptor alterado na tela tem efeito observável

- **WHEN** o Administrador autorizado altera um interruptor de disponibilidade na tela
- **THEN** o comportamento da fatia correspondente muda de acordo, e a tela não apresenta como alterável um interruptor que o servidor não consegue ler

#### Scenario: Chave cuja exposição o leitor não alcança é tratada como defeito

- **WHEN** o catálogo é conferido contra os leitores de configuração
- **THEN** toda chave cuja exposição não é alcançada pelo seu leitor é apontada, e nenhuma delas permanece apresentada ao Administrador como se funcionasse

#### Scenario: Fatia com leitor e sem chave passa a ser administrável

- **WHEN** uma fatia já implementada lê uma chave de configuração que não existe no catálogo
- **THEN** a chave passa a existir no catálogo com a exposição que o seu leitor alcança, e a fatia deixa de depender exclusivamente de variável de ambiente para ser ligada

#### Scenario: Falha de leitura não liga serviço

- **WHEN** a leitura da configuração falha, não responde ou devolve a chave em tipo incompatível
- **THEN** o padrão anterior permanece valendo, nenhum serviço é ligado por falha, e nenhum limite passa a valer como ausente

### Requirement: FR-087 — Impedir que a configuração amplie acesso, audiência ou autorização

**Fase de origem**: Evolução.

Nenhum valor gravado pela tela de administração SHALL conceder, ampliar ou substituir
autorização, alterar a audiência de um conteúdo, ou dispensar a verificação de sessão,
vínculo com o caso, concessão e atestado. Ligar uma fatia por configuração SHALL decidir
apenas a disponibilidade do serviço, nunca a permissão de quem o chama.

#### Scenario: Fatia ligada continua exigindo autorização

- **WHEN** uma fatia é ligada pela tela de configuração e alguém sem vínculo ativo, com acesso revogado ou de perfil familiar chama a operação
- **THEN** a operação é negada no servidor e no banco pelos mesmos controles de antes, e a tentativa é auditada

#### Scenario: Nenhuma chave decide audiência

- **WHEN** o catálogo de chaves é conferido
- **THEN** nenhuma chave administrável determina quem lê um conteúdo, e a audiência familiar continua dependendo exclusivamente do fundamento de autorização vigente registrado no caso

#### Scenario: Administração da configuração não se tranca por fora

- **WHEN** um valor que torne indisponível a própria administração é gravado
- **THEN** a superfície de administração permanece alcançável pelo Administrador autorizado, de modo que o valor possa ser corrigido pela plataforma

#### Scenario: Configuração não altera cifra, AAD nem esquema

- **WHEN** qualquer valor do catálogo é alterado
- **THEN** nenhum nome de tabela, nome de campo cifrado, dado adicional autenticado ou forma de payload muda, e todo conteúdo já cifrado permanece decifrável

### Requirement: FR-088 — Preservar relatório e exportação já emitidos quando o vocabulário muda

**Fase de origem**: Evolução.

Alterar um termo de vocabulário, um rótulo ou um texto institucional NÃO SHALL alterar o
conteúdo de registro, relatório ou exportação já emitidos. Documento já entregue a
terceiro NÃO SHALL ser reescrito por mudança posterior de configuração.

#### Scenario: Pacote já exportado não muda

- **WHEN** um vocabulário ou texto institucional é alterado depois de uma exportação ter sido emitida
- **THEN** o pacote já emitido permanece exatamente como foi entregue, e o registro da exportação continua apontando o que foi efetivamente entregue

#### Scenario: Reemissão de período passado não aplica vocabulário novo ao conteúdo antigo

- **WHEN** um relatório de período anterior à mudança é consultado ou reemitido
- **THEN** os registros são apresentados com o termo que foi declarado à época, sem substituição pelo termo vigente e sem indicar que o registro está incompleto

#### Scenario: Termo renomeado não apaga a autoria nem o instante do registro

- **WHEN** o Administrador renomeia um termo já usado em registros
- **THEN** autor, instante e conteúdo dos registros permanecem íntegros, e a mudança de catálogo é persistida com autor e instante próprios

#### Scenario: Mudança de configuração é auditada

- **WHEN** qualquer valor do catálogo é gravado
- **THEN** a alteração é registrada com autor, instante e chave alterada, no caminho permitido e no negado, e o registro não pode ser apagado
