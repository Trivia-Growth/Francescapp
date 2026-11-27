# Estado — migrar-interface-para-react

**Atualizado em:** 27/11/2026 · **Branch:** `claude/migrar-bloco-turno` · **Por:** Claude Code

## Onde está

Bloco turno/plantão (tarefa 5.2, leva 2) em migração, um commit por módulo. Alvo da
sequência de blocos: `web/ui/` sem importador, para apagar `ui/` e `ui.css`.
Importadores de `web/ui/` fora de testes: **15** (eram 22 na `main` `80f7583`).

## Última tarefa concluída

- Costura da síntese desarmada: `modelo-sintese.ts` vira `modelo-sintese.tsx`
  (`CamposSintese`, `lerSintese`, `controleSintese`), composto em `diario.tsx` e
  `passagem-turno.tsx` — nenhum dos dois monta mais DOM à mão num contêiner com ref. Ids,
  precedência de valores da Passagem (tentativa → rascunho → digitado) e remontagem por
  consulta preservados. `montarCamposSintese` continua exportada como ilha, só para a prova.
- Evidência: 21 arquivos de prova que tocam Diário, Passagem e Turno, 139/139, sem mudança de
  asserção (`modelo-sintese.test.ts` só mudou o especificador); `verificar:rapido` verde.

## Próximo passo

- `turno-execucao-integracao` em `.tsx`, com a costura de `turno-proprio.tsx` desarmada:
  `renderizarExecucao` no lugar de `montarExecucao`, Passagem composta direto, e
  `montarConsentimentoTurno` virando hook com componente. Aprovado pela coordenação em
  27/11/2026 com a condição de não mudar asserção de `turno-proprio`, `-abertura` e
  `-localizacao`.

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
