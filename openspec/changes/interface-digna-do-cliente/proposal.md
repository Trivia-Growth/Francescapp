# Interface digna do cliente

## Por que

Avaliação do solicitante em 24/11/2026, navegando como a Edilaine na versão publicada,
com as palavras dele: *"os loading estão horríveis, muito lento, nada profissional"*,
*"tela de criar usuário muito feia, uma caixa solta"*, *"clicando nas abas um loading para
montar a página, horrível"*, *"abas das configurações feias"*, *"olha como tá grosseiro,
usou nada de componente e layout moderno"*, *"side bar não está recolhendo"*, *"não existe
visão de lista de pacientes, lista de profissionais"*.

Isto não é preferência de gosto. É a primeira impressão de uma assessoria que atende
famílias de alto padrão em Vila Nova Conceição, e hoje a tela entrega menos do que o
produto por baixo dela já faz.

## O que foi medido

Números do código, não impressão:

- **64 textos distintos de "Carregando…"/"Consultando…"** espalhados por `web/`. Cada um
  substitui o conteúdo inteiro da área por uma frase. Não há esqueleto, não há transição:
  o conteúdo some, aparece texto, some o texto, aparece o conteúdo.
- **`aria-busy` é usado no TypeScript e não tem UMA regra em `web/styles.css`.** Ou seja:
  o estado de carregando existe na semântica e não existe visualmente.
- Nenhuma ocorrência de esqueleto, *shimmer* ou placeholder de carga em todo o CSS.
- A navegação lateral tem botão de recolher com `aria-expanded`, e recolher não altera o
  que está visível: os quatro destinos continuam ocupando o mesmo espaço.
- Não existe tela de lista de profissionais. A lista de pacientes existe, mas como blocos
  empilhados, sem colunas, ordenação ou densidade de lista.

## O que muda

Uma passada de desenho sobre TODAS as telas, com três frentes:

1. **Carregamento.** Trocar substituição de conteúdo por esqueleto na forma do conteúdo
   que vai chegar, com transição curta. Nada de área piscando entre dois estados. Trocar
   de aba não pode desmontar e remontar a página inteira.
2. **Composição.** Formulários em cartão com hierarquia clara, não caixa solta no meio do
   branco. Abas com peso e espaçamento consistentes. Sistema de espaçamento e tipografia
   já existe em tokens (`--texto-1..6`, `--espaco-1..8`): aplicar de fato.
3. **Listas.** Visão de lista para pacientes e uma lista de profissionais que hoje não
   existe, com colunas, ordenação e ações na linha.

Mais a navegação lateral recolhendo de verdade.

## O que NÃO muda

Nenhum contrato, nenhuma rota, nenhuma regra de autorização, nenhuma migration. Esta
mudança é de apresentação. Texto de interface só muda quando a mudança for de forma, não
de sentido: os avisos sobre sinal operacional, audiência, retenção e limites de áudio são
conteúdo acordado e continuam como estão.

## Fora de escopo

Marca definitiva, tipografia oficial e logotipo vetorial — virão do marketing da Edilaine.
