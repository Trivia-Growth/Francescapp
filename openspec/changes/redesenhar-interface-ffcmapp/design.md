# Design

## Context

Ver [proposal.md](proposal.md) para motivação e recorte. Esta decisão substitui o redesign livre anteriormente proposto: **o solicitante aprovou seguir o mock anexado**, com consistência, animações discretas, fluidez e sidebar recolhível. Não aguardar outra escolha gráfica, aplicar Impeccable ou gerar imagem de conceito.

Referência estética literal: captura enviada pelo solicitante em `/Users/lucasazevedo/Library/Application Support/orca/agent-session-attachments/b107d053-e99f-444e-a91d-a91e5b90194d/orca-paste-1794957809061-1abffd23-1a92-46bc-af38-6b7eab63b821.png`. A imagem foi inspecionada nesta preparação: sidebar branca com ícones lineares e item ativo oliva suave, superfícies claras, títulos serifados e carteira em cartões de duas colunas. Ela não é asset de produção nem fonte de dados.

Arquivos de referência somente de leitura: `docs/legacy/mockup/source/{styles.css,index.html,app.js}`. A leitura confirma `case-grid` com duas colunas em `styles.css:6` e `app.js:149`, uma no celular (`styles.css:12`); o refinamento final altera espaçamento e tamanhos (`styles.css:40`) e achata **outras** regiões como `case-row` e `timeline-card` (`styles.css:34` e `:39`). Portanto não substituir a carteira aprovada por linhas a partir de uma leitura genérica do CSS final. Se uma medida ou outro tratamento do arquivo histórico diferir da captura, a captura governa a estética; requisitos funcionais e acessibilidade governam o comportamento.

Base efetiva: `codex/refino-visual-pr16`, commit `804428e79334234a59b1cd415692a976b60246ef` do PR #16, confirmado em 17/11/2026. Worktree isolada `ffcmapp-refino-visual-mock`; a sessão em `ffcmapp-experiencia-mock` permanece intocada. Recomendações antigas de Source, glass, rail 256/breakpoint 64rem e carteira em linhas estão superadas. A matriz abaixo foi reconciliada com esse commit; disponibilidade em produção continua dependente dos gates de cada domínio.

### Gaps prioritários e ações avaliáveis

A carteira desktop publicada foi observada na revisão anterior. Na execução, a renderização real do frontend foi conferida localmente com respostas fictícias isoladas: carteira e shell desktop/celular, Seu dia, ficha e carregamento. Isso comprova apresentação dos estados exercitados, sem provar integração ou autorização. Cobertura e limites atuais estão em `estado.md`.

| Prioridade / gap | Evidência e alcance | Ação proposta para a retomada |
|---|---|---|
| P1 Marca ausente e nome duplicado | Observado na carteira desktop: FFCMApp na lateral e no topo, sem logo original. Fonte coloca imagem institucional no acesso. | Uma marca recebida intacta no shell; nome FFCMApp como identificação/fallback; topo para localização e sessão. Mesma linguagem nas páginas de acesso/públicas. |
| P1 Escala e peso excessivos | Observado na carteira: título domina; navegação e ações têm peso forte. Fonte usa H1 de 50px e diversos pesos 600/700; demais telas ainda não vistas. | Reequilibrar papéis e pesos conforme captura, mantendo serifada nos títulos, Raleway funcional e leitura confortável. Não reduzir todos os textos nem trocar fontes. |
| P1 Ferramentas acima das pessoas | Observado: filtros largos e busca separada consomem primeira dobra; primeiro paciente fica junto ao limite inferior. | Reorganizar espaçamento e hierarquia para carteira em cartões como a captura; busca/filtros reais com presença secundária e sem perda de recorte/paginação. Não adicionar busca global nem filtros fictícios. |
| P1 Badges e avisos competem com nome | Observado no primeiro caso: situação a completar e informação insuficiente ocupam atenção extensa; não se concluiu nada clínico. | Nome/preferência dominantes; estado curto, motivo encontrável e metadados subordinados. Não esconder falta de informação nem converter sinal em normalidade. |
| P2 Alinhamento e ritmo | Observado nos filtros/ações e na diferença entre título/painel; abrangência de formulários é leitura de classes, não inspeção total. | Grade, linha de base, alturas, espaçamentos e hierarquia de ações consistentes; aplicar classes comuns à matriz de cobertura e validar longos/zoom. |
| P1 Navegação sem modo compacto | Fonte desta base não tem rail acessível; teclado/mobile completos não foram testados. A sessão Claude está alterando navegação móvel. | Conciliar sua entrega; acrescentar recolhimento/ícones/identificação e foco quando faltarem, sem segunda gaveta ou alteração de destinos. |
| P2 Movimento sem sistema consistente | Leitura de fonte mostra pouco movimento funcional; screenshot estático não comprova fluidez ou ausência de animação no publicado. | Transições curtas e coerentes em controles/navegação; validar reduced-motion e desempenho percebido na retomada, sem efeitos decorativos novos. |
| P1 Estados desconectados visualmente | Relato do usuário e leitura de status/carregamento/erro nas fontes. “Verificando seu acesso…” não foi visto travado na carteira capturada. | Reproduzir entrada/retorno de aba; só então reduzir flicker comprovado e harmonizar estrutura/feedback, preservando ocultação de dados, timeout e recuperação existentes. |

**Gate de retomada atendido:** o solicitante pediu a execução após informar o PR #16. O commit publicado foi conferido e usado como base; frentes Terra receberam arquivos exclusivos e a gaveta existente foi reutilizada. Não houve merge, push ou deploy.

## Goals / Non-Goals

**Goals:**

- Reproduzir a linguagem aprovada com os dados já disponíveis: Cormorant Garamond nos títulos, Raleway no texto funcional, sidebar branca, seleção e ações em oliva, hierarquia e proporções reconhecíveis.
- Aplicar consistência por fundamentos e classes existentes, cobrindo vistas dinâmicas sem remontar dados ou duplicar componentes funcionais.
- Acrescentar navegação desktop recolhível e completar a navegação móvel entregue pela sessão em andamento, preservando nós, eventos, rascunhos e destinos; decidir organização do módulo após conciliação.
- Melhorar feedback de carregamento/revalidação somente na apresentação; preservar fronteiras da sessão e verdade das integrações.

**Non-Goals:**

- Alterar autenticação, rotas, APIs, RLS, campos de negócio, permissões, audiências, gates ou regras clínicas. Ajustes locais de foco, visibilidade e prevenção de reenvio preservam esses contratos.
- Migrar fontes, criar design system ou arquitetura novos, adicionar glass, dependência de animação, biblioteca/CDN ou variação de marca.
- Reproduzir dados, narrativas, equipes, filtros fictícios, seletor de perfil, agenda global ou funções não conectadas do mock.
- Copiar alterações da worktree ativa, editar o arquivo global de estado, publicar ou ativar integrações.

## Decisions

### 1. A captura é a referência; o produto continua a fonte funcional

A carteira pode usar os mesmos nós `ul/li/button` existentes em uma grade de dois cartões em desktop e um em celular. Nome, preferência, situação e sinal aparecem somente quando devolvidos para o perfil. Não preencher idade, relato, revisão ou equipe com conteúdo fictício para imitar cartões da captura. Filtros existentes continuam oferecendo os recortes reais e busca apenas na página carregada; nenhum filtro do mock será inventado. Leitura de lista e cartão mantém uma única ação de abrir ficha, sem aninhar botões.

Alternativas rejeitadas: nova composição editorial livre; copiar HTML/JS de demonstração; impor linhas planas à carteira porque outras regiões do CSS foram achatadas. Essas opções substituiriam a preferência explícita ou confundiriam simulação com produto.

### 2. Fundamentos existentes e marca intacta

Preservar os WOFF2 locais de Cormorant Garamond/Raleway e suas licenças. Consolidar tamanhos, pesos, linhas, espaçamentos e alinhamentos em `web/styles.css`, usando captura e CSS histórico como referência, não importação cega da cascata. Títulos mantêm caráter serifado e proporção da referência; texto funcional permanece legível, campos com 16px, foco perceptível e contraste verificável. Não corrigir excesso de peso simplesmente reduzindo toda a interface.

Usar imagem recebida em `assets/brand/francescato/` ou cópia de bytes intacta já existente em `web/assets/`, preservando proporção e fundo incorporado. O símbolo desenhado em SVG no mock não é logo aprovado para reproduzir. Nome textual FFCMApp funciona como fallback e no modo compacto quando a imagem não cabe com leitura; não recortar, remover fundo, reconstruir símbolo ou inventar monograma. Marketing continua responsável por variantes finais pequenas.

Sidebar e topo permanecem brancos. Oliva da marca é referência institucional; controles usam os tons existentes de contraste adequado e seleção suave do mock. A amostra `#839352` não é autorização para texto pequeno branco nessa cor, cujo contraste inicial é insuficiente conforme `docs/projeto/identidade-visual.md`.

Alternativas rejeitadas: Source, sidebar inteiramente oliva, novos painéis translúcidos e símbolo próprio. Todas foram superadas pela aprovação do mock.

### 3. Estilo compartilhado entre principal, acesso e páginas públicas

Acesso Google/técnico, validação de sessão, saída, `/convite-familiar/` e `/consulta-convite/` recebem os mesmos papéis de texto, campos, botões e feedback, com recursos locais. Reutilizar folha compartilhada ou referências locais de forma mínima; não criar pipeline de assets. Se página pública precisar liberar o carregamento de marca/fontes, sua CSP recebe somente `img-src 'self'` e `font-src 'self'`, sem alterar scripts, conexão, formulários, base, proteção de frame ou destinos da autenticação.

Os formulários públicos permanecem com seus gates e operações atuais. Aparência consistente não significa convite ou recuperação ativos; nenhuma chamada nova é criada. Não transportar token/código/paciente para preferência de aparência.

Alternativa rejeitada: copiar CSP inteira do acesso ou usar Google Fonts/CDN. Ampliaria dependência e superfície sem necessidade.

### 4. Conciliar a navegação existente antes de escolher extração

A navegação móvel do PR #16 foi reutilizada no bloco existente de `main.ts`. A integração não exige módulo independente, segunda gaveta, listeners concorrentes ou segundo roteador.

Contrato integrado: `patients-sidebar`, `toggle-sidebar`, `sidebar-backdrop`, links e destinos originais preservados; `collapse-sidebar`, `close-sidebar`, `sidebar-icon`, `sidebar-link-label`, `sidebar-tooltip`, `body.sidebar-collapsed` e `body.sidebar-open`. Desktop 248/80px; breakpoint existente de 760px. A própria sidebar recebe semântica modal e inércia no celular, com rolagem interna, em vez de duplicar destinos em outro diálogo.

Responsabilidade visual: estado expandido/compacto, ícones, nome visível no foco/ponteiro, gaveta, foco, Escape, fechamento, resize e limpeza dos efeitos modais. Não decidir permissões, chamar API, alterar hash, interceptar confirmação de rascunho, clonar links ou remontar vistas. Preservar nós/listeners e IDs/hrefs de domínio, obedecendo ao `hidden` definido pelo fluxo de sessão. Links ocultos nunca se tornam disponíveis por recolhimento, tooltip ou resize.

Desktop: acionador nomeado comunica estado e próxima ação; links compactos têm nome acessível permanente e identificação visual ao foco/ponteiro, dispensável por Escape quando pertinente. A proposta atual não grava preferência em storage; não criar persistência só para o refino. Se no futuro houver preferência existente a preservar, ela continua estritamente visual e nunca guarda identidade/caso.

Celular: abrir, percorrer, fechar e retornar ao acionador; enquanto modal, fundo inerte e rolagem controlada, foco contido, links fora da tela inacessíveis quando fechado. Ao escolher um destino, respeitar a decisão do fluxo existente: cancelar descarte mantém tarefa; navegação aceita fecha a gaveta. Ao cruzar breakpoint, sair da área autenticada ou ocultá-la para revalidação, limpar backdrop, inércia e bloqueio de rolagem sem reexibir conteúdo protegido nem focar elemento oculto. Histórico e destinos continuam pertencendo ao roteador atual.

Alternativas rejeitadas: extrair antes de conhecer o commit concluído, duplicar links para modo compacto, criar provider global de UI ou congelar antecipadamente um arquivo de integração. A necessidade é um comportamento acessível, não uma arquitetura predeterminada.

### 5. Cobertura por classes; sem novas funções

Esta matriz foi reconciliada com o commit do PR #16 e delimita a cobertura por classes e estados. Ela não ratifica disponibilidade de integração; a evidência de cada grupo e suas limitações ficam no estado operacional.

| Grupo | Superfícies e fontes atuais | Aplicação visual / limite |
|---|---|---|
| Entrada e casca | `index.html`, `public/convite-familiar`, `public/consulta-convite`, apresentação em `main.ts` | Logo, tipos, campos, status, foco e layout; preservar fluxos Google/técnico e gates familiares. |
| Coordenação e carteira | `home-profissional.ts`, `filtros-carteira.ts`, lista e cadastro em `index.html`/`main.ts`, `painel-cadastro.ts` | Estado de Seu dia, filtros/busca/paginação, grade de pacientes e diálogo existente; sem agregações de agenda/relatos novas. |
| Ficha e leitura | `ficha-paciente.ts`, `visao-caso.ts`, `linha-tempo.ts`, `secao-dados-familiar.ts` | Identidade, abas, painel, origem/datas, estados; preservar destinos primários e Mais seções do PR. Abrir ficha desmonta Seu dia para não sobrepor vistas; identidade móvel separa ações em linha própria. |
| Conteúdo do caso | Anamnese, Saúde, Plano, Crise, Tarefas, Pendências, Encaminhamentos, Orientações, Contexto, Rede e Diário | Classes comuns de cabeçalho, seção, formulário, lista e estado; texto longo/erro legível. Sem habilitar escrita de tarefas ou ampliar recorte familiar; conferir o comportamento efetivamente concluído. |
| Governança do caso | Cadastro/contatos, Equipe com acesso/revogação, Exportação, Acesso da família | Consistência visual preservando motivo, versão, audiência, operação incerta e acesso imediato. |
| Arquivos e áudio | `documentos-caso.ts`, `transcricao-audio.ts` e serviços, somente leitura | Estados e controles existentes; sem habilitar microfone/Drive ou inventar visualizador/download. |
| Agenda disponível | `agenda-individual.ts`, `agenda-operacoes.ts`, `agenda-vinculo.ts` | Refinar lista/formulário/estado atual de P Google; sem agenda global/caso/semana nova. |
| Administração e regras | Configuração, Equipe, Habilitação de crise, Auditoria, Solicitações do titular, Regras | Campos/listas/tabela/feedback coerentes; catálogo dinâmico e disponibilidade atuais. |
| Demonstração/legado | `demonstracao.*`, módulos locais e `docs/legacy/mockup/source/` | Referência/fixture somente; não editar o legado nem promover simulação a integração. |

Os IDs possíveis de ficha são `dados`, `visao`, `linha-tempo`, `anamnese`, `saude`, `plano`, `crise`, `tarefas`, `cadastro`, `equipe`, `exportacao`, `acesso-familia`, `pendencias`, `encaminhamentos`, `orientacoes`, `contexto`, `rede`, `documentos`, `diario`; a montagem é específica de perfil/capacidade. Família nesta base possui `dados`, `diario`, `plano`, `documentos`, `orientacoes`, sem Seu dia/administração. As cinco áreas administrativas são `configuracao`, `equipe`, `plano-de-crise`, `auditoria`, `solicitacoes`. Inspeção conectada deve conferir os grupos alcançáveis sem habilitar gates para fechar checklist.

Filtros da carteira ficam em `details` nativo, recolhidos inicialmente e com contagem dos campos realmente ativos; opções, busca local, callbacks e paginação mantidos. Mutações de Pendências compartilham guarda de gravação porque retornam snapshots completos do painel; o bloqueio é local ao módulo e restaura controles após falha.

Alternativa rejeitada: reescrever renderizadores de domínio apenas para estilizar. A prioridade é alcançar elementos já produzidos por classes; necessidade concreta de mudar comportamento volta à coordenação e ao recorte OpenSpec correspondente.

### 6. Movimento curto, feedback verdadeiro e remoção imediata

Transições discretas, aproximadamente 120–200ms para cor/borda/estado e até 220ms para navegação, sem escala em texto, entrada escalonada de pacientes, parallax, vidro novo ou atraso decorativo. Priorizar `opacity`/`transform` onde não gerem cópia de conteúdo; mudança de largura precisa preservar alinhamento do topo/conteúdo/rodapé e não remontar DOM. Sem dependência nova ou `will-change` permanente.

`prefers-reduced-motion` desliga movimentos não essenciais e rolagem suave; estado final, foco e limpeza modal não dependem de `transitionend`. O `hidden` de segurança continua imediato: não substituí-lo por opacidade, animação de saída, screenshot ou clone da tela anterior.

O relato sobre “Verificando seu acesso…” não comprova travamento ativo. Na retomada, reproduzir entrada e retorno à aba, observar estado final/tempo e só então ajustar o flicker ou a estrutura visual que a evidência justificar. A mensagem não desaparece por CSS enquanto a verificação continua. Não mudar timeout, retry, armazenamento, chamadas ou autenticação. Falha, sucesso, rascunho, falta de fonte e resultado incerto mantêm textos/ações reais. Um problema de sessão reproduzido que exija alteração de fluxo fica como achado separado, não correção oculta nesta fatia.

#### 6.1. Padrão transversal de carregamento — pedido adicional do solicitante

Aplicar às superfícies existentes da matriz, incluindo acesso/revalidação, Seu dia, carteira, ficha/seções, formulários, diálogos, agenda, administração e páginas públicas. Reaproveitar `web/esqueleto.ts` e os estados atuais antes de criar mecanismos novos. Nenhum loading depende de biblioteca, chamada adicional ou mudança de contrato de dados.

| Contexto | Apresentação planejada |
|---|---|
| Resposta rápida | Reconhecer a ação e impedir envio duplicado imediatamente quando aplicável. Adiar apenas a decoração visual por aproximadamente 300ms para evitar flashes; placeholders reservam geometria desde o início, com decoração invisível até esse prazo. Nunca atrasar a requisição ou conteúdo pronto para completar animação. |
| Primeiro conteúdo estruturado | Skeleton de cartões/lista/bloco de leitura com geometria aproximada do resultado e espaço reservado. Usar placeholders neutros, sem nomes, contagens, badges ou quantidade de casos inferida. Animação suave de opacidade, sem brilho intenso, escala ou varredura pela página inteira. |
| Ação localizada | Indicador compacto junto ao botão/linha e verbo pertinente, como “Salvando…”. Preservar largura do controle e contexto da edição; bloquear somente o reenvio/operação conflitante previsto no fluxo. Não transformar botão, diálogo inteiro ou toast em skeleton. |
| Regiões independentes | Exibir conteúdo conforme fica pronto, sem esperar o módulo mais lento nem cobrir toda a aplicação. Falha parcial ocupa a região correspondente. Paginação/anexação não apaga a lista já autorizada. |
| Atualização no mesmo contexto | Manter conteúdo apenas se ainda autorizado e identificado como atualização pendente, sem apresentar resultado anterior como resposta do novo filtro/caso. Preservar foco e rascunho. Isso nunca se aplica à revalidação de autorização, identidade ou vínculo: ali a ocultação continua imediata e a espera é neutra. |
| Espera de vários segundos | Após cerca de 3s, considerar texto contextual de espera mais longa enquanto a operação continua pendente. São parâmetros de apresentação a medir, não timeout ou confirmação de falha. Percentual/etapa somente se a origem os fornecer; sem estimativa fictícia ou retry/cancelamento novo. Erro/limite existente encerra loading e apresenta a recuperação permitida. |

O shell estático pode aparecer imediatamente quando não revelar dados protegidos; conteúdo autorizado deve substituir o placeholder por região, sem animação escalonada de cada linha ou atraso mínimo de exibição. Evitar spinner, skeleton e banner concorrentes para a mesma espera. O skeleton representa estrutura, não uma previsão de quantos resultados ou quais campos sensíveis existirão. Reservar dimensões responsivas para evitar deslocamentos quando dados, fontes ou imagens chegarem.

Acessibilidade: usar `aria-busy` na região efetivamente atualizada e um status textual por operação, anunciado de forma educada sem mover foco. Manter a mensagem anunciável fora de um ancestral marcado como ocupado quando isso adiar seu anúncio; limpar o estado ocupado ao concluir/falhar. Placeholders/ícones decorativos usam `aria-hidden`, não entram no Tab nem recebem rótulos individuais. Anunciar término/erro uma vez quando não houver mudança de contexto que já o comunique. Com `prefers-reduced-motion`, remover pulso/rotação e manter formas estáticas mais texto; função não depende da animação. Limpar timers e efeitos ao concluir, falhar, navegar, ocultar ou desmontar, ignorando respostas de contexto antigo; cancelar observação local não significa cancelar operação remota.

Conferência futura inclui resposta imediata, espera perceptível/prolongada, conteúdo parcial, erro, movimento reduzido, troca de contexto e revalidação. Simulação de latência serve à apresentação, não comprova integração. Novo teste só quando proteger um comportamento relevante, como timer antigo reabrindo loading ou mensagem de outro contexto, executado isoladamente conforme política do projeto.

Referências primárias consultadas: [Carbon — Loading](https://www.carbondesignsystem.com/building-blocks/core/patterns/loading), [Utah — Skeletons](https://designsystem.utah.gov/library/components/widgetsIndicators/skeletons), [W3C — status acessível](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22), [MDN — aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy) e [MDN — movimento reduzido](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion). As durações acima são escolhas iniciais deste plano, sujeitas à medição; as referências não impõem um cronograma universal.

### 7. Execução local e validação proporcional

**Agora:** execução local autorizada. Baseline, lint/typecheck integrados, testes focais e revisão formal dos dois eixos são registrados em `estado.md`, com revisão-base e limites. Esses resultados não substituem ativação ou prova conectada.

**Passagem integrada:** frentes Terra exclusivas de visual, navegação e loading trabalharam sobre o SHA registrado. A coordenação integra o diff e os revisores independentes conferem padrões e VIS/SC-VIS. Nenhum executor altera a worktree da outra sessão. Código segue DOM seguro existente, sem `innerHTML`, estilos/eventos inline ou liberação de CSP genérica.

**Primeira entrega observável:** shell, sidebar e carteira serão comparados renderizados com a captura em desktop e celular antes da propagação às demais telas. Essa conferência verifica proporções, primeira dobra, marca e navegação; não abre nova escolha estética nem exige publicação. Capturas e achados dessa etapa serão reaproveitados no aceite final, atualizados quando o diff afetar o resultado.

Durante implementação: `pnpm run verificar:rapido` para lint/typecheck; executar isoladamente cada arquivo novo/afetado de navegação ou loading que proteja comportamento relevante, com reporter minimal e `silent: 'passed-only'`, repetindo só o afetado após correção. CSS reversível não requer testes que congelem medidas incidentais. Uma revisão formal por fatia, nos eixos padrões e aderência VIS/SC-VIS; limitações e requisitos não exercitados ficam explícitos.

Aceite conectado, quando houver acesso/ferramentas e autorização aplicável: inspeção conjunta desktop 1280/1440 e celular 360/390, nomes longos, zoom 200%, teclado, movimento reduzido, marca/fontes locais e estados carregando/vazio/erro/sucesso. Provas positivas e negativas de autorização/RLS continuam obrigatórias na ativação conforme projeto; teste de navegação com DOM fictício não as substitui. Executar `pnpm run verificar:ativacao` uma vez na ativação, não a cada alteração. Ausência de prova mantém a fatia não ativada, mesmo com lint/typecheck verdes.

Pendências funcionais a **revalidar**, fora deste recorte visual: jornada familiar/convites/recuperação e sua entrada por caso; agenda global/caso e confirmação na origem; escrita de tarefas/conversão do Diário; gravação/transcrição/revisão/exclusão de áudio e policy de microfone; registro de solicitação do titular sem contexto de paciente; ações de documentos não ligadas. O inventário levantou essas lacunas, mas a sessão em andamento pode mudar seu estado. Elas não são tarefas de ativação silenciosa nem condições que autorizem ampliar escopo para imitar o mock.

## Risks / Trade-offs

- **Base e publicado divergem:** registrar commit e diff; preservar funcionalidades desta base e não copiar a sessão ativa. A paridade funcional da outra change permanece dependência própria.
- **Captura possui dados que a API não devolve:** usar só campos existentes e estado honesto; nenhuma narrativa, idade/equipe/revisão de exemplo.
- **Recolhimento pode deixar foco/backdrop órfão:** teste comportamental cobre abrir/fechar, teclado, resize, hidden e falha de persistência; validação real continua gate.
- **Fonte/brand raster podem falhar ou ficar ilegíveis pequenos:** fallback textual e proporção/fundo intactos; não inventar variante. Vetor futuro não bloqueia refino local.
- **Estilo global pode atingir telas esquecidas:** matriz de cobertura, seletores com responsabilidade clara e revisão do diff; não presumir inspeção visual por existência de CSS.
- **Flicker de sessão pode ser falha funcional:** acabamento não remove proteção; diagnóstico separado se necessário, sem ampliar escopo de auth.
- **Inspeção conectada não executada nesta preparação:** reavaliar disponibilidade na retomada e registrar limitações; testes locais/validação OpenSpec não são aceite publicado.

## Migration Plan

0. **Retomada concluída em 17/11/2026.** Pedido posterior recebido e checkout isolado atualizado para `804428e` do PR #16, sem copiar árvore em andamento ou realizar merge.
1. Após esse gate, preparar fundamentos locais e acesso/páginas públicas, mantendo contratos e fonte funcional da base reconciliada.
2. Reutilizar/completar navegação; avaliar módulo independente apenas se necessário. Conciliar DOM, mantendo nós/listeners, IDs/hrefs e roteamento existente.
3. Harmonizar carteira e conferir a primeira entrega renderizada de shell/sidebar/carteira em desktop e celular. Depois, propagar às classes da ficha/formulários/abas/feedback, Seu dia e demais grupos da matriz, sem novas agregações.
4. Reproduzir retorno de aba antes de reduzir flicker; acrescentar movimento/reduced-motion e verificar somente o diff afetado; registrar revisão padrões/spec.
5. Manter gates de visual conectado e autorização/RLS abertos até evidência. Publicação, push, merge e migrações exigem autorização explícita própria; não fazem parte da preparação autorizada.

Reversão futura: retirar somente arquivos/links/classes da fatia e restaurar seus estilos anteriores, preservando dados, gates, DOM de domínio e trabalho de outras sessões. Sem alteração de banco, APIs ou autenticação, não há migration remota pressuposta. Estado da change acompanha tarefa, comandos/resultado, limitações e próximo passo no mesmo commit; registro global só no merge.
