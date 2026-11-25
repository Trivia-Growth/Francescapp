# Tarefas

Ordem por impacto no que o solicitante vê primeiro.

## 1. Carregamento (o item que ele citou primeiro)

- [ ] 1.1 Dar forma visual a `aria-busy` em `web/styles.css`: hoje o atributo é escrito
      pelo TypeScript e não tem nenhuma regra. Esqueleto com a forma do conteúdo que vem,
      sem piscar, respeitando `prefers-reduced-motion`.
- [ ] 1.2 Trocar as 64 frases de "Carregando…"/"Consultando…" por esqueleto na área
      correspondente. A frase pode ficar como texto acessível para leitor de tela.
- [ ] 1.3 Trocar de aba na ficha e na Administração não pode desmontar a página. Manter
      cabeçalho e abas estáveis e trocar só o painel.
- [ ] 1.4 Medir: quanto tempo cada área fica em estado de carga na produção, antes e
      depois. Registrar os números, não a impressão.

## 2. Composição

- [ ] 2.1 Formulário de criar acesso e de pré-conceder equipe: cartão com título, grupos
      de campos e rodapé de ações. Hoje é caixa solta no branco.
- [ ] 2.2 Abas da Administração: peso, espaçamento e indicador de seleção consistentes
      com as abas da ficha. Hoje são dois desenhos diferentes no mesmo produto.
- [ ] 2.3 Aplicar de fato os tokens que já existem (`--texto-1..6`, `--espaco-1..8`).
      Restam 249 literais de espaçamento não convertidos.
- [ ] 2.4 Campos de formulário com rótulo, ajuda e erro no mesmo padrão em todas as telas.

## 3. Listas

- [ ] 3.1 Visão de lista para pacientes: colunas, ordenação, densidade e ação na linha.
      Hoje são blocos empilhados.
- [ ] 3.2 Tela de lista de profissionais, que não existe. Base: a listagem de equipe.
- [ ] 3.3 Estados vazio, carregando, erro e sucesso iguais nas duas listas.

## 4. Navegação

- [ ] 4.1 Recolher a navegação lateral precisa recolher. Hoje o botão troca o rótulo e os
      quatro destinos continuam ocupando o mesmo espaço.
- [ ] 4.2 Conferir no celular: a navegação recolhida não pode esconder destino sem deixar
      caminho.

## 5. Fechamento

- [ ] 5.1 Percorrer TODAS as telas com navegador e registrar antes/depois.
- [ ] 5.2 `pnpm run verificar:rapido` e a suíte `web`. Nenhum contrato muda, então
      nenhuma prova de autorização deve ser tocada.
- [ ] 5.3 Conferir contraste: a oliva `#839352` dá 3,35:1 sobre branco e NÃO passa em
      4,5:1. Não usar como cor de texto; `--primary` `#475436` passa.
