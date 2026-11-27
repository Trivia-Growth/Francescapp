# Estado — migrar-interface-para-react

**Atualizado em:** 27/11/2026 · **Branch:** `claude/migrar-bloco-turno` · **Por:** Claude Code

## Onde está

Bloco turno/plantão (tarefa 5.2, leva 2) em migração, um commit por módulo. Alvo da
sequência de blocos: `web/ui/` sem importador, para apagar `ui/` e `ui.css`.
Importadores de `web/ui/` fora de testes: **15** (eram 22 na `main` `80f7583`).

## Última tarefa concluída

- `turno-execucao-integracao` em `.tsx` (`TurnoComExecucao`): consentimento, turno, execução
  e passagem numa árvore só. Costura de `turno-proprio.tsx` desarmada: `renderizarExecucao`
  no lugar de `montarExecucao`, passagem composta (`PassagemTurnoTela`), remontagem por
  objeto de turno preservada com chave. Consentimento virou controlador
  (`criarConsentimentoTurno`) + `ConsentimentoTurno` + `usarConsentimentoTurno`;
  `montarConsentimentoTurno` segue por cima deles para a prova.
- Evidência: `turno-proprio`, `-abertura`, `-localizacao`, `passagem-turno` e
  `turno-execucao` 36/36 sem mudança de asserção. Única mudança de prova: o dublê de
  `./passagem-turno.js` em `turno-execucao-abertura.test.ts` passou a expor o componente
  e captura o mesmo `opcoes.encerrar` por props (a garantia é a mesma: o `encerrar` que o
  turno entrega à passagem). `pnpm run test:web` 905/905 (900 da `main` + 5 provas novas);
  o aviso `Not implemented: navigation` do jsdom já aparece na `main`.
  `verificar:rapido` verde.

## Próximo passo

- Fechar o bloco turno: `pnpm run verificar:ativacao` local, peso do pacote, CI do PR #22.
- Depois: bloco agenda (4 módulos), avulsos, `confirmacao.ts`, `main.ts`.
- Costuras `.tsx → montar*` fora do bloco turno, a reportar antes de resolver:
  `editar-paciente.tsx:440` (`montarSubstituicaoCaseManager`), `selecao-profissional.tsx:409`
  (`montarRevogacaoVinculo`) e `diario.tsx` (`montarEntradaPorAudio` via `AudioOuAtalho`).

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
