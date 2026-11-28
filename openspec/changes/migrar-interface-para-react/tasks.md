# Tarefas — migração da interface para React

Convenção: cada tarefa aponta requisito, dependência e evidência de aceite.
`[C]` = coordenação (arquivo de colisão, não delegar). `[A]` = delegável a agente.
Verificação durante o trabalho: só `pnpm run verificar:rapido` mais o arquivo de teste
tocado. `pnpm run verificar:ativacao` roda no fechamento de cada fase, uma vez.

---

## Fase 0 — Fundação visual (sem dependência nova)

Independente da decisão sobre React. Serve às duas vidas, então não há aposta perdida.

- [x] **0.1 [C]** Reorganizar os tokens de `web/styles.css` e `web/ui/ui.css` no vocabulário
  semântico de D3, derivando os papéis que faltam da paleta atual.
  *Requisito:* VIS-011, VIS-017. *Dependência:* nenhuma.
  *Evidência:* nenhum hex novo introduzido (diff mostra só nomes e referências);
  `pnpm run verificar:rapido` verde; captura das telas atuais antes e depois, idênticas.

- [x] **0.2 [C]** Escrever `web/contrato-visual.test.ts`: contraste mínimo 4,5:1 para todo
  token de texto sobre seu fundo declarado; oliva `#839352` proibida como cor de texto;
  presença de `:focus-visible`; presença de `prefers-reduced-motion`; alturas de controle
  e larguras de navegação fixadas.
  *Requisito:* VIS-017. *Dependência:* 0.1.
  *Evidência:* o teste reprova quando `--primary` é trocado por `--brand-olive`; roda em
  `vitest run web/contrato-visual.test.ts`.

- [x] **0.3 [A]** Reescrever `DESIGN.md` no formato de sistema de design: frontmatter com
  tokens e receitas de componente, prosa com regras nomeadas, Do's e Don'ts. Descrever o
  que existe, não o que se deseja.
  *Requisito:* VIS-011. *Dependência:* 0.1.
  *Evidência:* todo token citado existe em `web/ui/ui.css`; nenhuma cor da referência
  TriviAtende aparece.

- [x] **0.4 [C]** Apurar a lateral que "não recolhe": `collapse-sidebar` e
  `sidebar-collapsed` existem em `web/main.ts:321` com teste em
  `web/gaveta-lateral.test.ts:207`. Determinar se é defeito ou invisibilidade do controle.
  *Requisito:* VIS-015. *Dependência:* nenhuma.
  *Evidência:* causa nomeada; se for defeito, correção com teste; se for descoberta,
  registrado para a Fase 5.

**Fecha a fase:** `pnpm run verificar:ativacao` uma vez. Captura das telas sem regressão.

---

## Fase 1 — Ponte React (requer aprovação P1)

**Portão:** não instalar nada antes da aprovação explícita do solicitante.

- [x] **1.1 [C]** Instalar `react`, `react-dom`, `@vitejs/plugin-react`, `tailwindcss` v4,
  `@tailwindcss/vite`, `clsx`, `tailwind-merge`, `lucide-react`. Configurar o plugin no
  Vite e o TypeScript para JSX.
  *Dependência:* P1 aprovada.
  *Evidência:* `pnpm run build:web` e `pnpm run typecheck:web` verdes; nenhuma tela alterada.

- [x] **1.2 [C]** Criar `web/estilos/tema.css` com a ordem de camadas e o bloco
  `@theme inline` de D4, importando os tokens existentes na camada `legado`.
  *Requisito:* VIS-011. *Dependência:* 1.1, 0.1.
  *Evidência:* nenhum valor literal no bloco; captura das telas atuais inalterada.

- [x] **1.3 [C]** Criar `web/ponte/ilha.ts` com o adaptador de D2 e seu teste: montar,
  desmontar, e confirmar que resposta posterior à desmontagem não escreve.
  *Requisito:* VIS-012. *Dependência:* 1.1.
  *Evidência:* `vitest run web/ponte/ilha.test.ts`; o teste reprova se `unmount` sair.

**Fecha a fase:** `pnpm run verificar:ativacao`. Nenhuma tela migrada ainda, nenhuma
alteração visual.

---

## Fase 2 — Componentes base

Duas frentes paralelas, arquivos exclusivos. `web/componentes/ui/`.

- [x] **2.1 [A] Frente A — controles.** `button.tsx`, `input.tsx`, `textarea.tsx`,
  `select.tsx`, `badge.tsx`, `skeleton.tsx`. Variantes e alturas conforme `web/ui/basicos.ts`
  e `web/ui/controles.ts`, que são a especificação.
  *Requisito:* VIS-011, VIS-014. *Dependência:* 1.2.
  *Evidência:* teste por componente cobrindo variante, estado desabilitado e foco visível;
  alvo de toque ≥ 44px no celular; campo com 16px no celular.

- [x] **2.2 [A] Frente B — sobreposições.** `dialog.tsx`, `sheet.tsx`, `popover.tsx`,
  `combobox.tsx`, `tabs.tsx` sobre Radix. Portar o comportamento de `web/ui/dialogo.ts` e
  `web/ui/selecao.ts`.
  *Requisito:* VIS-013. *Dependência:* 1.2.
  *Evidência:* teste de armadilha de foco, devolução de foco, `Esc`, e **diálogo mais alto
  que a janela com ações visíveis e corpo rolável** — a correção pedida em 25/11/2026.

- [x] **2.3 [A]** `table.tsx`, `estado-vazio.tsx`, `estado-erro.tsx`, e o contrato de
  estados: carregando com esqueleto na região, vazio dentro do painel com próximo passo,
  erro com causa e recuperação, `0` distinto de indisponível.
  *Requisito:* VIS-014, VIS-016. *Dependência:* 2.1.
  *Evidência:* teste dos quatro estados; teste de que um registro inválido degrada sozinho.

- [x] **2.4 [C]** Medir o pacote contra o corte de D8 e registrar o número.
  *Dependência:* 2.1, 2.2, 2.3.
  *Evidência:* tamanho do JavaScript inicial comprimido, comparado ao corte declarado.
  Acima de 260 KB, volta à coordenação antes da Fase 3.

- [x] **2.5 [A]** Porta de demonstração dos componentes para conferência visual, e captura
  por Playwright enviada ao solicitante.
  *Dependência:* 2.1–2.3.
  *Evidência:* imagem das variantes em desktop e celular.

**Fecha a fase:** `pnpm run verificar:ativacao`. Aprovação visual do solicitante antes da
Fase 3.

---

## Fase 3 — Telas reclamadas (primeira entrega visível)

Alvo literal das palavras do solicitante em 24/11/2026. Duas frentes.

- [x] **3.1 [A] Frente A — Administração: acessos e equipe.**
  `acessos-administracao.ts` (354), `concessao-equipe.ts` (269),
  `revogacao-vinculo.ts` (149), `financeiro-concessao-administracao.ts` (179).
  Inclui *"tela de criar usuário muito feia, uma caixa solta"* e a listagem de equipe.
  *Requisito:* VIS-012, VIS-014, VIS-016, VIS-018. *Dependência:* Fase 2.
  *Evidência:* testes de comportamento existentes verdes; negativa de autorização
  inalterada; os seis `if (!ativa)` de `concessao-equipe.ts` eliminados.

- [x] **3.2 [A] Frente B — Administração: configurações.**
  `configuracao-sistema.ts` (273), `campo-extra-plano-administracao.ts` (349),
  `estado-emocional-administracao.ts` (229), `papel-declarado-administracao.ts` (221),
  `modelo-ficha-plantao-administracao.ts` (288), `habilitacao-plano-crise.ts` (161),
  `segredos-integracoes.ts` (167), `regras-atendimento.ts` (108).
  Inclui *"abas das configurações feias"* e *"clicando nas abas um loading para montar a
  página"* — a troca de aba não remonta mais.
  *Requisito:* VIS-013, VIS-014, VIS-018. *Dependência:* Fase 2.
  *Evidência:* troca de aba sem remontagem comprovada em teste; abas por teclado.

- [x] **3.3 [A]** Listas que não existem: visão de lista de **pacientes**
  (`filtros-carteira`, `indicadores-carteira-local`) e de **profissionais**
  (`selecao-profissional`).
  *Requisito:* VIS-016. *Dependência:* 2.3.
  *Evidência:* `web/telas/lista-pacientes.tsx` com linhas acionáveis, colunas alinhadas,
  secundárias somem no celular, degradação por registro. Testes verdes.

  **A ligação da lista de pacientes foi movida para a Fase 4, decisão de 25/11/2026.**
  `linhaPaciente` (2397), `pacientesFiltrados` (2444), `renderizarLista` (2456) e
  `carregarPacientes` (2512) vivem dentro de `web/main.ts`, sobre closures locais. Extrair
  exige reescrever a carteira na casca — e 30 testes alcançam elementos por
  `getElementById` de `web/index.html` (achado A8). Mexer neles fora da fatia da casca
  deixaria os 30 vermelhos de uma vez e apagaria a diferença entre "seletor mudou" e
  "regrediu". A visão está pronta e provada; falta uma chamada, que entra em 4.1.

  **`web/busca-pacientes-local.ts` ficou imperativa por um bloqueio que já NÃO existe
  mais.** O diagnóstico original estava certo: `montarBuscaPacientesLocal` só é consumida
  por `web/demonstracao.ts`, cujo teste fazia `vi.stubGlobal('navigator', {locks})` sem
  `userAgent`, e `react-dom/client` lê `navigator.userAgent` na avaliação do módulo.

  **Removido em 25/11/2026**, depois que a frente de Documentos esbarrou no MESMO muro em
  `web/documentos-locais.ts` e reportou em vez de contornar. Um dublê de `navigator` sem
  `userAgent` não representa navegador nenhum: o stub ganhou `userAgent: ''`, conferido
  antes que nenhum código de produção lê esse campo. Provado que destravou, não suposto —
  uma sonda que importa `ilha()` foi injetada na cadeia de `demonstracao.ts` e os 31
  testes passaram; depois removida.

  Lição registrada: o bloqueio era de **ferramenta de teste**, não de arquitetura, e
  custou duas fatias adiadas antes de alguém questionar o dublê em vez de contorná-lo.

- [x] **3.4 [C]** Pendências que tocam estas telas, parcialmente concluída.
  - **`banco_42501`: resolvido.** Não era grant faltando — era RLS. A regra estava escrita
    em três lugares e a migração de 24/11 corrigiu só o corpo da função; as duas policies de
    `20261112070000` seguiam com `perfil='profissional'`. Violação de `WITH CHECK` devolve o
    mesmo SQLSTATE 42501 de falta de privilégio, e foi isso que enganou.
    Correção em `supabase/migrations/20261128240000_rls_acesso_caso_para_administrador.sql`,
    com três provas positivas e três negativas em Postgres local, todas verdes.
  - **Seção negada não fecha mais a ficha: resolvido.** `acessoPerdido` passou a usar
    `ficha.limparSecao()` quando a recusa é de uma área, e só fecha a ficha quando a recusa
    é de `visao` — que é a leitura do caso em si. Prova em `web/integracao-plano.test.ts`:
    o conteúdo da área negada some, a moldura fica, e a troca de aba funciona.
  - [ ] **Aba "Plano de crise" só para quem está habilitado: em aberto.** Exige
    `habilitado_plano_crise` no contrato de sessão, que é mudança de contrato de API e não
    cabe nesta fatia. Levar para a Fase 4, junto com a casca.

**Fecha a fase:** `pnpm run verificar:ativacao` e captura das quatro telas ao solicitante.

---

## Fase 4 — Casca e navegação

- [ ] **4.1 [C]** Reconstruir a casca de `web/main.ts` (3.132 linhas) em React: navegação
  única, lateral completa ou trilho, preferência persistida, foco preservado na troca.
  Inclui **ligar `montarListaPacientes`** (pendência herdada de 3.3) e dar ao controle de
  recolher uma affordance em repouso e rótulo visível (achado de 0.4: ele funciona, mas é
  um `‹` cinza sem borda nem fundo, e a única pista aparece no `:hover`).
  Os identificadores de `web/index.html` que os 30 testes alcançam mudam **nesta fatia e
  só nela**, com os testes no mesmo commit (achado A8).
  *Requisito:* VIS-015, VIS-016. *Dependência:* Fase 3, 0.4.
  *Evidência:* `web/gaveta-lateral.test.ts` verde ou reescrito com justificativa nomeada;
  as duas formas nunca simultâneas; a carteira apresenta a lista nova.

  Preservar, provado em 0.4: alternância de `aria-expanded`/`aria-label`, troca `‹`/`›`
  (`web/main.ts:448-459`), persistência em `localStorage` sob `navegacao-recolhida` com
  `try/catch` (`443-446`, `465-477`), tooltip só quando recolhido e fora do celular
  (`383-386`), e a separação recolher (desktop) × gaveta (celular).
  Limpar junto o CSS morto: `web/styles.css:717`, `:784` e `:735` usam 240px, sobrepostos
  mais adiante por `:2304`/`:2310`, que usam `--sidebar-width` (248px).

- [ ] **4.2 [C]** Navegação de celular própria, sem duplicar a lateral; conteúdo reservando
  a altura; tela cheia onde o fluxo pedir.
  *Requisito:* VIS-015. *Dependência:* 4.1.
  *Evidência:* `pnpm run verificar:celular` verde.

- [ ] **4.3 [C]** Roteamento: substituir o despacho por `hash` por rotas, preservando os
  endereços atuais (ficha, abas) para não quebrar vínculo salvo.
  *Dependência:* 4.1.
  *Evidência:* todo endereço antigo continua abrindo a mesma tela.

- [ ] **4.4 [A]** Remover a ilha das telas já migradas: passam a montar na raiz React única.
  *Dependência:* 4.1.
  *Evidência:* `web/ponte/ilha.ts` sem uso nas telas migradas; nenhuma mudança visual.

**Fecha a fase:** `pnpm run verificar:ativacao` mais o roteiro de navegação completo.

---

## Fase 5 — Ficha e plantão

Maior volume, menor risco visual. Duas frentes, arquivos exclusivos.

- [ ] **5.1 [A] Frente A — ficha.** `ficha-paciente.ts` (352), `visao-caso.ts` (348),
  `anamnese.ts` (447), `saude.ts` (309), `plano-cuidado.ts` (663), `plano-crise.ts` (422),
  `diario.ts` (815), `tarefas-cuidado.ts` (518), `pendencias-caso.ts` (472),
  `contexto-cuidado.ts` (287), `rede-cuidado.ts` (200), `linha-tempo.ts` (237),
  `contatos-paciente.ts` (274), `editar-paciente.ts` (396).
  *Requisito:* VIS-012, VIS-014, VIS-018. *Dependência:* Fase 4.
  *Evidência:* `web/integracao-plano.test.ts` e os demais de integração verdes; barreira de
  gravação, guarda de pendência e revalidação de acesso preservadas.

- [ ] **5.2 [A] Frente B — plantão e turno.** Em duas levas, por acoplamento real.

  - [x] **Leva 1, entregue:** `turno-proprio` (340), `passagem-turno` (355),
    `escala-turno` (351). Fatia vertical fechada — `turno-proprio` compõe
    `passagem-turno`, e a barreira de encerramento atravessa os dois. 43 testes verdes.
    **25 de 36 `if (!ativa)` eliminados**; os 11 restantes cruzam a fronteira da ilha
    (`acessoPerdido`, `alteracaoPendente`, `montarExecucao`, `localizacao`, e o `encerrar`
    chamado de fora), e foram reunidos num `fora()` por módulo em vez de espalhados.
    Barreira confirmada intacta item por item, nenhuma mensagem mudou de palavra.
  - [x] **Leva 2, item 1 — `turno-execucao-editor`, entregue em Sonnet 5, conferida
    pela coordenação.** Contrato externo intacto (`turno-execucao.ts` não sabe que é
    React). Achado real corrigido: colisão de nome `motivo`/`motivo_situacao` entre dois
    campos do mesmo formulário, que quebraria `formulario.elements.namedItem`; a chave no
    JSON de saída não mudou. Verificado: 13 testes, lint e typecheck limpos.
  - [ ] **Leva 2, itens 2-7 em aberto** (`-arquivos`, `-gestao`, `-relatorios`,
    `-localizacao-coordenacao`, `turno-execucao.ts`, `ficha-plantao.ts`). A camada
    imperativa de `turno-execucao-campos.tsx` permanece — 5 consumidores a migrar antes
    de poder sair.

  **Achado de arquitetura:** o bloco `turno-execucao-*` **não migra em partes**.
  `turno-execucao-campos.ts` exporta `elementoTurno`, `campoTurno` e `botaoTurno` —
  fábricas de `HTMLElement` consumidas por `-leitura`, `-conversao`, `-localizacao`,
  `-arquivos` e `consolidado-ficha-plantao`. Migrar uma isoladamente obriga a migrar todas
  na mesma leva, ou a manter duas camadas de montagem convivendo. As fábricas são o
  primeiro item da leva 2.

  **Achado de teste:** o React agenda a repintura vinda de `then`/`await` **fora de
  evento** numa macrotarefa. O auxiliar `aguardar`, que esperava só a fila de
  microtarefas, voltava com a tela no estado anterior — ele afirmava um detalhe da escrita
  imperativa síncrona, não comportamento. Trocado por `setTimeout(0)` em três arquivos,
  com a justificativa escrita no próprio teste.

  *Requisito:* VIS-012, VIS-014, VIS-018. *Dependência:* nenhuma — a Fase 3 provou que um
  módulo migra sem tocar `main.ts`, então a dependência da Fase 4 que eu havia escrito
  estava errada e foi removida em 25/11/2026.
  *Evidência:* protocolo de barreira inalterado, com prova positiva e negativa.

- [ ] **5.3 [A]** Áudio e transcrição: `transcricao-audio.ts` (407),
  `relato-textual.ts` (150), `conversao-diario.ts` (360). Alternativa ao áudio preservada.
  *Dependência:* 5.1.
  *Evidência:* a alternativa textual continua disponível e anunciada.

---

## Fase 6 — Resto das telas

- [ ] **6.1 [A]** Agenda: `agenda-individual.ts` (742), `agenda-operacoes.ts` (360),
  `agenda-vinculo.ts` (179), `realizacao-compromisso.ts` (262).
- [ ] **6.2 [A]** Financeiro e auditoria: `financeiro.ts` (567),
  `financeiro-audiencia.ts` (48), `auditoria.ts` (292).

  - [x] **Auditoria, entregue por frente em Sonnet 5, conferida pela coordenação.**
    Os dois defeitos medidos na conferência de 25/11/2026 estão corrigidos e
    verificados diretamente no código (não só no relato): campos de filtro usam
    `Campo`/`SelecaoSimples` com `classeControle` fixando 16px (achado C2 fechado);
    tabela virou `Lista` com `min-w-0` no envelope (achado da rolagem horizontal
    fechado). Motivo cifrado/`request_id`/identificador continuam fora da tela,
    testado explicitamente. `if (!ativa)` 3 → 0. 13/13 testes verdes; lint e
    typecheck limpos. `financeiro-audiencia.ts` revisado e dispensado de migração:
    é lógica pura sem DOM.
  - [ ] **Financeiro e as duas agendas, não iniciados.**
- [x] **6.3 [A] Documentos e exportação — entregue, conferida pela coordenação.**
  Migrados: `documentos-locais`, `documentos-caso`, `exportacao`, e o trio
  `editor-documento-paciente` + `contexto-cuidado` + `rede-cuidado` na mesma leva,
  respeitando o acoplamento hospedeiro/corpo já registrado.
  **29 `if (!ativa)` eliminados, zero restantes** nos cinco módulos (conferido por grep).
  O hospedeiro virou o hook `usarEditorDocumentoPaciente`; conferi que **nenhum chamador
  externo** usa o contrato antigo — só os dois corpos que migraram junto, então não há
  quebra de contrato.
  Quatro testes tiveram **só o especificador de import** alterado; conferi o diff de cada
  um, nenhuma asserção mexida. 46 testes verdes nos arquivos da frente.

  **`anexos-exportacao.ts` e `pacote-exportacao.ts` não migram:** são lógica pura de zip e
  bytes, com **zero** referência a DOM (conferido). Não há interface para migrar.

  Durante o trabalho esta frente esbarrou no bloqueio do dublê de `navigator` e
  **reportou em vez de contornar** — foi o que levou à correção registrada na Fase 3.3.
- [ ] **6.4 [A]** Família e titular: `preautorizacoes-familiares.ts` (191),
  `solicitacoes-titular.ts` (296), `orientacoes.ts` (127),
  `secao-dados-familiar.ts` (71), `encaminhamentos.ts` (137).
- [ ] **6.5 [A]** Restantes: `home-profissional.ts` (247), `avisos.ts` (186),
  `substituicao-case-manager.ts` (363), `casca-offline.ts` (178),
  `login-interno.ts` (123), `ciclo-acesso.ts` (305).

*Requisito de todas:* VIS-012, VIS-014, VIS-016, VIS-018.
*Evidência de todas:* testes de comportamento verdes; prova positiva e negativa de
autorização onde a tela tiver autorização própria.

---

## Fase 7 — Encerramento

- [x] **7.0a [C]** Agenda individual usa seleção aprimorada React para registrar a realização.
  *Requisito:* VIS-017, VIS-018 e FR-024. *Evidência:* Chromium com o observador ativo,
  CSS real, Motivo montado e desmontado após carga, FormData e recusa simulada (403).
  As contraprovas de opacidade e de invólucro duplo estão registradas no estado.
- [x] **7.0b [C]** Cadastro passa a renderizar seus controles aprimorados, inclusive o
  catálogo assíncrono de responsáveis e os contatos que entram depois da abertura.
  *Evidência:* Chromium pela casca com sentinela legada, catálogo carregado depois
  da abertura, contato dinâmico, foco de erro, payload e reset. A contraprova do
  CSS falhou pela opacidade em `#birth-date`.
- [x] **7.0c [C]** Administração passa a renderizar seus controles aprimorados e o
  Financeiro usa ilhas para as datas nos dois hospedeiros.
  *Evidência:* Chromium pela casca, sentinela legada, GETs de Auditoria com os filtros
  corretos, troca de abas com as quatro datas do Financeiro e contraprova de opacidade.
- [x] **7.0d [C]** Ficha passa a renderizar os controles aprimorados de suas seções.
  *Evidência:* Chromium na casca com sentinela legada, troca de página da seleção
  de profissionais, datas da Linha do tempo e interação na ficha de plantão.
- [x] **7.0e [C]** Retirar o observador de controles das seis inscrições em `main.ts`
  após a prova de convivência de cada região. Regras e Início não montam esses controles.
  *Evidência:* Chromium com componentes e tema reais. A sentinela nativa preserva
  o pai original. Religar a observação na Administração falha nessa asserção.

- [ ] **7.1 [C]** Remover `web/ui/` vanilla e as regras de `web/styles.css` substituídas.
  *Dependência:* Fase 6 completa.
  *Evidência:* nenhuma tela importa o CSS removido; captura sem regressão.

- [x] **7.2 [C]** Remover `web/ponte/ilha.ts` e o último `montar*` que escreve no DOM.
  *Evidência:* `rg -n '^export function montar' web` encontra só os seis geradores puros de
  `web/pacote-exportacao.ts`: `montarResumoHtml`, `montarDadosJson`, `montarBytesZip`,
  `montarZip`, `montarBytesPacoteExportacao` e `montarPacoteExportacao`.
  A ativação passou com 84 cenários Chromium, axe sem violação e autorização local
  positiva e negativa. A contraprova da importação tardia foi revertida e consta em `estado.md`.

- [ ] **7.3 [C]** Conferir os textos `ffcm.regras.*` que ainda mostram marcador de semente
  às famílias.
  *Evidência:* os quatro textos preenchidos ou a pendência registrada.

- [ ] **7.4 [C]** Medição final do pacote contra D8; `DESIGN.md` atualizado para o estado
  real; sincronizar specs e arquivar a mudança.
  *Evidência:* `pnpm run verificar:ativacao` completo; `openspec validate` verde.

---

## Achados abertos, com dono a definir

Encontrados durante a execução, nenhum causado por esta mudança.

- [x] **A1. Dois vermelhos para o mesmo papel — RESOLVIDO em 25/11/2026.** O solicitante
  pediu "o mais levinho". Ficou `--error` `#903a30`: 2 pontos mais escuro que `#b42318`,
  mas com 50% de saturação contra 76,5%, e 7,41:1 contra 6,57:1 sobre branco. `--alerta`
  virou apelido. O contador do sino de avisos muda de tom — é a única mudança visual
  intencional desta fase.
- [ ] **A2. Sem cor de sucesso.** Nunca houve verde distinto do da marca. Enquanto não vier
  do marketing, sucesso vai por texto e ícone, que VIS-014 exige de qualquer forma.
- [x] **A3.** O proxy extrai `paciente_id` antes de validar o corpo estrito, valida o UUID à parte e o encaminha para conferir o paciente do pedido. Dono técnico proposto: Governança/LGPD. Custo: conferência por leitura. A ativação de `ffcm.lgpd.ativa` segue pendente.
- [ ] **A4. `servico_indisponivel` com dois significados.**
  `web/preautorizacoes-familiares.ts` apresenta esse código como "o acesso da família ainda
  não foi liberado", enquanto `web/servico-preautorizacoes-http.ts` usa o mesmo código para
  falha de rede. Nada é concedido a mais; a mensagem é que mente sobre a causa.
- [x] **A5.** A lista de acessos familiares descarta itens de outro paciente antes de exibir ações. Dono técnico proposto: Acessos familiares. Custo baixo, filtro por item e regressão focada.
- [x] **A6. `web/painel-cadastro.ts` — NÃO é código morto. Achado anterior INVALIDADO
  em 25/11/2026.** A suspeita vinha de uma varredura por `import`, que nunca o acharia:
  ele é carregado por `<script type="module" src="./painel-cadastro.ts">` em
  `web/index.html:19`, fora de qualquer import, e de propósito **antes** de `main.ts` —
  há comentário no HTML explicando que o diálogo precisa existir antes de `main.ts` pôr
  o foco no título do formulário.
  Está ativo: transforma o formulário de cadastro em diálogo (abrir, fechar, `Esc`,
  prender foco). Nenhuma autorização passa por ele.
  **Não apagar.** Migra junto com a casca na Fase 4, porque depende de `index.html`.
  Lição: varredura por `import` não encontra módulo carregado por `<script>`. Os outros
  achados de "sem uso" desta mudança foram obtidos pelo mesmo método e podem ter o mesmo
  viés.
- [ ] **A7.** Reproduzido por `testar-cadeia-migrations-sem-superusuario-local.sh` em PostgreSQL 17 com pg_cron: grant de `20261124160000:200` recusa o papel criado só em `20261125020000`. Dono técnico proposto: Plataforma/Supabase. Custo médio, conciliar a ordem limpa com o histórico aplicado e provar instalação e upgrade sem superusuário. A política de substituição de credenciais segue na decisão do cofre.
- [ ] **A8. 30 testes alcançam elementos por `getElementById` de `web/index.html`.** Se a
  casca React trocar esses identificadores, os 30 ficam vermelhos juntos e some a distinção
  entre "seletor mudou" e "regrediu". Migrar a casca em fatia isolada, com os seletores no
  mesmo commit.
- [x] **A9.** O teste resolve cada módulo em `.ts` ou `.tsx` e exige fonte única, preservando as asserções. Dono técnico proposto: Qualidade web. Custo baixo, alteração no próprio teste.

## Divisão por rota e portão de ativação — 26/11/2026

- [x] **Divisão por rota, concluída.** Administração (13 telas) e as 19 seções da ficha
  passam a chegar por importação dinâmica. Peso da primeira visita, comprimido:
  185,4 kB antes de tudo, 297,6 kB sem divisão, 258,9 kB com Administração sob demanda,
  **216,9 kB com a ficha também sob demanda** — dentro da régua de 255,4 kB, com folga de
  38,5 kB. Medido somando TUDO que o HTML puxa, inclusive `modulepreload`; ler só o pedaço
  de entrada daria 108,5 kB e seria falso.
  Exceção declarada: `montarTranscricaoAudio` continua estático, porque é chamado de um
  callback síncrono que o diário espera e a alternativa por áudio é requisito de produto.
  Aviso em aberto do build: `turno-execucao-relatorios` não se move por ser importado
  estaticamente por `turno-execucao.ts`.

  **Remedido em 26/11/2026, depois da padronização: 217,5 kB.** A diferença de 0,7 kB é o
  custo da troca das classes do kit antigo pelos componentes, e ela não se paga nesta
  fatia: `web/ui/ui.css` continua descendo enquanto os 23 módulos imperativos usarem
  `web/ui/`. Saldo sobre os 185,4 kB de referência: **+32,1 kB**, primeira faixa da régua
  de D8. Método: gzip nível 9 sobre `index.html` e tudo que ele referencia, incluindo os
  quatro `modulepreload`. CSS (16,4 kB) e HTML (5,7 kB) ficam fora da conta porque a régua
  de D8 é de JavaScript; somando tudo, a primeira visita traz 239,5 kB.

- [x] **`web/linha-tempo` migrado, com os primeiros testes que o módulo já teve.** Eram
  zero. Seis provas, incluindo negativa de autorização que exige `acessoPerdido` chamado
  **e** nenhuma mensagem genérica no lugar — distinguir recusa de permissão de falha de
  rede era o que faltava.

- [x] **Prova de celular consertada: 14 passam, eram 10 com 4 falhando.**
  `scripts/prova-celular/ficha-plantao.ts` importava `consolidado-ficha-plantao.ts` depois
  de o módulo virar `.tsx`. Nenhum dos 884 testes pegava; só apareceu quando
  `verificar:celular` rodou.
  **A causa de ter chegado tão longe foi a varredura que eu mesmo escrevi cobrir só
  `web/`.** Varrer a pasta onde o arquivo mudou não encontra quem o consome de outra
  pasta. Ampliada para `web/`, `scripts/` e `netlify/`, pegou um segundo caso no mesmo
  minuto, de outra frente.

## Defeito encontrado ao integrar as frentes — 25/11/2026

- [x] **Rascunho preso a versão vencida podia sobrescrever o cadastro.**
  Em `web/editar-paciente`, quando a conferência termina e a versão pode ter mudado, a
  pessoa precisa **copiar** o rascunho sem poder **sobrescrever**. A versão imperativa
  reabilitava só o `fieldset` e mantinha a trava do envio. A migração colapsou os dois
  estados num sinalizador só e escreveu `definirBloqueada(false)` — liberando o envio,
  contradizendo o próprio comentário logo acima, que dizia "sem permitir sobrescrita".
  Corrigido com um estado separado (`camposLiberados`): campos alcançáveis, envio travado.
  Encontrado porque o teste de barreira estava vermelho; não teria aparecido em revisão
  visual.

- [x] **Imports com extensão literal apontando para arquivo renomeado — 12 ocorrências.**
  Módulo migra de `.ts` para `.tsx` e quem importava com `from './x.ts'` passa a apontar
  para arquivo inexistente. Passou despercebido em quatro frentes porque a maioria é
  `import type`, apagada em execução: o `tsc` resolve e o typecheck fica verde. Só quebra
  no Vite, e só em quem importa de verdade — `modelo-sintese.test.ts` caiu sem que nada
  antes acusasse.
  Todos trocados para `.js`, que resolve `.ts` e `.tsx` igualmente, e **travado por teste**
  em `web/contrato-visual.test.ts`.

- [x] **Teste reescrito, nomeado:** `editar-paciente.test.ts`, guarda de resultado de outro
  paciente. Afirmava `button?.hidden === true`; a versão imperativa escondia o botão, a
  React não o renderiza. A garantia — não existir caminho para reconhecer resultado de
  outro paciente — passou a ser afirmada de forma que vale para as duas implementações.
  As asserções de `reconhecer` não chamado e identificador não exibido ficaram intactas.

## Conferência com conteúdo real — Fase 5

Fixtures versionadas em `web/fixtures/` (5 arquivos, ~720 linhas), validadas contra os 18
contratos Zod. Onze telas de administração conferidas em Chromium com conteúdo de verdade,
1440/1024/390. Contraste: nenhuma violação, pior razão medida 5,69:1.

Resolvidos no mesmo dia: a casca offline bloqueada, a rolagem horizontal da Auditoria e a
caixa dentro de caixa em seis telas. Ficam estes:

- [x] **C1. Botão de revogar vínculo cortado no celular — CORRIGIDO em 26/11/2026
  (`e9bf1ff`): rótulo e endereço inteiros em 390px.** Era assim: a célula da lista é
  `min-w-0 flex-1 truncate` e o botão de 220px é recortado: lê-se "Selecionar" em vez de
  "Selecionar para revogação". Agravante na mesma lista: os e-mails aparecem como
  `ana.ficticia…`. Numa ação de revogação, não dá para saber quem se está revogando.
  Precisa de coluna que não trunca.
- [x] **C2. Campos de filtro da Auditoria a 13px — CORRIGIDO: 16px por `classeControle`,
  junto da migração da tela.** Eram `input#auditoria-acao` e os dois do
  componente de data. O iOS dá zoom ao focar. Única tela com campo abaixo de 16px.
- [x] **C3. `<summary>` com 26px de altura — CORRIGIDO em 26/11/2026 (`d90a475`): 46px.**
  Nas listas administradas, contra os 46px de alvo de toque. É o controle que abre cada
  item do catálogo.
- [x] **C4. Caixas de marcação com 24px de largura — CORRIGIDO em 26/11/2026 (`475a364`):
  46px.** Em modelo de ficha, plano e financeiro.
- [x] **C5. Validação Zod sob Trusted Types no pacote de produção.** No Chromium,
  o build servido por Vite Preview em loopback manteve `require-trusted-types-for 'script'`
  e `style-src 'self'`. O navegador registrou o bloqueio efetivo de `Function` em um
  chunk de produção. A carteira exibiu a fixture válida e recusou a resposta de lista
  inválida com recuperação visível, sem exceção de página. A prova intercepta a API
  com dados fictícios, usa apenas recursos locais e roda no portão após `build:web`.

## Suíte de testes — contenção sob paralelismo

Medido em 25/11/2026, com todas as frentes paradas: oito arquivos falhavam de forma
intermitente na suíte inteira e **passavam todos isoladamente**. Não era defeito de código:
a migração deixou cada arquivo mais pesado (jsdom + árvore React + `flushSync`), e com o
padrão do vitest — um trabalhador por núcleo, dez nesta máquina — o `vi.waitFor` de 1s
estourava por disputa de recursos.

| Configuração | Resultado |
| --- | --- |
| Padrão, 10 trabalhadores | 8 falhas intermitentes |
| Sequencial | 880/880, 184s |
| **Quatro trabalhadores** | **880/880 em três rodadas, ~31s** |

Fixado `maxWorkers: 4` em `vitest.config.ts`, com as medições registradas ao lado. Falha
intermitente é pior que falha determinística: some quando se vai investigar e volta na CI.

## Conferência visual da Fase 3 — achados ainda abertos

Conferência em Chromium, 1440/1024/390, administrador e profissional, contra `HEAD`.
Resolvidos no mesmo dia: a serifa apagada por token autorreferente, a rolagem horizontal a
390px e o cabeçalho de colunas aparecendo sem linha nenhuma. Ficam estes:

- [x] **V1. Caixa dentro de caixa — RESOLVIDO.** Não era `Superficie` aninhada: era a
  `Lista`, com moldura própria, dentro de uma `Superficie` que já tinha a sua. `Lista`
  ganhou `moldura`, e as duas telas passam `false`. Travado por teste.
  Registro original: Medido: controles com DUAS
  molduras ancestrais — cartão da seção, cartão interno do formulário, campo. A versão
  imperativa tinha uma só. Contraria a regra **Superfície plana** do `DESIGN.md`, e é
  literalmente a queixa de 24/11/2026 ("uma caixa solta").
- [ ] **V2. Truncamento desnecessário em 1440.** Em Equipe o e-mail vira
  `profissional.um@ex…` com ~380px de folga à direita: a lista fica presa a ~714px
  enquanto a coluna de conteúdo vai até 1060.
- [ ] **V3. Estado vazio incoerente entre telas.** Agora é corpo semibold em todas, mas em
  Acessos o mesmo papel ainda usa um `output` de 13px. Unificar no componente.
- [ ] **V4. Telas de administração nunca vistas com conteúdo.** As fixtures cobrem sessão,
  pacientes, avisos e concessões de equipe; o resto responde lista vazia. Integrações,
  Configuração, Plano de cuidado, Ficha de plantão, Papéis declarados, Estado emocional,
  Quem vê o financeiro, Auditoria, Solicitações e Regras de atendimento foram vistas
  **só em estado vazio ou de erro**. `revogacao-vinculo` nunca renderizou.
  Não é defeito conhecido — é cobertura ausente, e precisa de fixtures antes da entrega.
- [ ] **V5. A CSP real nunca foi exercitada em tela montada.** A conferência rodou no
  servidor de desenvolvimento, que relaxa `style-src`. Falta uma passagem sobre o build de
  produção, com a diretiva fechada.

## Fora desta mudança, registrado para não se perder

Higiene de segurança pendente, independente da migração: revogar o token do Supabase,
rotacionar a chave do OpenRouter, trocar as senhas do Workspace e as de teste geradas,
marcar variáveis sensíveis do Netlify como secretas, limpar as entradas obsoletas de
`uri_allow_list`, tratar as 68 sessões nunca encerradas. Criar o cliente OAuth do Google
Cloud e a conta de serviço do Drive. A marca oficial ainda aguarda o arquivo vetorial.

## Levantamento dos módulos imperativos — 27/11/2026

Decisão do dono, 26/11/2026: *"Já corrija as pendências migre o que precisar depois das
correções se não ativar o valor não tem pq subir"*. O #19 **não mergeia** antes disso.
Ordem: pendências primeiro, migração depois, e migrar só **o que precisar** — não os 23
por estarem na lista.

### Provado: 6 dos 23 não são produto

`web/demonstracao.html` é a única porta desses módulos, e ela **não é empacotada**:
`web/vite.config.ts` não declara `rollupOptions.input`, então a única entrada é
`web/index.html`, e `netlify.toml:4` publica `web/dist`, onde só existe `index.html`.
Conferido também pelo avesso: nenhum dos símbolos aparece em `web/dist/assets`.

| Módulo | Linhas | Situação |
| --- | --- | --- |
| `evolucoes-locais.ts` | 109 | só `demonstracao.ts` |
| `linha-tempo-local.ts` | 49 | só `demonstracao.ts` |
| `painel-pendencias-local.ts` | 56 | só `demonstracao.ts` |
| `relacoes-locais.ts` | 146 | só `demonstracao.ts` |
| `resumo-caso-local.ts` | 166 | só `demonstracao.ts` |
| `busca-pacientes-local.ts` | 32 | meio-caso: `main.ts:27` importa só `correspondeBuscaPacienteLocal`, função pura sem DOM. O `montarBuscaPacientesLocal` do mesmo arquivo é demo |

**Nenhum deles precisa migrar para o valor ativar.** Decisão sobre apagar a prévia é
separada e não é desta fatia.

### Os 17 de produto, com quem os monta

Medido por importação direta e dinâmica. Não é recomendação ainda — é o mapa.

| Módulo | Linhas | Chega por |
| --- | --- | --- |
| `turno-execucao.ts` | 787 | `main.ts` e `turno-execucao-integracao.ts` |
| `ficha-plantao.ts` | 776 | `turno-execucao.ts` |
| `agenda-individual.ts` | 742 | `main.ts` |
| `financeiro.ts` | 567 | `main.ts`, importação dinâmica (`main.ts:2031`) |
| `turno-execucao-gestao.ts` | 473 | `turno-execucao.ts` |
| `turno-execucao-relatorios.ts` | 411 | `turno-execucao.ts` |
| `ficha-paciente.ts` | 390 | `main.ts`, `visao-caso.tsx`, `home-profissional.tsx` |
| `pacote-exportacao.ts` | 370 | `anexos-exportacao.ts`, `exportacao.tsx` — **sem DOM**, montagem de zip |
| `agenda-operacoes.ts` | 360 | `agenda-individual.ts` |
| `turno-execucao-localizacao-coordenacao.ts` | 328 | `turno-execucao.ts` |
| `turno-execucao-arquivos.ts` | 264 | `turno-execucao.ts` e dois irmãos |
| `realizacao-compromisso.ts` | 262 | `agenda-individual.ts` |
| `casca-offline.ts` | 234 | `main.ts` |
| `campos-caso-novo.ts` | 192 | `main.ts`, `cadastro.ts` |
| `agenda-vinculo.ts` | 179 | `agenda-individual.ts` |
| `integracao-tarefas-disponibilidade.ts` | 115 | `main.ts` |
| `modelo-sintese.ts` | 61 | `passagem-turno.tsx`, `diario.tsx` |

Três blocos, não dezessete frentes: **turno/plantão** (seis arquivos, 3.039 linhas),
**agenda** (quatro, 1.543) e sete avulsos.

### Impacto dos 17 módulos nas jornadas

Leitura dos pontos de montagem e das guardas no head `ba3e0c4`. São 16 módulos com
interface e uma rotina de ZIP sem DOM. As dependências abaixo foram verificadas por
leitura. Fora da importação estática de relatórios, a leitura não demonstrou defeito
que obrigue a migrar esses módulos para entregar a próxima fatia.

| Módulo | Jornada e impacto |
| --- | --- |
| `ficha-paciente` | Crítico para abrir e navegar o caso, preservar rascunho e retirar a seção quando o acesso muda. |
| `campos-caso-novo` | Crítico no cadastro com campos extras. `main` fornece os controles usados por `cadastro.ts`. |
| `integracao-tarefas-disponibilidade` | Crítico ao entrar em Tarefas pelo caso. Consulta disponibilidade e valida sessão antes de montar a tela React. |
| `agenda-individual` | Crítico para agenda própria. Hospeda operações, vínculos e realização e desmonta os filhos. |
| `agenda-operacoes` | Crítico para criar, alterar e cancelar compromisso. Compartilha seleção e atualização com o hospedeiro. |
| `agenda-vinculo` | Crítico para conceder e revogar acesso à agenda, cuja permissão é independente do vínculo de caso. |
| `realizacao-compromisso` | Crítico para registrar desfecho no fechamento do compromisso, com autorização própria. |
| `turno-execucao` | Crítico no turno em curso. Compõe editor, anexos e conversão e agrega pendências para a barreira. |
| `ficha-plantao` | Crítico no registro do plantão. Carrega modelo e papéis, registra respostas e compõe o consolidado React. |
| `turno-execucao-arquivos` | Crítico quando a ocorrência exige anexo. Compartilha entrega, cancelamento e revalidação com o turno. |
| `turno-execucao-gestao` | Periferia do turno básico, núcleo de fundamento familiar, prescrição e catálogo. Monta ao abrir a seção. |
| `turno-execucao-localizacao-coordenacao` | Periferia da coordenação, com autorização e pendência próprias. Monta ao abrir a seção. |
| `turno-execucao-relatorios` | Periferia de consulta e PDF. Importação estática por `turno-execucao` prende o chunk. |
| `modelo-sintese` | Crítico no Diário e na Passagem. Compartilha campos FR-009, área livre quando falta catálogo e validação de conteúdo. |
| `financeiro` | Periferia da jornada clínica e núcleo de valores, despesas e apuração. Já tem divisão por rota e provas de celular. |
| `casca-offline` | Transversal em conectividade e limpeza do aparelho. Só o indicador de rede monta DOM. |
| `pacote-exportacao` | Periferia de governança. Monta ZIP em bytes, sem interface a migrar. |

**Costura da ficha.** `visao-caso.tsx` e `home-profissional.tsx` usam `hashFicha`
e tipos, e `main.ts` chama `montarFicha`. A costura é a ficha imperativa hospedando seções
React. O descarte desmonta antes de limpar o painel e descarta montagens assíncronas
que resolvem tarde. Preservar hashes, foco, guarda de alterações e a distinção entre
perder a seção e perder a ficha em uma eventual mudança.

**Costura da síntese.** Diário e Passagem montam o mesmo formulário imperativo num
contêiner com ref. A Passagem restaura rascunho ou envio pendente e limpa o contêiner
ao terminar o efeito. O Diário escreve a transcrição no campo de atividade e devolve
o foco após validação. Uma eventual conversão deve incluir ambos os consumidores e
preservar audiência, prévia, rascunho, alternativa textual e barreira de fechamento.

### Menor fatia que ativa valor

Demonstrar **carteira → ficha → concessão e revogação de acesso** com as telas atuais,
as correções de A5/A9 e o build de produção em loopback. Provar que a conta administradora
concede, abre o caso e revoga, e que perfil, caso e sessão indevidos são recusados.
A jornada pode evoluir sem migrar ficha, agenda ou turno. Tratar a síntese junto de
Diário/Passagem se surgir um defeito observável ou bloqueador dessa jornada.

**Decisão remota separada.** A migração
`20261128240000_rls_acesso_caso_para_administrador.sql` permanece local. Para ativar
concessão a administradores em ambiente remoto, definir e autorizar o alvo, conferir
histórico e estado das policies, combinar recuperação e executar provas positivas e
negativas antes de considerar a jornada ativada. A7 é uma decisão separada da cadeia
de instalação do cofre.

A prova focada de RLS rodou em PostgreSQL 17 descartável, sem rede. Em uma cópia
temporária de `acesso_paciente_autorizacao_local.sql`, foram aplicadas as migrações
`20261124200000` e `20261128240000` antes das asserções e acrescentado o caso positivo
de concessão ao próprio administrador. O roteiro também passou para concessão a
profissional, revogação, replay e atomicidade de auditoria e recusou sessão encerrada,
perfil profissional comandando a revogação e acessos diretos que o fixture proíbe.

Portão local `pnpm run verificar:ativacao` passou com Node 22.23.5 e Deno 2.9.5:
897 testes web, 736 do proxy, 324 das funções, 207 de contrato e 137 de cadastro,
mais build, C5 e 14 cenários de celular. Permaneceram 30 testes pulados nas
suítes de cadastro, funções e proxy. A prova SQL focada acima rodou à parte.
O build manteve o aviso de importação estática dos relatórios. `openspec validate
--strict` sinalizou a extensão do requisito VIS-018 já presente na base.

### A7 — cadeia de instalação e contrato do cofre

O relatório noturno registra a aplicação de `20261125020000` no projeto de teste.
O commit `b6aa78c` adicionou uma correção com versão anterior, `20261124160000`, e
documenta uma gravação em produção. Isso é evidência versionada da época. O estado
atual dos ambientes e o registro da versão `20261124160000` não foram consultados.

- **Instalação limpa.** A ordem lexical executa a correção primeiro. Em banco vazio,
  ela tenta conceder privilégios a um papel ainda inexistente e a transação falha.
  Criar só o papel antecipadamente deixa a criação posterior em conflito e ainda
  permite que a migration original sobrescreva a função corrigida. O teste focado
  do cofre carrega a original e então a correção manualmente, em ordem de dependência.
- **Comportamento do cofre.** A proposta, o design e o delta em
  `cadastro-segredos-integracoes` exigem preservar o valor anterior no Vault. A
  correção versionada usa `vault.update_secret` no mesmo registro e mantém autoria,
  versão e auditoria, com as versões referenciando o mesmo UUID do Vault. O teste
  versionado passou a exigir um único registro para duas versões. O próprio commit
  registra a mudança de retenção como sujeita à confirmação. Corrigir a ordem
  resolve a dependência de instalação. Conciliar a retenção exige decisão própria.
- **Opção para instalação limpa.** Aprovar um baseline para novos ambientes ou um
  manifesto de instalação que execute as versões imutáveis pela dependência antes
  de assumir a sequência normal. Um baseline pede prova de equivalência de schema,
  owners, grants e políticas. Um manifesto pede prova de histórico e de que a
  versão tardia é registrada uma única vez. Ambos exigem validar o Vault com o
  migrador sem superusuário e instalar as migrações subsequentes.
- **Opção para upgrade.** Uma migration de convergência com versão nova pode
  levar os ambientes já instalados ao comportamento aprovado, preservando histórico
  e metadados. Ela exige inventário autorizado por ambiente e provas dos dois estados
  de partida, com e sem a correção de `b6aa78c`. Uma migration posterior por si só
  não resolve a instalação vazia, que para primeiro em `20261124160000`.
  A decisão de retenção define as asserções de substituição e o tratamento dos
  registros já rotacionados. Valores sobrescritos não são recriados por migration.

### Prova local da jornada de vínculo

No Chromium, `node --experimental-strip-types scripts/prova-celular/vinculo-caso-producao.mjs`
serve o build existente em loopback com porta efêmera. Dois contextos do navegador
simulam sessões independentes. A administradora abriu Carteira → ficha → Mais seções
→ Equipe com acesso, concedeu ao profissional fictício e revogou pelo diálogo.
O profissional abriu o caso pela própria carteira após a concessão. A rota do outro
caso foi recusada e a rota do caso concedido foi recusada após a revogação.

Em PostgreSQL 17 descartável no Docker rootless, `testar-acesso-paciente-autorizacao-local.sh`
rodou sem rede, em socket privado. A prova versionada carrega as migrações de RLS e de
vínculo de anamnese aplicáveis. Com os dois atores e anamnese nos dois casos, confirmou
carteira com um único caso após concessão, leitura desse caso, recusa do outro caso
e carteira vazia e leitura recusada após revogação. A concessão à própria administradora
ficou somente no SQL. A UI usa um dublê HTTP com estado e o SQL usa as RPCs reais com
atestado fictício. O roteiro integrado abaixo complementa essas duas verificações.

### Prova integrada com Auth e proxy locais

O roteiro `scripts/prova-celular/vinculo-caso-integrado.mjs` serve o pacote React
com o Vite Preview e encaminha as rotas da jornada aos handlers Netlify reais.
Chromium usa dois contextos isolados. Os dois atores fazem login interno pelo Auth local,
com cookies do SDK, Vault local e operações atestadas. A prova roda em loopback com
Supabase API 56721, PostgreSQL 56722 e proxy 56730 no Docker rootless.

A cadeia original recusou A7 com SQLSTATE `42704`. Na cópia descartável, os
contornos abaixo mantiveram o SQL versionado do repositório intacto:

1. A correção do cofre `20261124160000` foi executada depois de `20261125020000`.
   Os pares com versões duplicadas `20261125030000` e `20261125040000` receberam
   números distintos só no manifesto temporário, após recusa `23505`.
2. A guarda de fonte de `20261125170000` encontrou corpos divergentes nas operações
   de concessão e de cofre. Na cópia descartável, foram recalculados somente os
   hashes de entrada e saída para aplicar os mesmos dois fragmentos de autenticação
   a cada corpo. As âncoras continuaram únicas e a guarda de owner/ACL foi executada.
3. A instalação resultante admitiu os dois atores, mas o POST real de concessão
   falhou com `42501` no validador do transporte: `20261124200000` sobrescreve o
   corpo que aceitava e validava `reserva_id` e `geracao_reserva`.
   Para diagnóstico local, recompôs-se o corpo com reserva de `20261112220000`,
   os mesmos fragmentos de autenticação de `20261125170000` e a conferência de
   destinatário de `20261124200000`. As RLS originais continuaram aplicadas.
   Esse ajuste descartável pede uma correção versionada e revisão próprias antes
   de qualquer ativação.

A prova também reproduziu a ficha fechando quando somente a Anamnese retornava
`403` à administradora da carteira integral sem vínculo clínico. A recusa agora
fica no bloco de Anamnese para esse perfil e capacidade. Reautenticação e perda
de acesso nas demais situações continuam com o tratamento anterior.

Com esse bootstrap, a execução de ponta a ponta passou. Os dois logins internos
retornaram `200`. A administradora chegou a Equipe com acesso sem vínculo clínico
próprio, reservou, concedeu, conferiu o recibo, revogou e conferiu o último recibo.
Concessão e revogação retornaram `200`. O profissional abriu o primeiro caso e
leu Anamnese (`200`), teve a rota do segundo caso recusada com leitura direta
`403` e, após revogação, perdeu a ficha e recebeu `403` no primeiro caso.
Avisos e audiência financeira estavam desligados nessa stack. Nenhuma sessão,
chave ou dado real foi usado. A instalação limpa versionada continua bloqueada.
Ao fim, o banco descartável registrava um vínculo revogado, zero destinatários
administradores e um evento permitido para cada mutação.

Depois da prova integrada, `pnpm run verificar:ativacao` saiu com código 0.
Passaram 898 testes web, 736 do proxy, 324 das funções, 207 de contrato,
137 de cadastro, o build, C5 e 14 cenários de celular. Permaneceram 30 testes
pulados nas suítes de cadastro, funções e proxy. A stack descartável foi encerrada.

### Revisão da recusa isolada de Anamnese

Em `ffecb168`, o perfil e a capacidade capturados na montagem bastavam para
absorver um `403`. A RPC reúne motivos de recusa e o proxy devolve esse erro antes
da revalidação final do caminho de sucesso. A Visão do caso agora conserva a ficha
somente após `consultarSessao()` confirmar a mesma sessão e o mesmo usuário,
administrador com carteira integral. Perda de elegibilidade ou falha de confirmação
retira a visão. Uma sessão recusada segue o fluxo existente de nova entrada.

Com Chromium, handlers Netlify e Auth/PostgreSQL reais no Docker rootless, a
recusa isolada retornou `403`, a consulta posterior de sessão retornou `200`
e a ficha ficou disponível. Na corrida controlada, o roteiro segurou esse mesmo
`403` real, esperou as demais leituras retornarem `200`, encerrou a sessão pelo
handler real e liberou a resposta. A reconsulta retornou `401`, retirou a ficha
e mostrou a entrada. O profissional recebeu `403` no outro caso e, após
revogação, perdeu a ficha já aberta ao voltar à Visão do caso sem recarregar.
Reserva, autorização, revogação e conferência do recibo passaram pelo proxy real.
As quatro provas de navegador continuam dependentes do bootstrap descartável
descrito acima. A suíte focada de Visão do caso passou com 16 testes e
`verificar:rapido` passou.
