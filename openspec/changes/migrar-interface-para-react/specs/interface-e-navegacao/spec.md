# Spec Delta

## Purpose

Acrescentar à capability `interface-e-navegacao` os contratos que a reconstrução em React
precisa cumprir para não regredir comportamento já entregue: ciclo de vida de tela,
componentes acessíveis, contrato de estados, navegação única e sistema visual verificável.

Os requisitos VIS-001 a VIS-011 de `redesenhar-interface-ffcmapp` e
`refinamento-visual-ffcmapp` permanecem válidos e não são reescritos aqui. Nenhum ID FR/SC
de outra capability é alterado. Nenhuma audiência, permissão ou regra de domínio é criada.
Nada neste contrato autoriza remover rótulo, aviso de audiência, confirmação de descarte,
barreira de gravação, guarda de alteração pendente ou revalidação de acesso para acomodar
layout ou para simplificar uma migração.

Fase: Inicial.

## ADDED Requirements

### Requirement: VIS-012 — Tela desmontada não escreve

Uma tela que saiu de exibição SHALL interromper toda escrita pendente. Resposta de rede que
chegue depois da saída SHALL ser descartada sem efeito observável, e SHALL NOT produzir
escrita em região removida, mensagem de erro de uma tela que a pessoa já deixou, ou foco
movido para fora da tela atual.

Esta garantia SHALL vir do ciclo de vida do componente, não de conferência manual repetida
por módulo.

#### Scenario: resposta atrasada após sair da tela
- **WHEN** a pessoa abre uma tela que consulta o servidor e navega para outra antes da resposta
- **THEN** a resposta é descartada, nada é escrito, e a tela atual permanece intacta

#### Scenario: troca rápida entre abas da ficha
- **WHEN** a pessoa alterna entre abas mais rápido que as respostas chegam
- **THEN** somente o conteúdo da aba visível é apresentado, sem mistura de dados entre abas

#### Scenario: desmontagem com gravação em curso
- **WHEN** uma gravação está em curso e a tela é fechada
- **THEN** o resultado da gravação permanece registrado no servidor, e a interface não afirma sucesso nem falha em região removida

### Requirement: VIS-013 — Sobreposição acessível por biblioteca verificada

Diálogo, menu, popover e seleção com busca SHALL prender o foco enquanto abertos, devolver
o foco ao controle de origem ao fechar, fechar por `Esc`, e impedir interação e leitura do
conteúdo por baixo por tecnologia assistiva. Diálogo SHALL centralizar na tela, e quando o
conteúdo exceder a altura disponível SHALL rolar mantendo as ações visíveis.

Essas garantias SHALL vir de componente compartilhado, e SHALL NOT ser reimplementadas por
tela.

#### Scenario: diálogo longo no celular
- **WHEN** um diálogo tem mais conteúdo que a altura da janela do celular
- **THEN** o corpo rola, as ações permanecem alcançáveis sem rolar até o fim, e o fundo não rola junto

#### Scenario: fechamento devolve o foco
- **WHEN** a pessoa abre um diálogo por um botão e o fecha por `Esc` ou pelo cancelar
- **THEN** o foco volta ao botão que o abriu

#### Scenario: seleção com busca por teclado
- **WHEN** a pessoa opera uma seleção com busca somente pelo teclado
- **THEN** setas percorrem as opções, `Enter` escolhe, `Esc` fecha, e a opção ativa é anunciada

### Requirement: VIS-014 — Carga preserva a moldura da tela

Carregamento SHALL preservar a estrutura já apresentada e indicar a região que carrega, e
SHALL NOT substituir o conteúdo inteiro da área por uma frase. Troca de aba SHALL NOT
desmontar e remontar a página.

Zero confirmado SHALL ser apresentado como `0`; valor indisponível SHALL ser apresentado de
forma distinta de zero. Estado vazio SHALL permanecer dentro do painel, com frase e próximo
passo. Erro SHALL trazer causa compreensível e ação de recuperação.

#### Scenario: troca de aba sem remontagem
- **WHEN** a pessoa clica em outra aba da ficha
- **THEN** a moldura da ficha permanece, somente a região da aba indica carga, e o título não pisca

#### Scenario: zero confirmado e indisponível
- **WHEN** uma contagem vale zero e outra não pôde ser consultada
- **THEN** a primeira mostra `0` e a segunda mostra indisponibilidade, sem que uma seja confundida com a outra

### Requirement: VIS-015 — Navegação única

A navegação lateral SHALL aparecer em uma forma por vez: completa, com ícone e nome, ou
recolhida, somente ícones com nome acessível. As duas SHALL NOT ocupar a tela ao mesmo
tempo. A preferência SHALL persistir entre sessões. Recolher e expandir SHALL manter o foco
no controle correspondente.

No celular a navegação lateral SHALL ceder lugar a uma navegação própria de celular, sem
duplicar a lateral.

#### Scenario: recolher pelo controle
- **WHEN** a pessoa aciona o controle de recolher
- **THEN** a lateral passa a trilho de ícones, o conteúdo ocupa o espaço liberado, e o foco permanece no controle

#### Scenario: preferência preservada
- **WHEN** a pessoa recolhe a lateral e volta ao sistema depois
- **THEN** a lateral continua recolhida

### Requirement: VIS-016 — Registro é linha, não cartão

Conjunto de registros comparáveis — pacientes, profissionais, acessos, lançamentos — SHALL
ser apresentado como linhas acionáveis sob um cabeçalho, com alinhamento consistente entre
linhas, e SHALL NOT ser apresentado como coleção de cartões decorativos.

Falha ao apresentar um registro SHALL degradar aquele registro, e SHALL NOT impedir a
leitura dos demais.

#### Scenario: lista de pacientes
- **WHEN** a pessoa abre a carteira
- **THEN** os pacientes aparecem como linhas com as mesmas colunas, cada linha abrindo a ficha

#### Scenario: um registro inválido entre válidos
- **WHEN** um registro da página não pode ser apresentado
- **THEN** aquele registro indica o problema e os demais permanecem legíveis e acionáveis

### Requirement: VIS-017 — Sistema visual verificado por teste

O sistema visual SHALL ser verificado por teste automatizado, não apenas descrito em
documento. O teste SHALL reprovar: cor de texto cujo contraste sobre o fundo declarado seja
inferior a 4,5:1; ausência de indicação de foco visível; ausência de tratamento de
`prefers-reduced-motion`; e uso da cor institucional oliva como cor de texto.

#### Scenario: oliva como cor de texto
- **WHEN** alguém define a cor institucional oliva como cor de texto sobre fundo claro
- **THEN** a verificação reprova, nomeando o contraste medido e o mínimo exigido

#### Scenario: foco e movimento
- **WHEN** a folha de tokens perde o tratamento de foco visível ou de redução de movimento
- **THEN** a verificação reprova

### Requirement: VIS-018 — Migração não altera comportamento autorizado

A reconstrução de uma tela SHALL preservar, sem alteração observável: a autorização
aplicada, a barreira de gravação, a guarda de alteração pendente, a revalidação de acesso,
o aviso de audiência, a confirmação de descarte e o vocabulário de negócio em português.

Teste existente que verifique comportamento SHALL permanecer verde após a reconstrução.
Teste removido ou reescrito por depender de estrutura interna SHALL ser nomeado na tarefa
correspondente, com a justificativa; SHALL NOT ser removido em silêncio.

#### Scenario: tela reconstruída nega o mesmo acesso
- **WHEN** uma pessoa sem permissão abre uma tela reconstruída
- **THEN** a negativa é a mesma de antes, registrada em auditoria, sem expor conteúdo

#### Scenario: alteração pendente ao sair
- **WHEN** a pessoa tenta sair de uma tela reconstruída com alteração não gravada
- **THEN** a mesma confirmação de descarte aparece antes da saída
