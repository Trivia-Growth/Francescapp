# Proposal

## Why

Orientações (FR-019, implementadas no commit `f51f4f9`, sem change própria registrada) só
tinham trilha de autorização para colaborador. O solicitante autorizou, no trabalho de
`experiencia-minima-do-mock`, estender a família a plano de cuidado, documentos e orientações
com um padrão único: ela só lê o que estiver explicitamente marcado como público. Esta change
registra a fatia de orientações dessa decisão, que não tinha "change própria" para receber a
atualização.

## What Changes

- Coluna aditiva `visibilidade` (`interna` | `publica`) em `cadastro.orientacao_versao`, em
  claro, mesma vocabulário de plano de cuidado (`visibilidadeObjetivoSchema`, reaproveitado, não
  duplicado).
- Nova trilha de autorização em `api.orientacao_operacao_privada`, só para
  `api.ler_orientacoes` — mesma prova de `api.consultar_paciente_familiar_privado`. Família
  nunca grava orientação.
- Leitura filtra pela última versão de cada orientação: família só vê as marcadas `publica`;
  colaborador continua vendo todas, sem filtro.
- Interface: seletor de visibilidade no formulário de registro/substituição (colaborador);
  modo somente-leitura para família na ficha.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `plano-e-coordenacao` (FR-019): família ganha leitura de orientações marcadas públicas.

## Impact

Contratos (`packages/contracts/src/orientacao.ts`), camada nativa
(`netlify/functions/_shared/orientacao-nativa.ts`), SQL
(`supabase/migrations/20261117260000_orientacao_visibilidade.sql`,
`20261117270000_orientacao_familia_privada.sql`) e interface (`web/orientacoes-local.ts`,
`web/orientacoes.ts`, `web/servico-orientacoes-http.ts`, `web/main.ts`). Nenhuma migration
aplicada remotamente, nenhuma flag alterada, nenhum deploy — decisão e operação remota
continuam à parte, como em todo o trabalho desta sessão.
