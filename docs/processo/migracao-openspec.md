# Migração do processo de desenvolvimento com IA

**Data**: 14/10/2026. **Autorização**: o solicitante confirmou a adoção do conjunto OpenSpec, diretrizes para agentes e processo de implementação/revisão observado no HED Transportes.

## Escopo executado

- OpenSpec inicializado no repositório para Codex e Claude, com explore, propose, update, apply, sync e archive.
- Diretrizes adaptadas em `AGENTS.md`, contexto para Claude em `CLAUDE.md` e contexto de produto/visual em `PRODUCT.md` e `DESIGN.md`.
- Requisitos migrados em oito capacidades, preservando FR-001 a FR-054, suas fases e as 12 jornadas. Critérios SC-001 a SC-012, regras transversais, hipóteses, esclarecimentos e pendências preservados em `docs/projeto/contexto-negocio.md`.
- Decisões e referência Atendimento mantidas em `docs/projeto/`. A confirmação de uso do Drive e a autorização para sugerir pastas foram registradas; nenhuma organização de arquivos foi escolhida.
- Spec Kit movido para `docs/legacy/spec-kit`, incluindo suas skills, sem alteração dos conteúdos históricos.
- Impeccable atualizado e boas práticas React instaladas no repositório. O hook Impeccable existente foi preservado.
- Comandos/skills OpenSpec do Claude foram liberados seletivamente no Git; configurações pessoais continuam ignoradas.

## Ferramentas e origem

| Ferramenta | Origem / versão verificada |
| --- | --- |
| OpenSpec | CLI local `1.14.1`; skills geradas por `openspec init`. Para reproduzir a CLI: `npm install -g @fission-ai/openspec@1.14.1`. |
| Impeccable | Skill `4.5.2`, engine `0.1.14`, atualizados pelo instalador oficial; binário específico da máquina permanece ignorado. |
| React Best Practices | `vercel-labs/agent-skills`, caminho `skills/react-best-practices`, revisão `063bee94c3f4df8453406c830b0a7df0f2860278`, instalada com a skill `skill-installer`. |
| Referência de processo | HED Transportes local: OpenSpec, diretrizes, produto/design e tarefas rastreáveis; nenhuma alteração feita naquele projeto. |
| Referência de código | Atendimento, conforme registro próprio em `docs/projeto/referencia-atendimento.md`; não substituída pela arquitetura demonstrativa do HED. |

Não foram instaladas dependências da aplicação ou escolhidas versões da futura stack de produção. Não há automação de troca de modelo nem agentes disparados por padrão.

A skill React mantém o conteúdo original da revisão fixada, inclusive os espaços finais usados em Markdown. Uma regra de whitespace em `.gitattributes` é restrita a essa dependência vendorizada; os documentos do projeto continuam com verificação normal.

## Rastreabilidade e validação

- [Mapa dos requisitos](rastreabilidade.md): uma capacidade por requisito, sem renumeração ou promoção de fases.
- `node scripts/check-framework-migration.mjs`: verifica condições originais, fases, jornadas, metas, esclarecimentos, bytes históricos e links locais.
- `openspec validate --all --strict --no-interactive`: verifica a estrutura das oito specs.
- `git diff --check`: verifica problemas de whitespace.

Os cenários “Condição de aceite FR” foram acrescentados como adaptação estrutural ao OpenSpec, reproduzindo as condições originais. As jornadas completas continuam preservadas. A migração não substitui a descoberta nem cria testes de produto executados.

## Limite de prontidão

A troca do processo está concluída; a aplicação de produção não está declarada pronta para implementação integral. Ainda faltam decisões registradas na fundação, sobretudo espaço/acesso do Drive, transcrição/IA, recorte das entregas, operação e políticas de dados.

Não foram criadas tarefas de produção ou mudanças artificiais com checkboxes concluídos para sugerir que essas decisões estão resolvidas. O próximo trabalho usa `openspec-explore`; uma entrega aprovada será proposta em uma mudança OpenSpec e implementada apenas após revisão/autorização.

Nenhum mockup, HTML/PDF comercial, segredo, ambiente externo ou projeto de referência foi modificado pela migração.
