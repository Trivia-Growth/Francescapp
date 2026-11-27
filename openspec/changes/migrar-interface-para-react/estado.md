# Estado — migrar-interface-para-react

**Atualizado em:** 27/11/2026 · **Branch:** `migracao/controles-react` · **Por:** Codex

## Retirada do observador de controles

A agenda individual adota `SelecaoAprimorada` em Situação e Motivo. O nativo já nasce
no invólucro com `data-aprimorada`, que o observador pula. As seis inscrições de
`main.ts` seguem ativas até cadastro, administração e ficha migrarem e comprovarem
a convivência. Regras e Início não renderizam os tipos de controle observados.

- `pnpm run verificar:celular agenda-individual-controles.pw.ts` passou em Chromium a
  390 × 844 com o tema real e dublês HTTP. O observador processou um select legado de
  prova. Motivo entrou e saiu três vezes, seus valores chegaram ao FormData, e a
  recusa simulada da gravação (403) apareceu no formulário. Início e Fim da operação
  permaneceram `datetime-local` sem invólucro.
- Contraprovas revertidas: a regra de opacidade alterada para `1` falhou em
  `#realizacao-situacao` com esperado `0` e recebido `1`. Sem `data-aprimorada`,
  o observador gerou dois invólucros e a prova esperava um. Nenhuma falha foi por
  tempo esgotado.
- Próximo passo: levar o mesmo contrato a cadastro, administração e ficha, com
  uma contraprova por região. Antes de remover o contorno de chave em
  `selecao-profissional`, reproduzir e relatar a falha que ele evita.
- A remoção integral de `web/ui/` segue em tarefa própria. Restam `main.ts`
  (`botao`/`linhaLista`), a frente de `confirmacao.ts`, três módulos da
  demonstração com decisão pendente e o import de `ui.css` no tema.

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
