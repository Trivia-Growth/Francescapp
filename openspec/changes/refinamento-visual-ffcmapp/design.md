# Design

## Context

Ver [proposal.md](proposal.md) para motivação e recorte, e
[docs/processo/avaliacao-visual-21-11-2026.md](../../../docs/processo/avaliacao-visual-21-11-2026.md) para o
diagnóstico com `arquivo:linha` e as 94 capturas que o sustentam.

Esta change **refina**, não substitui: a composição serena do mock aprovado em 17/11/2026
(`redesenhar-interface-ffcmapp`) continua valendo, assim como "The Quiet Surface Rule" e "The Francescato
Rule" de `DESIGN.md`. O que muda é que as decisões passam a existir como sistema, e não como sedimento de CSS.

**Estrela-guia.** O slogan da Francescato, *"Nós ESTAMOS para que você SEJA"*, lido como instrução de
interface: **presença sem imposição**. A interface está disponível, não reivindica atenção para si, não
celebra, não cobra. Luxo aqui é contenção.

**As duas pessoas na mesma casca.** Um acompanhante terapêutico preenchendo ficha às três da manhã, e uma mãe
querendo saber como foi o dia do filho. Estados emocionais opostos, mesmo produto. A decisão 6 trata disso.

**Observação factual registrada.** O site da Francescato não enfatiza sigilo. O produto é construído sobre
audiência, autorização e cifra. A família que chega não espera um painel de conformidade. Nada disso autoriza
remover controle: muda **densidade e lugar** da fala sobre permissão, não a política.

### Limites de material, explícitos

Não existe logo vetorial, PNG transparente nem fonte oficial (`docs/projeto/identidade-visual.md`). É
**proibido** recortar fundo, simular transparência, esticar ou redesenhar o símbolo. Logo: Cormorant
Garamond e Raleway seguem provisórias, a marca entra como imagem recebida intacta, e o acabamento final de
identidade fica pendente do marketing da Edilaine. Qualquer promessa além disso seria desonesta.

## Goals / Non-Goals

**Goals**

- Um sistema de fundamentos (tipografia, espaço, cor, movimento) que caiba na cabeça de quem revisa.
- Uma tela de acesso que comunique cuidado e seriedade sem parecer landing page comercial.
- Movimento que oriente a atenção e dê continuidade, nunca entretenha.
- Correção dos defeitos de contraste e de estado selecionado encontrados.
- Leitura possível de registros longos no celular, de madrugada.

**Non-Goals**

- Identidade final de marca, favicon definitivo, variantes de logo.
- Qualquer mudança de autenticação, autorização, audiência, rota, contrato ou integração.
- Tema escuro (`color-scheme: light` permanece; `web/styles.css:19`).
- Framework, biblioteca de animação, fonte remota, ícone de terceiro.
- Habilitar a jornada familiar, hoje desligada em `web/index.html:91`.

## Decisions

### 1. Escala tipográfica: modular de razão 1,25 ancorada em 16px

**Decisão.** Seis degraus, exatamente: **13 / 16 / 20 / 25 / 31 / 39 px** (0.8125 / 1 / 1.25 / 1.5625 /
1.9375 / 2.4375 rem). Papéis:

| Degrau | Papel | Família |
| --- | --- | --- |
| 39 | Título de primeiro contato e de tela principal (desktop) | display (serif) |
| 31 | Título de tela (celular) e título de seção (desktop) | display (serif) |
| 25 | Título de bloco; **nunca** dado operacional | display (serif) |
| 20 | Subtítulo, entrada de leitura longa | corpo (sans) |
| 16 | Corpo, campos, nome de pessoa em lista | corpo (sans) |
| 13 | Metadado, rótulo auxiliar, legenda | corpo (sans) |

Consequências diretas: desaparecem os três vizinhos indistinguíveis (26px em `web/styles.css:398`, 25,6px em
`:2316`, 24px em `:1118`), as grafias duplicadas (`.875rem`/`0.875rem`, `.75rem`/`0.75rem`, `0.85rem`, `25px`,
`16px`, `28px`) e o degrau de 14/15px que hoje aparece 46 vezes sem critério — tudo converge para 13 ou 16.
O nome do paciente sai do serif de 25,6px e passa a corpo 16px com peso 600: nome é dado que se procura, não
título editorial. O mesmo vale para `.visao-destaque` (`:1118`), hoje serif 24px num rótulo de estado.

**Alternativa descartada: razão 1,333 (quarta perfeita).** Produz 16 / 21 / 28 / 38 / 50 e obriga a manter o
display de 50px atual (`:183-187`). Em celular esse degrau já precisa de exceção (42px em `:526`), ou seja, a
razão maior reintroduz exatamente a exceção que estamos removendo, e 50px de serif num produto de leitura
operacional domina a tela sem acrescentar informação.

**Alternativa descartada: manter os 22 tamanhos e só documentá-los.** Documentar um não-sistema não o torna
sistema; qualquer tela nova continuaria escolhendo entre 22 opções sem critério.

**SUPOSIÇÃO CONSERVADORA.** A razão 1,25 e os seis degraus não foram confirmados pelo solicitante. Também não
foram confirmadas as famílias: Cormorant Garamond e Raleway seguem provisórias até o material do marketing.
A escala é desenhada para sobreviver à troca de família — ela define degraus e papéis, não tipos.

### 2. Espaçamento: escala de base 4, oito degraus

**Decisão.** `--espaco-1: 4px` … `--espaco-8: 72px`, com os valores **4 / 8 / 12 / 16 / 24 / 32 / 48 / 72**.
Regras de uso: dentro de um controle, 1–3; entre campos de um grupo, 4; entre grupos, 5; entre blocos de uma
seção, 6; entre seções, 7; margem superior de primeira dobra, 8. Alvo de toque mínimo de 44px continua sendo
restrição de tamanho, não de espaço, e permanece como está
(`AGENTS.md`, medido em `scripts/prova-celular/conforto-celular.pw.ts`).

Isso resolve, entre outros, o encosto de "Para contas internas criadas pela administração." no rótulo
"E-mail" no celular, hoje efeito de `#acesso-interno { margin-block: 28px }` (`web/styles.css:1482`) convivendo
com `.field { margin-bottom: 20px }` (`:272`) e `margin: 12px 0 24px` (`:231`).

**Alternativa descartada: escala rígida de 8px.** Elimina o degrau de 12px, hoje usado corretamente em
`padding` de controle e em `gap` de chips; forçaria 8 (apertado) ou 16 (frouxo) e aumentaria o diff sem ganho
de leitura.

**Alternativa descartada: espaçamento fluido com `clamp()`.** Torna cada medida dependente da viewport e
inviabiliza conferência por captura — exatamente a evidência que este projeto usa para revisar.

### 3. Oliva sem violar contraste: três papéis, nenhuma cor inventada

Medidas de `docs/projeto/identidade-visual.md`: marca `#839352` sobre branco **3,35:1**; marca sobre carvão
`#1F1F1D` **4,92:1**; apoio `#75734D` sobre branco **4,87:1**; carvão sobre branco **16,51:1**. O
`--primary` de produto (`#475436`, `web/styles.css:22`) é mais escuro que a marca e passa com folga.

**Decisão — três papéis, sem exceção:**

1. **Oliva de marca `#839352` é superfície e traço, nunca texto pequeno.** Pode preencher áreas grandes
   (faixa, bloco de marca) desde que o texto sobre ela seja carvão `#1F1F1D` (4,92:1, acima de 4,5:1). Pode
   ser traço de 2–3px (indicador de aba selecionada, régua de seção), onde contraste de texto não se aplica.
   **Nunca** recebe texto branco pequeno, por mais elegante que pareça.
2. **Texto, ícone e botão continuam em `--primary` `#475436`.** Botão primário permanece `#475436` com texto
   branco, como hoje (`web/styles.css:106-114`).
3. **Estado selecionado nunca depende só de cor.** Além da cor, usa traço, peso ou marcador. Isso corrige
   diretamente o defeito crítico: `.administracao-aba[aria-current="page"]` recebe fundo `--primary` e texto
   branco em `web/styles.css:1423-1427` e, 1.180 linhas depois, `color: var(--primary)` em `:2608-2611`,
   produzindo oliva sobre oliva (≈1:1).

**Alternativa descartada: ajustar a luminosidade do oliva da marca até passar 4,5:1 sobre branco.** Seria
inventar uma cor de marca sem manual, contrariando `docs/projeto/identidade-visual.md`. Se o manual chegar com
um valor oficial diferente, a troca é de token, não de arquitetura.

**Alternativa descartada: usar o oliva de apoio `#75734D` como cor de texto (4,87:1).** Passa por pouco, é
visualmente próximo do carvão e introduziria uma terceira cor de texto sem benefício de leitura.

### 4. Vocabulário de movimento

Movimento em produto de saúde **não é entretenimento**: orienta atenção e dá continuidade. Por isso é curto,
previsível e escasso.

**Tokens de duração** — três, e só três:

| Token | Valor | Quando |
| --- | --- | --- |
| `--mov-estado` | 120ms | Resposta a hover, foco, pressionar: cor de fundo, cor de texto, cor de borda |
| `--mov-troca` | 180ms | Troca de conteúdo dentro da mesma tela: aba, acordeão, dobra |
| `--mov-contexto` | 240ms | Entrada e saída de contexto: abrir ficha, voltar à lista, diálogo, gaveta móvel, entrada do acesso |

**Tokens de curva** — duas:

- `--curva-entrada: cubic-bezier(0.2, 0, 0, 1)` — desacelera ao chegar; o elemento se assenta.
- `--curva-saida: cubic-bezier(0.4, 0, 1, 1)` — acelera ao sair; não pede atenção na despedida.

**Atraso de espera:** 300ms antes de qualquer indicador de carregamento. Já existe
(`web/styles.css:2382`, `:2390`, `:2413`) e é um acerto do produto: preserva.

**O que anima, e com qual gatilho:**

| Gatilho | Tratamento | Token |
| --- | --- | --- |
| Hover/foco/pressionar em controle | cor de fundo, texto, borda | `--mov-estado`, `--curva-entrada` |
| Trocar de aba na ficha ou na administração | conteúdo entra com opacidade 0→1 e 4px de deslocamento vertical | `--mov-troca`, `--curva-entrada` |
| Abrir e dobrar "Mais seções" e dobras do acesso | altura/opacidade da região revelada | `--mov-troca` |
| Abrir a ficha de um paciente e voltar à lista | opacidade 0→1 e 8px de deslocamento | `--mov-contexto` |
| Abrir diálogo | opacidade do backdrop e do painel; sem escala | `--mov-contexto` |
| Gaveta móvel | `transform` (já existe em `web/styles.css:1176`), padronizada nos tokens | `--mov-contexto` entrando, `--mov-troca` saindo |
| Primeiro contato do acesso | **uma** sequência: marca, frase, bloco de acesso, escalonados em 60ms | `--mov-contexto`, `--curva-entrada` |
| Espera | esqueleto e indicador existentes, após 300ms | inalterado |

**O que NÃO anima, e por quê:**

- **Erro nunca entra animado.** Mensagem de falha aparece imediatamente; atrasar um erro para fazer graça é
  cruel com quem já está num momento difícil.
- **Retirada de dado protegido é instantânea.** Sair, perder acesso, trocar de sessão: o conteúdo some sem
  transição. Isso preserva os requisitos VIS-005/VIS-006 já aprovados e impede que um quadro de saída exponha
  dado por mais tempo que o necessário.
- **Nada pisca, pulsa ou repete em laço** além do esqueleto de carregamento e do indicador de ação, que já
  existem e cujo laço comunica espera real.
- **Números e valores não são contados em tela.** Nenhum "contador animado" em pendências, objetivos, valores
  financeiros ou datas. O número é a informação; animá-lo é ruído.
- **Nenhuma revelação por rolagem, parallax, elevação em hover de cartão ou brilho.** São gramáticas de
  página de venda; aqui leriam como marketing dentro de um prontuário.
- **Nenhuma celebração ao concluir** tarefa, plantão ou cadastro. Concluir não é conquista; é trabalho.
- **Nada anima em `prefers-reduced-motion`.** Um único bloco global substitui os quatro de hoje
  (`web/styles.css:599`, `:2460`, `:2617`, `:2657`), e o estado final é o estado visível: sem fade residual,
  sem deslocamento.

**Alternativa descartada: animação de entrada por seção, com deslocamento ao rolar.** É o padrão genérico que
`frontend-design` identifica como marca de página gerada, e aqui atrapalharia leitura repetida de prontuário.

**Alternativa descartada: biblioteca de animação.** Tudo acima cabe em `transition` e duas `@keyframes` já
existentes; dependência nova não se justifica.

### 5. A tela de acesso como primeiro contato

**Decisão de composição.** Coluna única centrada, largura máxima ~460px no desktop, com respiro superior
generoso (`--espaco-8`). Ordem vertical: marca › uma frase de acolhimento › o caminho de entrada › dobras dos
demais caminhos › aviso de ambiente e nota de acesso restrito.

- **Marca.** Imagem recebida intacta, em escala menor que os 144px de hoje (`web/styles.css:221-226`), com
  área de respiro suficiente para que o fundo oliva embutido do JPEG leia como selo, e não como bloco colado.
  Sem recorte, sem transparência simulada, sem redesenho. Quando chegar o vetor, só o arquivo muda.
- **Uma frase, não o nome do sistema.** "Acesso ao FFCMApp" descreve a tela; não acolhe. A frase deve estar
  no tom da Francescato — afetuosa, sem termo clínico, sem promessa comercial. **SUPOSIÇÃO CONSERVADORA:**
  proponho uma linha curta de presença, aprovada pelo solicitante antes de entrar; não copiar o slogan
  literalmente sem autorização de marca.
- **Um caminho visível por vez.** O caminho principal de cada público fica à vista; os demais ficam em dobras
  com marcador de dobra explícito (hoje `<summary>` sem marcador, `web/styles.css:2593-2598`, lê como texto
  solto). Isso remove as duas ações primárias de peso idêntico que competem hoje.
- **O aviso de ambiente de teste sai do topo.** Hoje `.chip-ambiente` (`web/styles.css:751-758`) é o objeto
  mais saturado da primeira dobra, e no celular ocupa uma faixa inteira (`:1159-1165`). Ele continua visível
  e legível — é exigência de ambiente —, mas abaixo do bloco de acesso.
- **Menos fala sobre permissão acima da dobra.** Hoje são quatro menções no primeiro viewport. Uma basta no
  primeiro contato; as demais acompanham o caminho a que pertencem. Nenhuma política muda.
- **O que explicitamente não entra:** fotografia de família, ilustração, depoimento, "por que escolher",
  número de anos de mercado, selo, animação de fundo, gradiente. É isso que separa acolhimento de landing
  page.
- **Movimento:** a sequência única de 240ms descrita na decisão 4, e nada mais.

**Alternativa descartada: manter as duas colunas com painel-cartão à direita.** A assimetria atual (coluna
esquerda sem superfície, direita como cartão) não decide se a tela é página ou diálogo, e no celular colapsa
em uma pilha longa. Uma coluna resolve desktop e celular com a mesma composição.

**Alternativa descartada: hero com imagem institucional.** Ganharia impacto e perderia o ponto: a pessoa que
chega às duas da manhã não quer ser impressionada.

### 6. Densidade por audiência, sem duas interfaces

**Decisão.** Mesma paleta, mesma escala tipográfica, mesmo espaçamento, mesmo movimento para todos. Varia:

1. **Quantidade de blocos por tela.** Leitura (família, consulta) mostra menos blocos, cada um com mais ar.
   Registro (profissional em plantão) mostra o formulário primeiro e o histórico depois.
2. **Peso dos controles de escrita.** Em leitura, as ações de escrita não existem ou ficam discretas; em
   registro, a ação de publicar é a única primária da tela — hoje "Publicar" e "Salvar rascunho" têm o mesmo
   peso secundário (`web/styles.css:1052-1058`).
3. **Forma do registro.** O par `Rótulo: valor` em negrito, linha a linha, com marcador de lista, é leitura de
   banco de dados. Para quem lê, o registro vira um parágrafo com data e autoria discretas; os rótulos
   permanecem para campos sem contexto óbvio. Nenhum dado desaparece, nenhuma audiência muda.

**Alternativa descartada: dois temas visuais, um "família" e um "equipe".** Dobra o custo de manutenção,
multiplica os estados a conferir e quebra a promessa de ser o mesmo produto para a mesma família. A diferença
pertence à densidade, não à identidade.

**SUPOSIÇÃO CONSERVADORA.** Os critérios de qual bloco aparece em cada densidade precisam de confirmação do
solicitante por superfície; nada aqui autoriza esconder informação de uma audiência que hoje a recebe.

### 7. Fundamentos antes de telas

**Decisão.** A camada de tokens e a consolidação das redefinições vêm **antes** de qualquer refinamento de
tela, e numa fatia própria. Hoje `.pessoa` é redefinida em `web/styles.css:816`, `:1188`, `:2305` e `:2368`;
`.people-list` em `:807`, `:2293`, `:2364`; `.carteira-tools > #filtros-carteira` recebe `flex: 1 1 100%` em
`:2487` e `flex: 0 1 auto` em `:2524`. Refinar telas sobre essa base multiplicaria o sedimento.

**Alternativa descartada: reescrever `web/styles.css` do zero.** Perderia correções com história documentada
(por exemplo, o `min-height: 44px` das dobras do acesso em `:2593-2598`, que existe por medição real de alvo
de toque) e tornaria a revisão impossível de conferir por diff.

## Risks / Trade-offs

- **Troca de fonte futura.** A escala é desenhada em degraus e papéis; trocar a família muda métricas óticas e
  exigirá reconferência de altura de linha. Aceito: a alternativa é não ter escala.
- **Diff grande em `web/styles.css`.** Mitigado por fatias (fundamentos › correções de contraste › acesso ›
  densidade/estados) e por captura antes/depois em quatro larguras por fatia.
- **Movimento pode irritar em uso repetido.** Mitigado pelas durações curtas, pela ausência de laço e pelo
  bloco global de `prefers-reduced-motion`. Se a conferência mostrar ruído, reduzir é barato.
- **Copy de acolhimento é escolha de marca.** Fica como suposição marcada, sujeita a aprovação; nenhuma linha
  entra em produção sem confirmação.
- **Risco de parecer que o visual substitui o gate de segurança.** Não substitui: nenhuma evidência visual
  conta como prova de autorização ou RLS.

## Migration Plan

Sem migração de dados, sem bandeira de funcionalidade, sem mudança de rota. A adoção é por fatia de
apresentação, cada uma conferível por captura e por `pnpm run verificar:rapido`. A bancada temporária do
diagnóstico é removida antes da primeira fatia.
