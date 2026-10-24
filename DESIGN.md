---
name: FFCMApp - marca recebida e interface provisória
description: Materiais Francescato recebidos; fontes e componentes do mock ainda provisórios.
colors:
  brand-olive: "#839352"
  brand-charcoal: "#1f1f1d"
  brand-support-olive: "#75734d"
  brand-beige: "#e3d6c6"
  brand-sand: "#ccaf8f"
  primary: "#475436"
  olive: "#879257"
  lime: "#aeba7b"
  sand: "#e3ccb0"
  brown: "#6f604b"
  ink: "#273123"
  muted: "#65705f"
  line: "#dfe5d4"
  wash: "#fbfcf8"
  soft: "#f1f4e9"
  white: "#ffffff"
  panel: "#f2f5eb"
  primary-hover: "#38442a"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "50px"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.022em"
  body:
    fontFamily: "Raleway, Arial, sans-serif"
    fontSize: "16px"
    lineHeight: 1.62
  label:
    fontFamily: "Raleway, Arial, sans-serif"
    fontSize: "14px"
rounded:
  field: "7px"
  control: "8px"
  card: "12px"
  panel: "14px"
  dialog: "16px"
  chip: "20px"
spacing:
  button: "11px 16px"
  field: "11px 12px"
  nav: "13px 12px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "{spacing.button}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "{spacing.field}"
  nav-active:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "{spacing.nav}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
---

# Design System: FFCMApp

## Overview

**Creative North Star: "Mesa de coordenação serena"**

A referência provisória é o mock existente: leitura ampla, fundo claro, oliva e poucos elementos competindo pela atenção. A carteira se apresenta em linhas, com a agenda como apoio, em vez de um painel repetitivo de cartões de indicadores.

Atualizado em 15/10/2026: o solicitante confirmou o nome **FFCMApp** e forneceu logos e paleta. [Materiais e limites de uso](docs/projeto/identidade-visual.md); originais em [assets/brand/francescato](assets/brand/francescato/). Os tokens `brand-*` são cores extraídas das imagens, ainda sem códigos de manual. Os demais tokens e os componentes descrevem o mock, não uma migração de marca já executada. Fontes e desenho dos componentes continuam provisórios.

A fonte da interface documentada é [o CSS da demonstração arquivada](docs/legacy/mockup/source/styles.css), considerando os refinamentos finais. A [direção original arquivada](docs/legacy/mockup/source/DESIGN.md) continua como referência histórica; a extração de 14/10/2026 não incluiu inspeção renderizada, pois não havia navegador disponível.

**Key Characteristics:**

- Superfícies claras e apoio tonal suave.
- Títulos editoriais com texto funcional legível.
- Casos e relatos em linhas, sem profundidade ornamental.
- Ações simples e foco visível.

## Colors

Os tokens `brand-olive`, `brand-charcoal`, `brand-support-olive`, `brand-beige` e `brand-sand` registram o material recebido. O oliva do logo difere do oliva da paleta; preservar essa distinção até confirmação dos códigos oficiais. Os tokens sem prefixo `brand-` são o snapshot do mock. Não confundir as duas origens nem declarar que o mock já foi atualizado.

Antes de definir cores de texto e botões, validar contraste. O oliva do logo com branco resulta em (3,35:1), insuficiente para a referência de texto normal (4,5:1). Não transferir a aplicação do logo automaticamente para texto pequeno.

### Primary

Na referência do mock: `primary` e `primary-hover` conduzem ações; `olive` é a aproximação anterior de marca/foco; `lime` dá apoio. Na marca recebida, o oliva do logo está em `brand-olive`; a definição semântica final das ações ainda será validada.

### Secondary

`sand` e `brown`: detalhes de apoio, não uma segunda marca.

### Neutral

`ink` e `muted`: texto; `wash`: fundo; `soft` e `panel`: áreas auxiliares; `line`: separadores; `white`: controles e diálogo.

**The Francescato Rule.** Não aplicar à aplicação a identidade Trivia da proposta comercial nem azul, laranja, leão ou transparências do HED. HED orienta processo, não marca.

Os estados do mock também usam âmbar, azul e rosa. Não constituem classificação clínica nem uma política de cores de produção aprovada.

## Typography

Cormorant Garamond nos títulos, com fallback Georgia/serif; o CSS usa o alias local `Cormorant`. Raleway no corpo, controles e formulários, com fallback Arial/sans-serif. As fontes e licenças do mock estão em `docs/legacy/mockup/source/assets/`; cópias licenciadas usadas apenas pela proposta comercial estão em `assets/fonts/`.

Essas são fontes do mock, não fontes oficiais identificadas nas imagens. Não inferir a tipografia do produto a partir das letras dos logos. Preservar logos como recebidos e pedir fontes/licenças ou confirmação da tipografia provisória.

Papéis-base no frontmatter. No celular, o título principal passa a (42px); o corpo permanece (16px). Campos usam (16px), botões (14px), auxiliares geralmente (12-14px). Títulos de seções específicas variam: hero (48px desktop, 44px celular), cabeçalho de seção (31px, 29px), relato (18px, 17px).

**The Readability Rule.** Documentar tamanhos reais não significa aprovar todo texto pequeno. Conferir leitura no celular, zoom, texto longo e estados reais antes de produção.

## Layout

Sidebar desktop (248px), conteúdo com máximo (1460px) e padding (50px 56px 72px). Carteira principal e apoio de agenda (330px), com gap (64px). Até (1200px), sidebar (220px), conteúdo (42px 36px 62px) e gap (36px).

Até (760px), menu recolhido, conteúdo (34px 22px 56px) e colunas de carteira/apoio em uma coluna. Topbar (92px desktop, 78px celular). O código possui regras antigas em (980px) e (760px), depois sobrescritas por refinamentos; larguras intermediárias precisam de revisão, não cópia cega.

O mock não define as jornadas completas de configuração, cadastro, convite ou erro. Layout de demonstração não é requisito funcional. Novas telas priorizam tarefas e leitura, sem assumir composição de landing page.

## Elevation & Depth

Linhas de caso e diário são planas, com separador inferior, sem sombra. Painéis auxiliares usam diferença tonal, não elevação. Diálogo tem sombra (0 25px 90px #26301e2b), backdrop escurecido e blur (3px).

**The Quiet Surface Rule.** Preservar a composição serena do mock; não transformar todos os blocos em cartões elevados.

## Shapes

Controles discretamente arredondados; raios no frontmatter. Casos e relatos usam cantos retos e divisórias. Avatares são circulares. Chips arredondados não substituem texto para explicar estados.

## Components

- **Botão principal:** oliva escuro, texto branco; hover escurecido. Variante neutra usa branco e borda; botões menores mantêm a linguagem.
- **Campos:** fundo branco, borda suave (#dce2d3), altura mínima (41px), texto legível. Foco de campo: contorno (2px) verde claro, offset (1px).
- **Navegação:** sidebar com item ativo tonal e peso (700); menu recolhido no celular. Navegação regular usa peso (550).
- **Chips e etiquetas:** filtros com estado ativo oliva; badges de situação (12px) precisam de significado textual. O mock não estabelece sozinho todos os estados de erro de produção.
- **Painel auxiliar:** fundo tonal e padding; painel comum é plano. Linha de caso usa nome, contexto, situação e indicador de abertura.
- **Diálogo:** largura (620px), máximo `calc(100vw - 32px)` e altura `calc(100dvh - 44px)`; rolagem e teclado precisam de validação real.

Foco geral: contorno (3px) oliva, offset (4px). Botões desabilitados têm opacity (0.55). Transição de navegação (0.18s); `prefers-reduced-motion` remove animações/transições. Não houve auditoria de contraste, teclado ou responsividade nesta extração.

## Do's and Don'ts

### Do:

- **Do** preservar a leitura ampla, a composição serena e o foco visível.
- **Do** validar celular, zoom, textos longos e estados reais ao implementar.
- **Do** usar os logos e a paleta recebidos como referência de marca, mantendo fontes e componentes provisórios até aprovação.

### Don't:

- **Don't** aplicar a marca Trivia da proposta ou a identidade HED à aplicação.
- **Don't** tratar tokens do mock ou cores extraídas de JPEG como manual final ou prova de acessibilidade.
- **Don't** copiar simulações, limitações de jornada ou problemas de cascade para produção.
