# Direção visual — escolhida em 25/11/2026

O solicitante pediu: *"escolha você e mostre nesse projeto, preserve cores"*, com modais no
computador para as telas não ficarem gigantes e cuidado com o modal no celular.

## O diagnóstico que justifica a direção

Medido em 25/11/2026: **246 arquivos em `web/` e nenhuma camada de componente**, 274 classes
num CSS de 3.426 linhas, 17 `<select>` nativos e 18 campos de data nativos. Cada tela montou
o próprio DOM. Nada se parece com nada porque nada compartilha nada, e nos três momentos de
maior atenção — escolher, confirmar, datar — quem aparece é o widget do navegador, não o
produto. Os 27 `window.confirm` já saíram; faltam os outros 35.

## A direção

**Sóbria, tipográfica, com respiro.** Uma assessoria que acompanha famílias em tratamento de
saúde mental não quer painel de SaaS: quer algo que pareça um documento bem feito.

- **Cor: preservada.** Carvão `#1F1F1D` no texto, `--primary` `#475436` em ação e texto de
  destaque. A oliva `#839352` dá 3,35:1 sobre branco e **nunca** é cor de texto — só área,
  filete e marcação. Nenhum tom novo entra.
- **Hierarquia por tipografia e espaço, não por caixa.** Hoje tudo é cartão dentro de cartão.
  A regra passa a ser: uma superfície por assunto, separada das outras por espaço e filete.
- **Elevação quase zero.** Degrau de fundo e borda em vez de sombra. Sombra só no que flutua
  de verdade: modal e menu.
- **Densidade de leitura.** Linha de lista entre 56 e 64px, ritmo de 8px saindo de
  `--espaco-*`, medida de texto em torno de 68 caracteres. A página usa a largura toda com
  grade clara — não um cartão estreito boiando no branco, que é o tell de amadorismo atual.
- **Movimento curto**, pelos tokens que já existem, com o bloco único de `prefers-reduced-motion`.

## Modal

No computador, formulário longo vira modal para a tela não crescer sem fim; no celular, o
mesmo componente vira folha de baixo para cima.

- **≥768px**: diálogo centrado, 560px para formulário, 720px para conteúdo, fundo escurecido.
- **<768px**: folha ancorada embaixo, ocupando até a área segura, cabeçalho fixo com título e
  fechar, rodapé fixo com as ações, corpo rolando entre os dois. Altura em `dvh` para o
  teclado não empurrar a ação para fora. Nunca um diálogo centrado espremido.
- Foco preso, Esc cancela, foco devolvido a quem abriu — como já faz `web/confirmacao.ts`,
  que vira a base do componente geral.

## Prova antes de espalhar

A direção é provada em **acesso** e **carteira** — as duas primeiras telas que qualquer
pessoa vê. Se estiver certa, rola para as outras; se não, se joga fora uma tela, não o
sistema.

## O que não muda

Contrato, rota, autorização, migration. E o texto acordado com a cliente: avisos sobre sinal
operacional, audiência, retenção e limites de áudio continuam palavra por palavra.
