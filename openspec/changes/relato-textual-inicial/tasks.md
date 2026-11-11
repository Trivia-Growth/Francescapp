# Tasks

## 1. Preparação local

- [x] 1.1 Após revisão desta change, implementar contrato local dos campos de FR-008 em `packages/contracts/`, sem persistência, audiência ou envio. Dependência: proposta e delta revisados. Evidência: teste isolado `relato-textual.test.ts` passou (2 testes); dados fictícios cobrem obrigatórios, opcionais e ausência de data ou descrição.
- [x] 1.2 Revisar o diff pelos eixos de padrões e especificação; executar `pnpm run verificar:rapido` e o teste novo isolado conforme AGENTS.md. Dependência: 1.1. Evidência: resultados registrados aqui, sem declarar jornada conectada.

**Revisão (11/11/2026).** Diff de 1.1: `packages/contracts/src/relato-textual.ts` + `test/relato-textual.test.ts` (commit `369da78`), `web/relato-textual.ts` + `.test.ts` (commit `1085004`), consolidados no squash `32bcd31`. `pnpm run verificar:rapido` limpo; `test/relato-textual.test.ts` (2 testes) e `web/relato-textual.test.ts` (4 testes, incluindo injeção de HTML — `<img src=x onerror=...>` confirmado renderizado só como texto, nunca como elemento) passaram.

Eixo padrões: schema `.strict()` rejeita campo de autoridade (`audiencia`) enviado pela entrada — confirmado pelo teste, não só pela intenção. Componente usa só `textContent`/`createElement`, nunca `innerHTML`; aviso de ambiente fictício visível em toda renderização; rascunho preservado após rejeição definitiva do servidor (400/403/404), distinto de resultado incerto. Sem achado.

Eixo spec: campos batem exatamente com FR-008 ("relato simples": data e descrição obrigatórias; categoria, contexto, ação tomada, solicitação de retorno opcionais; áudio fora do recorte, como a proposta já declara). Componente não está montado em rota própria — é usado dentro da prévia maior de `web/demonstracao.ts`, onde o callback `salvar` opcional aponta pra um endpoint fictício de prévia (`/patients/:id/preview`, armazenamento em `localStorage`/`Map` em memória do mock de teste, não um backend real) — consistente com "sem declarar jornada conectada": é demonstração, não integração.

Sem achado em nenhum dos dois eixos. Nenhuma correção necessária.

## Limites para etapa futura

Publicação, dados reais e integração exigem outra revisão de escopo, fundação de identidade/vínculo/audiência comprovada, instruções de crise aprovadas e definições de retorno. Áudio, anexos, retificação e estados de envio/consulta/retorno permanecem requisitos iniciais não entregues aqui. Nenhuma operação remota está autorizada por esta change.
