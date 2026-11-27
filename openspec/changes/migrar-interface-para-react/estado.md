# Estado — migrar-interface-para-react

**Atualizado em:** 27/11/2026 · **Branch:** `codex/remover-web-ui` · **Por:** Codex

## Fatia 8b do plano visual — lateral, gaveta, barra e linhas da Carteira

Sobre `b5db640`, a raiz da casca desenha a navegação responsiva, barra, Avisos,
Seu dia, Como funciona e linhas da Carteira. A revalidação continua ocultando o
conteúdo protegido. Os painéis e seções com montagem imperativa ainda precisam
ser migrados para cumprir a tarefa 7.2.

- Chromium, build de produção: 240 px de lateral em 1440 px, gaveta de 358 px em
  390 px, barra sticky de no mínimo 72/64 px e um título principal nas seis capturas.
  As folhas carregadas foram `index-X-zgnAef.css` na base e `index-B-X97JSR.css`
  na fatia. O JavaScript inicial passou de 242.878 a 245.239 bytes gzip em seis arquivos.
- Axe integral sem violações nas seis vistas e na gaveta. Na base, os cinco botões
  da Carteira tinham nome incompatível com o texto visível, e o corpo do diálogo
  de cadastro era rolável sem foco. Reintroduzir o rótulo anterior nos botões
  reproduziu a violação a 390 e 1440 px. Alteração temporária revertida.
- Ativação inicial de `50e4880`: 929 testes web e 52 cenários Chromium aprovados
  (um cenário preexistente pulado), build e Trusted Types aprovados. A prova SQL
  de concessão e recusa passou em PostgreSQL 17 descartável sem rede.
- Revisão do PR #53: título visível e foco preservado ao cruzar 1024 px, rótulo
  do trilho reaparece com hover e foco, e a seta da Carteira usa um único desenho.
  Os cinco cenários da casca passaram; sem a transferência de foco, o Chromium
  falhou em `toBeFocused` para Menu. A prova do catálogo confirmou um GET inicial,
  cinco voltas sem GET e descarte após 403. Capturas refeitas com CSS aplicado.
- A CI do primeiro ajuste encontrou um clique no fundo antes da instalação do
  ouvinte do Radix. O próprio fundo passou a fechar a gaveta. O cenário que
  falhou passou cinco vezes seguidas em Chromium.
- Próximo passo: CI e aprovação das capturas. A tarefa 7.2 segue com os painéis
  restantes, e o corte preexistente do sinal operacional fica no PR #51.

## Fatia 8a do plano visual — roteador por fragmento

Sobre `23d0daa`, a raiz da casca React controla o histórico e desenha Seu dia e
Como funciona. Carteira, Administração e ficha usam os destinos existentes durante
a transição. A tarefa 7.2 permanece aberta.

- A prova `roteamento-casca.pw.ts` confirmou link antigo de Configuração, preservação
  de `?agenda=conectada`, Voltar/Avançar e foco a 390 px. Família chegou à Carteira
  via link administrativo sem montar Administração nem disparar chamadas a `/api/admin/`.
  A contraprova removeu o foco no título da Carteira e falhou em `toBeFocused`.
- A base compilada referenciava 242.878 bytes gzip de JavaScript inicial (seis arquivos).
  A captura da Carteira a 390 px documenta recorte preexistente dos motivos FR-028.
  A folha de produção estava aplicada. A correção da linha é de outra frente.
- Revisão independente em `23d0daa...4833381`: a volta à Carteira preserva o
  foco na linha da ficha anterior e Seu dia permanece como única vista durante
  a consulta da ficha fora da primeira página. As contraprovas reproduziram a
  perda do foco e a Carteira visível; as quatro provas passaram com a correção.
- Ativação local de `4833381`: 930 testes web, 50 cenários Chromium aprovados,
  um cenário previamente pulado, build e Trusted Types aprovados. A revisão
  também executou `scripts/testar-acesso-paciente-autorizacao-local.sh` em
  PostgreSQL 17 descartável, sem rede, com saídas de concessão e recusa verificadas.
- Próximo passo: CI de 8a e portar lateral, gaveta, barra e destinos restantes.
  As pendências de axe da base na Carteira e no corpo rolável de diálogo continuam
  registradas para a etapa visual.

## Fatia 4 do plano visual — primitivas e ícones

Na branch `codex/primitivas-sistema`, sobre `12bfb81`, Botão, Campo e
MarcaEstado usam cva e os tokens do SISTEMA §§2, 3 e 6. Configuração do
sistema faz uso do estado “Salvando…”. A casca mantém a navegação existente
com ícones Lucide e o sino apresenta o texto visível no nome acessível.

- Chromium 159 validou pílula de 999 px, tamanho 16/24 e alvo mínimo de
  46 px nos controles a 390 e 1440 px. Cliques repetidos, Enter e
  `requestSubmit()` não admitiram outro envio pendente na galeria.
- Ao remover a guarda de `aria-disabled`, o teste contou três ativações
  em vez de uma. Restaurar o nome anterior do sino reproduziu
  `label-content-name-mismatch` em Auditoria. Ambas as contraprovas
  foram revertidas.
- O axe da galeria mede os três componentes. Em varredura integral,
  as linhas acionáveis da Lista apresentaram divergência entre nome
  acessível e texto visível. O achado pertence à fatia 5.
- A primeira tentativa com `aria-label` ainda falhou em seis páginas.
  O nome nativo do botão passou nas seis em Chromium após o rebase.
  O relatório de 30 varreduras ficou com zero violações e zero exceções.
- O teste da ponte imperativa passou ao conferir o mesmo contrato do Botão.
  Build, Trusted Types e o caso positivo e negativo de acesso a paciente
  em PostgreSQL 17 descartável passaram. A prova SQL simula Auth e Vault.
- Próximo passo: CI de ativação no PR #47 e aprovação das capturas pelo dono.

Leituras do catálogo Estado emocional via TanStack Query (#48): QueryClient único, chave por conta+sessão, clear() na revogação/novo acesso/saída, retenção de 5 min.

## Fatia 3 do plano visual — tokens do SISTEMA

Na branch `codex/tokens-sistema`, sobre `a8a3f8a`, o `@theme` expõe os
tokens do SISTEMA (§2). As utilitárias existentes ainda renderizam a galeria
da base. A prova cobre VIS-017 e os quatro pares de contraste do §6.

- Chromium 159, galeria local com dados fictícios, 390 × 844 e 1440 × 900.
  Os pares antes/depois são idênticos byte a byte. Uma amostra temporária
  confirmou as novas utilitárias de cor, raio, espaço e tipografia, inclusive
  o breakpoint de viewport e a variante por contêiner.
- Contraprovas revertidas. Com o texto secundário em `#c0c0c0`, o contrato
  mediu 1,66:1 contra 4,5:1. Retirar `1` do grupo tipográfico de `juntar`
  descartou `text-1` ao lado da cor. O Vitest falhou nos dois casos.
- `pnpm exec vitest run web/contrato-visual.test.ts web/componentes/ui/juntar.test.ts
  --reporter=minimal` passou em Node 22 com 27 testes após restaurar os valores.
  `acesso_paciente_autorizacao_local.sql` passou em PostgreSQL 17 descartável
  com Auth e Vault simulados. Verificou concessão, acesso direto, outro caso e revogação.
- Próximo passo da fatia: CI de ativação no PR #45 e aprovação do dono pelas capturas.
  A adoção das utilitárias nas primitivas começa na fatia 4.

## Retirada do observador de controles

As quatro regiões com seleção e data já montam os próprios controles. Durante a
migração o nativo nascia no invólucro com `data-aprimorada`, que o observador pulava.
Depois das provas de convivência, as seis inscrições de `main.ts` foram retiradas.
Regras e Início não renderizavam os tipos de controle observados.

- `pnpm run verificar:celular agenda-individual-controles.pw.ts` passou em Chromium a
  390 × 844 com o tema real e dublês HTTP. O observador processou um select legado de
  prova. Motivo entrou e saiu três vezes, seus valores chegaram ao FormData, e a
  recusa simulada da gravação (403) apareceu no formulário. Início e Fim da operação
  permaneceram `datetime-local` sem invólucro.
- Contraprovas revertidas: a regra de opacidade alterada para `1` falhou em
  `#realizacao-situacao` com esperado `0` e recebido `1`. Sem `data-aprimorada`,
  o observador gerou dois invólucros e a prova esperava um. Nenhuma falha foi por
  tempo esgotado.
- A ativação da agenda em Node 22 passou localmente e na CI do PR #30. A prova
  SQL de realização (FR-024) passou em PostgreSQL 17 descartável com casos
  positivos e negativos e acesso direto.
- Administração: seleção React aplicada às áreas com controles. As datas da
  Auditoria notificam o ISO por callback explícito, preservando os GETs corrigidos
  no PR #33. O Financeiro monta e desmonta as ilhas das quatro datas nas trocas
  de aba. A prova da casca de Administração usa um select legado para confirmar
  o observador ativo e verifica um único invólucro nos componentes migrados.
- `pnpm run verificar:rapido` e
  `pnpm run verificar:celular filtros-data.pw.ts financeiro-controles-proprios.pw.ts`
  passaram em Node 22. Na contraprova da Administração, mudar apenas a regra de
  opacidade das datas para `1` falhou em `#auditoria-de` com recebido `1` e
  esperado `0`. Revertida a alteração, a prova passou.
- Ficha: `pnpm run verificar:rapido` e `pnpm run verificar:celular filtros-data.pw.ts
  ficha-plantao-celular.pw.ts` passaram em Node 22 e Chromium (9 cenários). Na casca,
  a sentinela comprovou o observador ativo e a seleção de profissionais foi
  remontada ao avançar a página. A Linha do tempo preservou a data nos GETs e
  as seleções da ficha de plantão mantiveram a interação no celular.
- Orientações e Encaminhamentos optam pelo aprimoramento na Ficha. Os 37 testes
  das duas seções e da demonstração passaram no #39. A comparação em Chromium
  na `main` em `99fd4a1` confirmou três divergências de preenchimento
  programático: datas vazias e audiência Interna em Orientações, etapa
  sugerido em Encaminhamentos e o familiar errado ao manter o rascunho na
  Gestão do Turno. Os valores nativos estavam corretos.
- O preenchimento programático agora notifica os controles aprimorados pelo
  mesmo evento local. `pnpm run verificar:celular preenchimento-controles.pw.ts`
  passou nos três cenários. Remover apenas o envio desse evento reproduziu
  as três divergências na comparação imediata, com opacidade calculada zero.
  Restaurado o evento, os três cenários passaram. As provas SQL
  `orientacao_operacoes_local`, `orientacao_familia_local`,
  `encaminhamento_operacoes_local` e `turno_execucao_clinica_local` passaram
  em PostgreSQL 17 descartável. Próxima fatia: Cadastro.
- Reprodução anterior à migração da ficha: com a chave no invólucro antigo,
  Equipe com acesso abriu e avançou à página 2. Mover somente a mesma chave
  para o select nativo lançou `NotFoundError` em `removeChild` na montagem.
  A alteração temporária foi revertida. A chave agora pertence ao componente React.
- Contraprova da ficha: alterar somente a opacidade de `select` para `1` fez
  falhar a medição de `#profissional-selecionado` (esperado `0`). Depois de
  restaurar a regra, o cenário voltou a passar.
- Cadastro: Nascimento, Situação, responsável e o tipo dos contatos recebem
  ilhas React. A equipe muda por props e o hospedeiro lê os nativos do
  formulário. Correção em commit próprio: a saída limpava as marcações de
  nome, preferência e nascimento e esquecia Situação e responsável. A prova
  no Vitest falhou com as duas seleções ainda inválidas e passou após a limpeza.
- `pnpm run verificar:rapido` e os 38 cenários de `campos-caso-novo.test.ts` e
  `fluxo-caso-novo.test.ts` passaram. Chromium na casca do cadastro verificou
  o observador ativo pela sentinela legada, a equipe chegando depois da
  abertura, a montagem/desmontagem de contato, o foco de erro, o POST com os
  valores corretos e o reset. Ao alterar só a regra CSS para opacidade `1`,
  a prova falhou em `#birth-date`, esperado `0` e recebido `1`. Restaurado e
  verde.
- A primeira CI do #41 registrou trabalho React após o teardown do jsdom. O
  desmonte do Cadastro retira as ilhas e os eventos dos botões e invalida a
  consulta de equipe pendente. A casca usa esse desmonte na saída definitiva
  da página, e as provas o chamam antes de descartar o DOM. O teste de
  regressão cobre reset, contato extra e resposta de equipe após o desmonte.
  Os 42 testes de campos, fluxo e integração de edição passaram em conjunto.
  Os nove testes de retorno Google passaram com o mesmo desmonte entre as
  recargas simuladas e no fim de cada teste.
- A retirada removeu o instalador global e as ligações das bancadas. As provas
  direcionadas em Chromium passaram (25 cenários), com o tema real e as três
  regressões de preenchimento. Em cada uma das seis regiões da casca, um
  select e uma data inseridos após a carga permaneceram no mesmo pai, com
  opacidade `1`. Religar o observador original fez as seis provas falharem
  pela troca do pai. Restaurada a retirada, as seis voltaram a passar.
  `pnpm run build:web` e as provas de vínculo e de execução do cuidado
  pela casca de produção local também passaram.
- A bancada do painel #31 monta os campos reais. Ao bloquear Tab na captura
  somente para a contraprova, Tab nº 11 levou o foco para `body#` e a asserção
  falhou. Com o bloqueio revertido, os quatro cenários do painel passaram.
  As provas SQL de Agenda, Auditoria, Linha do tempo, Ficha e Cadastro passaram
  em instâncias descartáveis de PostgreSQL 17.
- A primeira CI do #42 encontrou trabalho React durante o teardown de
  `login-aba-oculta.test.ts`. `teste-casca.ts` registra o desmonte real do
  Cadastro no fim de cada caso para as provas que importavam `main.ts`
  diretamente. As provas com recargas simuladas mantêm o desmonte entre
  as montagens da casca. Passaram os 122 testes nos 29 arquivos atualizados.
- A auditoria de imports e referências a recursos em `web` e `scripts`
  encontrou zero importadores externos de `web/ui/`. A casca usa as pontes
  imperativas de botão e linha de lista. `estilos/tema.css` importa a folha
  movida para `web/estilos/ui.css` na mesma camada `legado`, com os mesmos
  bytes.
- Sobre `8f03652`, a remoção dos oito arquivos órfãos encerrou a parte de
  `web/ui/` da tarefa 7.1. O comentário da Carteira aponta para o painel de
  cadastro. Os 25 cenários Chromium passaram com a pasta removida. Na
  contraprova, mudar só a opacidade do select nativo fez `#realizacao-situacao`
  receber `1` em vez de `0`. O cenário voltou a passar após restaurar a regra.

## Histórico da integração do turno e plantão

O PR #22 integrou o bloco turno/plantão (tarefa 5.2, leva 2), com um commit por
módulo. A sequência de blocos tem por alvo retirar os importadores de `web/ui/`.

## Última tarefa concluída

- **`web/painel-cadastro.ts` sem `web/ui/`** (branch `migracao/painel-cadastro`, 27/11):
  continua `.ts` carregado por `<script>` (A6) — não desenha nada; o `<dialog>` e o
  formulário são de `index.html`/`main.ts` e migram com a casca. `focaveis`/`prenderFoco`
  passaram para `web/ponte/foco-preso.ts`; `web/ui/dialogo.ts` importa de lá (uma cópia
  só). Provas novas, que não existiam: `web/painel-cadastro.test.ts` (jsdom, 4) e
  `scripts/prova-celular/painel-cadastro.pw.ts` (Chromium, marcação lida de `index.html`,
  `aplicarControlesProprios` ativo em `#cadastro`, 4). Contraprovas: sem `prenderFoco`, o
  Tab nº 10 leva o foco ao `body`; sem a guarda do `hidden`, o diálogo abre sem permissão.
  `main.ts` e `index.html` intocados. Importadores de `web/ui/` (grep do #26): 6 → 5.
- **Bloco turno/plantão fechado** (PR #22, `ec879a2`): 7 módulos imperativos migrados,
  fábricas imperativas retiradas, costuras da síntese e de `turno-proprio.tsx` desarmadas.
- Evidência: `pnpm run verificar:ativacao` local em `ec879a2` saiu 0 (3m16s; web 905,
  proxy 742, funções 324, contratos 207, cadastro 137, celular 14; 30 pulados, os mesmos da
  `main`). CI `verificar-ativacao` do PR #22 verde (4m15s), com o PR fora de draft.
  Peso do JS na primeira visita: 224.425 B = 219,2 KiB (main `80f7583`: 222.914 B =
  217,7 KiB; +1,5 KiB), gzip -9 do `index.html` e tudo que ele puxa, inclusive
  `modulepreload`. Aviso do build mantido: `turno-execucao-relatorios` preso por import
  estático, agora de `turno-execucao.tsx`.

- Prova de navegador pela casca real (`scripts/prova-celular/turno-casca-producao.mjs`,
  build de produção, Chromium, dublê HTTP): exercita os `<select>` e datas do turno com o
  observador `aplicarControlesProprios` de `main.ts` ATIVO. Código real: passou (e passou
  também na `main` `80f7583`, linha de base). Contraprova: com o seletor de turno dos
  relatórios trocado por `<select>` cru condicional, falhou com `NotFoundError: Failed to
  execute 'removeChild'`; revertido e repassou.

- Ficha do plantão (`ficha-plantao-celular.pw.ts`, teste novo de interação): com a bancada
  honesta do #25 (que instala `aplicarControlesProprios` e carrega `tema.css`), código real
  5/5; contraprova (seletor "Plantão" trocado por `<select>` cru que some com "Sim") falhou
  com `NotFoundError` em `removeChild`, pego na conferência de erros; revertido, 5/5. Na
  bancada antiga, sem observador, a mesma mutação PASSA — a bancada mentia. Até o #25
  entrar, o teste roda no caminho nativo nesta branch.
- Conflito previsto com o #25: os dois mudam a linha do import de
  `scripts/prova-celular/ficha-plantao.ts` (aqui para `.js`, porque o módulo virou `.tsx`).

## Próximo passo

- Bloco agenda (4 módulos), avulsos, `confirmacao.ts`, `main.ts`.
- Costuras `.tsx → montar*` fora do bloco turno, a reportar antes de resolver:
  `editar-paciente.tsx:440` (`montarSubstituicaoCaseManager`), `selecao-profissional.tsx:409`
  (`montarRevogacaoVinculo`) e `diario.tsx` (`montarEntradaPorAudio` via `AudioOuAtalho`).

## Bloqueadores

- A7 fica com a frente que já o conduz (branches locais `LmAzevedo94/validar-a7-vault` e
  `LmAzevedo94/inventario-ffcm`); pendências dele são do dono.
- Roteiro de navegador com backend REAL para a tela do turno não executado; a prova de
  navegador desta fatia usa dublê HTTP (ver abaixo).

## Decisões vigentes nesta mudança

- 27/11/2026, coordenação: migrar até `web/ui/` ficar sem importador; um PR por bloco
  (turno → agenda → avulsos → `confirmacao.ts` → `main.ts`), sem merge pela frente.
- `web/confirmacao.ts` entra como item próprio depois da agenda. Verificado: o diálogo é
  anexado a `document.body` (`web/ui/dialogo.ts:176`), fora de qualquer raiz React.
- Peso de referência: 179,1 KiB antes do React (`fa72f8d`), 217,7 KiB em `80f7583`
  (gzip -9 do JS do `index.html`, inclusive `modulepreload`). Saldo +38,6 KiB.

## Pendente de confirmação do solicitante

- Os 3 módulos só da demonstração (`evolucoes-locais`, `painel-pendencias-local`,
  `relacoes-locais`) importam `web/ui/`: migrar ou apagar a demonstração.
