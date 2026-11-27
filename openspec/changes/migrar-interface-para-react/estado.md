# Estado — migrar-interface-para-react

**Atualizado em:** 27/11/2026 · **Branch:** `claude/migrar-bloco-turno` · **Por:** Claude Code

## Onde está

Bloco turno/plantão (tarefa 5.2, leva 2) em migração, um commit por módulo. Alvo da
sequência de blocos: `web/ui/` sem importador, para apagar `ui/` e `ui.css`.
Importadores de `web/ui/` fora de testes: **17** (eram 22 na `main` `80f7583`).

## Última tarefa concluída

- 5.2 leva 2 — `ficha-plantao` migrado para `.tsx` (`FichaPlantao`). Rascunho do servidor
  entra como valor inicial dos controles, por cima do publicado; cada recarga troca a chave
  do formulário. `scripts/prova-celular/ficha-plantao.ts` passa a importar por `.js`.
  Antes: `-arquivos` (`89777de`), `-localizacao-coordenacao` (`1f6fc3a`),
  `-relatorios` (`97c0710`), `-gestao` (`6dd2f59`).
- Evidência: `ficha-plantao.test.ts` 8/8 sem mudança de asserção (só o especificador);
  `contrato-visual.test.ts` e `textos-obrigatorios-nao-configuraveis.test.ts` verdes;
  `pnpm run verificar:rapido` verde. Prova de celular da ficha ainda não executada nesta
  branch (entra no portão de fechamento do bloco).

## Próximo passo

- `turno-execucao`, `turno-execucao-integracao`; depois retirar as fábricas imperativas de
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
