# Direção visual do FFCMApp

**Proposta para aprovação, com execução após a migração para React.** A família que volta depois de uma semana precisa reconhecer a pessoa acompanhada, encontrar o que está previsto para hoje e abrir o que foi publicado desde sua última consulta. A home preserva visão do dia, atualizações e verde. O expediente interno continua por tarefa e por pessoa.

As referências de código apontam para a base auditada `80f7583`. As medidas de tela vêm da auditoria com fixtures fictícias. Os valores abaixo são alvos para a reforma. O Figma indicado requer acesso e ficou fora da inspeção. No Atendimento, o checkout local `76a3ccda` documenta a escala de espaçamento de 4 a 48 px, os papéis tipográficos de Krub e Inter Tight e uma ação dominante por região. Aplicamos a regularidade e o ritmo ao uso intermitente da família, com leitura a 16 px e um primeiro quadro centrado no próximo acontecimento. [Auditoria](AUDITORIA-VISUAL.md) · [Plano](PLANO-EVOLUCAO.md) · [Distribuição](../../DISTRIBUICAO.md) · [Projeto de distribuição](../../PROJETO-DISTRIBUICAO.md) · [Referência Atendimento](../projeto/referencia-atendimento.md)

## 1. Espaçamento

**Hoje.** A área administrativa inteira para em `78ch`, seus formulários em `54ch` e a Equipe põe um formulário de 560 px dentro de um segundo painel. A largura de leitura de um texto acaba decidindo a largura de uma lista que precisa de várias colunas. A borda do painel termina depois dos campos, deixando uma área sem função. [Limites da administração](../../web/styles.css#L1541-L1566) · [Formulário da Equipe](../../web/concessao-equipe.tsx#L370-L377)

**Proposta.** Escala em px **4, 8, 12, 16, 24, 32, 48**. Usar 4 entre rótulo e ajuda curta, 8 entre rótulo e campo ou entre ícone e texto, 12 entre itens do mesmo grupo, 16 entre campos e no recuo interno de uma superfície em celular, 24 no recuo de superfície em desktop e entre grupos de um formulário, 32 entre seções da página e 48 somente entre regiões de primeiro nível em desktop. Alinhar título, lista e seus controles ao mesmo início de coluna. Listas ocupam a largura disponível na grade. Prosa explicativa tem até 65 caracteres por linha e formulários de uma coluna até 560 px, medidos no próprio conteúdo. Campos relacionados podem dividir duas colunas a partir de 1024 px quando houver espaço para rótulos completos.

## 2. Botões

**Hoje.** A primitiva React já oferece três pesos. Em Equipe, “Atualizar lista” ocupa o cabeçalho, “Pré-conceder acesso” fica em outro painel e “Conferir novamente” aparece abaixo do formulário. Ao procurar como convidar alguém, a pessoa precisa decidir entre ações apresentadas em três pontos diferentes. [Primitiva](../../web/componentes/ui/botao.tsx#L43-L69) · [Atualização da lista](../../web/concessao-equipe.tsx#L334-L355) · [Operações do convite](../../web/concessao-equipe.tsx#L408-L433)

**Proposta.** Altura mínima **46 px**, raio **10 px**, recuo horizontal **16 px**, fonte **16/22 px semibold**. Rótulo longo pode quebrar e aumentar a altura. Usar ação principal verde com texto branco, secundária branca com contorno e ação discreta com texto verde. Link abre destino e botão executa ação. Foco externo de 2 px com afastamento de 2 px. Em Equipe, “Convidar alguém” é a única ação principal do índice. Abre página própria, cujo rodapé oferece “Pré-conceder acesso” e “Cancelar”. Quando a conferência bloquear o envio, mostrar o motivo acima do rodapé e dar destaque a “Conferir acesso novamente”. Preservar os estados de reserva, reconciliação e confirmação. Durante envio, preservar largura, mostrar verbo em andamento e impedir reenvio. Na falha, manter o que foi preenchido e indicar a recuperação junto da ação.

## 3. Disposição de tabelas

**Hoje.** Equipe usa uma lista flex com aparência tabular. A coluna Conta desaparece em telas estreitas e as células que ficam normalmente têm reticências. A 390 px, a auditoria registrou e-mail, perfil e estado cortados. Fica difícil distinguir convite pendente de acesso ativo ou identificar qual conta conferir. [Colunas da Equipe](../../web/concessao-equipe.tsx#L70-L82) · [Renderização e truncamento](../../web/componentes/ui/lista.tsx#L93-L125) · [Células](../../web/componentes/ui/lista.tsx#L150-L159)

**Proposta.** Para dados que pedem comparação, usar tabela semântica quando o **contêiner** tiver pelo menos **720 px**. Em Equipe, Pessoa, Perfil, Conta e Estado ocupam **40%, 20%, 18% e 22%**, com cabeçalho e valores à esquerda. Tabelas com quantias alinham números à direita. Cabeçalho com altura mínima de 44 px, linhas de pelo menos 56 px, células com 12 px na vertical e 16 px na horizontal. Abaixo de 720 px, Equipe vira lista de registros com identidade na primeira linha, depois Perfil, Estado e Conta com rótulos visíveis. E-mail quebra inclusive sem espaços. Estado e conta cabem por inteiro e ações de linha, quando houver, vêm ao final. Preservar filtros, ordenação e paginação entre formas de apresentação. Uma matriz cuja tarefa dependa de comparar colunas simultaneamente pode rolar dentro de uma região nomeada e navegável por teclado, com indicação visível de continuação. O documento mantém a largura da tela.

## 4. Linhas

**Hoje.** A superfície compartilhada pode ter contorno próprio e divisor no cabeçalho. A lista desenha seu cabeçalho e separadores de linha. Equipe já desliga sua moldura interna, mas os dois painéis independentes ainda dão à leitura da lista e ao convite o mesmo peso. Quanto mais bordas e cabeçalhos aparecem antes do primeiro registro, mais difícil é perceber onde o conteúdo começa. [Superfície](../../web/componentes/ui/superficie.tsx#L31-L47) · [Divisores da lista](../../web/componentes/ui/lista.tsx#L93-L125) · [Moldura desativada na Equipe](../../web/concessao-equipe.tsx#L313-L323)

**Proposta.** Um divisor horizontal de **1 px** em `#DFE5D4` entre registros e abaixo de cabeçalhos tabulares. Primeira linha sem segundo divisor, última sem filete redundante. Separar seções irmãs por **32 px** de espaço. Uma superfície que precise de limite tem borda de 1 px e raio de **12 px**. Campos mantêm contorno próprio e mensagens de alerta podem usar filete de **3 px** mais texto. Uma linha interativa tem destino identificável e foco visível. Uma linha de leitura conserva aparência estática.

## 5. Ícones

**Hoje.** A lateral insere SVGs lineares com grade de 24 e traço de 1,7. O controle de recolher usa o caractere ‹. O desenho de navegação tem uma base, enquanto controles da mesma casca se apoiam em mecanismos diferentes para comunicar movimento e direção. Um símbolo sem rótulo pode exigir tentativa e erro de quem volta depois de dias. [SVGs da lateral](../../web/main.ts#L327-L354) · [Controle de recolher](../../web/index.html#L136-L145)

**Proposta.** Uma família linear com **viewBox 24 × 24**, traço **2** com terminação arredondada e cor do texto. Renderizar a **20 px** em navegação e barra e a **16 px** junto de rótulos de botão. Reservar alvos de **46 × 46 px** nos controles só com ícone. Menu, Conta, Agenda, Pessoas e Tarefas têm nomes visíveis nas entradas principais. Ícone acompanhado de texto é decorativo para tecnologia assistiva. Fechar e expandir podem usar só ícone com nome acessível, foco e indicação da ação. Usar seta para voltar e chevron para indicar abertura ou expansão. A seleção usa fundo verde claro, texto semibold e estado atual programático.

## 6. Imagem no perfil

**Hoje.** A barra de sessão contém papel e saída. O avatar existente gera iniciais para a pessoa acompanhada. O contrato de sessão traz ID, perfil de acesso, função, estado e versão, sem referência a uma foto da conta. A pessoa que usa o app carece de um ponto visual para identificar sua própria conta. [Barra](../../web/index.html#L33-L38) · [Iniciais do paciente](../../web/ficha-paciente.ts#L95-L100) · [Contrato](../../packages/contracts/src/identidade.ts#L159-L186)

**Proposta.** Construir foto **opcional da conta**, com escolha de arquivo, prévia, enquadramento quadrado, “Trocar foto” e “Remover foto”. Avatar circular de **32 px** na barra, em alvo de **46 px**, e **72 px** em Meu perfil. Usar recorte central, proporção 1:1 e reserva fixa de espaço. Sem foto ou se a leitura falhar, mostrar até duas iniciais ou ícone de pessoa se o nome ainda não existir. Para o piloto, propor JPEG e PNG até **5 MiB**, imagem final **256 × 256 px**, reencodada sem metadados. Validar tamanho, conteúdo e dimensões no serviço. Mostrar resultado só após confirmação e preservar a última foto confirmada em falha. Após remover, voltar às iniciais.

A proposta inicial é de visibilidade **apenas para o titular**. Construir leitura e escrita protegidas pelo vínculo com a conta autenticada e entrega privada da imagem, sem URL pública nem importação automática da foto do Google. Tratar substituição e remoção com política de descarte aprovada. Confirmar essa audiência, os limites, a retenção e a capacidade do armazenamento no OpenSpec antes da implementação. Provar envio inválido, acesso de outra conta, troca de sessão e remoção, além do envio e da leitura próprios.

## 7. Editar o próprio perfil

**Hoje.** A interface oferece saída de sessão e um cadastro da pessoa acompanhada. O convite administrativo contém e-mail, papel e motivo, destinados à concessão. O contrato de sessão representa a identidade de acesso e não carrega nome editável. Falta uma jornada comum para o familiar ou profissional corrigir como se identifica no app. [Sessão](../../web/index.html#L33-L38) · [Cadastro de paciente](../../web/index.html#L151-L158) · [Convite](../../web/concessao-equipe.tsx#L374-L407) · [Contrato de identidade](../../packages/contracts/src/identidade.ts#L159-L186)

**Proposta.** Avatar e rótulo “Conta” abrem menu com “Meu perfil” e “Sair”. “Meu perfil” abre página própria com foto, “Nome de exibição”, e-mail da conta quando já disponível de forma autorizada e “Salvar alterações”. Nome de exibição é a primeira edição proposta, de **1 a 80 caracteres** após aparar espaços. E-mail de autenticação, vínculo e papel de acesso ficam fora do formulário editável. Formulário alinhado à esquerda, largura de até 560 px, campos a 46 px de altura mínima e ações na ordem “Salvar alterações”, “Cancelar”. Desabilitar salvamento enquanto estiver em andamento ou sem alteração. Marcar erro no campo, manter o rascunho na falha e voltar com confirmação de sucesso ao salvar. Com alteração pendente, pedir confirmação se a pessoa tentar sair da edição.

Construir contrato de leitura e atualização da própria conta, além da persistência do nome. Identificar o titular pela sessão no servidor, aceitar apenas os campos permitidos e impor a mesma regra no banco. Preservar autoria histórica e descartar rascunho ou resposta atrasada na troca de identidade. Confirmar exposição do nome, conjunto de campos e tratamento de concorrência na futura change. Testar titular autorizado, pedido de alteração de ID/perfil e acesso direto de outra conta, além de sessão vencida e edição em duas abas.

## 8. Disposição da tela

**Hoje.** A barra reúne marca, localização, indicação de teste, papel e saída. A área administrativa tem título próprio, a faixa de destinos e só então as folhas. O catálogo auditado iniciava a lista em y=1.016 no celular. A espera do catálogo reaparecia na volta e o botão de atualizar parecia ativo durante uma consulta que descartava o clique. A combinação atrasa tanto a descoberta quanto o uso. [Casca](../../web/index.html#L23-L39) · [Administração](../../web/index.html#L222-L227) · [Medições](AUDITORIA-VISUAL.md#catálogo-emocional-e-equipe)

**Proposta.** Abaixo de **1024 px**, uma coluna, barra de altura mínima **56 px** e recuos laterais de **16 px**. Em desktop, barra **64 px**, lateral **240 px** e área útil flexível, centralizada com até **1440 px** de conteúdo e recuos de **32 px**. Usar grade **8 + 4** com intervalo de 24 px apenas quando a coluna de apoio tiver função própria, como Hoje e Atualizações. Equipe e catálogos ficam em largura integral, com título e ação antes da lista. Dentro de cada folha, a ordem é localização, assunto, ação e conteúdo. Em 390 × 844, o primeiro conteúdo real e sua ação principal aparecem na primeira dobra, sem aviso bloqueante. Em 360 px e zoom de 200%, comandos quebram para novas linhas e a página conserva rolagem vertical.

Manter as fontes locais como referência provisória até a identidade de marketing. Cormorant Garamond semibold em título de página **32/36 px** no celular e **40/44 px** no desktop. Raleway semibold em título de seção **20/28 px**, corpo **16/24 px** e metadados **14/20 px**. Base cromática: fundo `#FBFCF8`, superfície `#FFFFFF`, texto `#273123`, verde de ação `#475436`, verde de seleção e do bloco Hoje `#EDF2E6`, divisor `#DFE5D4`. Verde sinaliza ação, seleção ou contexto de hoje. Estados operacionais e clínicos têm rótulos próprios.

Na primeira consulta, reservar a área do conteúdo em espera e mostrar decoração neutra local somente se a espera passar de 300 ms. Usar status acessível por região e alternativa estática com movimento reduzido. Em atualização, conservar o conteúdo ainda autorizado e indicar a consulta junto da ação. Em erro, oferecer nova tentativa na região afetada. Vazio vem de leitura bem-sucedida. Medir a cascata e as chamadas repetidas previstas no plano. Na futura implementação React, iniciar leituras independentes em paralelo após suas autorizações e carregar módulos de Administração quando o destino os exigir. Manter a semântica de sessão e revogação ao trocar perfil ou caso.

## 9. Navegação

**Hoje.** A casca tem até quatro destinos laterais, a agenda ocupa uma região da Carteira para profissional no recorte Google, Equipe é folha administrativa e Tarefas mora dentro da ficha. A família entra pela Carteira. Na prática, procurar calendário, convidar alguém e abrir tarefa exigem descobrir três convenções diferentes. [Menu e agenda](../../web/index.html#L136-L161) · [Condição da agenda](../../web/main.ts#L2330-L2348) · [Equipe](../../web/main.ts#L2000-L2012) · [Tarefas](../../web/main.ts#L1165-L1169) · [Entrada familiar](../../web/main.ts#L2393-L2403)

**Proposta.** A família terá **Seu dia** e **Pessoas acompanhadas** em primeiro nível, com Ajuda no menu e Conta na barra. Para a equipe, manter a árvore de trabalho do projeto de distribuição e resolver as variantes de ordem com os percursos dele. No celular, usar gaveta vertical com linhas de 46 px, rótulos completos, ativo identificável e fechamento após navegar. Na ficha, “Seções da ficha” abre por ação, e o link direto entra com a seção ativa já visível. Usar a tabela de aliases do projeto de distribuição, com a nova entrada familiar sujeita a aprovação explícita.

| Procuro | Caminho proposto |
|---|---|
| Cadastrar alguém da equipe | **Administração → Contas e permissões → Equipe → Convidar alguém**. A folha lista acessos concedidos. O formulário é aberto sob demanda. Equipe com acesso ao caso continua no caso, com seu próprio escopo. |
| Ver calendário | **Agenda → Minha agenda** para quem tem capacidade aplicável. Conectar calendário é ação local. Um compromisso compartilhado pode levar ao seu detalhe, condicionado à audiência e ao vínculo. Uma agenda familiar completa precisa de aprovação e fonte autorizada. Separar agenda vazia de calendário desconectado ou indisponível. |
| Ver tarefas | **Pessoas acompanhadas → ficha → Pendências e tarefas → Tarefas do cuidado**. Seu dia oferece atalhos das tarefas acionáveis já verificadas, com pessoa, prazo e origem. A família recebe apenas ações aprovadas para sua audiência. Uma fila entre casos depende da prova de fonte e autorização prevista no projeto de distribuição. |

Validar descoberta com Administrador, Profissional e Familiar fictícios, por primeiro clique em celular e desktop. Conferir link direto, Voltar/Avançar, Escape e retorno de foco. Exercitar outro caso, revogação e tentativa de acessar utilidade improvisando o endereço. Capacidades administrativas, acesso ao caso, publicação à família e calendário têm provas independentes no serviço e no banco.

## Proposta de home

A home familiar é a mudança proposta em relação à entrada exclusiva pela Carteira no projeto anterior. As caixas pequenas, as linhas e os botões são sintomas quando a tela dá a mesma prioridade a consultar, cadastrar e configurar. A correção começa pela ordem das perguntas. **O que está previsto para hoje? O que foi publicado? Onde abro o restante?** A Carteira segue como caminho direto para as pessoas vinculadas. A home interna conserva o trabalho acionável do desenho aprovado, com atualizações autorizadas em região própria.

```text
390 × 844 · recuo lateral 16 px · ordem de leitura de cima para baixo

┌──────────────────────────────────────┐
│ Menu          FFCMApp         Conta  │  56 px mínimos
└──────────────────────────────────────┘
  Seu dia
  Sexta-feira, 27 de novembro
  Lia Alves                           caso fictício

  ┌ Hoje ─────────────────────────────┐
  │ 14h00  Encontro de acompanhamento │
  │        Ver compromisso            │  abre o item autorizado
  └───────────────────────────────────┘  fundo verde claro

  Atualizações
  25 nov   Orientação publicada
           Abrir orientação
  ─────────────────────────────────────
  21 nov   Relatório publicado
           Abrir relatório
  Todas as atualizações

  Pessoas acompanhadas
```

1. **Barra e contexto.** Menu e Conta ficam no mesmo lugar entre home e ficha. Mostrar a data por extenso e a pessoa acompanhada. Com um único vínculo, mostrar o nome direto. Com vários, oferecer seleção explícita e identificar o caso em cada linha de uma visão conjunta, se essa visão for aprovada. A 390 px, o título, a data, o contexto, a primeira informação de Hoje e pelo menos o começo de Atualizações ficam na primeira dobra no cenário típico.
2. **Hoje.** Superfície verde clara com recuo de 16 px e raio de 12 px. Mostrar até três compromissos de hoje, em ordem de horário, e apontar ao registro autorizado. A home interna usa esse bloco para o próximo trabalho verificável, com pessoa, motivo e destino. Confirmar com o solicitante a fonte permitida para a família e o fuso usado pelo caso. Sem resultado em consulta bem-sucedida, mostrar “Nenhum compromisso compartilhado para hoje”. Em falha, mostrar “Não foi possível consultar os compromissos” e “Tentar novamente”. Se a fonte familiar ainda não estiver disponível, explicar a indisponibilidade e oferecer a ficha compartilhada.
3. **Atualizações.** Até três publicações permitidas por ordem decrescente de publicação, com data visível, título e nome da ação. Mostrar as mais recentes mesmo se forem de dias anteriores. Cada linha abre o item publicado e segue a audiência vigente. “Todas as atualizações” abre o histórico autorizado quando aprovado e disponível. Se só houver fontes por categoria, usar os destinos de Materiais compartilhados. Validar com o solicitante quais publicações entram, sem inferir aprovação de feed transversal ou estado de leitura. Em vazio confirmado, “Nenhuma atualização compartilhada”; em falha, recuperação local. Hoje e Atualizações se resolvem independentemente depois de confirmar o acesso.
4. **Continuação.** Link “Pessoas acompanhadas” leva à Carteira. Em desktop, Hoje ocupa oito colunas e Atualizações quatro quando houver largura suficiente. A ordem de leitura e de teclado segue o celular. Com a conta familiar fictícia, abrir a home, localizar o compromisso e o relatório, voltar e reencontrar o contexto. Repetir com dia vazio, publicação retirada, fonte indisponível e outro caso. Conferir que o conteúdo da sessão anterior desaparece na troca de conta.
