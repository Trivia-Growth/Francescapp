# Auditoria visual e de experiência — FFCMApp

Base: `origin/main` em `80f7583`, worktree destacada em trivia-dev. Escopo: aplicativo, páginas públicas e bancadas de demonstração identificadas no repositório. As branches de migração ficam fora deste recorte. Revisão dos registros de rota em `web/main.ts`, da casca em `web/index.html`, dos renderizadores e do sistema visual do Atendimento. Onde há renderização, foi feita com o pacote compilado em Chromium, tráfego restrito a loopback e API interceptada com fixtures fictícias. Renderização parcial ou leitura de fonte são indicadas abaixo. A auditoria não incluiu login real, medição no ambiente conectado, alteração de código ou aceite de permissões.

## Prioridades por causa

| Prioridade e tipo | Causa e alcance | Critério de correção |
|---|---|---|
| P1 · inconsistência de navegação | A Administração apresenta até 13 destinos como uma faixa horizontal. A ficha já tem destinos primários e “Mais seções”, mas o transbordo acaba virando uma segunda navegação extensa. O primeiro problema mistura decisões de acesso, manutenção de vocabulário, finanças e auditoria no mesmo nível. | Todos os destinos autorizados ficam reconhecíveis por grupo a 390px, com posição atual visível. Acesso direto, voltar/avançar, foco e recortes por perfil continuam válidos. |
| P1 · defeito de desempenho percebido | Ao voltar ao catálogo emocional, a aplicação destrói e refaz a tela, reconsulta os termos e repete o carregamento inicial. A mesma máquina é usada por outros catálogos administrativos. | Medir a primeira entrada, a volta e a atualização manual separadamente. Volta com dados ainda válidos durante a sessão conserva o conteúdo se a política de autorização permitir. A validação, invalidação após gravação e retirada imediata em perda de acesso precisam ser explícitas. |
| P1 · inconsistência de composição | Cabeçalhos de contexto, avisos, superfícies, bordas e ações disputam a mesma atenção. Equipe e os catálogos já mostram que trocar componentes sem reorganizar a tarefa mantém o problema. O cadastro do paciente também herda uma composição longa de etapas e verificações. | Em cada tela, identificar o assunto, o que pode ser feito agora e a próxima ação. Uma ação principal por assunto. Registros comparáveis alinhados por colunas, controles de edição separados da leitura e avisos localizados junto do bloqueio real. |
| P1 · defeito de legibilidade móvel | A lista de Equipe corta a própria informação de estado a 390px. Outras listas que usam as mesmas primitivas e colunas de largura equivalente devem ser medidas com valores longos. | E-mail, perfil e estado completo são legíveis em tela estreita. Informação imprescindível aceita quebra de linha e fica associada à pessoa. |
| P2 · inconsistência de componentes | DOM imperativo, classes legadas e ilhas React convivem no shell, ficha, formulários, estados e diálogos. Regras globais sobrevivem mesmo onde a tela passa a usar componentes novos. | Conferir cada troca de primitivo por papel semântico, contraste, teclado, densidade mobile e estados de espera/vazio/erro. Retirar a regra antiga quando perder o último consumidor. |
| P2 · escolha estética | A serifa editorial tem personalidade, mas perde valor quando vários títulos de escala parecida competem acima da lista. Filetes e superfícies reiteram limites que o espaçamento já pode indicar. | Reservar a maior escala para o título da página, reduzir subtítulos operacionais e usar respiro para continuidade visual dentro de um assunto. |

## Catálogo emocional e Equipe

**Estado emocional observado.** `web/main.ts:2148–2228` conserva os links, mas desmonta a área anterior e monta outra ilha. `web/estado-emocional-administracao.tsx` inicia com lista vazia e omite conteúdo até a primeira leitura. `web/telas/catalogo-administrado.tsx:107–166` consulta no efeito de montagem, guarda dados apenas na instância do hook e relê após a escrita. `web/servico-catalogo-administrado-http.ts:87–90` usa `cache: 'no-store'` e prazo de 20 segundos. Não há reaproveitamento do snapshot nessa navegação. Com dados carregados na mesma montagem, uma atualização manual mantém a lista e reduz sua opacidade. Ao sair e voltar, a instância nova não conhece o resultado anterior. O texto de espera acompanha a consulta. As três barras são geradas por CSS regional com atraso de 300 ms, sem atraso artificial da consulta. A rota real também verifica a configuração do serviço antes de delegar à entrada autenticada. Rede, partida fria e banco continuam hipóteses de latência conectada, cada qual exige medição própria.

**Medição.** Em seis entradas com a fixture de dez termos, houve um GET em cada entrada, inclusive na volta. O tempo do navegador da troca de fragmento até o cabeçalho “Termos do catálogo” aparecer foi 37,0 e 15,1 ms no desktop e 45,5 e 24,5 ms no celular, sem latência adicionada. O próprio recurso HTTP levou 2,6–5,9 ms. Com 450 ms adicionados na resposta, o catálogo apareceu em 471,0 e 471,7 ms e o recurso HTTP levou 454,2 e 455,3 ms. Em outra entrada com 650 ms adicionados, a captura aos 325 ms após o texto de espera mostrou as três barras. O botão estava habilitado no DOM, sem `aria-disabled`. Durante a consulta, o clique não inicia outra, pois o hook retorna imediatamente quando ocupado. A aparência de ação disponível com clique inócuo é um defeito de feedback na base auditada. O defeito de desempenho comprovado é repetir a leitura e a espera a cada retorno. A latência do serviço conectado permanece sem medida.

**Equipe.** A lista já usa linhas e colunas compartilhadas. A fixture cobre seis pessoas, frente às três do exemplo do dono. A 390px, a coluna “Conta” fica oculta e as três colunas visíveis truncam e-mail, perfil e estado. “Acesso ativo” e “Convite pendente” ficam cortados mesmo sendo informações essenciais. É um defeito de legibilidade móvel. Converter cada linha móvel em identidade com quebra e metadados em segunda linha preserva o sentido. Os dois blocos empilhados parecem tarefas de peso semelhante porque ambos ganham títulos serifados, descrição, moldura e controles de manutenção. A lista traz “Atualizar lista” ao lado do título e reserva uma linha para estado. O formulário abre na própria página, com e-mail, perfil, motivo, “Pré-conceder acesso”, “Conferir novamente” e outro estado. A explicação sobre decisão no servidor e o fluxo de conferência ocupam espaço acima e abaixo da operação, com a condição de bloqueio longe dos campos quando a pessoa lê de cima para baixo. O formulário tem limite de 560px dentro de um painel mais largo. A página se lê melhor se a lista for o conteúdo principal, “Convidar” abrir uma área própria por intenção e o botão de reconciliação ganhar destaque apenas quando a conferência for necessária. Preservar reserva, confirmação, recuperação e rótulo específico de pré-concessão. A tarefa citada como “cadastro de usuário” foi interpretada aqui como convite da equipe. Novo paciente e edição do paciente também têm vereditos próprios.

**Organização proposta.** Manter Administração como destino principal. Dentro dela, usar uma navegação secundária vertical agrupada no desktop, com cabeçalhos e links, em vez da fita. No celular, abrir o índice por grupos, mostrar a página atual e oferecer volta visível para “Administração”. Preservar links profundos. Grupos sugeridos para validação do vocabulário: **Equipe e permissões** (Equipe, Acessos, Quem aprova plano de crise, Quem vê o financeiro), **Modelos e vocabulários** (Plano de cuidado, Ficha de plantão — modelo, Papéis declarados, Estado emocional observado), **Operação e governança** (Configuração, Credenciais das integrações, Financeiro, Auditoria, Solicitações do titular). O agrupamento deve omitir destino indisponível e grupo vazio, preservando a autorização de cada operação. Na ficha, manter poucos destinos frequentes e organizar a navegação secundária por cuidado, rotina e gestão do caso.

**Medida da navegação.** Com Administração e audiência todas habilitadas na fixture, a faixa tem cerca de 2.370px de conteúdo. A 1.440px, a faixa de 1.097px mostra só cinco dos 13 destinos inteiros. A 390px, a faixa de 346px mostra um destino inteiro. Em links profundos para Equipe e Estado emocional, a faixa começava à esquerda com a seleção fora da janela, mesmo com a página correta renderizada. A largura total do documento seguia a viewport. A rolagem pertence à faixa.

## O que a migração resolve

`web/ui/ui.css` tem 707 linhas e `web/styles.css` tem 3.444. `web/estilos/tema.css` põe os dois na camada `legado` e mapeia as mesmas variáveis para Tailwind v4, sem Preflight. As ilhas em `web/ponte/ilha.ts` ainda dependem de `web/main.ts` para a montagem. A coexistência é principalmente de primitivas e regras de composição, com uma fonte comum de cores. A migração completa com adoção das mesmas primitivas pode eliminar diferenças de botão, moldura de campo, feedback, tabela, diálogo e raio. Não há base para estimar porcentagem visual por contagem de linhas. Entre as três prioridades acima, nenhuma desaparece só com a troca de framework. Equipe e Estado emocional já são React, e a faixa de navegação e a política de remontagem vivem na casca. O CSS de páginas públicas também tem entrega e escopo próprios.

## Direção visual a partir do Atendimento

A referência combina Krub 26/22/18px com Inter Tight de 14px no corpo, 13px no controle e 12px em rótulos. A escala de 4/8/12/16/20/24/32/48px organiza separação de grupos e alinhamento. Nosso equivalente usa Cormorant Garamond para títulos, Raleway para controle e valores, e os degraus existentes 4/8/12/16/24/32/48/72px. Aplicar 8px dentro do campo, 16px entre campos e 24–32px entre assuntos, com 16px de margem móvel e campos de texto de 16px. Usar os controles de 46px que já pertencem à Francescato.

Em Atendimento, a sidebar completa e o trilho são mutuamente exclusivos, integrações moram em Configurações, e a conversa móvel expande só o trabalho em andamento. Registros comparáveis ficam em linhas, com ações discretas e separador único. O vazio usa título pequeno, explicação curta e ação opcional no mesmo painel. O componente de skeleton é decorativo ao leitor de tela, com a comunicação de estado na região que o chama. Zero e indisponível permanecem distintos. Essas decisões de hierarquia, separação e permanência do contexto são transferíveis. Referências conferidas no checkout local: `DESIGN.md`, `packages/ui/tokens.css`, `apps/web/src/app.tsx` e `apps/web/src/components/ui/{estado-vazio,skeleton,button,tabs}.tsx`.

No FFCMApp, usar branco nos painéis, fundos claros atuais para separar contexto, tinta e texto de apoio existentes, oliva escuro na ação principal com texto branco, oliva claro na seleção, e tons de aviso/erro já definidos acompanhados de texto. O oliva de marca serve de filete/área. Manter contraste, reduzir movimento conforme preferência, e manter título, contexto, navegação e conteúdo válido durante atualização. A experiência de cadastro deve tornar a etapa seguinte óbvia mesmo quando houver recuperação. A direção preserva as cores e fontes atuais e deixa a identidade final com o marketing.

## Inventário

**R** = superfície renderizada no passe local em 1440×900 e 390×844. **P** = casca ou parte da experiência renderizada, dados ou transições incompletos. **F** = inspeção de fonte. Uma superfície pode ter mais de uma ação interna. As variantes de edição, confirmação, vazio e erro estão listadas junto do destino correspondente.

### Casca e entrada

| Tela ou superfície | Prova | Veredito |
|---|---|---|
| Entrada Google, acesso interno e acesso técnico excepcional | P | Mensagem de acolhimento é reconhecível. Métodos alternativos e seus formulários precisam ficar subordinados ao acesso de rotina. |
| Retorno Google, acesso negado, sessão expirada e revalidação | F | Mensagens distinguem falha e falta de autorização. Próximo passo deve ficar junto da mensagem, com hierarquia consistente na volta. |
| Seu dia | R | “Precisa de você agora” organiza por urgência. Manter critério do indicador compreensível e linhas com ação clara. |
| Pessoas acompanhadas, filtros, paginação e vazio | R | Cartões permitem leitura em coluna única. Nome longo, estado e justificativa precisam de posições estáveis para leitura rápida. |
| Novo paciente, entrada/confirmar/recuperar/descartar | P | Dar identidade de etapa ao diálogo e guardar a ação no rodapé. Campos complementares devem ter prioridade visual menor que identificação e responsável. |
| Minha agenda, vincular agenda e compromisso | F | Distinguir ausência de compromissos, agenda desconectada e agenda indisponível. Manter autorização de calendário separada da entrada. |
| Avisos, lidos e não lidos | P | Contador é perceptível na barra. Painel precisa manter destino, motivo e estado de leitura legíveis juntos. |
| Como funciona o acompanhamento | R | Subseções editoriais orientam melhor que a faixa administrativa. Separar canal de ajuda de texto institucional quando exigirem ações diferentes. |
| Menu lateral, trilho e gaveta | R | Lateral branca e seleção tonal são bons fundamentos. Cabeçalho móvel ocupa várias linhas e recua o início da tarefa. |
| Encerrar acesso, repetir saída e estado offline/PWA | F | Mensagem de progresso ou recuperação junto da ação. Garantir que perda de sessão e indisponibilidade fiquem distinguíveis. |

### Administração

| Destino | Prova | Veredito |
|---|---|---|
| Plano de cuidado — administração | R | Novo campo e lista dividem a leitura. Dar precedência ao catálogo e agrupar configurações de cada campo. |
| Ficha de plantão — modelo | R | Cadastro de campo e metadados são densos. Separar leitura da estrutura, edição e consequências de visibilidade. |
| Papéis declarados | R | Novo papel antes da lista inverte a prioridade para quem procura algo existente. Explicar a função de rótulo junto do campo. |
| Estado emocional observado | R | Descrição longa e criar termo vêm antes da lista. O carregamento inicial repetido atrasa a tarefa mesmo na volta. |
| Acessos | P | Novo acesso tem alta saliência. Dar precedência ao estado existente e separar concessão de revogação. A fixture não cobriu `/api/acessos`. |
| Credenciais das integrações e expurgo | R | Várias seções técnicas similares. Status primeiro, edição contextual e expurgo com separação clara. |
| Configuração do sistema | R | Sequência extensa de chaves. Agrupar por domínio e mostrar valor vigente antes da edição. |
| Equipe | R | Estrutura de linhas já ajuda. E-mail truncado, duas superfícies grandes, atualização e convite competem. |
| Quem aprova plano de crise | R | Muitas opções de pessoa pedem alinhamento e status persistente. Dar destaque à consequência de cada alteração. |
| Quem vê o financeiro | R | Tela relativamente contida. Mostrar quem já tem audiência e o alcance antes de conceder. |
| Financeiro do cuidado | P | Valor por turno e Despesas do caso já têm destinos distintos. Registrar valor, histórico e consulta pedem separação entre leitura e escrita dentro de cada destino. Fluxo completo de dados fora da fixture. |
| Auditoria | R | Filtros e registros são tarefas diferentes. Conservar data, evento e alvo como primeiras chaves de varredura. |
| Solicitações do titular | R | Tipos de solicitação ficam legíveis. Reforçar a etapa atual do registro e separar ação de alteração de dados. |

### Ficha interna

Os 21 destinos abaixo estão registrados em `web/main.ts:1035–1368`. Todos foram abertos por link profundo nos dois tamanhos, usando o perfil de Administrador ou Profissional conforme o destino. Visão do caso, Execução e relatórios, Meu turno, Exportação, Equipe com acesso e Acesso da família mostraram conteúdo parcial ou de leitura. Diversos módulos mostraram apenas erro/indisponibilidade porque a fixture não cobre a API correspondente. Os vereditos de sucesso dessas telas vieram do renderizador. A expansão automática de “Mais seções” ao abrir um destino secundário ocupa quase toda a dobra de 844px no celular. Diálogos de escrita e integrações receberam leitura de fonte.

| Destino | Veredito |
|---|---|
| Visão do caso | Boa orientação de contexto, com muitas subseções competindo acima da tarefa prioritária. Dar saliência a pendências verificadas e próxima revisão. |
| Linha do tempo | Ordem cronológica é um ponto de entrada natural. Dar mais peso a evento e data que a tags repetidas. |
| Anamnese | Campos e estados de resposta precisam de grupos pequenos, navegação por assunto e distinção entre dado ausente e não aplicável. |
| Saúde | Informações instituídas e edição devem se diferenciar. Priorizar alertas relevantes e leitura dos dados atuais. |
| Plano de cuidado | Objetivos, revisão, estado e publicação dividem a mesma área. Usar hierarquia por tarefa e manter autoria e audiência perto da publicação. |
| Plano de crise | Disponibilidade, versão e aprovação precisam de estado inequívoco. Ação consequente merece posição estável e confirmação focalizada. |
| Tarefas | Estado, prioridade, prazo e responsável precisam de alinhamento para comparar. Edição com salvamento junto do item. |
| Meu turno | Destacar início, turno ativo e encerramento. Dar clareza a passagem de turno, ciência e ações de retomada. |
| Execução e relatórios | Separar leitura da ficha de plantão, editor, conversão de diário e relatório consolidado. Mostrar progresso e erros por operação. |
| Escala de turnos | Melhor navegação por período e turno, com estado explícito de disponibilidade e de agenda. |
| Cadastro | Edição de identificação, situação, responsável e contatos aglutina dados com consequências diferentes. Agrupar por assunto e preservar histórico. |
| Equipe com acesso | Diferenciar papéis, vínculos e alcance. Concessão, substituição de case manager e revogação com ações e motivos localizados. |
| Exportação | Dar primeiro o escopo, disponibilidade e consequência dos arquivos. Usar estado por etapa para geração e recuperação. |
| Acesso da família | Separar pré-autorização, convite e revogação. Destacar o estado que bloqueia o próximo passo junto do controle. |
| Pendências | Triagem pede agrupamento por responsabilidade e prazo. Gestos de manutenção devem ficar na linha. |
| Encaminhamentos | Estado e destino devem ser legíveis antes de metadados. Edição contextual reduz competição com a lista. |
| Orientações | Texto principal e público precisam ficar juntos. Separar leitura, histórico e composição. |
| Rotina e recursos | Fazer leitura de rotina, recursos e relações com objetivos por blocos sem adicionar caixas a cada fragmento. |
| Rede de cuidado | Favorável à leitura por pessoa/instituição, com papel e contato alinhados. Distinguir papel declarado de permissão. |
| Documentos | Separar lista, envio e indisponibilidade de integração. Preservar feedback seletivo de download, busca, envio e edição. |
| Diário | Texto, áudio, transcrição e conversão são passos distintos. Dar prioridade ao relato e ao estado de envio, com alternativa textual evidente. |

### Família e páginas públicas

A fixture familiar exercitou carteira, Dados, Diário vazio com editor e Relatórios com filtros. Plano, Documentos e Orientações ficaram no estado de indisponibilidade por rota sem fixture. Na ficha familiar móvel, a própria faixa de seis destinos também rola e corta rótulos. “Novo objetivo” ganha espaço ao lado de “Novo relato” mesmo nesse recorte. Conferir o papel e a disponibilidade desse comando por perfil antes de redistribuir o cabeçalho.

| Destino | Prova | Veredito |
|---|---|---|
| Carteira familiar e abertura de caso | R | Lista curta pede identificação simples e continuidade com o nome na ficha. |
| Dados do paciente | R | Hierarquia discreta. Dados e canais de referência devem permanecer fáceis de achar. |
| Diário da família | R | Separar leitura compartilhada das ações de contribuição quando disponíveis e valorizar texto. |
| Relatórios do cuidado | P | Dar acesso por período e estado de publicação, com vazio informativo. |
| Plano de cuidado compartilhado | P | Resumir objetivos vigentes e estado antes dos detalhes. |
| Documentos compartilhados | P | Explicitar disponibilidade, tipo e ação de abrir. |
| Orientações da família | P | Boa adequação ao formato de leitura. Data, título e texto devem ter papéis consistentes. |
| Convite familiar | R | Página bloqueada é concisa e tem retorno visível. Aceite ativo depende de gate; só indisponibilidade foi exercitada. |
| Consulta de convite | R | Aviso estático é claro, mas intenção precisa permanecer distinta da ativação familiar. Exercitada só a indisponibilidade. |

### Demonstrações e bancadas locais

| Superfície | Prova | Veredito |
|---|---|---|
| Entrada, carteira, pendências, cadastro e saída da demonstração | F | Prévia local histórica, com casca e controles que podem divergir da aplicação. |
| Relato fictício, Anamnese, Resumo do caso, Linha do tempo | F | Úteis como fixture de fluxo. Não representam conteúdo conectado. |
| Agenda geral, Agenda do paciente, Pessoas de referência, Evoluções | F | Mostram formas locais da tarefa; composição de grade e edição merece conferência separada se a prévia continuar em uso. |
| Orientações, Encaminhamentos, Documentos, Tarefas e Plano da demonstração | F | Formulários ao lado/abaixo de lista reproduzem a concorrência de prioridade, com diferenças de nomenclatura. |
| Galeria de componentes | F | Útil para verificar consistência das primitivas e estados sem atravessar módulos. |
| Bancadas Financeiro e Ficha de plantão | F | Bancadas de verificação de layout do repositório, fora da navegação do produto. |

Os mockups históricos em `docs/legacy/mockup/`, as alternativas da decisão em `.impeccable/mocks/` e a proposta comercial em `output/` são referências de processo e identidade. Os templates de e-mail de convite e recuperação em `supabase/preparacao/` são material de comunicação, fora da navegação. Em ativação futura, verificar a continuidade entre o texto do e-mail e o estado da página pública.

## Sequência de reforma e aceite

1. Fechar desenho de navegação da Administração e da ficha. Demonstrar links profundos e voltar por grupo em celular e desktop, com recortes de Administrador, Profissional e Família conforme o destino.
2. Reproduzir o fluxo de entrada/volta/atualização de catálogo com uma conta fictícia autorizada em ambiente conectado. Registrar duração da requisição, tempo até lista utilizável e presença de esqueleto. Separar amostras frias e quentes, e registrar mediana e p95 com quantidade de amostras. Após mudança, confirmar invalidação após editar, falha de atualização e retirada imediata em perda de autorização.
3. Entregar Equipe como primeira referência de administração: lista legível em 360 e 390px, estado completo e convite contextual. Exercitar nomes longos, acesso ativo/revogado/pendente, conta desativada, lista vazia, falha de leitura, envio sem confirmação e foco de retorno.
4. Aplicar o mesmo padrão de composição a catálogos, cadastro e painéis da ficha enquanto as frentes React convergem. Conferir 1440px, 390px e 360px, zoom 200%, tabulação, foco, contraste, movimento reduzido e estados reais de recuperação antes de tratar a migração como aceite visual.
