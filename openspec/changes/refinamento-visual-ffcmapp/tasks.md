# Tasks

**Estado em 21/11/2026: proposta.** Nada foi implementado nesta passagem. O diagnóstico está em
[docs/processo/avaliacao-visual-21-11-2026.md](../../../docs/processo/avaliacao-visual-21-11-2026.md).

Gates desta change, antes de qualquer edição de interface: as decisões marcadas **SUPOSIÇÃO CONSERVADORA** em
`design.md` precisam de confirmação do solicitante (escala e papéis tipográficos, frase de acolhimento do
acesso, critérios de densidade por superfície). Nenhuma delas é resolvida silenciosamente.

Ao fechar qualquer tarefa, registrar evidência, limitações e próximo passo na própria tarefa. Provas de
autorização e RLS permanecem gate de ativação e **não** são substituídas por evidência visual.

## 0. Higiene e confirmações

- [x] 0.1 **Pré-requisito de todas as demais.** A bancada temporária usada no diagnóstico
  (`scripts/prova-celular/_avaliacao-visual.pw.ts` e `scripts/prova-celular/_fixtures-avaliacao.ts`) foi
  removida logo após as capturas, por não pertencer a `pnpm run verificar:celular`. Evidência: `git status`
  sem esses arquivos em 21/11/2026; se ressurgirem numa execução futura, remover de novo antes de 1.1.
- [ ] 0.2 **Gate de decisão; VIS-011, VIS-014, VIS-015.** Submeter ao solicitante as suposições conservadoras
  de `design.md`: escala de seis degraus e seus papéis, frase de acolhimento do acesso, critérios de densidade
  por superfície. Evidência: confirmação registrada por decisão; sem confirmação, a tarefa dependente não
  começa.
  **22/11/2026 — parcial.** A coordenação liberou a execução dos grupos 1, 2 e 4 com a escala de seis degraus,
  a escala de espaçamento e o vocabulário de movimento do `design.md` como estão, sem reabrir a discussão. A
  frase de acolhimento do acesso (grupo 3) e os critérios de densidade por superfície (grupo 5) continuam sem
  confirmação do solicitante e seguem bloqueando 3.1 e 5.2. Não houve confirmação do próprio solicitante sobre
  a escala; o que existe é liberação da coordenação, registrada aqui para não ser lida como aprovação de
  marca.
- [ ] 0.3 **Pendência de material; VIS-012, VIS-014.** Solicitar ao marketing da Edilaine o logo vetorial,
  variantes transparentes com área de proteção e tamanhos mínimos, e os códigos oficiais de cor e fontes com
  licença. Evidência: pedido registrado e resposta; até lá, marca entra como imagem recebida intacta e as
  fontes seguem provisórias.

## 1. Fundamentos tokenizados

- [x] 1.1 **VIS-011, SC-VIS-011-A/B/C. Depende de 0.1 e 0.2.** Introduzir em `web/styles.css` os tokens de
  escala tipográfica (seis degraus e papéis), de espaçamento (oito degraus de base 4) e de movimento (três
  durações e duas curvas), sem alterar HTML, rótulos, `aria-*` ou ordem de foco. Evidência: diff dos tokens e
  inventário antes/depois dos tamanhos de fonte declarados.
  **22/11/2026 — feito.** Tokens em `web/styles.css` `:root`: `--texto-1..6` (13/16/20/25/31/39px),
  `--espaco-1..8` (4/8/12/16/24/32/48/72px), `--mov-estado|troca|contexto` (120/180/240ms) e
  `--curva-entrada|saida`. Inventário de tamanhos de fonte declarados: antes 22 valores distintos em 97
  declarações (27x `.875rem`, 19x `.9375rem`, 13x `.8125rem`, 7x `.75rem`, além de 26px, 25,6px, 24px, 22px,
  19px, 18px, 17px e as grafias duplicadas); depois 6 tokens em 97 declarações (52x `--texto-1`, 29x
  `--texto-2`, 6x `--texto-3`, 5x `--texto-4`, 3x `--texto-5`, 2x `--texto-6`) e nenhum literal de tamanho de
  fonte no arquivo. Nenhum HTML, rótulo, `aria-*` ou ordem de foco foi tocado: o diff é só de `web/styles.css`.
  **Limitação:** o espaçamento foi tokenizado nos componentes desta passagem (30 usos); restam 249 declarações
  de `margin`/`padding`/`gap` com literal em px, a converter por componente nos grupos seguintes.
- [x] 1.2 **VIS-011, SC-VIS-011-A. Depende de 1.1.** Consolidar as redefinições concorrentes identificadas no
  diagnóstico, começando por `.pessoa` (`web/styles.css:816`, `:1188`, `:2305`, `:2368`), `.people-list`
  (`:807`, `:2293`, `:2364`), `.patients-layout` (`:344`, `:707`) e
  `.carteira-tools > #filtros-carteira` (`:2487` contra `:2524`). Uma declaração governante por componente.
  Evidência: capturas antes/depois em 1280, 1440, 360 e 390 por componente tocado; nenhuma mudança de
  comportamento.
  **22/11/2026 — feito nos componentes nomeados e em mais sete.** Uma declaração governante para `.pessoa`,
  `.pessoa-texto`, `.pessoa-seta`, `.pessoa-nome`, `.people-list`, `.people-list li`, `.patients-layout`,
  `.patient-register`, `.patient-register .section-heading`, `.busca`, `.sidebar-brand`, `.sidebar-label`,
  `.sidebar-link`, `.filtros-carteira`, `.filtros-carteira-titulo`, `.filtro-carteira select`,
  `.list-loading span`, `.list-loading[data-compacto] span` e `.access-form-panel`. O par oposto
  `.carteira-tools > #filtros-carteira` (`flex: 1 1 100%` contra `flex: 0 1 auto`) ficou com a declaração que
  já governava, `flex: 0 1 auto`. Duas regras mortas removidas: `.pessoa { padding: 14px 4px }` no celular e o
  cartão de `.patient-register`, ambas já anuladas por blocos posteriores. Em cada caso o valor preservado é o
  que o navegador já aplicava; só `.people-list` (gap 18px para 16px), `.pessoa-texto` (5px para 4px) e
  `.busca` (margem 16/20px para 16px) mudaram de medida, para entrar na escala.
  **Limitação:** capturas do depois em 1280 e 360 (`depois-abas-*.png`, `depois-login-*.png`,
  `depois-financeiro-*.png`, em diretório temporário fora do repositório). Não há capturas pareadas em 1440 e
  390 porque a bancada do diagnóstico foi removida na 0.1; as medidas que importam foram conferidas por
  `pnpm run verificar:celular`, que roda 360 e 390.
- [x] 1.3 **VIS-013, SC-VIS-013-D. Depende de 1.1.** Consolidar os quatro blocos `prefers-reduced-motion`
  (`web/styles.css:599`, `:2460`, `:2617`, `:2657`) em um único bloco governante, garantindo cobertura das
  transições novas. Evidência: conferência com movimento reduzido ativo em pelo menos uma superfície de cada
  tipo, com captura.
  **22/11/2026 — feito.** Os quatro blocos foram removidos e substituídos por um único bloco no fim do
  arquivo, com `*, *::before, *::after` e `transition: none !important; animation: none !important`. Medido em
  Chromium com `reducedMotion: 'reduce'`: `#ficha-view`, `#lista-view` e `#patients-view` ficam com
  `animation-name: none`, `transition-property: none` e `opacity: 1` no primeiro quadro — o estado final é o
  estado visível, sem fade residual nem deslocamento.

## 2. Correções de contraste e de estado selecionado

- [x] 2.1 **Defeito crítico; VIS-012, SC-VIS-012-A. Depende de 1.1.** Corrigir a aba ativa da Administração,
  hoje ilegível por `background: var(--primary)` em `web/styles.css:1423-1427` contra `color: var(--primary)`
  em `:2608-2611`. Evidência: captura da aba selecionada e razão de contraste medida do rótulo contra seu
  fundo.
  **22/11/2026 — feito.** As duas declarações concorrentes deixaram de existir. A aba selecionada não tem mais
  fundo preenchido: rótulo em `--primary` sobre `--wash`, traço inferior de 3px no oliva da marca e peso 700.
  Contraste medido no navegador por `getComputedStyle`: **7,87:1** (`rgb(71,84,54)` sobre `rgb(251,252,248)`),
  contra ≈1:1 antes. A seleção é percebida por três atributos, não só por cor. Captura:
  `depois-abas-1280.png`.
- [x] 2.2 **VIS-012, SC-VIS-012-A/B. Depende de 2.1.** Unificar as quatro linguagens de aba do produto
  (ficha, administração, financeiro e "Mais seções") em uma só, preservando papéis ARIA, foco e navegação por
  teclado existentes. Evidência: capturas das quatro superfícies e percurso de foco sem regressão.
  **22/11/2026 — feito.** Uma declaração governa `.ficha-aba`, `.ficha-aba-secundaria`, `.administracao-aba` e
  `.financeiro__aba`: rótulo em `--muted`, traço inferior transparente de 3px, e na seleção traço no oliva da
  marca, `--primary` e peso 700. As quatro medem 7,87:1 no estado selecionado e 6,15:1 no não selecionado. A
  pílula preenchida da administração e o chip contornado do financeiro deixaram de existir. Nenhum atributo
  ARIA, `role`, `tabindex` ou tratador foi tocado — os seletores continuam sendo `[aria-selected="true"]` e
  `[aria-current]`, escritos por `web/ficha-paciente.ts`, que não foi alterado. O `<summary>` de "Mais seções"
  ganhou marcador de dobra, porque sem ele era lido como texto solto. Percurso de foco conferido por
  `pnpm run verificar:celular` (foco visível em todas as paradas, 14 cenários). Capturas: `depois-abas-1280.png`,
  `depois-abas-360.png`, `depois-financeiro-1280.png`, `depois-financeiro-360.png`.
- [x] 2.3 **VIS-012, SC-VIS-012-B/C. Depende de 1.1.** Revisar as composições que usam oliva e texto auxiliar
  apagado nas superfícies alteradas, aplicando os três papéis de cor do `design.md`. Evidência: medição de
  contraste das composições tocadas; registrar explicitamente que isto não é auditoria completa de contraste
  do produto.
  **22/11/2026 — feito nas composições tocadas.** Nenhuma cor nova foi criada; o oliva da marca `#839352`
  entrou como traço de 3px (indicador de aba), nunca como texto, e não recebeu texto branco em lugar nenhum.
  Medições das composições alteradas: aba selecionada 7,87:1; aba não selecionada 6,15:1; `--muted` sobre
  `--wash` 6,15:1, sobre `--white` 6,34:1, sobre `--soft` 5,69:1, sobre `--panel` 5,75:1; `--primary` sobre
  branco 8,11:1; `.pessoa-nome` 13,55:1; `.pessoa-preferencia` 6,34:1; `.chip-ambiente` 6,93:1; sinal de
  atenção operacional 8,59:1. O oliva da marca sobre branco segue em 3,35:1 e por isso continua fora de texto.
  **Isto não é auditoria completa de contraste do produto:** só as composições desta passagem foram medidas, e
  `docs/projeto/identidade-visual.md` continua registrando a auditoria completa como pendente.

## 3. Primeiro contato

- [ ] 3.1 **VIS-014, SC-VIS-014-A/B/C/D. Depende de 1.1, 2.1, 0.2 e 0.3.** Recompor a tela de acesso em coluna
  única conforme a decisão 5 do `design.md`: marca em escala menor e com respiro, frase de acolhimento
  aprovada, um caminho de entrada visível, demais caminhos em dobras com marcador explícito, aviso de ambiente
  e nota de restrição deslocados para depois do bloco de acesso. Preservar todos os formulários, rótulos,
  `autocomplete`, feedback acessível e o bloco familiar desligado em `web/index.html:91`. Evidência: capturas
  em 1280, 1440, 360 e 390 nos estados repouso, foco, dobras abertas e erro (SC-VIS-014-A/B/C/D); percurso de foco e alvos de toque
  conferidos.
- [ ] 3.2 **VIS-013, SC-VIS-013-A. Depende de 3.1 e 1.3.** Aplicar a sequência única de entrada do acesso
  (240ms, escalonamento de 60ms entre marca, frase e bloco), sem atrasar a interação e sem nada em laço.
  Evidência: captura com e sem movimento reduzido; confirmar que o campo recebe foco no mesmo instante que
  hoje.

## 4. Movimento nas trocas de contexto

- [x] 4.1 **VIS-013, SC-VIS-013-A/B/C/D. Depende de 1.1 e 1.3.** Aplicar os tokens de movimento às trocas de
  aba, à abertura e ao fechamento da ficha, às dobras e ao diálogo, mantendo a gaveta móvel já existente
  (`web/styles.css:1176`) dentro do mesmo vocabulário. Não animar erro, retirada de conteúdo protegido,
  números ou valores. Evidência: capturas de início e fim de cada transição e confirmação de que `hidden`
  imediato, foco, timeout e recuperação permanecem como estão.
  **22/11/2026 — feito.** Vocabulário aplicado: estado de controle (fundo, texto, borda) em `--mov-estado`
  com `--curva-entrada`, em botões, links da barra lateral, abas, `.pessoa` e `.home-caso-link`; troca dentro
  da tela em `--mov-troca` (seção da ficha ao mudar de aba, "Mais seções", painel de filtros da carteira e
  dobras do acesso), com opacidade e 4px; entrada de contexto em `--mov-contexto` (`#ficha-view`,
  `#lista-view`, `#home-view` e o diálogo com seu `::backdrop`), com opacidade e 8px, sem escala. A gaveta
  móvel trocou `transform 0.2s ease` por `--mov-contexto`/`--curva-entrada` ao entrar e
  `--mov-troca`/`--curva-saida` ao sair. As três listas de transição repetidas com `.16s ease` sumiram.
  Não animam, por regra explícita no arquivo: erro (`[data-tone="error"]`, `.field-error`, `[role="alert"]`
  recebem `animation: none; transition: none`), retirada de conteúdo protegido, números e valores. O atraso de
  300ms do esqueleto e do indicador foi preservado intacto, e continuam sendo o único laço.
  **Limitação:** não foram produzidas capturas de quadro inicial e final de cada transição; o que há é a
  medição de `animation-name`/`animation-duration`/`transition-property` no navegador, mais as capturas de
  estado final. Nenhum tratador de foco, `timeout` ou recuperação foi tocado: o diff é só de `web/styles.css`.
- [x] 4.2 **VIS-013, SC-VIS-013-C. Depende de 4.1.** Conferir explicitamente que sair, perder acesso e trocar
  de identidade continuam retirando o conteúdo protegido sem transição. Evidência: observação registrada com
  sessão fictícia; nenhum quadro intermediário exibindo dado.
  **22/11/2026 — conferido.** Com conteúdo fictício em `#ficha-view`, `#lista-view` e `#patients-view`,
  aplicar `hidden` deixa os três com `display: none`, `getClientRects().length === 0`,
  `transition-property` sem efeito e `animation-name: none` no mesmo quadro — com e sem movimento reduzido.
  Nenhuma regra de saída foi criada: as animações de entrada só casam com `:not([hidden])`, e
  `[hidden] { display: none !important }` continua intacto. `fecharFicha` e os caminhos de perda de acesso em
  `web/main.ts` não foram tocados.
  **Limitação:** a conferência foi feita sobre a folha real com marcação fictícia equivalente, não sobre uma
  sessão de ponta a ponta; ela comprova que o CSS não retém conteúdo, não substitui prova de autorização.

## 5. Estados, densidade e registros longos

- [ ] 5.1 **VIS-016, SC-VIS-016-A/B/C. Depende de 1.1.** Dar estrutura aos estados de espera, vazio e erro da
  carteira, da home e das seções da ficha: ação adjacente à mensagem, âncora visual no vazio, copy em voz de
  produto. Preservar o atraso de 300ms e os anúncios acessíveis existentes. Evidência: capturas dos três
  estados por superfície tocada.
- [ ] 5.2 **VIS-015, SC-VIS-015-A/B/C. Depende de 0.2 e 1.1.** Aplicar a densidade por audiência ao diário e
  à evolução: agrupar o formulário por assunto, destacar uma única ação principal e apresentar registros
  publicados como texto com metadados discretos. Nenhum campo removido, nenhuma audiência alterada.
  Evidência: capturas em 1280 e 360 antes/depois, e conferência de que os campos apresentados continuam os
  mesmos para cada audiência.
- [ ] 5.3 **VIS-017, SC-VIS-017-A/B/C. Depende de 5.2.** Agrupar a ficha de plantão por assunto, subordinar a
  orientação ao campo que ela explica e tornar a conclusão alcançável; indicar continuidade na faixa de abas
  da ficha e agrupar os destinos de "Mais seções" (`web/styles.css:988-993`). Evidência: altura total da
  ficha de plantão antes/depois em 360 e 1280, e captura da faixa de abas rolável.

## 6. Verificação e revisão

- [ ] 6.1 **VIS-011 a VIS-017. Depende de 1–5.** Executar `pnpm run verificar:rapido` no diff integrado e
  somente os testes afetados pelo diff. Evidência: comandos e resultados do estado alterado; baseline anterior
  não serve como prova.
- [ ] 6.2 **VIS-011 a VIS-017. Depende de 6.1.** Revisão formal independente com `code-review` nos dois
  eixos — padrões do projeto e aderência a esta spec —, informando revisão-base, change e diff exato,
  incluindo arquivos novos e alterações locais. Evidência: achados, correções no diff afetado e limitações
  registradas.
- [ ] 6.3 **Gate de ativação. Depende de 6.2 e de autorização específica.** Na retirada do PR de draft,
  executar uma única vez `pnpm run verificar:ativacao` e o roteiro "Como testar" do PR, com os testes
  positivos e negativos de autorização e RLS, que não podem ser pulados. Evidência: resultados registrados ou
  bloqueio explícito; nenhuma fatia é considerada ativada por CI verde nem por captura bonita.
