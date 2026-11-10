# Tasks

## 1. Preparação local

- [x] 1.1 Após revisão desta change, implementar contrato local dos campos de FR-008 em `packages/contracts/`, sem persistência, audiência ou envio. Dependência: proposta e delta revisados. Evidência: teste isolado `relato-textual.test.ts` passou (2 testes); dados fictícios cobrem obrigatórios, opcionais e ausência de data ou descrição.
- [x] 1.2 (feito em 10/11/2026) Revisar o diff pelos eixos de padrões e especificação; executar `pnpm run verificar:rapido` e o teste novo isolado conforme AGENTS.md. Dependência: 1.1. Evidência: `relatoTextualSchema` (`packages/contracts/src/relato-textual.ts`) exige `dataAcontecimento` e `descricao` não vazia, mantém `categoria`/`contexto`/`acaoTomada`/`solicitacaoRetorno` opcionais e usa `.strict()` — confirmado que campo de autoridade (`audiencia`) é rejeitado, coerente com a proposta de não declarar audiência/publicação nesta fatia. `relato-textual.test.ts` cobre positivo mínimo e completo, e negativo de obrigatório ausente, descrição em branco, data inválida e campo de autoridade. `pnpm run verificar:rapido` (lint 460 arquivos, typecheck de todos os pacotes) e o teste isolado passaram. Sem persistência, rota ou operação remota nesta fatia — nada a ativar além desta revisão.

## Limites para etapa futura

Publicação, dados reais e integração exigem outra revisão de escopo, fundação de identidade/vínculo/audiência comprovada, instruções de crise aprovadas e definições de retorno. Áudio, anexos, retificação e estados de envio/consulta/retorno permanecem requisitos iniciais não entregues aqui. Nenhuma operação remota está autorizada por esta change.
