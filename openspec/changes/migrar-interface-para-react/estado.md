# Estado — migrar-interface-para-react

**Atualizado em:** 27/11/2026 · **Branch:** `claude/migrar-bloco-turno` · **Por:** Claude Code

## Onde está

Bloco turno/plantão (tarefa 5.2, leva 2) em migração, um commit por módulo. Alvo da
sequência de blocos: `web/ui/` sem importador, para apagar `ui/` e `ui.css`.
Importadores de `web/ui/` fora de testes: **16** (eram 22 na `main` `80f7583`).

## Última tarefa concluída

- 5.2 leva 2 — `turno-execucao` migrado para `.tsx` (`ExecucaoTurno`). O protocolo de
  barreira foi transportado sem reescrita: estado mutável num ref, repintura síncrona onde a
  versão imperativa chamava `controles()`. Fotos, conversão, relatórios, ficha, gestão,
  localização e editor passam a ser COMPOSTOS na mesma árvore — nenhum `montar*` é chamado
  de dentro de `.tsx` neste bloco. `EditorExecucao` e `TelaConversao` exportados; o editor
  aceita trava externa (`travado`). Gestão e ficha disparam a carga inicial fora do efeito.
  Antes: `-arquivos` (`89777de`), `-localizacao-coordenacao` (`1f6fc3a`),
  `-relatorios` (`97c0710`), `-gestao` (`6dd2f59`), `ficha-plantao` (`507c53d`).
- Evidência: 12 arquivos de prova do turno/plantão, 64/64, sem mudança de asserção
  (`turno-execucao.test.ts` só mudou o especificador). Avisos de `flushSync` em ciclo de
  vida: 3 em `turno-proprio.test.ts`, idênticos na `main` `80f7583` (pré-existentes),
  nenhum novo. `pnpm run verificar:rapido` verde.

## Próximo passo

- `turno-execucao-integracao`; depois retirar as fábricas imperativas de
  `turno-execucao-campos.tsx` e resolver a costura da síntese (`modelo-sintese.ts` em
  `diario.tsx` e `passagem-turno.tsx`).

## Bloqueadores

- A7 fica com a frente que já o conduz (branches locais `LmAzevedo94/validar-a7-vault` e
  `LmAzevedo94/inventario-ffcm`); pendências dele são do dono.
- `pnpm run verificar:ativacao` do bloco ainda não executado nesta branch.

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
