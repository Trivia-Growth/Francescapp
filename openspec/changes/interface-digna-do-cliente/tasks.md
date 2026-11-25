# Tarefas

Ordem por impacto no que o solicitante vê primeiro.

## 1. Carregamento (o item que ele citou primeiro)

- [x] 1.1 Dar forma visual a `aria-busy` em `web/styles.css`: hoje o atributo é escrito
      pelo TypeScript e não tem nenhuma regra. Esqueleto com a forma do conteúdo que vem,
      sem piscar, respeitando `prefers-reduced-motion`.
      *Feito.* Duas regras valem para toda a aplicação, sem cada tela precisar saber:
      região esvaziada em consulta recebe três barras na forma do texto que vem; região
      que ainda mostra o conteúdo anterior só recua para 62% de opacidade, sem desmontar.
      O pulso de opacidade do esqueleto da lista virou varredura. Atraso de 300ms
      preservado; o bloco único de `prefers-reduced-motion` continua governando.
- [x] 1.2 Trocar as 64 frases de "Carregando…"/"Consultando…" por esqueleto na área
      correspondente. A frase pode ficar como texto acessível para leitor de tela.
      *Feito onde faltava.* Boa parte de `web/` já chamava `esqueletoCarregando`; o que
      restava sem forma nenhuma eram dez painéis. Oito receberam a declaração de região
      em consulta: papéis declarados, estado emocional, modelo da ficha de plantão, campo
      extra do plano, regras do atendimento, avisos, ficha do plantão e série de
      registros do turno. Nenhuma frase foi apagada. Contexto do cuidado e rede de
      cuidado já estavam cobertos por `editor-documento-paciente.ts`.
      **Fora:** `agenda-operacoes.ts` e `revogacao-vinculo.ts` usam a frase como estado
      de uma operação pontual, não como substituição de área: não há forma a mostrar.
- [x] 1.3 Trocar de aba na ficha e na Administração não pode desmontar a página. Manter
      cabeçalho e abas estáveis e trocar só o painel.
      *Feito na Administração.* A faixa de abas era reconstruída inteira a cada troca,
      mesmo com o conjunto autorizado igual: piscava junto com o painel. Agora só muda
      quem está marcada, e o foco no título não arrasta mais a rolagem.
      A ficha já trocava só o painel (`ficha-paciente.ts`), conferido no navegador.
- [x] 1.4 Medir: quanto tempo cada área fica em estado de carga na produção, antes e
      depois. Registrar os números, não a impressão.
      *Medido no Chromium, com o serviço atrasado em 1500ms, mesma máquina e mesmo
      código — só a folha de estilo trocada entre as duas passadas.*

      | Área | Antes | Depois |
      |---|---|---|
      | Administração / Papéis declarados | 1494ms com a área medindo **0px** e só a frase | 1502ms com a área medindo **108px**, na forma do que vem |
      | Carteira | 1353ms de esqueleto em blocos de 150px | 1353ms de esqueleto em linhas de 64px, na forma da lista |

      A duração não mudou e não deveria: o que mudou é o que ocupa a tela nesse tempo.
      A carteira já tinha esqueleto desde antes; o que ela não tinha era a forma certa.

## 2. Composição

- [x] 2.1 Formulário de criar acesso e de pré-conceder equipe: cartão com título, grupos
      de campos e rodapé de ações. Hoje é caixa solta no branco.
      *Feito, e para todos os formulários da Administração de uma vez.* Era caixa dentro
      de caixa: borda do `form`, borda do `fieldset` e a legenda recortando as duas.
      Virou uma superfície só, com a legenda como título do cartão e rodapé de ação
      dimensionada. A ação continua dentro do `fieldset` de propósito: é ele que a
      administração desabilita quando a criação está bloqueada.
- [x] 2.2 Abas da Administração: peso, espaçamento e indicador de seleção consistentes
      com as abas da ficha. Hoje são dois desenhos diferentes no mesmo produto.
      *Feito.* Peso e indicador já eram compartilhados; o que divergia era o
      comportamento: treze áreas quebravam em três fileiras desalinhadas e a faixa
      deixava de se ler como navegação. Agora é a mesma faixa rolável da ficha, com os
      mesmos dois sinais de continuidade.
- [~] 2.3 Aplicar de fato os tokens que já existem (`--texto-1..6`, `--espaco-1..8`).
      Restam 249 literais de espaçamento não convertidos.
      *Parcial, e de propósito.* 75 declarações de espaçamento repetiam em pixel um
      valor que já tinha nome na escala: trocadas pelo token, sem mudar um pixel.
      Restam 158, em valores fora da escala (6, 10, 14, 18, 20, 22, 26, 28, 40px) ou em
      atalhos de vários valores. Encaixá-los MUDA o desenho de cada tela onde aparecem —
      é decisão de desenho caso a caso, não conversão mecânica, e não cabe numa passada
      que não pode ser conferida tela a tela. Fica registrado, não escondido.
- [x] 2.4 Campos de formulário com rótulo, ajuda e erro no mesmo padrão em todas as telas.
      *Feito onde estava quebrado.* Na Administração cada campo parava numa largura
      diferente porque herdava a medida intrínseca do controle em vez da coluna do
      rótulo — o formulário parecia montado sem desenho. A coluna do rótulo passou a ser
      uma só, e todos os campos da área têm a mesma largura.

## 3. Listas

- [x] 3.1 Visão de lista para pacientes: colunas, ordenação, densidade e ação na linha.
      Hoje são blocos empilhados.
      *Feito, menos ordenação.* A carteira mostrava seis pessoas por tela em cartões de
      150px que não alinhavam nada entre si. Virou lista: uma superfície, linhas
      separadas por fio, nome / preferência / situação sempre na mesma coluna, 64px de
      altura, e a linha inteira abre a ficha. No celular as partes voltam a empilhar.
      **Ordenação ficou fora:** a paginação é do servidor, então ordenar só a página
      visível mentiria sobre a lista inteira, e ordenar de verdade exige parâmetro novo
      na consulta — contrato, que esta mudança não toca.
- [x] 3.2 Tela de lista de profissionais, que não existe. Base: a listagem de equipe.
      *Feito na área Equipe da Administração.* A listagem já existia no serviço
      (`listarProfissionais`) e era consultada só por dentro, para conferir um convite.
      Agora aparece, com e-mail, perfil, estado do convite e conta desativada na mesma
      coluna em todas as linhas, com paginação. A lista não concede nada: servidor e
      banco continuam autorizando cada consulta.
      **Sem ação na linha:** revogar ou alterar um acesso pela linha exigiria rota e
      autorização novas.
- [x] 3.3 Estados vazio, carregando, erro e sucesso iguais nas duas listas.
      *Feito.* As duas usam a mesma superfície e a mesma linguagem: esqueleto na forma da
      linha durante a consulta, frase de contagem no sucesso, frase de convite no vazio e
      frase com `data-tone="error"` na falha, sempre em `role="status"`. Coberto por
      teste em `web/concessao-equipe.test.ts` (conteúdo, estado por linha e falha).

## 3-bis. Confirmações

Achado em 25/11/2026 na aba Equipe: ao conferir convites pendentes, a tela abria um
`window.confirm` do navegador. O diálogo nativo fica ACIMA da página, bloqueia tudo e não
aparece no conteúdo — quem olhava a tela via só "Conferindo…" parado para sempre. Eu mesmo
diagnostiquei errado como estado perdido antes de encontrar o diálogo aberto.

- [ ] 3b.1 Um diálogo de confirmação próprio, com `<dialog>`, foco presa, Esc, botão de
      cancelar como ação segura e o texto da consequência em vez de "Continuar?".
- [ ] 3b.2 Trocar as 46 chamadas de `window.confirm` em 18 arquivos. São síncronas; o
      diálogo é assíncrono, então cada chamada vira `await` e a função envolvente precisa
      ser `async`. `web/demonstracao.ts` concentra 17 delas.
- [ ] 3b.3 Nenhuma confirmação pode ficar invisível: teste que garanta que o diálogo está
      no documento e recebe foco.

## 4. Navegação

- [x] 4.1 Recolher a navegação lateral precisa recolher. Hoje o botão troca o rótulo e os
      quatro destinos continuam ocupando o mesmo espaço.
      *O diagnóstico registrado estava errado, e a medição está aqui.* No navegador, em
      1680, 1440, 1280, 1100, 900 e 800px de largura, recolher já levava a barra de 248px
      para 80px e reposicionava topo, conteúdo e rodapé junto. O que não existia era
      **permanência** — a escolha durava até a próxima carga, e voltar com a barra
      inteira é exatamente o que se lê como "não recolheu" — nem **transição**: 168px
      sumiam num quadro só. As duas foram feitas. Preferência guardada é de largura e
      nada mais; navegador que recusa armazenamento fica com a barra inteira.
      Coberto por teste em `web/gaveta-lateral.test.ts`.
- [x] 4.2 Conferir no celular: a navegação recolhida não pode esconder destino sem deixar
      caminho.
      *Conferido a 390 e 600px.* Abaixo de 760px o botão de recolher some e a navegação
      é gaveta: abre pelo "Menu", fecha pelo fundo, pelo Escape e ao escolher um destino
      — conferido no navegador, os quatro destinos continuam alcançáveis.

## 5. Fechamento

- [~] 5.1 Percorrer TODAS as telas com navegador e registrar antes/depois.
      *Parcial.* Percorridas com Chromium e a API dublada: acesso, Seu dia, carteira
      (1280 e 390px), ficha e suas abas, Como funciona, e Administração em Acessos,
      Equipe, Configuração e Papéis declarados. **Não percorridas:** plantão, turno,
      financeiro, auditoria e as telas da jornada familiar — exigem estado de sessão e
      de caso que o dublê desta passada não monta. As mudanças que as alcançam são as
      regras gerais de `styles.css`, não desenho específico delas.
- [x] 5.2 `pnpm run verificar:rapido` e a suíte `web`. Nenhum contrato muda, então
      nenhuma prova de autorização deve ser tocada.
      *Executado.* `verificar:rapido` limpo (lint sobre 962 arquivos e typecheck).
      `pnpm exec vitest run web`: 114 arquivos, 674 testes, todos passando. Nenhum
      arquivo de `packages/contracts`, `supabase/` ou `netlify/` foi tocado.
- [x] 5.3 Conferir contraste: a oliva `#839352` dá 3,35:1 sobre branco e NÃO passa em
      4,5:1. Não usar como cor de texto; `--primary` `#475436` passa.
      *Conferido.* `--brand-olive` aparece em seis lugares de `web/styles.css`, todos
      como borda ou traço, nenhum como cor de texto. Nada do que esta mudança escreveu
      usa a oliva em texto.

## Fora do escopo desta mudança, observado no caminho

- A faixa de 13 áreas da Administração rola, mas 13 destinos num nível só continua sendo
  navegação rasa demais. Agrupá-los muda a estrutura de navegação, não a aparência dela.
- O "ê" de "você" no título de "Seu dia" sai com o acento deslocado: é o recorte latino
  da Cormorant Garamond provisória, e some quando o material da marca chegar.
