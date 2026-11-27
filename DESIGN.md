---
name: FFCMApp
description: Coordenação serena do cuidado — precisão editorial, superfície plana, oliva como área e nunca como palavra.
colors:
  primary: "#475436"
  primary-hover: "#38442a"
  primary-suave: "#edf2e6"
  primary-filete: "#d4ddc8"
  primary-texto-suave: "#4a5240"
  brand-olive: "#839352"
  brand-charcoal: "#1f1f1d"
  ink: "#273123"
  muted: "#58634f"
  wash: "#fbfcf8"
  white: "#ffffff"
  soft: "#f1f4e9"
  panel: "#f2f5eb"
  superficie-trabalho: "#fafbf8"
  line: "#dfe5d4"
  field-line: "#859077"
  error: "#903a30"
  error-superficie: "#f6ece9"
  aviso: "#b4801f"
  aviso-filete: "#d8c08a"
  aviso-superficie: "#fdf6e7"
  aviso-texto: "#5c431a"
  areia-superficie: "#f4ece1"
  areia-texto: "#5a4e3b"
typography:
  display:
    fontFamily: '"Cormorant Garamond", Georgia, serif'
    fontSize: "2.4375rem"
    fontWeight: 500
    lineHeight: 1.2
  headline:
    fontFamily: '"Cormorant Garamond", Georgia, serif'
    fontSize: "1.9375rem"
    fontWeight: 500
    lineHeight: 1.2
  title:
    fontFamily: '"Cormorant Garamond", Georgia, serif'
    fontSize: "1.5625rem"
    fontWeight: 600
    lineHeight: 1.2
  subtitle:
    fontFamily: Raleway, Arial, sans-serif
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: Raleway, Arial, sans-serif
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: Raleway, Arial, sans-serif
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  field: "7px"
  control: "8px"
  card: "12px"
  panel: "14px"
  chip: "20px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "72px"
controls:
  sm: "36px"
  md: "46px"
navigation:
  sidebar: "248px"
  rail: "80px"
icons:
  base: "16px"
  chrome: "18px"
shadows:
  control: "0 3px 12px rgb(39 49 35 / 12%)"
  menu: "0 12px 28px rgb(39 49 35 / 16%)"
  modal: "0 18px 48px rgb(39 49 35 / 20%)"
motion:
  estado: "120ms"
  troca: "180ms"
  contexto: "240ms"
  entrada: "cubic-bezier(0.2, 0, 0, 1)"
  saida: "cubic-bezier(0.4, 0, 1, 1)"
components:
  botao-principal:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "{controls.md}"
  botao-principal-hover:
    backgroundColor: "{colors.primary-hover}"
  botao-secundario:
    backgroundColor: "{colors.white}"
    textColor: "{colors.primary}"
    borderColor: "{colors.field-line}"
    rounded: "{rounded.control}"
    height: "{controls.md}"
  botao-discreto:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    height: "{controls.md}"
  campo:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    borderColor: "{colors.field-line}"
    rounded: "{rounded.field}"
    height: "{controls.md}"
  superficie:
    backgroundColor: "{colors.white}"
    borderColor: "{colors.line}"
    rounded: "{rounded.card}"
  navegacao-ativa:
    backgroundColor: "{colors.primary-suave}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
  marca-estado:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.chip}"
  aba-selecionada:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    borderBottom: "3px solid {colors.brand-olive}"
---

# Design System: FFCMApp

## Overview

**Norte criativo: "Coordenação serena do cuidado"**

A Francescato acompanha famílias durante tratamento de saúde mental, com clientela de alto
padrão. A tela precisa ser **precisa e calma**, não densa e operacional: quem a usa está
lidando com o pior momento de uma família, e a interface não pode acrescentar ruído a isso.

Daí as três escolhas que governam todo o resto. Serifa editorial nos títulos, para o produto
ter voz e não parecer um painel administrativo. Superfície plana por padrão, porque cada
caixa a mais é uma decisão a mais pedida ao olho. E oliva como área, nunca como palavra —
decisão de contraste, explicada abaixo, não de gosto.

Este documento descreve **o que está implementado**, conferido por
`web/contrato-visual.test.ts`. O que ainda é provisório está marcado como pendência, no fim.

**Características:**

- Branco e lavado contínuos; oliva pontual em área, filete e marcação.
- Cormorant Garamond nos títulos; Raleway em corpo, controles e metadados.
- Hierarquia por tamanho, peso e espaço — nunca por caixa dentro de caixa.
- Uma navegação por vez: lateral completa ou trilho de ícones.
- Alvo de toque de 46px; campo de 16px no celular.

## Colors

Todo valor nasce no `:root` de `web/styles.css`. **Nenhuma cor literal existe fora dele** —
`web/contrato-visual.test.ts` reprova se uma aparecer.

Isso não é zelo abstrato. Antes de 25/11/2026 havia 25 cores literais na folha e só 12
declaradas: o sistema de aviso inteiro estava escrito por extenso em dois lugares, e
existiam **dois vermelhos** para a mesma ideia de erro. A terceira cópia teria divergido.

### Marca

- **`primary` `#475436`** conduz ação e é a cor da marca em palavra.
- **`brand-olive` `#839352`** é o oliva institucional. Mede **3,35:1 sobre branco** — reprova
  no mínimo de 4,5:1 para texto. Serve como área, filete e marcação; **nunca como texto**.
  A regra não vale para o logotipo, que é isento de contraste mínimo.
- **`primary-suave`, `primary-filete`, `primary-texto-suave`** são a marca em fundo, linha e
  texto tonal.

### Estado

- **`error` `#903a30`** com `error-superficie`. **Um vermelho só**, decidido em 25/11/2026:
  havia um segundo, `#b42318`, escondido como valor de reserva de um token nunca declarado.
  O `#b42318` é 2 pontos mais claro, mas tem 76,5% de saturação contra 50% — o que pesa no
  olho é a saturação, não a clareza. Ficou o tijolo lavado, que ainda contrasta melhor:
  7,41:1 contra 6,57:1 sobre branco. `alerta` e `perigo` são apelidos, não cores novas.
- **`aviso` `#b4801f`** com filete, superfície e dois tons de texto.
- **`areia`** para etiqueta de contexto.

Não existe cor de sucesso. O produto nunca teve um verde distinto do verde da marca, e
inventar um contraria a instrução de preservar as cores. Sucesso se expressa por texto e
ícone — que VIS-014 exige de qualquer forma, porque cor nunca pode ser o único sinal.

**The Oliva é área Rule.** Oliva pinta superfície, filete e marcação. Palavra em tom de
marca usa `primary`, que mede 8,11:1. O teste de contrato trava os dois lados: mede o
contraste de 23 pares texto/fundo e reprova `color: var(--brand-olive)` em qualquer regra.

## Typography

**Títulos:** Cormorant Garamond, peso 500 a 600, com Georgia de reserva.
**Corpo, controles e metadados:** Raleway, com Arial de reserva.

A serifa é o que separa este produto de um painel genérico. O acento destacado do `ê` em
Cormorant Garamond é desenho do tipo, não defeito de arquivo — conferido em 25/11/2026,
`U+00EA` composto e a fonte carregando no peso 500.

Seis degraus e só seis, razão 1,25 ancorada em 16px:

| Degrau | Papel |
| --- | --- |
| 6 — 2,4375rem | título de tela |
| 5 — 1,9375rem | título de tela no celular; título de seção |
| 4 — 1,5625rem | título de bloco |
| 3 — 1,25rem | subtítulo; entrada de leitura longa |
| 2 — 1rem | corpo, campo e nome em lista |
| 1 — 0,8125rem | metadado |

**The Dado operacional não é editorial Rule.** Nome, estado e número nunca usam a serifa:
são **procurados**, não lidos. A serifa pertence ao que se lê em prosa.

## Layout

Ritmo de 4px, oito degraus. Dentro de um controle 1–3; entre campos de um grupo 4; entre
grupos 5; entre blocos 6; entre seções 7; primeira dobra 8.

Controles têm duas alturas: **46px** padrão, que é o alvo de toque confortável, e **36px**
compacto para barra de ferramentas. Campo no celular usa 16px de fonte — abaixo disso o iOS
dá zoom ao focar, e a tela salta.

Lateral de **248px** no desktop, recolhida a **80px** de trilho. Abaixo de 760px a lateral
cede lugar a gaveta com fundo escurecido, fechável por `Esc`.

**The Navegação única Rule.** Lateral completa **ou** trilho, nunca as duas. A preferência
persiste em `localStorage`. Recolher e expandir mantêm o foco no controle.

## Elevation & Depth

Superfície estática é branco, filete de 1px e espaço. O degrau de fundo basta para separar.

Sombra é reservada ao que flutua de verdade, em três degraus: `control` em controle e campo,
`menu` em menu e popover, `modal` em diálogo.

**The Superfície plana Rule.** Painel repousa em filete e espaço. Sem gradiente, sem
glassmorphism, sem cartão decorativo, sem borda dupla entre regiões vizinhas. Uma superfície
por assunto.

## Components

Camada compartilhada em `web/componentes/ui/`. Mudar o botão num lugar muda em todos.

### Botão

Três pesos e só três: a ação do assunto, a alternativa, o comando discreto. Altura de 46px
pelo alvo de toque. `aria-disabled` anuncia e **bloqueia a ação**, mantendo o foco.

### Campo, área de texto e seleção

Mesma moldura: rótulo, marca opcional, dica e erro num lugar só. O nome acessível inclui a
marca — "Nome completo obrigatório" — porque a marca mora dentro do rótulo.

### Diálogo

Centralizado. Teto de altura em `min(640px, calc(100dvh - 64px))`, cabeçalho e rodapé
fixos, corpo rolável com sinal de continuidade pintado por gradiente — pintura, não
animação, logo imune a `prefers-reduced-motion`. Abaixo de 768px vira folha colada embaixo,
com rodapé invertido, botões largos e `env(safe-area-inset-bottom)`.

Clique fora **não fecha**: o conteúdo costuma ser formulário, e fechar por engano perde
trabalho.

**The Ação sempre à vista Rule.** Diálogo mais alto que a janela rola no corpo e mantém as
ações alcançáveis. Rodapé que sai da tela é defeito, não densidade.

### Lista de registros

Registro comparável é **linha acionável** sob cabeçalho, com colunas alinhadas entre linhas.
Nunca coleção de cartões decorativos. Falha num registro degrada aquele registro; os demais
continuam legíveis.

### Abas

Ghost compactas, sem cartão em volta. Selecionada com traço de 3px em oliva e peso 700.
Setas, Home e End no teclado; só a ativa entra na tabulação. Trocar de aba **não remonta a
página**.

### Estados

Quatro, sempre explícitos. Carga preserva a moldura e indica a região — não troca a tela por
uma frase. Vazio fica dentro do painel, com frase e próximo passo. Erro traz causa e
recuperação. E **zero confirmado `0` é distinto de indisponível**: confundir os dois faz a
coordenadora agir sobre um dado que não existe.

### Movimento

Três durações: `estado` 120ms, `troca` 180ms, `contexto` 240ms. Duas curvas. Nada fora disto
anima. `prefers-reduced-motion` é governado por um bloco único no fim de `web/styles.css` —
não escrever outro.

## Do's and Don'ts

### Do

- **Do** declarar toda cor no `:root` e consumir pelo papel, não pelo valor.
- **Do** usar a serifa no que se lê em prosa e Raleway no que se procura.
- **Do** manter a hierarquia por tamanho, peso e espaço.
- **Do** mostrar lateral completa ou trilho, um por vez.
- **Do** manter o alvo de toque em 46px e o campo do celular em 16px.
- **Do** apresentar registro comparável como linha, com degradação por registro.
- **Do** distinguir zero confirmado de indisponível.

### Don't

- **Don't** usar `brand-olive` como cor de texto — 3,35:1 reprova.
- **Don't** escrever cor literal dentro de uma regra; o teste de contrato reprova.
- **Don't** aplicar a serifa a nome, estado ou número.
- **Don't** trocar a tela inteira por "Carregando…", nem remontar a página ao trocar de aba.
- **Don't** empilhar caixa dentro de caixa, nem duplicar filete entre regiões vizinhas.
- **Don't** inventar cor de estado que a marca não entregou.
- **Don't** aplicar a identidade Trivia da proposta comercial ou a identidade HED. O HED
  orienta processo, não marca.

## Pendências de identidade

Materiais em [docs/projeto/identidade-visual.md](docs/projeto/identidade-visual.md);
originais em [assets/brand/francescato](assets/brand/francescato/).

1. **Sem cor de sucesso.** Aguarda o marketing da Edilaine.
2. **Fontes provisórias.** Cormorant Garamond e Raleway vêm do mock, sob OFL. Não foram
   identificadas nas imagens da marca nem confirmadas como tipografia oficial.
3. **Marca oficial.** Recebida em 25/11/2026 como imagem; falta o vetor para gerar o
   conjunto completo, o símbolo isolado para o trilho de 80px e os ícones de 180/192/512px.
