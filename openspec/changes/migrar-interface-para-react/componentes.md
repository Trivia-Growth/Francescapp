# Especificação dos componentes React — extraída de `web/ui/`

Detalha a tabela D5 de `design.md:115-124`. A camada `web/ui/`, construída em 24–25/11/2026,
é a **fonte de verdade** das variantes, medidas, estados e comportamento de teclado. Quem
implementar o componente React trabalha por este documento; a camada antiga sai depois de
cumprida (`design.md:111-113`).

Regras que atravessam todos os componentes:

- **Nenhuma cor nova e nenhum valor literal novo.** Toda medida sai dos tokens do bloco
  `:root` de `web/styles.css:23-138`. Onde a camada atual escreveu pixel cru, isto está
  assinalado como dívida, não como licença para inventar outro número.
- **Oliva `--brand-olive` nunca é cor de texto** (3,35:1 sobre branco): só área, filete e
  marcação — `ui.css:9`, `ui.css:228`, `ui.css:273`, `basicos.ts:237-238`, `design.md:78-80`.
- **Foco visível é global**, não por componente: `:focus-visible { outline: 3px solid
  var(--primary); outline-offset: 4px }` em `web/styles.css:157-160`. O React não pode
  substituir isso por `ring-0`/`outline-none` sem reposição equivalente.
- **Movimento** só por `--mov-estado|troca|contexto` e `--curva-entrada|saida`
  (`web/styles.css:127-133`), com o bloco único de `prefers-reduced-motion` em
  `web/styles.css:3370`. Erro **nunca** anima (`web/styles.css:3116-3123`).

---

## 1. Botão — `basicos.ts:21-32` + `ui.css:62-113`

### API atual

```ts
type PesoBotao = 'principal' | 'secundario' | 'discreto';            // basicos.ts:8
type PedidoBotao = {                                                  // basicos.ts:10-19
  rotulo: string;
  peso?: PesoBotao;              // padrão 'secundario' (basicos.ts:25)
  tipo?: 'button' | 'submit';    // padrão 'button'     (basicos.ts:23)
  id?: string;
  marca?: string;                // vira data-acao, usado pelos testes (basicos.ts:27)
  rotuloLeitura?: string;        // vira aria-label      (basicos.ts:28)
  largo?: boolean;               // acrescenta .ui-botao--largo (basicos.ts:24)
  aoAtivar?: (evento: MouseEvent) => void;
};
botao(pedido: PedidoBotao): HTMLButtonElement
```

### Variantes (nome exato)

| Atributo | Fundo | Borda | Texto | Onde |
| --- | --- | --- | --- | --- |
| `data-peso="principal"` | `--primary` | transparente | `--white` | `ui.css:77-80` |
| `data-peso="secundario"` (padrão) | `--white` | `--field-line` | `--primary` | `ui.css:84-88` |
| `data-peso="discreto"` | transparente | transparente | `--primary`, sublinhado `text-underline-offset: .2em` | `ui.css:92-98` |
| `.ui-botao--largo` | — | — | `width: 100%` | `ui.css:111-113` |

Não existem hoje `ghost` nem `destrutivo`. A tabela D5 (`design.md:119`) cita os quatro; os
dois últimos são **lacuna** (ver §16), não equivalência de `discreto`.

### Medidas

- `min-height: 46px` — pixel cru, justificado pelo alvo de toque em `ui.css:60-61`. O alvo
  mínimo do produto é 44px (`web/styles.css:118`); 46px é o mesmo valor do reset global
  `web/styles.css:182`.
- `padding: 10px 18px` (`ui.css:68`); em `discreto`, `padding: 10px 8px` (`ui.css:93`).
- `border-radius: var(--radius-control)` (`ui.css:70`).
- `font: 600 var(--texto-2) / 1.4 var(--font-body)` (`ui.css:71`).
- `gap: var(--espaco-2)` entre rótulo e eventual ícone (`ui.css:66`).
- Display `inline-flex`, centralizado nos dois eixos (`ui.css:63-65`).

### Estados

| Estado | Regra | Onde |
| --- | --- | --- |
| hover `principal` | `background: var(--primary-hover)` | `ui.css:81-83` |
| hover `secundario` | `background: var(--panel)` | `ui.css:89-91` |
| hover `discreto` | `background: var(--panel)` e **remove** o sublinhado | `ui.css:99-102` |
| desabilitado | `cursor: not-allowed; opacity: 0.62` — vale para `:disabled` **e** `[aria-disabled="true"]` | `ui.css:103-107` |
| ativo (pressionado) | `transform: translateY(1px)`, só quando não desabilitado | `ui.css:108-110` |
| foco | global, `web/styles.css:157-160` | — |
| carregando | **não existe** na camada atual | lacuna §16 |

Todo hover é escrito como `:hover:not(:disabled):not([aria-disabled="true"])`
(`ui.css:81,89,99`): o botão desabilitado por `aria-disabled` — que continua focável e
anunciável — não pode acender no hover.

### Para o React

`buttonVariants` com as três variantes nos **mesmos nomes de domínio**
(`principal|secundario|discreto`) e `largo` como prop booleana. Preservar o par
`:disabled` + `[aria-disabled="true"]` nas variantes de hover e na opacidade; shadcn trata
só `:disabled`.

---

## 2. Campo de texto — `basicos.ts:60-115` + `ui.css:119-173`

### API atual

```ts
type PedidoCampo = {                 // basicos.ts:34-49
  id: string; rotulo: string;
  tipo?: string;                     // padrão 'text' (basicos.ts:80)
  nome?: string; marcaRotulo?: string; dica?: string; valor?: string;
  obrigatorio?: boolean; tamanhoMaximo?: number;
  autocomplete?: string; inputmode?: string; placeholder?: string;
};
type Campo = { elemento: HTMLElement; controle: HTMLInputElement; erro(mensagem: string): void };
campoTexto(pedido: PedidoCampo): Campo
```

### Estrutura e medidas

- Invólucro `.ui-campo`: `display: grid; gap: var(--espaco-2); margin-bottom: var(--espaco-4)`
  e `min-width: 0` (`ui.css:119-124`). O `min-width: 0` é o que impede o campo de estourar
  a grade do diálogo.
- Rótulo `.ui-campo__rotulo`: `flex`, `align-items: baseline`,
  `justify-content: space-between`, `font-size: var(--texto-2)`, peso 600, `line-height: 1.4`
  (`ui.css:125-135`). A marca (`"obrigatório"`, unidade) vai à direita, em `.ui-campo__marca`:
  `--muted`, `var(--texto-1)`, peso 400 (`ui.css:136-140`).
- Controle `.ui-campo__controle`: `width: 100%`, `min-height: 48px`, `padding: 10px 12px`,
  `border: 1px solid var(--field-line)`, `border-radius: var(--radius-field)`,
  `background: var(--white)`, `color: var(--ink)`, `caret-color: var(--primary)`,
  `font: 400 var(--texto-2) / 1.4 var(--font-body)` (`ui.css:141-152`).
  `--texto-2` é 1rem/16px e isso é deliberado: menos que 16px faz o iOS dar zoom ao focar
  (`web/styles.css:476`).
- Dica `.ui-campo__dica`: `--muted`, `var(--texto-1)`, `max-width: 68ch` (`ui.css:160-165`).
- Erro `.ui-campo__erro`: `--error`, `var(--texto-1)`, e **`:empty { display: none }`**
  (`ui.css:166-173`) — o parágrafo existe sempre no DOM, só não ocupa espaço. É o que
  evita o salto de layout quando o erro aparece (`ui.css:117-118`).

### Estados

| Estado | Regra | Onde |
| --- | --- | --- |
| desabilitado | `background: var(--panel); color: var(--muted)` | `ui.css:153-156` |
| erro | `[aria-invalid="true"] { border-color: var(--error) }` | `ui.css:157-159` |
| foco | global (`web/styles.css:157-160`); `input:focus-visible { outline-offset: 2px }` em `web/styles.css:485-487` | — |

### Acessibilidade garantida pelo código

- `aria-describedby` é montado com **dica e erro juntos**, nessa ordem
  (`basicos.ts:89-104`): os dois ids sempre apontados, mesmo com erro vazio.
- `erro(mensagem)` liga e desliga `aria-invalid` junto com o texto
  (`basicos.ts:109-113`): não há estado em que a borda vermelha apareça sem frase, nem
  frase sem `aria-invalid`.
- O erro é frase, nunca só cor (`basicos.ts:58-59`).

### Para o React

`Input` + um `Campo`/`FormField` que preserve: id único, `htmlFor`, `aria-describedby`
com os dois ids, `aria-invalid` acoplado ao texto do erro, e o nó de erro sempre montado
com `:empty { display:none }` (ou equivalente de altura reservada).

---

## 3. Área de texto (`textarea`)

**Não existe em `web/ui/`.** Hoje o `textarea` é atendido só pelo reset global
`web/styles.css:470-484`, que lhe dá as mesmas medidas do `input`: `width: 100%`,
`min-height: 48px`, `padding: 10px 12px`, `border: 1px solid var(--field-line)`,
`border-radius: 7px` (literal, equivale a `--radius-field`), `font-size: var(--texto-2)`,
`background: var(--white)`, `color: var(--ink)`, `caret-color: var(--primary)`. Erro usa
`.field-error` (`web/styles.css:494-502`), a versão antiga de `.ui-campo__erro`.

Cada tela ajusta altura por conta própria (`web/styles.css:1157`, `1392`, `1582`,
`1616`, `2800`, `2868`) — a duplicação que o `textarea.tsx` deve encerrar.

**O React precisa:** `textarea.tsx` com as mesmas medidas do campo de texto, `min-height`
explícito por prop (ex.: `linhas`), mesma marcação de rótulo/dica/erro do §2, e
`font-size: var(--texto-2)` obrigatório pela mesma razão do iOS.

---

## 4. Seleção — `selecao.ts` + `ui.css:182-286`

### Decisão de arquitetura que **não pode** ser perdida

O `<select>` nativo **continua no documento e continua dono do valor**
(`selecao.ts:8-12`, `selecao.ts:51-57`). É ele que o formulário envia e que o resto do
código lê. O widget só o tira da vista (`aria-hidden="true"`, `tabIndex = -1`). O
esconderijo CSS depende de `[data-aprimorada]`, aplicado **depois** de montado
(`selecao.ts:53-55`, `ui.css:186-195`): falha de script devolve o controle nativo
visível, em vez de deixar o campo invisível.

### API atual

```ts
type Selecao = {                                  // selecao.ts:20-27
  grupo: HTMLElement; gatilho: HTMLButtonElement; lista: HTMLElement;
  sincronizar(): void; encerrar(): void;
};
aprimorarSelecao(nativa: HTMLSelectElement): Selecao   // selecao.ts:40 — idempotente (41-45)
aprimorarSelecoes(raiz: ParentNode): Selecao[]         // selecao.ts:277 — pula os já aprimorados (279)
```

### Variantes e atributos de estado

| Marca | Significado | Onde |
| --- | --- | --- |
| `.ui-selecao[data-aprimorada]` | aprimoramento aplicado; esconde o nativo | `ui.css:186`, `selecao.ts:55` |
| `.ui-selecao__valor[data-vazio="sim\|nao"]` | valor vazio pinta `--muted` | `ui.css:225-227`, `selecao.ts:162` |
| `.ui-selecao__opcao[data-ativa="sim\|nao"]` | opção sob o cursor de teclado: `background: var(--soft)` | `ui.css:267-269`, `selecao.ts:106` |
| `.ui-selecao__opcao[aria-selected="true"]` | peso 600 **e** filete oliva de 3px via `::before` | `ui.css:270-281` |
| `.ui-selecao__gatilho[aria-invalid="true"]` | `border-color: var(--error)` | `ui.css:212-214` |

O filete tem contrapeso: `:not([aria-selected="true"])::before { width: 3px }`
(`ui.css:282-286`) reserva a mesma coluna, para a opção não deslocar ao ser escolhida.

### Medidas

- Gatilho: `min-height: 48px`, `padding: 10px 12px`, `border: 1px solid var(--field-line)`,
  `border-radius: var(--radius-field)`, `font: 400 var(--texto-2) / 1.4 var(--font-body)`,
  `gap: var(--espaco-3)`, `text-align: left` (`ui.css:196-211`).
- Seta: quadrado de 10px com dois filetes de 2px em `--brand-olive`, rotacionado 45°
  (`ui.css:229-236`); `aria-hidden` (`selecao.ts:71`).
- Lista: `position: absolute; z-index: 30; top: calc(100% + var(--espaco-1))`,
  `max-height: 17rem`, `padding: var(--espaco-1)`, `overflow-y: auto`,
  `overscroll-behavior: contain`, `border: 1px solid var(--line)`,
  `border-radius: var(--radius-control)`, sombra `0 12px 28px rgb(39 49 35 / 16%)`
  (`ui.css:237-253`). É um dos dois únicos lugares com sombra (`ui.css:11-12`).
- Opção: `min-height: 44px` (alvo de toque), `padding: var(--espaco-2) var(--espaco-3)`,
  `gap: var(--espaco-3)`, `border-radius: var(--radius-field)` (`ui.css:257-266`).

### Estados sincronizados a partir do nativo — `selecao.ts:142-170`

`sincronizar()` relê: lista de opções, texto e `data-vazio` do valor, `disabled`,
`aria-invalid`, `aria-required`; e, se ficou desabilitado, fecha a lista sem devolver foco
(`selecao.ts:169`). É disparado por `change`, `input`, `form.reset` (com `setTimeout 0`) e
por um `MutationObserver` sobre `disabled | aria-invalid | required` + `childList/subtree`
(`selecao.ts:244-253`).

### Teclado e ARIA (combobox) — `selecao.ts:185-235`

| Tecla | Fechada | Aberta |
| --- | --- | --- |
| `ArrowDown`/`ArrowUp` | abre | move a ativa, com clamp em 0 e no último (`selecao.ts:197`) |
| `Home`/`End` | ignora | primeira / última (`selecao.ts:200-209`) |
| `Enter`, `Space`, `Spacebar` | abre | escolhe e fecha (`selecao.ts:210-220`) |
| `Escape` | ignora | fecha; `preventDefault` **e `stopPropagation`** (`selecao.ts:221-227`) |
| `Tab` | — | fecha sem devolver foco (`selecao.ts:228-230`) |
| letra isolada | salta e **escolhe** | salta e marca ativa (`selecao.ts:172-182`, `231-234`) |

Busca por letra acumula por 800ms (`selecao.ts:174`) e compara com
`toLocaleLowerCase('pt-BR')` (`selecao.ts:177,233`) — acento e caixa em português.

ARIA no gatilho: `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`,
`aria-controls`, `aria-activedescendant` (`selecao.ts:63-66`, `109-111`). A lista é
`role="listbox"` com itens `role="option"` e id estável `${marca}-opcao-${posicao}`
(`selecao.ts:74-78`, `146-152`).

Rótulo: usa o `<label>` **da tela**, sem duplicar — `aria-labelledby="${rotulo.id}
${gatilho.id}"` (`selecao.ts:82-88`); e `aria-describedby` é herdado do nativo
(`selecao.ts:89-90`).

### Garantias travadas por teste — `selecao.test.ts`

| O que | Teste |
| --- | --- |
| nativo permanece conectado, `tabIndex -1`, `aria-hidden="true"`, gatilho é `combobox`, rótulo da tela é o rótulo | `selecao.test.ts:38-46` (asserções 39-45) |
| teclado escreve no `<select>`, dispara `change` **uma** vez, o gatilho mostra o rótulo e fecha | `selecao.test.ts:48-61` (57-60) |
| `Escape` fecha sem mudar valor **e não alcança o diálogo em volta** | `selecao.test.ts:63-74` (70-73) |
| acompanha opções novas, `disabled` e `aria-invalid` vindos de fora | `selecao.test.ts:76-87` (79, 85-86) |
| `nativa.focus()` termina no gatilho | `selecao.test.ts:89-92` (91) |

Observação para o React: `escolher()` dispara **`input` e `change`** no nativo
(`selecao.ts:118-121`), porque parte das telas escuta um e parte escuta o outro. E o
clique fora fecha sem escolher, via listener de `document` em fase de captura
(`selecao.ts:236-240`).

### Para o React

`combobox.tsx` sobre Radix Popover + cmdk (`design.md:121`). Enquanto houver tela não
migrada lendo o `<select>`, o componente precisa de um modo controlado que continue
emitindo `input`+`change` no elemento nativo, ou a tela migrada escreve no estado React e
o adaptador HTTP recebe o valor direto — decisão a registrar na tarefa, não a improvisar.
O `Escape` que não escapa para o diálogo continua obrigatório.

---

## 5. Campo de data — `data.ts` + `ui.css:293-397`

### Decisão de arquitetura

Mesma da seleção: o `input[type=date]` continua no documento, dono do valor em ISO
(`data.ts:8-11`, `data.ts:108-112`), escondido por `[data-aprimorada]` (`ui.css:297-306`).

**Nada de fuso.** As contas são feitas sobre ano/mês/dia, nunca sobre `new Date(iso)`
(`data.ts:13-14`, `data.ts:47-67`): `diasNoMes` e `primeiroDiaDaSemana` usam `Date.UTC`.

### API atual

```ts
type CampoData = {                                   // data.ts:17-24
  grupo: HTMLElement; texto: HTMLInputElement; abrir: HTMLButtonElement;
  calendario: HTMLElement; sincronizar(): void; encerrar(): void;
};
paraVisivel(iso: string): string            // data.ts:70 — '' quando inválido
doVisivel(visivel: string): string | null   // data.ts:78 — null quando não é data real
aprimorarData(nativo: HTMLInputElement): CampoData     // data.ts:97 — idempotente (98-102)
aprimorarDatas(raiz: ParentNode): CampoData[]          // data.ts:355
```

### Medidas

- Linha: `flex`, `align-items: stretch`, `gap: var(--espaco-2)` (`ui.css:307-311`).
- Campo de texto: reusa `.ui-campo__controle` (`data.ts:119`) — logo, mesmas medidas do §2 —
  mais `.ui-data__texto { flex: 1 1 auto; min-width: 0 }` (`ui.css:312-315`).
- Botão de abrir: `48px` de lado, `border: 1px solid var(--field-line)`,
  `border-radius: var(--radius-field)`, `color: var(--primary)` (`ui.css:316-326`);
  desabilitado: `--panel`/`--muted`/`not-allowed` (`ui.css:327-331`).
- Calendário: `position: absolute; z-index: 30`, `width: min(21rem, calc(100vw -
  var(--espaco-6)))`, `padding: var(--espaco-3)`, `border-radius: var(--radius-control)`,
  mesma sombra da lista de seleção (`ui.css:332-343`).
- Passo de mês: `min-width/min-height: 44px` (`ui.css:358-366`). Dia: `min-height: 44px`,
  `font: 400 var(--texto-2) / 1.2 var(--font-body)` (`ui.css:378-386`). Grade de 7 colunas
  com `gap: 2px` (`ui.css:367-371`).

### Estados

| Estado | Regra | Onde |
| --- | --- | --- |
| hover no dia | `background: var(--soft)` | `ui.css:387-389` |
| hoje | `[data-hoje="sim"] { border-color: var(--brand-olive) }` | `ui.css:390-392`, `data.ts:228-233` |
| dia escolhido | `[aria-selected="true"] { background: var(--primary); color: var(--white); font-weight: 600 }` | `ui.css:393-397` |
| erro | `aria-invalid="true"` no campo de texto, **só quando os 10 caracteres estão preenchidos e a data é impossível** | `data.ts:304-305` |
| desabilitado | texto e botão seguem `nativo.disabled` | `data.ts:311-312` |

### Comportamento de digitação

- Máscara progressiva, sem recusar o incompleto: `mascarar()` filtra não-dígitos, corta em
  8 e junta com `/` (`data.ts:88-94`).
- A cada `input`: se virar ISO válido, escreve no nativo e dispara `input`+`change`; senão
  **limpa** o nativo e dispara `input` (`data.ts:291-306`).
- `inputMode = 'numeric'`, `autocomplete="off"`, `placeholder="dd/mm/aaaa"`, `maxLength = 10`
  (`data.ts:120-123`).
- Dica de formato invisível, em `.sr-only` (`web/styles.css:652`), ligada por
  `aria-describedby` junto com o que já vinha do nativo (`data.ts:135-139`).
- O `<label>` da tela é **reapontado** para o campo visível (`rotulo.htmlFor = texto.id`,
  `data.ts:125-130`).

### Teclado do calendário — `data.ts:256-277`

`ArrowLeft/Right` ±1 dia; `ArrowUp/Down` ∓7 dias; `PageUp/PageDown` ∓1 mês; `Escape`
fecha com `preventDefault` **e `stopPropagation`** (`data.ts:271-276`). Roving tabindex:
só o dia em foco tem `tabIndex = 0` (`data.ts:234`), e `mover()` redesenha e refoca
(`data.ts:245-254`). O mês tem `aria-live="polite"` (`data.ts:199`). O botão é
`aria-haspopup="dialog"` + `aria-expanded` + `aria-controls`; o popover é `role="dialog"`
com `aria-label="Calendário"` (`data.ts:145-156`).

### Garantias travadas por teste — `data.test.ts`

| O que | Teste |
| --- | --- |
| conversão nos dois sentidos sem fuso; 29/02 de ano bissexto aceita, de não bissexto recusa; mês 13 recusa | `data.test.ts:33-41` (34-40) |
| digitar `31012000` vira `31/01/2000` visível e `2000-01-31` no nativo | `data.test.ts:43-52` (50-51) |
| incompleta não marca erro; completa e impossível marca `aria-invalid` | `data.test.ts:54-67` (59-66) |
| calendário abre, 31 células, selecionado correto, `ArrowLeft` anda um dia e o clique grava | `data.test.ts:69-86` (72-85) |
| `Escape` fecha o calendário **sem alcançar o diálogo em volta** | `data.test.ts:88-100` (98-99) |
| o `<label>` aponta para o campo digitável; o nativo fica `aria-hidden` e fora da tabulação | `data.test.ts:102-107` (104-106) |

### Para o React

`date-field.tsx` **mantendo `paraVisivel`, `doVisivel`, `mascarar` e as contas em UTC como
estão** (`design.md:122`). Essas funções são puras e já testadas: portá-las sem alteração
é mais barato e mais seguro do que adotar o parser de qualquer biblioteca de calendário.

---

## 6. Seleção com busca

**Não existe em `web/ui/`.** O que existe é a seleção do §4, com salto por letra digitada
(`selecao.ts:172-182`), que é outra coisa: não filtra a lista, só move o cursor.

**O React precisa** (cmdk dentro do Popover, `design.md:121`): campo de busca dentro da
lista, filtragem sem acento e sem caixa — reusar a comparação `toLocaleLowerCase('pt-BR')`
já usada em `selecao.ts:177` —, estado vazio de busca ("nenhum resultado"), `aria-controls`
/`aria-activedescendant` mantidos, e as mesmas garantias de `Escape` contido e de valor
escrito onde o formulário lê.

---

## 7. Diálogo — `dialogo.ts` + `ui.css:405-554`

### API atual

```ts
type MedidaDialogo = 'formulario' | 'conteudo' | 'decisao';   // dialogo.ts:49
type AcaoDialogo = {                                           // dialogo.ts:51-63
  rotulo: string;
  peso?: 'principal' | 'secundario' | 'discreto';   // padrão 'secundario' (dialogo.ts:93)
  marca?: string;                                   // vira data-acao
  aoAtivar?: () => boolean | undefined;             // false mantém aberto (dialogo.ts:97)
  fecha?: boolean;                                  // padrão: fecha (dialogo.ts:98)
  focoInicial?: boolean;
};
type PedidoDialogo = {                                         // dialogo.ts:65-78
  titulo: string; descricao?: string; medida?: MedidaDialogo;  // padrão 'formulario' (109)
  corpo?: Node | readonly Node[]; acoes?: readonly AcaoDialogo[];
  comFechar?: boolean; classe?: string; aoFechar?: () => void;
};
type Dialogo = { elemento: HTMLDialogElement; corpo; rodape; fechar(): void };
abrirDialogo(pedido: PedidoDialogo): Dialogo                   // dialogo.ts:104
focaveis(raiz: ParentNode): HTMLElement[]                      // dialogo.ts:25
prenderFoco(raiz: HTMLElement): () => void                     // dialogo.ts:34
```

### Variantes de medida

| `data-medida` | Largura ≥768px | Diferenças | Onde |
| --- | --- | --- | --- |
| `formulario` (padrão) | `min(560px, 100vw - var(--espaco-6))` | — | `ui.css:408` |
| `conteudo` | `min(720px, …)` | — | `ui.css:424-426` |
| `decisao` | `min(420px, …)` | cabeçalho sem filete e sem padding inferior; corpo com `padding-top: var(--espaco-3)`; rodapé sem filete; **sem botão de fechar** | `ui.css:427-429`, `ui.css:514-524`, `dialogo.ts:144` |

### Medidas

- Teto de altura: `max-height: min(640px, calc(100dvh - var(--espaco-6) * 2))`
  (`ui.css:415`). O comentário em `ui.css:409-414` registra a medição de 25/11/2026: sem o
  teto de 640px, o cadastro em 1440x900 ficava com 852px de altura e 24px de folga, lendo
  como lâmina colada à tela.
- Raio `--radius-panel`, borda `--line`, sombra `0 18px 48px rgb(39 49 35 / 20%)`
  (`ui.css:418-422`); `overflow: hidden` (`ui.css:417`) para o raio recortar o corpo rolante.
- Backdrop: `rgb(39 49 35 / 48%)` (`ui.css:430-432`).
- Cabeçalho: `padding: var(--espaco-5) var(--espaco-5) var(--espaco-4)`, filete embaixo,
  `gap: var(--espaco-4)` (`ui.css:433-441`). Título `--font-display`, `var(--texto-4)`,
  peso 600, `line-height: 1.2` (`ui.css:442-448`). Descrição `--muted`, `var(--texto-1)`,
  `max-width: 68ch` (`ui.css:449-454`).
- Botão de fechar: `44x44`, `border-radius: var(--radius-field)`, `font-size: var(--texto-3)`,
  hover `--panel` (`ui.css:455-470`); `aria-label="Fechar"`, glifo `×`, `data-acao="fechar"`
  (`dialogo.ts:145-152`).
- Corpo: `padding: var(--espaco-5)` (`ui.css:480`). Rodapé: `padding: var(--espaco-4)
  var(--espaco-5)`, `gap: var(--espaco-3)`, filete em cima, `justify-content: flex-end`
  (`ui.css:494-504`).

### Centralização, ações visíveis e rolagem — o pedido de 25/11/2026

Como a camada atual resolve, peça por peça:

1. **Centralização.** Não há CSS de posicionamento: vem de `elemento.showModal()`
   (`dialogo.ts:180`) e da folha do agente, que aplica `margin: auto` ao `dialog:modal`.
   O CSS só limita largura (`ui.css:408`) e altura (`ui.css:415`).
2. **Ações sempre visíveis.** O elemento é `display: flex; flex-direction: column`
   (`ui.css:406-407`). Cabeçalho e rodapé são `flex: none` (`ui.css:434`, `ui.css:495`);
   o corpo é `flex: 1 1 auto; min-height: 0; overflow-y: auto`
   (`ui.css:478-482`). O `min-height: 0` é a peça que faz o corpo encolher em vez de
   empurrar o rodapé para fora — sem ele o rodapé sai da tela.
3. **Rolagem com sinal.** Quatro gradientes em `ui.css:483-492`: duas camadas
   `local` (brancas, rolam com o conteúdo) encobrindo duas camadas `scroll` (sombra
   `rgb(31 31 29 / 0.18)`, fixas) no topo e na base. Sem JavaScript, sem animação — logo,
   imune a `prefers-reduced-motion` (`ui.css:471-476`). `overscroll-behavior: contain`
   (`ui.css:482`) impede o scroll de vazar para a página atrás.
4. **Corpo vazio não pinta sinal.** `.ui-dialogo__corpo:empty { display: none }`
   (`ui.css:511-513`) — sem isso, o diálogo de decisão mostrava uma faixa cinza no meio,
   lida como defeito (`ui.css:508-510`). O rodapé tem o mesmo tratamento (`ui.css:505-507`).
5. **Celular (<768px).** O mesmo elemento vira folha ancorada embaixo (`ui.css:526-554`):
   `width: 100%`, `max-height: calc(100dvh - var(--espaco-6))`, `margin-block: auto 0`
   (cola na base), borda só em cima, raio só nos cantos superiores. Paddings caem para
   `--espaco-4`. O rodapé vira `flex-direction: column-reverse; align-items: stretch`, os
   botões ficam `width: 100%` (`ui.css:546-553`) — a ação segura fica sob o polegar — e
   recebe `padding-bottom: calc(var(--espaco-4) + env(safe-area-inset-bottom, 0px))`.
6. **Teclado virtual.** A altura é `dvh`, não `vh` (`ui.css:415`, `ui.css:532`): com o
   teclado aberto, a ação continua no rodapé visível (`medidas.md:42-44`).

Medições que comprovam (`medidas.md:33-44`): 1440x900 — largura 560px, topo 24px, base
876px, cabeçalho 121px fixo, corpo 604px rolando 852px de conteúdo, rodapé 79px fixo;
390x844 — folha com base em 844px, cabeçalho 141px, corpo 545px rolando 878px, rodapé 79px
com `safe-area`.

**O que a camada atual NÃO resolve:**

- Sem `showModal` (jsdom), cai em `setAttribute('open')` (`dialogo.ts:178-181`): aí não há
  `::backdrop`, não há centralização do agente e não há inertização do resto da página. É
  fallback de prova, não de navegador.
- **Não há fechamento por clique fora.** Não existe listener de backdrop em `dialogo.ts`.
- **Não há bloqueio de rolagem do corpo da página** além do que `showModal` dá de graça.
- `prenderFoco` recalcula a lista de focáveis a cada `Tab` (`dialogo.ts:37`), mas o
  seletor (`dialogo.ts:13-21`) não cobre `[contenteditable]` nem elementos de Shadow DOM.

### Comportamento de foco e fechamento

- Foco preso: `Tab`/`Shift+Tab` circulam dentro da raiz, sempre com `preventDefault`
  (`dialogo.ts:34-47`). Se o foco estiver fora da lista (`atual === -1`), vai para o
  primeiro (`dialogo.ts:43`).
- `focaveis()` exclui `disabled`, `aria-hidden="true"` e qualquer coisa dentro de `[hidden]`
  (`dialogo.ts:25-31`) — é o que impede o `<select>` escondido pelo aprimoramento de entrar
  na volta do `Tab`.
- Foco inicial: a ação marcada `focoInicial`, senão o primeiro focável do corpo, senão o
  primeiro botão, senão o próprio diálogo (`dialogo.ts:183-186`).
- `fechar()` é idempotente (`dialogo.ts:133-135`), libera o trap, fecha, **remove do DOM**,
  devolve o foco a quem abriu se ainda estiver conectado, e só então chama `aoFechar`
  (`dialogo.ts:130-142`).
- `Escape`: dois caminhos — o evento `cancel` do `<dialog>` com `preventDefault`
  (`dialogo.ts:165-169`) e um `keydown` próprio (`dialogo.ts:170-174`), para o caso sem
  `showModal`.
- Ação que recusa: `aoAtivar()` devolvendo `false` **mantém o diálogo aberto**
  (`dialogo.ts:97`) — é como a validação do formulário mostra o erro sem a tela fechar.

### Garantias travadas por teste — `dialogo.test.ts`

| O que | Teste |
| --- | --- |
| abre com `open`, foco vai para o campo do corpo, exatamente 3 focáveis (campo, ação, fechar), `Tab` não sai | `dialogo.test.ts:10-38` (25-33) |
| fechar remove do DOM e devolve o foco a quem abriu | `dialogo.test.ts:35-37` |
| ação que devolve `false` mantém aberto; a segunda tentativa fecha | `dialogo.test.ts:40-63` (60-62) |
| `data-medida` chega ao elemento (`formulario`/`conteudo`) | `dialogo.test.ts:65-73` (68, 72) |
| `decisao` **não** ganha botão de fechar e `Escape` fecha | `dialogo.test.ts:75-81` (77, 81) |

### Para o React

`dialog.tsx` sobre Radix Dialog + `sheet.tsx` abaixo de 768px (`design.md:120`). O
componente precisa garantir explicitamente, porque Radix **não dá nada disso de graça**:

- Centralização própria: Radix renderiza um `div` em portal, não um `dialog:modal`; o
  `margin: auto` do agente não vale. Usar overlay `fixed inset-0` com
  `grid place-items-center`, ou `left-1/2 top-1/2 -translate-1/2`.
- Grade de três faixas com corpo rolável:
  `grid-template-rows: auto minmax(0, 1fr) auto` (ou o mesmo `flex` + `min-height: 0`),
  mais o teto `max-height: min(640px, calc(100dvh - var(--espaco-6) * 2))`. O
  `DialogContent` padrão do shadcn **não** limita altura: com formulário longo o rodapé sai
  da tela. Isso é exatamente o defeito reclamado em 25/11/2026.
- Os quatro gradientes de sinal de rolagem do corpo (`ui.css:483-492`), sem substituí-los
  por sombra animada.
- O ponto de corte 768px decidindo `Dialog` vs `Sheet`, com rodapé `column-reverse`,
  botões largos e `env(safe-area-inset-bottom)`.
- `100dvh`, nunca `100vh`.
- `data-medida` pode virar prop `medida`, mas os três nomes permanecem.
- Equivalente ao `aoAtivar → false`: `onSelect`/`onSubmit` com `preventDefault` controlando
  o fechamento, nunca `onOpenChange` incondicional.

---

## 8. Confirmação — `web/confirmacao.ts`

Construída inteiramente sobre `abrirDialogo` (`confirmacao.ts:19`, `36`). Não tem CSS
próprio além de `.dialogo-confirmacao` como marca (`confirmacao.ts:40`) e
`data-confirmacao` no elemento (`confirmacao.ts:54`).

```ts
type PedidoConfirmacao = { titulo: string; detalhe?: string; acao: string; cancelar?: string };
confirmar(pedido): Promise<boolean>          // confirmacao.ts:33
confirmarDescarte(oQue: string): Promise<boolean>  // confirmacao.ts:63
```

Decisões que o React precisa manter:

- `medida: 'decisao'` (`confirmacao.ts:39`): sem corpo, sem botão de fechar.
- **Ordem no DOM:** seguir adiante vem **antes** do seguro (`confirmacao.ts:44-50`), porque
  é a ordem de tabulação que as provas guardam; no celular o `column-reverse` do rodapé
  inverte a ordem visual para o seguro cair sob o polegar (`confirmacao.ts:42-43`).
- **Pesos invertidos de propósito:** a ação que segue é `secundario`, o botão seguro é
  `principal` e tem `focoInicial` (`confirmacao.ts:44-50`), porque confirmar por engano é o
  erro caro (`confirmacao.ts:11-13`).
- A promessa resolve em `aoFechar` (`confirmacao.ts:52`), então **Esc, clique no fechar e
  qualquer outro caminho resolvem `false`** — não ficam pendentes.
- Nunca voltar a `window.confirm`: o diálogo nativo fica acima da página, fora da captura
  de tela e do teste, e já produziu um diagnóstico errado de "estado perdido"
  (`confirmacao.ts:1-9`).
- O texto diz a consequência; "Continuar?" é proibido (`confirmacao.ts:11`, `22`).

---

## 9. Superfície / seção — `basicos.ts:135-170` + `ui.css:21-56`

```ts
type PedidoSuperficie = {                      // basicos.ts:117-127
  titulo?: string; descricao?: string; nivel?: 2 | 3;   // sem título, não há cabeçalho
  acao?: HTMLElement; conteudo?: Node | readonly Node[];
  plana?: boolean; rotuloLeitura?: string;
};
type Superficie = { elemento: HTMLElement; corpo: HTMLElement };
superficie(pedido): Superficie                 // basicos.ts:135
```

- Base: `<section>`, `border: 1px solid var(--line)`, `border-radius: var(--radius-card)`,
  `background: var(--white)` — **sem sombra** (`ui.css:21-25`, `ui.css:19-20`).
- `plana`: zera borda, raio e fundo (`ui.css:26-30`) — separa só por espaço.
- Cabeçalho: `flex` com `align-items: baseline`, `space-between`,
  `gap: var(--espaco-3) var(--espaco-4)`, `padding: var(--espaco-4) var(--espaco-5)`,
  filete embaixo (`ui.css:32-40`). Título `--font-display`, `var(--texto-4)`, peso 600
  (`ui.css:41-47`); descrição `--muted`, `var(--texto-1)`, `max-width: 68ch`
  (`ui.css:48-53`). Corpo: `padding: var(--espaco-5)` (`ui.css:54-56`).
- Nível do título: `h2` por padrão, `h3` se `nivel === 3` (`basicos.ts:144`).
- **Nomeação da região:** com `rotuloLeitura` usa `aria-label`; sem ele, gera id sequencial
  no título e aponta `aria-labelledby` (`basicos.ts:157-161`). Nunca fica sem nome. No
  React, trocar a sequência global por `useId`.
- Regra de produto: **uma superfície por assunto**, nada de cartão dentro de cartão
  (`basicos.ts:133-134`, `design.md` da linguagem visual, linhas 22-23).

---

## 10. Lista de registros — `basicos.ts:194-214` + `ui.css:560-603, 661-707`

```ts
type PedidoLinha = {                        // basicos.ts:172-182
  principal: Node | string;                 // o que a linha é
  secundario?: Node | string;               // o que ajuda a reconhecer
  fim?: Node | readonly Node[];             // estado, à direita
  antes?: Node;                             // avatar/ícone
  rotuloLeitura: string;                    // obrigatório
  aoAbrir?: () => void;
};
linhaLista(pedido): HTMLLIElement           // basicos.ts:194
```

- Contêiner `.ui-lista`: `<ul>` sem marcador, `overflow: hidden`, borda `--line`,
  `border-radius: var(--radius-card)`, fundo branco (`ui.css:560-568`). Separação por
  `border-top` no `li`, exceto o primeiro (`ui.css:569-575`) — uma caixa só, não um cartão
  por linha.
- `.ui-linha` é um `<button>` que ocupa a linha inteira (`basicos.ts:196-198`):
  `min-height: 56px`, `padding: var(--espaco-2) var(--espaco-4)`, `gap: var(--espaco-4)`,
  `font: 400 var(--texto-2) / 1.4 var(--font-body)`, `text-align: left` (`ui.css:576-590`).
  Hover `--soft` (`ui.css:591-593`). **`:focus-visible { outline-offset: -3px }`**
  (`ui.css:594-596`) — negativo, para o anel não ser recortado pelo `overflow: hidden` do
  contêiner.
- Celular: `min-height: 64px`, `align-items: flex-start`,
  `padding: var(--espaco-3) var(--espaco-4)` (`ui.css:597-603`). Alvo de leitura 56–64px
  (`ui.css:558-559`).
- Colunas: `.ui-linha__principal { flex: 0 0 34%; font-weight: 600 }`,
  `.ui-linha__secundario { flex: 1 1 10rem; color: var(--muted); font-size: var(--texto-1) }`,
  e tudo a partir do terceiro filho vai para a direita por `margin-left: auto`
  (`ui.css:671-685`). Ambos com `overflow-wrap: anywhere`.
- Seta: 8px com filetes de 2px em `--brand-olive`, `aria-hidden` (`ui.css:686-693`,
  `basicos.ts:207-209`).
- Celular: o principal ocupa a linha (`flex-basis: 100%`), secundário e estado dividem a de
  baixo, e o `margin-left: auto` é zerado (`ui.css:694-707`). O comentário registra o
  porquê: empilhar os três levava a linha a 99px (`ui.css:695-697`, `medidas.md:20-23`).
- `rotuloLeitura` é **obrigatório** no tipo (`basicos.ts:180`) e vira `aria-label`
  (`basicos.ts:199`): a linha inteira é um botão, e o rótulo precisa dizer o que abre.

Existe ainda uma segunda lista, **não interativa**, em `web/styles.css:3296-3334`:
`.lista-registros` / `.lista-registros__linha` (`min-height: 56px`, principal
`flex: 0 0 40%`), com `:empty:not([aria-busy="true"]) { display: none }`
(`web/styles.css:3310-3312`). O `table.tsx` previsto em `design.md:124` precisa cobrir os
dois casos: linha-botão e linha-dado.

---

## 11. Estado vazio — `basicos.ts:218-233` + `ui.css:606-626`

```ts
estadoVazio(titulo: string, texto?: string, acao?: HTMLElement): HTMLElement
```

- `display: grid; gap: var(--espaco-2); justify-items: start`,
  `padding: var(--espaco-7) var(--espaco-5)`, **`border: 1px dashed var(--line)`**,
  `border-radius: var(--radius-card)`, fundo branco (`ui.css:606-614`).
- Título: `<h3>`, `--font-display`, `var(--texto-4)`, peso 600 (`ui.css:615-621`,
  `basicos.ts:221`). Texto: `--muted`, `max-width: 68ch` (`ui.css:622-626`).
- Sem ilustração e sem caixa extra (`ui.css:604-605`).
- Regra de conteúdo: diz o que houve e o que fazer a seguir; **nunca afirma que algo não
  existe quando só não veio** (`basicos.ts:216-217`). Isso é texto, mas é contrato — o
  `estado-vazio.tsx` deve separar "não há" de "não carregou".

---

## 12. Estado de erro / aviso — `basicos.ts:239-255` + `ui.css:632-659`

```ts
type TomAviso = 'informacao' | 'atencao' | 'erro';                 // basicos.ts:235
aviso(texto: string, tom: TomAviso = 'informacao', titulo?: string): HTMLElement
```

| `data-tom` | Régua esquerda (3px) | Fundo | Texto | Onde |
| --- | --- | --- | --- | --- |
| `informacao` (padrão) | `--brand-olive` | `--soft` | `--ink` | `ui.css:632-641` |
| `atencao` | `--primary` | `--panel` | `--ink` | `ui.css:651-654` |
| `erro` | `--error` | `--white` | `--error` | `ui.css:655-659` |

- `padding: var(--espaco-3) var(--espaco-4)`, `gap: var(--espaco-1)`,
  `border-radius: 0 var(--radius-field) var(--radius-field) 0`, `font-size: var(--texto-2)`
  (`ui.css:632-641`). Título do aviso: `var(--texto-2)`, peso 600 (`ui.css:642-646`).
  Texto: `max-width: 68ch` (`ui.css:647-650`).
- **Nunca uma caixa colorida:** o tom muda a régua, não a cor da palavra — exceto o erro,
  que tem cor própria (`ui.css:630-631`).
- `tom === 'erro'` recebe `role="alert"` (`basicos.ts:243`); e `[role="alert"]` tem
  `animation: none; transition: none` por regra global (`web/styles.css:3116-3123`).

---

## 13. Indicador de carga — só em `web/styles.css`, fora de `web/ui/`

Não há função em `web/ui/`. O que existe é uma regra global sobre `aria-busy`
(`web/styles.css:3233-3281`):

- **Região vazia em consulta** (`[aria-busy="true"]:empty`): `position: relative`,
  `min-height: 108px`, `overflow: hidden`, com `animation: loading-reveal 0s linear 300ms
  backwards` (`web/styles.css:3246-3252`) — o atraso de 300ms que impede o piscar
  (`web/styles.css:128`, `3176-3177`). O `::before` desenha três barras de `--soft`
  (100%/82%/58% de largura) e o `::after` faz a varredura
  `esqueleto-varredura 1.6s var(--curva-entrada) 300ms infinite`
  (`web/styles.css:3253-3277`, keyframes em `3283-3290`).
- **Região com conteúdo anterior** (`[aria-busy="true"]:not(:empty)`): só
  `opacity: 0.62` com `transition: opacity var(--mov-estado) var(--curva-entrada)`
  (`web/styles.css:3278-3281`). Atualizar uma lista **não** a esvazia, e o recuo **não**
  desliga os controles (`web/styles.css:3275-3277`).
- Esqueleto de lista legado: `.list-loading span` com `height: 64px` e a variante
  `[data-compacto]` de 36px, último filho a 60% (`web/styles.css:2491-2527`).
- `prefers-reduced-motion` para a varredura e mantém a forma (`web/styles.css:3244-3245`,
  bloco único em `3307`).

**O React precisa:** `skeleton.tsx` com as duas formas (vazio e recuo), o atraso de 300ms,
e `aria-busy` continuando a ser o sinal — não substituir por um `spinner` novo. Botão em
envio: ver §16.

---

## 14. Marca de estado (badge) — só em `web/styles.css`

Não existe em `web/ui/`. Os dois exemplares vigentes:

- `.pessoa-situacao` (`web/styles.css:932-941`): `padding: 2px 10px`,
  `border-radius: 20px`, `background: var(--panel)`, `color: var(--ink)`,
  `font-size: var(--texto-1)`, peso 600, `justify-self: start`,
  `margin-top: var(--espaco-1)`. Variante `[data-situacao="completar"]`
  (`web/styles.css:942-948`): fundo branco, `border: 1px solid var(--line)`,
  `color: var(--muted)` — borda **contínua**; a tracejada foi retirada por parecer defeito
  de renderização (`web/styles.css:942-943`).
- `.ficha-aba-estado` (`web/styles.css:1078-1085`): `padding: 2px 8px`,
  `border-radius: 20px`, `background: var(--soft)`, `color: var(--muted)`,
  `font-size: var(--texto-1)`.

`badge.tsx` deve unificar esses dois em variantes nomeadas, preservando
`border-radius: 20px`, `--texto-1` e a proibição de oliva como cor de texto. Não há hoje
variante de perigo/sucesso com fundo tonal. O vocabulário de aviso já existe
(`--aviso`, `--aviso-filete`, `--aviso-superficie`, `--aviso-texto` em
`web/styles.css:66-70`) e o de erro tem `--error-superficie` (`web/styles.css:77`);
faltam `--sucesso*` e `--perigo*`, que a tarefa 0.1 não promoveu por não haver uso
literal correspondente na folha.

---

## 15. Abas — só em `web/styles.css`

Não existe em `web/ui/`. A linguagem única de aba já foi definida e vale para ficha,
administração e financeiro (`web/styles.css:1033-1085`):

- `.ficha-aba, .administracao-aba, .financeiro__aba`: `inline-flex`, `min-height: 48px`,
  `min-width: 44px`, `padding: var(--espaco-3) var(--espaco-4)`, `border: 0`,
  **`border-bottom: 3px solid transparent`**, `border-radius: 0`, fundo transparente,
  `color: var(--muted)`, `--font-body`, `var(--texto-2)`, peso 600, `text-align: left`,
  transição de `color`/`border-color`/`background-color` em
  `var(--mov-estado) var(--curva-entrada)` (`web/styles.css:1038-1059`).
- Hover: `color: var(--ink); background: var(--soft)` (`web/styles.css:1064-1069`).
- **Selecionada** — `[aria-selected="true"]`, `[aria-current="true"]` ou
  `[aria-current="page"]`: `border-bottom-color: var(--brand-olive)`,
  `color: var(--primary)`, `font-weight: 700` (`web/styles.css:1070-1077`). A seleção
  **nunca depende só de cor**: traço de 3px + peso (`web/styles.css:1033-1037`). A pílula
  preenchida foi abandonada por deixar o rótulo ilegível.
- Faixa `.ficha-abas`: `display: flex`, `gap: var(--espaco-1)`, `overflow-x: auto`,
  `border-bottom: 1px solid var(--line)`, `scrollbar-width: thin` e os **mesmos quatro
  gradientes** `local`/`scroll` do corpo do diálogo, na horizontal
  (`web/styles.css:1017-1032`) — sinal de continuidade sem JavaScript e sem animação. Abas
  diretas da faixa: `flex: none; white-space: nowrap` (`web/styles.css:1060-1063`).

`tabs.tsx` sobre Radix Tabs deve reproduzir essa aparência e o sinal de rolagem
horizontal, e manter `aria-selected`/`aria-current` como gancho de estilo para não quebrar
os testes de tela que já procuram por eles.

---

## 16. Lacunas — o que a camada atual não tem

| Peça | Situação hoje | O que já se sabe do comportamento desejado |
| --- | --- | --- |
| `textarea.tsx` | só o reset global `web/styles.css:470-484` + ajustes por tela | medidas do campo de texto (§2), altura por prop, `--texto-2` obrigatório (iOS) |
| `tabs.tsx` | CSS pronto em `web/styles.css:1017-1085`, sem componente | traço oliva de 3px + peso 700; nunca só cor; faixa rolável com os gradientes `local`/`scroll` |
| `table.tsx` | `.lista-registros` em `web/styles.css:3296-3334` | superfície única, `min-height: 56px` por linha, empilhar no celular (`web/styles.css:3294`), `:empty:not([aria-busy])` some |
| `skeleton.tsx` | regra global de `aria-busy` (`web/styles.css:3233-3281`) | duas formas (vazio com barras `--soft`; cheio com `opacity: 0.62`), atraso de 300ms, varredura 1,6s que para em `prefers-reduced-motion` |
| `badge.tsx` | `.pessoa-situacao` e `.ficha-aba-estado` | raio 20px, `--texto-1`, fundo `--panel`/`--soft`, variante de contorno; oliva nunca como texto |
| `estado-erro.tsx` | só `aviso(tom: 'erro')` (§12) | `role="alert"`, sem animação, régua `--error`, fundo branco; precisa também do caso "não carregou" com ação de tentar de novo, que hoje não existe |
| botão `carregando` | inexistente | hoje a espera é `aria-busy` na região (`web/styles.css:3278-3281`); decidir se o botão ganha estado próprio ou segue `aria-disabled` + região ocupada — **decisão de produto, não de implementação** |
| botão `ghost`/`destrutivo` | inexistentes (`design.md:119` os cita) | `discreto` não é `ghost` (tem sublinhado, `ui.css:96`); `destrutivo` precisa de `--perigo` + `-superficie`, que ainda não existem — `--error` e `--error-superficie` (`web/styles.css:38`, `77`) são o ponto de partida, sem hex novo |
| seleção com busca | só salto por letra (`selecao.ts:172-182`) | filtro sem acento/caixa reusando `toLocaleLowerCase('pt-BR')`, estado vazio de busca |
| modo escuro | inexistente: `color-scheme: light` (`web/styles.css:24`) | fora de escopo nesta mudança; não introduzir por hábito de shadcn |
| tokens de D3 (`design.md:63-72`) | **já promovidos em 25/11/2026** pela tarefa 0.1: `--superficie/-2/-3`, `--borda`, `--borda-forte`, `--sobreposicao`, `--primary-suave/-filete/-texto-suave`, `--aviso*`, `--error-superficie`, `--areia-*`, `--controle-sm` 36px e `--controle-md` 46px, `--largura-sidebar` 248px e `--largura-trilho` 80px, `--icone-base` 16px e `--icone-chrome` 18px, `--sombra-controle/-menu/-modal` (`web/styles.css:40-101`), conferidos por `web/contrato-visual.test.ts` | faltam só `--sucesso*` e `--perigo*`; `--controle-lg` não foi criado (há `sm` e `md`). **Dívida:** `ui.css:252`, `ui.css:342` e `ui.css:422` ainda escrevem a sombra literal em vez de `--sombra-menu`/`--sombra-modal`, de valor idêntico — o React usa o token |

---

## 17. Riscos de regressão

Comportamento sutil que uma reescrita ingênua perde. Cada item é verificável.

1. **Rodapé do diálogo saindo da tela.** `DialogContent` do shadcn não tem teto de altura
   nem `min-height: 0` no corpo. Sem reproduzir `ui.css:415` + `ui.css:478-482` +
   `ui.css:494-495`, o formulário longo volta ao defeito reclamado em 25/11/2026.
2. **`vh` no lugar de `dvh`.** `ui.css:415` e `ui.css:532` usam `dvh` de propósito: com o
   teclado virtual aberto, a ação continua visível (`medidas.md:42-44`).
3. **Centralização assumida.** Hoje vem de `showModal` (`dialogo.ts:180`), não do CSS. Em
   Radix, que renderiza um `div` em portal, é preciso escrever a centralização.
4. **Sinal de rolagem trocado por sombra animada.** Os gradientes de `ui.css:483-492` são
   pintura, não movimento — por isso sobrevivem a `prefers-reduced-motion`
   (`ui.css:471-476`). O mesmo vale para a faixa de abas (`web/styles.css:1017-1032`).
5. **`.ui-dialogo__corpo:empty { display: none }`** (`ui.css:511-513`). Sem isso, o
   diálogo de decisão volta a mostrar uma faixa cinza no meio (`ui.css:508-510`).
6. **Ordem dos botões da confirmação.** Seguir vem antes do seguro no DOM
   (`confirmacao.ts:42-50`) e o `column-reverse` do celular (`ui.css:548`) inverte só o
   visual. Inverter o DOM "para ficar igual ao desenho" quebra tabulação e testes.
7. **Promessa da confirmação resolvida em `aoFechar`** (`confirmacao.ts:52`). Se o React
   resolver no `onClick` do cancelar, Esc e clique fora deixam a promessa pendente para
   sempre.
8. **`aoAtivar → false` mantendo o diálogo aberto** (`dialogo.ts:97`, travado em
   `dialogo.test.ts:40-63`). Radix fecha no clique por padrão.
9. **Devolução do foco a quem abriu** (`dialogo.ts:140`, travado em
   `dialogo.test.ts:37`). Radix devolve ao `Trigger`; onde o diálogo é aberto por código,
   sem trigger, isso precisa ser explícito.
10. **`focaveis()` ignorando `aria-hidden` e `[hidden]`** (`dialogo.ts:26-30`). É o que
    mantém a contagem de 3 em `dialogo.test.ts:28` com um `<select>` aprimorado dentro.
11. **`Escape` da seleção e do calendário fechando o diálogo inteiro.** `stopPropagation`
    em `selecao.ts:225` e `data.ts:274`, travado em `selecao.test.ts:73` e
    `data.test.ts:99`. Radix Popover dentro de Radix Dialog reintroduz exatamente esse
    risco.
12. **`input` **e** `change` disparados juntos** ao escolher (`selecao.ts:118-121`,
    `data.ts:170-171`, `data.ts:296-297`): parte das telas escuta um, parte o outro.
13. **Valor escrito no controle que o formulário envia.** `selecao.test.ts:5-8` existe
    para isso: um combobox que esquece de escrever manda cadastro vazio ao servidor.
14. **`form.reset()` não dispara `change`.** Por isso o `setTimeout(sincronizar, 0)` em
    `selecao.ts:244` e `data.ts:328`; sem ele, o campo visível mostrava a data do cadastro
    anterior (`data.ts:326-327`).
15. **Datas convertidas com `new Date(iso)`.** `data.ts:13-14` e `data.test.ts:5-7`: o dia
    anda para trás conforme o fuso, e vira data errada no prontuário. Portar
    `doIso`/`paraIso`/`diasNoMes` sem reescrever.
16. **Erro de data só com 10 caracteres** (`data.ts:304`, `data.test.ts:59-66`): marcar
    `aria-invalid` enquanto a pessoa ainda digita é regressão de usabilidade.
17. **`.ui-campo__erro:empty { display: none }`** (`ui.css:171-173`) com o nó sempre
    montado e sempre em `aria-describedby` (`basicos.ts:102-104`): montar o erro
    condicionalmente reintroduz o salto de layout e perde o anúncio.
18. **`aria-invalid` acoplado ao texto do erro** (`basicos.ts:109-113`): borda vermelha
    sem frase é erro só por cor.
19. **`outline-offset: -3px` na linha de lista** (`ui.css:594-596`): com o
    `overflow: hidden` do contêiner (`ui.css:563`), o offset positivo global recorta o
    anel de foco.
20. **Degradação sem script.** `[data-aprimorada]` é escrito **depois** da montagem
    (`selecao.ts:53-55`, `data.ts:110`), para falha de script não deixar o campo
    invisível. Em React o nativo some por construção: registrar que a garantia muda de
    natureza, em vez de alegar que foi preservada.
21. **`.ui-botao` desabilitado por `aria-disabled`** (`ui.css:81`, `89`, `99`, `104`): o
    botão que fica focável e anunciável não pode acender no hover.
22. **Oliva como cor de texto.** Proibido (`ui.css:9`, `design.md:78-80`). Toda aparição
    é filete, área ou marcação: seta da seleção (`ui.css:233-234`), filete da opção
    escolhida (`ui.css:280`), borda de hoje no calendário (`ui.css:391`), seta da linha
    (`ui.css:690-691`), traço da aba selecionada (`web/styles.css:1074`).
23. **`aria-busy` com conteúdo anterior apenas recua** (`web/styles.css:3278-3281`):
    substituir por skeleton que desmonta a lista reintroduz os três estados em menos de um
    segundo que o comentário em `web/styles.css:3234-3237` descreve como defeito.
24. **Região da superfície sempre nomeada** (`basicos.ts:157-161`): `aria-label` ou
    `aria-labelledby`, nunca nenhum dos dois.
25. **`min-width: 0`** em `.ui-campo` (`ui.css:122`), `.ui-selecao` (`ui.css:184`),
    `.ui-data` (`ui.css:295`) e `.ui-linha__texto` (`ui.css:669`): sem ele, campo longo
    estoura a grade do diálogo no celular.
26. **Nomes de domínio em português.** `peso`, `medida`, `rotuloLeitura`, `aoAtivar`,
    `data-acao` são lidos por testes existentes (`dialogo.test.ts:58`,
    `data.test.ts:24`). Traduzir para `variant`/`size` sem mapear quebra provas de
    comportamento que `design.md:151-156` manda preservar.
