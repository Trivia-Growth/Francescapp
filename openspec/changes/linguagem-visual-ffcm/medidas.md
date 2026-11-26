# Medidas da prova — acesso e carteira (25/11/2026)

Medido no Chromium, com a aplicação real servida pelo Vite do repositório e a API dublada
com dados fictícios. Nenhum serviço remoto foi chamado. jsdom não calcula layout: largura,
altura e rolagem só valem medidas num motor de layout de verdade.

Viewports: **computador 1440x900** e **celular 390x844**.

## Superfícies

| O quê | Antes | Computador | Celular |
| --- | --- | --- | --- |
| Coluna do acesso | 460px fixos, centrados e sozinhos no branco | grade `504px 460px` — apresentação à esquerda, caminhos de entrada numa superfície de **460px** à direita | coluna única de **342px** (24px de respiro de cada lado) |
| Lista da carteira | cartão sem largura própria dentro do espaço de trabalho | superfície de **1097px**, usando a largura da área de trabalho | **346px** |

## Linha de lista

Alvo da direção: entre 56 e 64px.

| | Antes | Depois |
| --- | --- | --- |
| Computador | 68px (`.pessoa`, `min-height: 64px` + padding) | **60px** |
| Celular | 99px com nome, preferência e situação em três linhas | **77px** — o nome ocupa a linha, preferência e situação dividem a de baixo |

O alvo de toque continua acima de 44px nas duas larguras; `pnpm run verificar:celular`
mede isso em 360x640 e 390x844 e passou.

## Diálogo, nos dois tamanhos

Medido no diálogo de cadastro (`#cadastro-dialogo`), que é o formulário mais longo das duas
telas e por isso o caso que prova a moldura.

| | Computador 1440x900 | Celular 390x844 |
| --- | --- | --- |
| Largura | **560px** (medida de formulário) | **390px** — a tela inteira |
| Ancoragem | centrado, topo em 24px, base em 876px | **folha**: base em **844px**, encostada no fim da janela |
| Cabeçalho | 121px, fixo | 141px, fixo |
| Corpo | 604px, `overflow-y: auto` | 545px, `overflow-y: auto` |
| Rodapé com a ação | 79px, fixo | 79px, fixo, com `env(safe-area-inset-bottom)` |
| O corpo realmente rola | sim (852px de conteúdo em 604px) | sim (878px de conteúdo em 545px) |

A altura do elemento é `dvh`, não `vh`: com o teclado virtual aberto, "Cadastrar paciente"
continua no rodapé visível em vez de sair da tela. Em nenhuma das duas larguras o diálogo
centrado aparece espremido — abaixo de 768px o mesmo elemento é folha, por uma regra só.

## Seleção e data

No diálogo de cadastro, em ambas as larguras:

- controles nativos (`<select>`, `input[type=date]`) visíveis: **0**
- controles próprios no lugar deles: **4** (situação, quem acompanha o caso, tipo do
  primeiro contato e data de nascimento)

Os nativos continuam no documento, fora da vista e da ordem de tabulação, como donos do
valor que o formulário envia. Os quatro `<select>` dos filtros da carteira receberam o mesmo
tratamento. Sem o script, o controle nativo continua aparecendo e funcionando.

## Verificações executadas

- `pnpm exec vitest run web` — 118 arquivos, 691 testes, verde.
- `pnpm run verificar:rapido` (lint + typecheck) — verde.
- `pnpm run verificar:celular` — 14 provas em 360x640 e 390x844, verde.
