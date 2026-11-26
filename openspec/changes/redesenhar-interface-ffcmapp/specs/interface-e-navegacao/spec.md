# Spec Delta

## Purpose

Dar ao FFCMApp uma apresentação consistente com o estilo do mock aprovado pelo solicitante e uma navegação adaptável, legível e fluida, preservando os comportamentos autorizados dos fluxos existentes.

Fase: Inicial, restrita à apresentação dos fluxos aprovados. Os IDs FR/SC e as fases de origem das demais capabilities permanecem inalterados; este contrato não introduz novas audiências nem promove Evolução a entrega inicial.

## ADDED Requirements

### Requirement: VIS-001 — Reconhecer a mesma identidade em todas as superfícies

O produto SHALL apresentar FFCMApp, a marca recebida intacta e a linguagem do mock aprovado: Cormorant Garamond/Raleway, sidebar branca e oliva em seleção/ações. A apresentação SHALL ser consistente no acesso, área autenticada e páginas públicas existentes, preservando proporções e conteúdo dos originais.

#### Scenario: SC-VIS-001-A — Marca presente no acesso e na área de trabalho

- **WHEN** uma pessoa abre o acesso e depois entra em uma área autorizada
- **THEN** encontra a marca institucional e o nome do aplicativo com a mesma linguagem visual, sem duas assinaturas concorrentes no mesmo cabeçalho.

#### Scenario: SC-VIS-001-B — Recurso visual indisponível

- **WHEN** a imagem ou fonte não carrega
- **THEN** nome, rótulos e funções continuam legíveis e utilizáveis, sem ocultar a entrada ou deformar a composição.

### Requirement: VIS-002 — Recolher a navegação desktop preservando orientação

O produto SHALL permitir alternar a navegação desktop entre modos expandido e compacto por um controle nomeado. Destinos autorizados, localização, nomes acessíveis e foco SHALL permanecer disponíveis nos dois modos, sem reiniciar a tarefa em curso.

#### Scenario: SC-VIS-002-A — Alternância durante uma tarefa

- **WHEN** a pessoa recolhe ou expande o menu durante uma edição
- **THEN** a rota, o rascunho e a posição útil da tarefa são preservados; o controle comunica seu estado e sua próxima ação.

#### Scenario: SC-VIS-002-B — Reconhecimento por ícone

- **WHEN** um destino recebe ponteiro ou foco de teclado no modo compacto
- **THEN** seu nome fica visível e acessível sem depender da interpretação do ícone ou apenas da cor.

#### Scenario: SC-VIS-002-C — Destino não autorizado

- **WHEN** uma pessoa sem permissão usa qualquer modo do menu ou tenta a rota diretamente
- **THEN** o recolhimento não cria acesso novo; servidor e banco continuam aplicando as regras do domínio.

### Requirement: VIS-003 — Usar a navegação móvel com controle de foco

O produto SHALL oferecer navegação móvel que possa ser aberta, percorrida e fechada por toque e teclado, com estado perceptível e retorno de foco. Enquanto uma gaveta for modal, o restante da interface SHALL permanecer inacessível à interação.

#### Scenario: SC-VIS-003-A — Abertura e fechamento

- **WHEN** a pessoa abre a gaveta e usa Escape, o botão de fechar ou o fundo permitido
- **THEN** o foco permanece dentro dela enquanto aberta e retorna ao acionador quando fechada, sem deixar controles invisíveis focáveis.

#### Scenario: SC-VIS-003-B — Escolha de destino e mudança de largura

- **WHEN** a pessoa escolhe um destino ou cruza o limite entre navegação móvel e desktop
- **THEN** a rota fica clara e não restam fundo bloqueante, rolagem presa ou estado de expansão contraditório.

### Requirement: VIS-004 — Ler e operar em larguras e escalas diferentes

O produto SHALL manter hierarquia, alinhamento, leitura e ações disponíveis em celular, desktop, zoom e textos longos. Texto, estados e controles SHALL ter contraste verificável, foco visível e áreas de interação confortáveis, sem corte de funções essenciais.

#### Scenario: SC-VIS-004-A — Celular e texto longo

- **WHEN** a tela tem 360 ou 390 pixels CSS e recebe nomes, rótulos ou mensagens longos
- **THEN** o conteúdo se reorganiza sem rolagem horizontal da página e sem sobrepor ações; regiões intrinsecamente largas oferecem alternativa identificada.

#### Scenario: SC-VIS-004-B — Desktop e zoom

- **WHEN** a pessoa usa larguras de 1280/1440 pixels CSS ou amplia o conteúdo a 200%
- **THEN** títulos não afastam indevidamente a tarefa principal, controles mantêm ordem compreensível e nenhuma informação essencial depende de hover.

#### Scenario: SC-VIS-004-C — Estados além da cor

- **WHEN** um estado selecionado, pendente, inválido ou confirmado é apresentado
- **THEN** texto ou sinal acessível diferencia seu significado além da cor e o foco é perceptível sobre a superfície real.

### Requirement: VIS-005 — Usar efeitos sem condicionar o funcionamento

O produto SHALL usar transições curtas para orientar mudanças e interações, preservando as superfícies claras do mock aprovado, sem introduzir painéis de glass. Movimento reduzido ou ausência de efeitos SHALL preservar conteúdo, contraste, feedback, foco e funcionamento.

#### Scenario: SC-VIS-005-A — Interação normal e efeitos indisponíveis

- **WHEN** uma pessoa abre filtros, navegação, painel ou troca de seção com efeitos disponíveis ou desabilitados
- **THEN** compreende a mudança e executa a mesma tarefa sem aguardar uma apresentação decorativa ou encontrar conteúdo invisível.

#### Scenario: SC-VIS-005-B — Movimento reduzido

- **WHEN** a pessoa solicita movimento reduzido no dispositivo
- **THEN** transições não essenciais e rolagem animada deixam de ser necessárias para acompanhar a interface.

#### Scenario: SC-VIS-005-C — Leitura em superfície estável

- **WHEN** a pessoa lê conteúdo longo ou clínico e rola a tela
- **THEN** textos, foco e controles permanecem legíveis sobre superfícies estáveis, sem novos painéis translúcidos alterando o estilo aprovado.

### Requirement: VIS-006 — Apresentar sessão e carregamento sem mascarar falhas

O produto SHALL comunicar carregamentos conforme contexto e duração: skeleton discreto para conteúdo estruturado, indicador local para ações e progresso apenas mensurável, com feedback acessível e alternativa sem movimento. Não SHALL atrasar conteúdo pronto, mascarar falhas ou preservar dados cuja autorização foi perdida.

#### Scenario: SC-VIS-006-A — Retorno à aba e recuperação

- **WHEN** a pessoa retorna à aba e a sessão precisa ser conferida
- **THEN** encontra uma estrutura neutra coerente; dados protegidos só reaparecem após a validação necessária, com foco restaurado quando ainda pertinente.

#### Scenario: SC-VIS-006-B — Consulta falha ou permanece pendente

- **WHEN** o serviço informa falha ou a operação alcança o limite de espera definido no fluxo
- **THEN** a interface distingue falha de trabalho ainda em curso e oferece a recuperação permitida, sem um indicador infinito usado como substituto do erro.

#### Scenario: SC-VIS-006-C — Perda de autorização durante efeito

- **WHEN** sessão, vínculo ou identidade deixa de autorizar conteúdo que está sendo exibido ou animado
- **THEN** conteúdo, sobreposições e representações visuais protegidas desaparecem sem aguardar animação de saída e não persistem em uma cópia de transição.

#### Scenario: SC-VIS-006-D — Resposta rápida e conteúdo estruturado pendente

- **WHEN** uma região consulta conteúdo com estrutura conhecida
- **THEN** o feedback evita flashes em respostas rápidas e, quando a espera se torna perceptível, apresenta skeleton com as proporções da região, animação discreta e espaço estável, substituído assim que o conteúdo estiver pronto, sem duração mínima artificial.

#### Scenario: SC-VIS-006-E — Carregamento parcial e contexto autorizado

- **WHEN** regiões independentes carregam em tempos diferentes ou uma região já autorizada é atualizada
- **THEN** cada região apresenta seu próprio estado, preservando áreas utilizáveis e distinguindo conteúdo anterior de resultado novo; skeleton não informa quantidade, identidade ou dado real ainda desconhecido, nem reaproveita dados durante revalidação de acesso.

#### Scenario: SC-VIS-006-F — Ação pendente e espera prolongada

- **WHEN** uma ação permanece em processamento
- **THEN** o controle/região correspondente apresenta indicador e texto pertinente, evita reenvio duplicado sem bloquear áreas independentes e informa progresso somente a partir de dados reais; espera prolongada, falha e recuperação seguem o fluxo existente, sem falso percentual ou sucesso por tempo decorrido.

#### Scenario: SC-VIS-006-G — Feedback acessível e fim do carregamento

- **WHEN** um carregamento começa, termina, falha ou sua região é desmontada
- **THEN** mensagens são anunciadas sem roubar foco ou repetir cada frame, skeleton decorativo não vira conteúdo ou controle, movimento reduzido mantém indicação estática e temporizadores/efeitos pendentes são limpos sem reexibir respostas de um contexto anterior.

### Requirement: VIS-007 — Manter alcance e comportamento dos fluxos existentes

O produto SHALL aplicar a mesma linguagem visual às vistas e seções existentes de cada perfil, mantendo rotas, capacidades, audiência, disponibilidade e contratos de ação. Mudança de layout SHALL preservar retornos, filtros válidos e conteúdo de edição conforme o fluxo autorizado.

#### Scenario: SC-VIS-007-A — Percurso completo de uma pessoa autorizada

- **WHEN** a pessoa percorre Seu dia, carteira, cadastro, ficha e seções disponíveis ao seu perfil
- **THEN** encontra os mesmos recursos e ações autorizados, com componentes consistentes e indicação da posição atual.

#### Scenario: SC-VIS-007-B — Família e conteúdo restrito

- **WHEN** uma sessão de Família percorre os destinos disponíveis ou tenta uma seção restrita
- **THEN** o redesign não amplia o recorte de leitura/escrita definido pelo domínio nem expõe conteúdo interno por atalhos, menus ou sobreposições.

#### Scenario: SC-VIS-007-C — Recurso ainda indisponível

- **WHEN** uma integração, rota ou capacidade não está liberada
- **THEN** a interface mantém o estado verdadeiro de disponibilidade, sem apresentar uma demonstração ou controle decorativo como função conectada.

### Requirement: VIS-008 — Preservar formulários, audiência e recuperação

O produto SHALL oferecer formulários e diálogos com rótulos, instruções pertinentes, erros próximos à origem e confirmação proporcional. O redesign SHALL preservar revisão de audiência, dados em edição e proteção contra perda de trabalho previstas no domínio.

#### Scenario: SC-VIS-008-A — Validação e correção

- **WHEN** uma submissão falha por campo inválido ou erro recuperável
- **THEN** a pessoa identifica o problema, alcança o campo ou ação correspondente e preserva os dados cuja permanência ainda é autorizada.

#### Scenario: SC-VIS-008-B — Saída de diálogo ou seção em edição

- **WHEN** a pessoa cancela, fecha ou navega durante uma edição pendente
- **THEN** o comportamento de confirmação/rascunho existente continua válido, com retorno de foco e sem submissão duplicada causada pela transição.

#### Scenario: SC-VIS-008-C — Publicação e audiência

- **WHEN** uma ação envolve conteúdo interno ou disponibilizado à família
- **THEN** a audiência continua explícita antes da confirmação, conforme FR-036 e os contratos da capability responsável.

### Requirement: VIS-009 — Comunicar a verdade das integrações e dos sinais

O produto SHALL distinguir informação disponível, insuficiente, antiga, pendente de confirmação ou indisponível. Reorganização visual SHALL preservar origem, motivo e atualização pertinentes, sem transformar sinal operacional em classificação clínica ou sucesso não confirmado.

#### Scenario: SC-VIS-009-A — Agenda ou documento sem confirmação

- **WHEN** a origem não confirma leitura ou alteração de agenda/documento
- **THEN** a interface apresenta a condição real e a ação permitida de recuperação, preservando FR-025, FR-049 e FR-050.

#### Scenario: SC-VIS-009-B — Dados insuficientes na carteira

- **WHEN** faltam dados para um sinal operacional
- **THEN** o estado e o motivo continuam encontráveis junto ao caso, ainda que o detalhamento seja recolhido; ausência de dados não parece confirmação de normalidade, conforme FR-026 e FR-028.

### Requirement: VIS-010 — Compartilhar acabamento sem compartilhar dados sensíveis

O produto SHALL manter a apresentação dos convites e acessos coerente com a aplicação, sem carregar recursos externos desnecessários ou guardar dados pessoais como preferência visual. Preferências de aparência SHALL limitar-se a valores de apresentação e não conceder autorização.

#### Scenario: SC-VIS-010-A — Preferência de navegação

- **WHEN** a preferência de menu compacto é preservada ou sua persistência falha
- **THEN** somente o valor visual é usado; nomes, IDs de casos, conteúdo e sessão não são gravados por esse mecanismo, e a navegação continua utilizável.

#### Scenario: SC-VIS-010-B — Convite com proteção de conteúdo

- **WHEN** a página pública de convite recebe marca e fontes locais
- **THEN** seu fluxo continua sob as restrições de segurança aplicáveis, sem depender de CDN, liberar destinos genéricos ou expor códigos do convite em mensagens desnecessárias.
