# Spec Delta

## Purpose

Acrescentar à capability `interface-e-navegacao` os fundamentos visuais tokenizados, o tratamento do primeiro
contato, o vocabulário de movimento, a densidade por audiência, os estados com ação e a leitura de registros
longos. Fase: Inicial, restrita à apresentação dos fluxos já aprovados.

Os requisitos VIS-001 a VIS-010 de `redesenhar-interface-ffcmapp` permanecem válidos e não são reescritos
aqui. Nenhum ID FR/SC de outra capability é alterado; nenhuma audiência, permissão ou regra de domínio é
criada. Nada neste contrato autoriza remover rótulo, aviso de audiência, confirmação de descarte ou controle
de autorização para acomodar layout.

## ADDED Requirements

### Requirement: VIS-011 — Fundamentos visuais declarados uma única vez

O produto SHALL expressar tipografia, espaçamento, papéis de cor e movimento como tokens declarados em um
único lugar, e SHALL aplicar cada componente a partir desses tokens sem redefinir o mesmo seletor em blocos
concorrentes. A escala tipográfica SHALL ter degraus finitos e papéis declarados; o espaçamento SHALL vir de
uma escala única; nenhum valor literal novo SHALL competir com um token existente.

#### Scenario: SC-VIS-011-A — Uma declaração por componente

- **WHEN** alguém revisa o estilo de um componente da casca, da carteira ou da ficha
- **THEN** encontra uma declaração governante para esse componente, com os valores vindos de tokens, sem
  precisar reconciliar blocos posteriores que sobrescrevem a mesma propriedade com valor oposto.

#### Scenario: SC-VIS-011-B — Tela nova usa a escala existente

- **WHEN** uma superfície nova precisa de um tamanho de texto ou de um espaço
- **THEN** escolhe um degrau existente da escala e seu papel declarado, sem introduzir um tamanho ou um
  espaçamento intermediário próprio.

#### Scenario: SC-VIS-011-C — Troca de família tipográfica

- **WHEN** o material oficial do marketing substituir as fontes provisórias
- **THEN** a troca ocorre nos tokens de família, preservando degraus, papéis e composição, e a conferência de
  leitura é refeita sem redesenhar as telas.

### Requirement: VIS-012 — Cor de marca aplicada sem violar contraste

O produto SHALL usar o oliva da marca como superfície e traço, e SHALL manter texto, ícone e botão nas cores
de produto com contraste suficiente. Texto pequeno branco sobre o oliva da marca, ou o inverso, SHALL NOT ser
usado. Estado selecionado SHALL ser distinguível por mais de um atributo visual, nunca só por cor, e SHALL
manter o rótulo legível.

#### Scenario: SC-VIS-012-A — Aba selecionada permanece legível

- **WHEN** uma pessoa seleciona uma aba em qualquer área do produto
- **THEN** o rótulo da aba selecionada continua legível, com contraste suficiente contra seu próprio fundo, e
  a seleção é percebida também por traço, peso ou marcador.

#### Scenario: SC-VIS-012-B — Oliva de marca em superfície

- **WHEN** o oliva da marca preenche uma área
- **THEN** o texto sobre ela usa a cor escura aprovada e atinge a referência de contraste para texto normal;
  nenhum texto pequeno em branco é aplicado sobre essa superfície.

#### Scenario: SC-VIS-012-C — Cor oficial ainda não confirmada

- **WHEN** o manual de marca não tiver confirmado os códigos exatos
- **THEN** os valores extraídos permanecem como estão, sem clarear, escurecer ou substituir a cor para
  alcançar contraste, e o ajuste de contraste é feito pelo papel da cor.

### Requirement: VIS-013 — Movimento que orienta, com vocabulário fechado

O produto SHALL animar apenas transições de estado de controle, troca de conteúdo na mesma tela e entrada ou
saída de contexto, usando um conjunto fechado de durações e curvas. Mensagem de erro, retirada de conteúdo
protegido, números e valores SHALL NOT ser animados. Nenhuma animação em laço SHALL existir além dos
indicadores de espera já aprovados. Com `prefers-reduced-motion`, nenhuma transição ou animação SHALL
ocorrer, e o estado final SHALL ser o estado apresentado.

#### Scenario: SC-VIS-013-A — Troca de contexto orientada

- **WHEN** uma pessoa abre a ficha de um paciente e depois volta para a lista
- **THEN** a mudança é acompanhada por uma transição curta de entrada e saída que indica de onde veio e para
  onde foi, sem atrasar a leitura nem reposicionar o foco.

#### Scenario: SC-VIS-013-B — Erro imediato

- **WHEN** uma operação falha
- **THEN** a mensagem de falha aparece imediatamente, sem transição de entrada, e permanece anunciada para
  tecnologia assistiva.

#### Scenario: SC-VIS-013-C — Saída de conteúdo protegido

- **WHEN** a sessão termina, o acesso é perdido ou a identidade muda
- **THEN** o conteúdo protegido é retirado da tela imediatamente, sem transição que o mantenha visível por
  mais tempo.

#### Scenario: SC-VIS-013-D — Movimento reduzido

- **WHEN** o sistema da pessoa indica preferência por movimento reduzido
- **THEN** nenhuma transição ou animação é executada em qualquer superfície, incluindo as criadas depois desta
  change, e o conteúdo aparece diretamente em seu estado final.

### Requirement: VIS-014 — Primeiro contato acolhedor e contido

A tela de acesso SHALL apresentar a marca intacta, uma frase de acolhimento aprovada e um caminho de entrada
visível por vez, com os demais recolhidos em dobras identificáveis como controle. Avisos administrativos SHALL
permanecer legíveis sem ocupar o maior destaque da primeira dobra, e recursos de página de venda SHALL NOT ser
usados.

#### Scenario: SC-VIS-014-A — Família chega pela primeira vez

- **WHEN** uma pessoa da família abre a tela de acesso em um celular
- **THEN** encontra a marca, uma frase de acolhimento e um caminho de entrada claro, sem precisar escolher
  entre duas ações de mesmo peso e sem que um aviso administrativo seja o elemento mais destacado.

#### Scenario: SC-VIS-014-B — Caminhos excepcionais recolhidos

- **WHEN** existem caminhos de acesso adicionais, como confirmação de e-mail ou acesso técnico
- **THEN** cada um aparece como uma dobra identificável como controle, com área de toque suficiente, e abrir
  uma dobra não desloca nem esconde o caminho principal.

#### Scenario: SC-VIS-014-C — Marca usada como recebida

- **WHEN** a marca institucional é aplicada na tela de acesso
- **THEN** aparece como o material recebido, sem recorte, transparência simulada, deformação ou redesenho do
  símbolo, e sem assinatura gráfica inventada.

#### Scenario: SC-VIS-014-D — Falha de recurso visual

- **WHEN** a imagem da marca ou a fonte não carrega
- **THEN** o nome do aplicativo, os rótulos e os campos continuam legíveis e utilizáveis, e a composição não
  se deforma.

### Requirement: VIS-015 — Uma interface, duas densidades

O produto SHALL servir leitura e registro com a mesma identidade visual, variando a quantidade de blocos por
tela, o peso dos controles de escrita e a forma de apresentação dos registros. Uma tela de registro SHALL ter
uma única ação principal destacada. Nenhuma variação de densidade SHALL remover informação que a audiência já
recebe, alterar quem vê o quê, ou criar uma segunda identidade visual.

#### Scenario: SC-VIS-015-A — Registro durante o plantão

- **WHEN** um profissional abre a tela de registro em um celular, de madrugada
- **THEN** encontra o formulário no início, agrupado por assunto, com uma única ação principal destacada para
  concluir o registro e as ações secundárias subordinadas a ela.

#### Scenario: SC-VIS-015-B — Leitura pela família

- **WHEN** uma pessoa autorizada consulta o acompanhamento
- **THEN** lê os registros como texto corrido com data e autoria discretas, sem perder nenhum campo que sua
  audiência já receberia, e sem controles de escrita que não lhe pertencem.

#### Scenario: SC-VIS-015-C — Audiência inalterada

- **WHEN** a densidade de uma superfície é ajustada
- **THEN** quem vê cada informação permanece exatamente o mesmo, decidido no servidor e no banco, e a
  apresentação não é usada como mecanismo de restrição.

### Requirement: VIS-016 — Estados de espera, vazio e erro com saída

Toda região que carrega, fica vazia ou falha SHALL apresentar o estado correspondente com uma saída imediata:
texto que explica o que aconteceu em voz de produto e, quando houver recuperação possível, a ação adjacente ao
texto. O estado de espera SHALL manter o atraso curto já adotado antes de qualquer movimento, preservar a
estabilidade do layout e anunciar-se para tecnologia assistiva. O estado vazio SHALL convidar à próxima ação
em vez de descrever o formulário.

#### Scenario: SC-VIS-016-A — Falha de uma região

- **WHEN** a leitura de uma região falha
- **THEN** a pessoa lê o que aconteceu e encontra a ação de tentar novamente junto da mensagem, sem procurar
  um controle distante da falha.

#### Scenario: SC-VIS-016-B — Espera curta e espera longa

- **WHEN** uma consulta responde rapidamente, e em outra ocasião demora
- **THEN** a resposta rápida não produz piscada de esqueleto, e a demora apresenta o esqueleto compatível com
  o conteúdo esperado, sem salto de layout quando o conteúdo chega.

#### Scenario: SC-VIS-016-C — Lista vazia

- **WHEN** uma lista não tem itens para a pessoa
- **THEN** a tela explica a situação e oferece a próxima ação pertinente ao seu acesso, sem descrever
  exigências de formulário como se fossem a explicação.

### Requirement: VIS-017 — Registros longos legíveis no celular

Seções de registro extenso, como diário, evolução e ficha de plantão, SHALL agrupar campos por assunto,
apresentar o texto explicativo subordinado ao campo que ele explica e manter a ação de conclusão alcançável
sem percorrer a tela inteira. A navegação entre seções de uma ficha SHALL indicar continuidade quando houver
mais destinos do que cabem na largura, e SHALL agrupar destinos quando forem muitos.

#### Scenario: SC-VIS-017-A — Preencher a ficha de plantão no celular

- **WHEN** um profissional preenche a ficha de plantão em um celular
- **THEN** percorre grupos identificáveis por assunto, com a orientação de cada campo subordinada a ele, e
  alcança a ação de concluir sem perder a posição do que já preencheu.

#### Scenario: SC-VIS-017-B — Navegação da ficha com muitos destinos

- **WHEN** a ficha oferece mais destinos do que cabem na largura disponível
- **THEN** a faixa de navegação indica que há continuidade, e os destinos adicionais aparecem agrupados por
  natureza em vez de uma lista contínua de rótulos.

#### Scenario: SC-VIS-017-C — Leitura de um registro publicado

- **WHEN** alguém lê um registro já publicado
- **THEN** distingue o conteúdo do registro dos seus metadados sem que cada linha repita um rótulo em
  destaque, e a situação, a audiência e a autoria continuam visíveis.
