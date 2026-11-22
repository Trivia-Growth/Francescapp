# Avaliação visual e de experiência — FFCMApp — 21/11/2026

Diagnóstico por evidência renderizada. **Nada foi implementado nesta passagem**; o produto desta avaliação é
este documento mais a proposta `openspec/changes/refinamento-visual-ffcmapp/`.

Skills lidas antes de julgar, conforme `AGENTS.md`: `.agents/skills/impeccable/SKILL.md` (modos Operate e
Persuade, princípio "a brief wins", refinamento preserva identidade incumbente) e
`.agents/skills/frontend-design/SKILL.md` (escala tipográfica deliberada, estrutura como informação, motivo
único de ousadia, movimento não disparado pela pessoa usado com parcimônia). O launcher
`.agents/skills/impeccable/scripts/impeccable context` **não foi executado**: ele baixa binário na primeira
execução e esta passagem é de diagnóstico, sem edição de interface. Em vez dele foram lidos `PRODUCT.md`,
`DESIGN.md`, `docs/projeto/identidade-visual.md` e o CSS/HTML reais.

## 1. Método e o que foi efetivamente visto

Servidor local do próprio repositório (`scripts/prova-celular-vite.config.mjs`, porta 5174) e Playwright
(`playwright.config.ts`), com dublê de rede: nenhuma requisição sai de `127.0.0.1` e toda a API é respondida
por fixtures fictícias validadas contra os schemas zod reais de `packages/contracts/src/`. Bancada temporária
`scripts/prova-celular/_avaliacao-visual.pw.ts` + `scripts/prova-celular/_fixtures-avaliacao.ts`, **já
removida** depois das capturas: não pertence a `pnpm run verificar:celular` e não ficou no repositório.

94 capturas em `…/scratchpad/capturas/` (diretório temporário fora do repositório), em 1280, 1440, 360 e 390.
Sessão fictícia de Administrador com todas as capacidades.

| Superfície | 1280 | 1440 | 360 | 390 | Observação |
| --- | --- | --- | --- | --- | --- |
| Login (repouso, foco, dobras abertas, erro) | sim | sim | sim | sim | — |
| Seu dia (home) | sim | sim | sim | sim | painéis em erro e com dados |
| Carteira (lista, foco, vazia, erro, carregando) | sim | sim | sim | sim | — |
| Ficha — Visão do caso, Diário, Pendências, Documentos, "Mais seções" | sim | sim | sim | sim | — |
| Ficha — Plano de cuidado | só erro | só erro | só erro | só erro | ver limitações |
| Administração (abas + Configuração do sistema) | sim | sim | sim | sim | conteúdo em erro |
| Ficha de plantão (bancada) | sim | sim | sim | sim | fora da casca |
| Financeiro (bancada) | sim | sim | sim | sim | fora da casca |

### O que não consegui ver, e por quê

- **Plano de cuidado populado.** O dublê de `/api/pacientes/:id/plano` não passou na validação do cliente e a
  seção caiu no estado de erro. Capturei o erro, não a leitura do plano. Julgamento do plano nesta avaliação
  limita-se ao que a casca mostra.
- **Turno/escala e execução do cuidado dentro da casca.** Avaliados pela bancada
  `scripts/prova-celular/ficha-plantao.html`, que monta os módulos reais com a folha real, mas **sem** topbar,
  sidebar, gutters e largura máxima da aplicação. Medidas de margem lateral dessas duas telas não são
  conclusivas; composição interna, tipografia e densidade são.
- **Família e jornada familiar.** O bloco `#acesso-familiar` está `hidden` em `web/index.html:91`, por decisão
  de produto. Não há tela familiar para avaliar hoje — o que é relevante para o pedido do cliente, porque o
  "primeiro contato da família" existe hoje apenas como a tela de acesso genérica.
- **Fontes definitivas e logo vetorial.** Não existem. Tudo que se diga sobre tipografia e marca é provisório
  por limitação de material, não por opinião.
- **Modo escuro.** `color-scheme: light` fixo (`web/styles.css:19`). Não há tema escuro para avaliar.

## 2. Resposta direta: o produto parece luxuoso hoje?

**Não.** Parece um sistema interno competente, honesto e cuidadoso com a linguagem — e visivelmente montado em
camadas por várias mãos. Não é falta de "polimento" genérico; são cinco coisas concretas:

1. **Não existe sistema, existe sedimento.** `web/styles.css` tem 2.978 linhas e redefine os mesmos seletores
   em blocos empilhados por data: `.pessoa` em `web/styles.css:816`, `:1188`, `:2305` e `:2368`;
   `.people-list` em `:807`, `:2293` e `:2364`; `.patients-layout` em `:344` e `:707`;
   `.carteira-tools > #filtros-carteira` recebe `flex: 1 1 100%` em `:2487` e `flex: 0 1 auto` em `:2524`.
   Luxo é coerência sem esforço aparente; isto é o contrário: cada tela carrega o histórico de quem passou por
   ela.
2. **A escala tipográfica não é uma escala.** 22 tamanhos distintos declarados, incluindo três vizinhos
   indistinguíveis — `1.625rem`/26px (`:398`), `1.6rem`/25,6px (`:2316`) e `1.5rem`/24px (`:1118`) — e grafias
   duplicadas do mesmo valor (`.875rem` e `0.875rem`, `.75rem` e `0.75rem`, além de `0.85rem`, `25px`, `16px`
   e `28px` em shorthand). Nenhuma razão governa os saltos.
3. **O serif é usado como decoração, não como voz.** Cormorant Garamond aparece em nome de paciente
   (`:2316`), em rótulo de estado operacional (`.visao-destaque`, `:1118`) e em título de seção. O nome de uma
   pessoa e o estado de uma pendência não são conteúdo editorial: são dados que alguém procura com os olhos às
   três da manhã. Serif grande em dado operacional parece caro e lê pior.
4. **Há um defeito de contraste que é, literalmente, texto invisível.** A aba ativa da Administração recebe
   `background: var(--primary); color: var(--white)` em `web/styles.css:1423-1427` e, 1.180 linhas depois,
   `color: var(--primary)` em `web/styles.css:2608-2611`. Resultado renderizado: pílula oliva escura **sem
   rótulo legível** (`30-administracao-desktop-1280.png`). Razão de contraste ≈ 1:1. Nenhum produto que se
   pretenda premium mostra a própria aba selecionada em branco.
5. **O primeiro objeto colorido do primeiro contato é um aviso de ambiente de teste.** `.chip-ambiente`
   (`web/styles.css:756-763`, bege `#f4ece1` com texto `#5a4e3b`) é o elemento de maior saturação acima da
   dobra no login, em todas as larguras. No celular ele ocupa uma linha inteira do topo
   (`web/styles.css:1159-1165`). A primeira coisa que a família vê é um carimbo administrativo.

O que **já é bom** e precisa ser preservado: a superfície é calma e clara, sem sombra decorativa; a hierarquia
de texto é sóbria; o foco é visível (contorno 3px oliva, offset 4px, `web/styles.css:62-65`); `skip-link`,
`sr-only`, `aria-live` e rótulos existem e funcionam; `prefers-reduced-motion` é respeitado; a copy evita
jargão clínico e explica o que a tela faz. Isso é uma base rara. O problema não é excesso de ambição visual —
é ausência de sistema.

### O que "luxo" significa neste produto

O contexto de negócio recebido (Francescato Family Case Management, São Paulo; case management de famílias
durante tratamento de saúde mental; diferencial declarado na **restauração das relações familiares**; slogan
*"Nós ESTAMOS para que você SEJA"*; tom afetuoso, evitando termo clínico pesado; clientela que contrata
consultoria premium) define luxo aqui como **contenção, não ostentação**. Quem abre a tela às duas da manhã
depois de uma noite ruim não quer celebração, animação de entrada, métrica de engajamento nem ilustração
alegre. Quer espaço, silêncio e uma frase que não cobre nada.

Isso também resolve a tensão entre os dois públicos da mesma casca: o acompanhante terapêutico preenchendo
ficha às três da manhã e a mãe querendo saber como foi o dia do filho. Não são duas interfaces: são **duas
densidades da mesma interface** — mesma paleta, mesma tipografia, mesmo movimento, variando apenas a
quantidade de informação por tela e o peso dos controles de escrita. O `design.md` da proposta trata disso.

Registro factual pertinente, trazido pela coordenação: **o site da Francescato não enfatiza sigilo em lugar
nenhum.** O produto é construído inteiro sobre audiência, autorização e cifra. Não é contradição, mas a
família que chega não espera um painel de conformidade. Hoje o produto fala de permissão o tempo todo na
superfície — "Acesso restrito a pessoas previamente autorizadas", "Entrar não concede acesso automaticamente",
"Use o método autorizado pela administração", "Acesso técnico excepcional" — tudo visível no primeiro
viewport do login. Os controles continuam; o que muda é **densidade e lugar** dessa fala.

## 3. Fundamentos: o que o CSS revela

### 3.1 Cor

Tokens em `web/styles.css:18-41`. `--primary: #475436` conduz ações; `--brand-olive: #839352` é a marca
recebida e aparece em **apenas três regras**, sempre como filete de 4px à esquerda de um cartão —
`.saude-item` (`web/styles.css:1261`), `.rede-cuidado` (`:1322`) e `.regras-atendimento__item` (`:1517`).
Ou seja: fora do JPEG do logo, a marca toca a interface em três cantos de três telas secundárias. O uso é
correto quanto a contraste (traço não é texto) e insignificante quanto a presença.

- `--primary` (#475436) sobre branco: contraste alto, seguro para texto e para botão com texto branco.
- `--brand-olive` (#839352) sobre branco: **3,35:1**, conforme `docs/projeto/identidade-visual.md`. Abaixo de
  4,5:1. Não pode receber texto pequeno branco nem servir de cor de texto normal. Esse limite é respeitado
  hoje por omissão — o oliva de marca simplesmente não é aplicado.
- `--muted: #58634f` em texto auxiliar de 12–14px é frequente (27 ocorrências de `.875rem`); é o lugar mais
  provável de falha de leitura em celular com brilho baixo. Não medi cada composição: `identidade-visual.md`
  registra que não houve auditoria completa de contraste, e esta avaliação não a substitui.
- Estados usam `#903a30` (erro, `:33`), âmbar e verde suave em chips. Não há escala de cor de estado; cada
  tela improvisa.

### 3.2 Tipografia

Famílias em `web/styles.css:20-21`, arquivos locais WOFF2 subset latino (`:1-16`) — bom para privacidade e
desempenho, e deve ser preservado. Problemas: a escala (item 2 acima) e o uso de serif em dado operacional
(item 3). `p { max-width: 70ch }` em `web/styles.css:174-176` aplica medida só a `<p>`; textos irmãos que não
são `<p>` correm a largura inteira da coluna. Isso produz o descasamento visível na Visão do caso: o parágrafo
explicativo do sinal quebra em ~540px enquanto as linhas vizinhas vão a ~950px
(`21-ficha-visao-desktop-1280.png`).

### 3.3 Espaçamento

Não existem tokens de espaçamento. Os valores são literais e heterogêneos — `20px`, `22px`, `24px`, `28px`,
`32px`, `34px`, `36px`, `44px`, `48px`, `72px`, além de `.5rem`, `.75rem`, `1.5rem` em regiões trazidas de
outro módulo (`.agenda-individual`, `web/styles.css:607-639`). `--radius-*` existe (`:34-37`), espaçamento
não. Consequência direta: ritmo vertical irregular dentro da mesma tela (por exemplo, no login,
`#acesso-interno { margin-block: 28px }` em `:1482` convive com `.field { margin-bottom: 20px }` em `:272` e
`margin: 12px 0 24px` em `:231`, e o parágrafo "Para contas internas criadas pela administração." encosta no
rótulo "E-mail" — visível em `01-login-celular-360.png`).

### 3.4 Movimento — inventário completo

Tudo o que existe hoje:

| Onde | O quê | Arquivo:linha |
| --- | --- | --- |
| Gaveta móvel | `transform 0.2s ease` | `web/styles.css:1176` |
| Links da sidebar, botões primário/secundário | `background-color/color/border-color .16s ease` | `web/styles.css:2422` |
| Abas da ficha e da administração | `background-color/color/border-color .16s ease` | `web/styles.css:2606` |
| Esqueleto de lista | `loading-reveal 0s linear 300ms backwards` + `loading-pulse 1.4s ease-in-out 300ms infinite alternate` | `web/styles.css:2382`, `:2390` |
| Indicador de ação | `loading-spin .8s linear 300ms infinite` | `web/styles.css:2413` |
| Status de revalidação e saída | mesmo spinner, por `::before` | `web/styles.css:2655` |
| Botão pressionado | `transform: translateY(1px)` sem transição | `web/styles.css:102-105` |

O que está certo: o atraso de 300ms antes de qualquer movimento de carregamento é uma decisão madura — evita
flash em resposta rápida. As durações (.16s/.2s) são adequadas.

O que está errado:

- **Quatro blocos `prefers-reduced-motion` separados** (`:599`, `:2460`, `:2617`, `:2657`), um deles global
  com `!important` (`:599-607`) e três locais redundantes. A política funciona, mas por acumulação; qualquer
  animação nova nasce sem garantia de estar coberta.
- **Três declarações de transição com a mesma lista de propriedades** (`:1176`, `:2422`, `:2606`), nenhuma
  nomeada por token. Não há vocabulário: há repetição.
- **Nada anima na troca de contexto.** Entrar na ficha, trocar de aba, abrir "Mais seções", voltar para a
  lista: tudo é substituição instantânea de conteúdo. É exatamente onde o movimento serviria para orientar —
  e é o único lugar onde o cliente vai sentir falta.
- **Nada anima no login.** O primeiro contato é estático e abrupto.
- Falta curva comum: tudo usa `ease`, inclusive entradas e saídas que pedem curvas diferentes.

## 4. Superfície por superfície

### 4.1 Login — o primeiro contato (seção própria no §5)

Resumo aqui; análise e direção no §5.

### 4.2 Seu dia (home)

`09-home-*.png`. Título serif 50px, régua, dois blocos ("Precisa de você agora", "Suas pessoas acompanhadas").
Com os painéis em erro, dois botões "Tentar novamente" idênticos empilhados ocupam a tela inteira — o estado
de falha é mais estruturado que o estado de sucesso. Abaixo, ~500px de vazio sem rodapé de conteúdo. Não há
nada que diga "é isto que importa agora" além do texto. Para um painel que se chama "Seu dia", a composição
não prioriza nada visualmente.

### 4.3 Carteira

`10-carteira-*.png`. O que está bom: duas colunas no desktop, uma no celular; cartões brancos de borda fina,
sem sombra, fiéis à Quiet Surface Rule; chips de situação legíveis; sinal operacional com motivo textual
visível (FR-028 respeitado na forma).

Problemas, com referência:

- **Nome em serif 25,6px** (`web/styles.css:2316`): no celular quebra em duas linhas em 2 dos 3 cartões
  (`10-carteira-celular-360.png`), e cada cartão passa a parecer capa de livro.
- **Barra de ferramentas desalinhada**: `.carteira-tools { align-items: flex-start }` (`:2483`) com
  `#reload-patients { align-self: center }` (`:2504`) e a busca com rótulo acima; as três linhas de base ficam
  em alturas diferentes (`10-carteira-desktop-1280.png`). A mesma propriedade `flex` do contêiner de filtros é
  declarada duas vezes com valores opostos (`:2487` e `:2524`).
- **Cartão com ar mal distribuído**: `min-height: 150px` com `padding: 24px` (`:2305-2311`) e seta
  `align-self: center` (`:2318`); cartões com uma linha a menos ficam com um bloco vazio à direita e a seta
  flutuando no meio.
- **Hierarquia invertida**: "Novo paciente" é o objeto mais escuro e pesado da tela (`.button-primary`,
  `:106-114`), acima da própria lista; no celular ele vem **antes** da busca e empurra a lista
  (`10-carteira-celular-360.png`). Cadastrar é ação rara; consultar é a tarefa.
- **Estado vazio sem convite**: `.empty-state { padding: 44px 0 }` (`:425`), um `h3` e um parágrafo, sem ação
  e sem âncora visual, num vazio de ~450px (`12-carteira-vazia-desktop-1440.png`). A copy
  ("informando todos os campos exigidos") fala do formulário, não da pessoa.
- **Estado de carregamento**: antes dos 300ms só existe a linha "Consultando pacientes…" em 14px apagado
  (`14-carteira-carregando-desktop-1280.png`); o esqueleto (`#list-loading`, `:2396-2402`) é coerente com o
  cartão (150px, duas colunas), o que é um acerto.
- **Estado de erro**: uma linha vermelha de texto corrido (`.list-status[data-tone=error]`, `:409-411`) sem
  ação adjacente; a saída é descobrir o link "Atualizar lista" acima.

### 4.4 Ficha do paciente e abas

`20-*`, `21-*`, `22-*`, `23-*`.

- **Cabeçalho**: avatar 64px, nome serif 42px, preferência, chip de situação e duas ações
  ("Novo objetivo", "Novo relato") como secundárias à direita (`web/styles.css:901-932`). Legível e digno.
  "Voltar para a lista" é um link sublinhado solto no topo, sem relação visual com o cabeçalho.
- **Faixa de abas**: sublinhado oliva na ativa (`.ficha-aba[aria-selected=true]`, `:962-965`) — correto e
  sóbrio. No celular a faixa corta a terceira aba sem qualquer indicação de rolagem
  (`20-ficha-dados-celular-360.png`); `overflow-x: auto` (`:938`) sem máscara nem gradiente.
- **"Mais seções"**: abre 16 destinos em três fileiras de texto puro, sem agrupamento, separador ou ordem
  perceptível (`22-ficha-mais-secoes-desktop-1280.png`; `.ficha-mais-lista`, `:988-993`). Uma ficha com 20
  destinos precisa de arquitetura visual, não de uma lista de palavras.
- **Visão do caso**: blocos planos separados por régua (`.visao-bloco`, `:1096-1099`) — fiel ao mock e
  agradável. Dois defeitos: o estado "Atenção operacional" em serif 24px (`:1118`) é o elemento mais forte do
  bloco, acima do conteúdo que ele qualifica; e o descasamento de medida descrito em §3.2.
- **Pendências**: cartões brancos com título, texto, metadados em 13px e botões
  ("Reconhecer", "Resolver") de mesmo peso — nada indica qual é a ação esperada. O bloco
  "Periodicidade acordada para este caso" aparece com o rótulo à esquerda, centralizado verticalmente, e o
  formulário deslocado à direita, deixando ~300px de vazio à esquerda
  (`22-ficha-mais-secoes-desktop-1280.png`); vem de `.ficha-secao form { max-width: 70ch; margin: 20px 0 }`
  (`:1019-1025`) dentro de um contêiner que alinha o rótulo ao centro.
- **Diário e evolução** (`21-ficha-di-rio-desktop-1280.png`): o pior problema de densidade do produto. O
  formulário tem **sete áreas de texto idênticas** empilhadas, sem agrupamento nem prioridade; o bloco de
  áudio é um painel dentro do painel; "Publicar" e "Salvar rascunho" têm o mesmo peso visual, ambos
  secundários (`.ficha-secao button:not(.button-primary)`, `:1052-1058`). Abaixo, os registros aparecem como
  **itens de lista com marcador** e pares `Rótulo: valor` em negrito linha a linha — oito rótulos em negrito
  por registro. Lê como despejo de banco, não como relato de cuidado. É esta a tela que a família pode
  receber; e é esta a tela do acompanhante às três da manhã.
- **Plano de cuidado**: ver limitações. No estado de erro, a seção inteira vira uma frase e um botão num vazio
  de ~400px (`21-ficha-plano-de-cuidado-desktop-1280.png`).

### 4.5 Administração

`30-administracao-*.png`.

- **Defeito grave**: aba ativa sem rótulo legível (§2, item 4), `web/styles.css:1423-1427` vs `:2608-2611`.
- **Onze abas em três fileiras** de pílulas de mesmo peso (`.administracao-aba`, `:1410-1419`), sem
  agrupamento por natureza (catálogos, pessoas, dinheiro, auditoria). É um amontoado, não uma navegação.
- A área de conteúdo tem `max-width: 78ch` (`:1428-1433`) — medida razoável, mas isolada: as abas acima usam a
  largura inteira, criando dois alinhamentos na mesma tela.
- No celular as pílulas quebram em cinco fileiras (`30-administracao-celular-360.png`).

### 4.6 Ficha de plantão (bancada)

`40-ficha-plantao-desktop-1280.png`: **6.220px de altura** numa coluna única. Cada grupo é um quadro com
título e duas a três linhas de texto explicativo em 12–13px antes do campo; a explicação ocupa mais área que o
campo. As ações ("Guardar rascunho", "Publicar ficha do plantão") ficam no meio da página, seguidas de mais
conteúdo. Para a pessoa que preenche isto de madrugada, no celular, é o oposto de cuidado: não há etapas, não
há progresso, não há âncora de ação. A composição interna não usa a largura disponível no desktop, mas isso é
parcialmente artefato da bancada (ver limitações).

### 4.7 Financeiro (bancada)

`51-financeiro-valores-desktop-1280.png`. Abas em chips retangulares com fundo suave na ativa — **a quarta
linguagem de aba do produto** (ficha: sublinhado; administração: pílula preenchida; financeiro: chip
contornado; "Mais seções": links de texto). Na mesma coluna convivem três larguras diferentes de controle: o
cartão de consulta (~528px), o botão "Consultar valores" (~760px) e o cartão de registro (~528px). Valores
monetários aparecem em negrito 15px, sem tratamento tabular.

## 5. A tela de login — primeiro contato da família

### 5.1 O que existe hoje

`web/index.html:39-125` e `web/login-interno.ts`. Antes da sessão, `main.ts` só monta o login e o status de
revalidação. Estilos: `.access-layout` (`web/styles.css:198-206`), `.access-context` (`:207-226`),
`.access-form-panel` (`:227-232` e, 2.300 linhas depois, `:2585-2589`).

Composição em 1280/1440 (`01-login-desktop-1440.png`): grade de duas colunas `1.1fr / 1fr` com `gap: 100px`;
à esquerda, logo + "Acesso ao FFCMApp" + duas frases; à direita, um cartão branco com borda e raio 14px
contendo cinco formulários (Google, e-mail/senha, confirmação de e-mail, acesso familiar oculto, acesso
técnico).

### 5.2 Diagnóstico

1. **O logo é um JPEG com fundo oliva embutido**, exibido como bloco quadrado de 144px
   (`web/index.html:42`, `.institutional-logo`, `web/styles.css:221-226`). Num fundo `--wash` quase branco,
   lê como imagem não tratada colada na página. Não há vetor nem PNG transparente
   (`docs/projeto/identidade-visual.md`, Pendências) e **não é permitido** simular transparência ou redesenhar
   o símbolo. É o limite mais duro desta tela.
2. **O título quebra mal**: `.access-context h1 { max-width: 12ch }` (`web/styles.css:207-210`) força
   "Acesso ao / FFCMApp" em duas linhas em todas as larguras. "Acesso ao FFCMApp" também é o nome do sistema,
   não uma frase de acolhimento.
3. **Duas ações primárias de mesmo peso** ("Entrar com Google da organização" e "Entrar com e-mail e senha"),
   ambas `.button-primary full-width` escuras. Quem chega não sabe qual é o seu caminho. Para a família, nenhum
   dos dois é — a entrada familiar está desligada (`web/index.html:91`).
4. **Cinco formulários numa tela**, três deles atrás de `<summary>` sem marcador visual de dobra
   (`.access-form-panel summary`, `:2593-2598` define apenas `min-height: 44px` e `cursor`), de modo que
   "Confirmar o e-mail da conta interna" e "Acesso técnico excepcional" lêem como textos soltos e não como
   controles (`01-login-desktop-1440.png`).
5. **O ritmo do painel é irregular**: no celular, "Para contas internas criadas pela administração." cola no
   rótulo "E-mail" (`01-login-celular-360.png`), porque o parágrafo não tem margem inferior própria naquele
   contexto e `#acesso-interno h3 { margin-bottom: 8px }` (`:1485-1487`) governa só o título.
6. **O primeiro objeto colorido é o chip de ambiente de teste** (§2, item 5).
7. **Fala de permissão quatro vezes acima da dobra** — correto como política, excessivo como acolhimento.
8. **Nenhum movimento**: a tela aparece pronta, sem uma única entrada orientada.
9. **Assimetria de tratamento**: coluna esquerda sem superfície, coluna direita como cartão com borda. A
   composição não decide se é uma página ou um diálogo.

### 5.3 Direção proposta (detalhe e alternativas descartadas em `design.md`)

Uma coluna central estreita, generosamente respirada, com um único caminho de entrada visível e os demais
recolhidos; frase de acolhimento no lugar do nome do sistema; marca aplicada em escala menor e com menos
competição; o aviso de ambiente movido para depois do bloco de acesso; uma única entrada orientada em ~240ms,
sem nada que pisque. O objetivo é que a tela se comporte como o slogan: **estar presente sem se impor**.

## 6. Tabela de severidade

Severidade considera impacto na leitura/uso e quem sofre. "Alta" inclui o que um cliente que pediu
"expectativa de sistema luxuoso" vai identificar de imediato.

| # | Achado | Superfície | Arquivo:linha | Severidade |
| --- | --- | --- | --- | --- |
| 1 | Aba ativa da Administração com rótulo invisível (oliva sobre oliva, ≈1:1) | Administração | `web/styles.css:1423-1427` vs `:2608-2611` | **Crítica** |
| 2 | Diário: 7 textareas idênticas + registros como pares `Rótulo: valor` em marcador de lista | Ficha › Diário | `web/styles.css:1019-1058`; `21-ficha-di-rio-desktop-1280.png` | **Alta** |
| 3 | Sem sistema de espaçamento; valores literais heterogêneos em todo o CSS | Todas | `web/styles.css:18-41` (sem token) | **Alta** |
| 4 | Escala tipográfica com 22 tamanhos e três vizinhos indistinguíveis | Todas | `web/styles.css:398`, `:1118`, `:2316` | **Alta** |
| 5 | Mesmos seletores redefinidos em blocos empilhados; propriedade oposta duas vezes | Todas | `web/styles.css:816/1188/2305/2368`; `:2487` vs `:2524` | **Alta** |
| 6 | Login: duas ações primárias de mesmo peso e cinco formulários numa tela | Login | `web/index.html:46-125` | **Alta** |
| 7 | Logo JPEG com fundo embutido como bloco de 144px | Login, sidebar | `web/index.html:42`; `web/styles.css:221-226` | **Alta** (bloqueada por material) |
| 8 | Quatro linguagens de aba distintas no mesmo produto | Ficha, Administração, Financeiro | `web/styles.css:945-965`, `:1410-1427`, bancada financeiro | **Alta** |
| 9 | "Mais seções": 16 destinos sem agrupamento nem ordem visual | Ficha | `web/styles.css:988-993` | **Alta** |
| 10 | Nenhuma transição de contexto (ficha, abas, volta à lista) | Todas | ausência; `web/styles.css:2422`, `:2606` | **Média** |
| 11 | Chip de ambiente de teste é o objeto mais saturado do primeiro contato | Login, casca | `web/styles.css:756-763`, `:1159-1165` | **Média** |
| 12 | Barra de ferramentas da carteira com linhas de base desalinhadas | Carteira | `web/styles.css:2483`, `:2504` | **Média** |
| 13 | Medida de linha inconsistente (`max-width` só em `<p>`) | Ficha › Visão | `web/styles.css:174-176` | **Média** |
| 14 | Estado vazio sem ação e com copy de formulário | Carteira | `web/styles.css:425-430`; `web/index.html:150` | **Média** |
| 15 | Estado de erro da lista como linha de texto sem ação adjacente | Carteira, seções | `web/styles.css:409-411` | **Média** |
| 16 | "Novo paciente" como objeto mais pesado, acima da lista e, no celular, da busca | Carteira | `web/index.html:146`; `web/styles.css:106-114` | **Média** |
| 17 | Faixa de abas rola no celular sem indicação de continuidade | Ficha | `web/styles.css:936-941` | **Média** |
| 18 | Serif em nome de paciente e em rótulo de estado | Carteira, Ficha | `web/styles.css:2316`, `:1118` | **Média** |
| 19 | Ficha de plantão: 6.220px em coluna única, sem etapas nem âncora de ação | Ficha de plantão | `40-ficha-plantao-desktop-1280.png` | **Média** |
| 20 | Quatro blocos `prefers-reduced-motion` e três declarações de transição repetidas | Todas | `:599`, `:2460`, `:2617`, `:2657` | **Baixa** |
| 21 | Topbar do celular em três fileiras antes do conteúdo | Casca | `web/styles.css:1143-1166` | **Baixa** |
| 22 | `<summary>` sem marcador de dobra no login | Login | `web/styles.css:2593-2598` | **Baixa** |
| 23 | Campos de data em `mm/dd/yyyy` nas capturas | Diário, Financeiro | comportamento nativo por locale | **Baixa** (verificar em pt-BR real) |

## 7. Limitações desta avaliação

- Nenhuma alteração foi feita em `web/`, `openspec/specs/` ou em qualquer artefato de produção. Nada foi
  commitado.
- As telas foram vistas com **dublês de API**: comprovam apresentação e layout, **não** integração,
  autorização, RLS ou desempenho real. Teste de autorização continua sendo o gate do §"Execução enxuta" de
  `AGENTS.md`, e não foi executado aqui.
- Contrastes citados são os registrados em `docs/projeto/identidade-visual.md` mais a leitura direta dos
  tokens. **Não houve auditoria completa de contraste** de cada composição renderizada.
- Plano de cuidado populado, turno dentro da casca, jornada familiar, tema escuro e navegação por teclado
  ponta a ponta não foram observados (§1).
- Capturas em diretório temporário fora do repositório; não versionadas. A bancada temporária foi removida
  ao fim das capturas.
- O diretório de trabalho já continha alterações de outra frente em `netlify/functions/ficha-plantao.ts`,
  `web/pendencias-caso.ts` e `netlify/functions/_shared/ficha-plantao-rota.test.ts`. Elas foram **preservadas
  intactas**; o texto de falha de leitura de pendências que aparece nas capturas vem delas.
- Fontes oficiais e logo vetorial continuam pendentes do marketing da Edilaine. Qualquer promessa de
  identidade final é desonesta até esse material chegar.
