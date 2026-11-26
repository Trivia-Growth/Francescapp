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

- [ ] **7.1 [C]** Remover `web/ui/` vanilla e as regras de `web/styles.css` substituídas.
  *Dependência:* Fase 6 completa.
  *Evidência:* nenhuma tela importa o CSS removido; captura sem regressão.

- [ ] **7.2 [C]** Remover `web/ponte/ilha.ts` e o último `montar*` imperativo.
  *Evidência:* `rtk grep -rn "export function montar" web/` sem resultado.

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
- [ ] **A3. `solicitacoes-titular.ts` envia `paciente_id` em `responder`, e
  `responderSolicitacaoTitularSchema` é `.strict()` sem esse campo.** A rota está desligada
  por `ffcm.lgpd.ativa`, então o efeito não aparece hoje — mas aparece no dia em que ligar.
- [ ] **A4. `servico_indisponivel` com dois significados.**
  `web/preautorizacoes-familiares.ts` apresenta esse código como "o acesso da família ainda
  não foi liberado", enquanto `web/servico-preautorizacoes-http.ts` usa o mesmo código para
  falha de rede. Nada é concedido a mais; a mensagem é que mente sobre a causa.
- [ ] **A5. `montarPreautorizacoesFamiliares` não confere o `paciente_id` dos itens**, e o
  módulo irmão `montarDadosFamiliar` confere. Não é brecha, porque servidor e banco
  autorizam; é inconsistência entre irmãos.
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
- [ ] **A7. Cadeia de migrações sem superusuário já quebra** em
  `20261124160000_segredos_integracoes_cofre_gerenciado.sql:200`:
  `role "ffcmapp_segredos_integracoes_owner" does not exist`. Anterior a esta mudança.
- [ ] **A8. 30 testes alcançam elementos por `getElementById` de `web/index.html`.** Se a
  casca React trocar esses identificadores, os 30 ficam vermelhos juntos e some a distinção
  entre "seletor mudou" e "regrediu". Migrar a casca em fatia isolada, com os seletores no
  mesmo commit.
- [ ] **A9. `textos-obrigatorios-nao-configuraveis.test.ts` carrega uma lista de caminhos
  `web/*.ts`** que precisa ser atualizada a cada módulo migrado, senão passa a provar
  literal em arquivo que já não roda.

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

- [ ] **C1. Botão de revogar vínculo cortado no celular.** A célula da lista é
  `min-w-0 flex-1 truncate` e o botão de 220px é recortado: lê-se "Selecionar" em vez de
  "Selecionar para revogação". Agravante na mesma lista: os e-mails aparecem como
  `ana.ficticia…`. Numa ação de revogação, não dá para saber quem se está revogando.
  Precisa de coluna que não trunca.
- [ ] **C2. Campos de filtro da Auditoria a 13px.** `input#auditoria-acao` e os dois do
  componente de data. O iOS dá zoom ao focar. Única tela com campo abaixo de 16px.
- [ ] **C3. `<summary>` com 26px de altura** nas listas administradas, contra os 46 de alvo
  de toque. É o controle que abre cada item do catálogo.
- [ ] **C4. Caixas de marcação com 24px de largura** em modelo de ficha, plano e financeiro.
- [ ] **C5. Zod usa `new Function`**, bloqueado pela mesma diretiva de Trusted Types em
  todas as telas. Zod tem caminho alternativo e nada quebrou visivelmente, mas convém
  confirmar no build de produção, que não foi rodado.

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
