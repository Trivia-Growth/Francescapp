# Proposal

## Why

FR-002 (mapa de pessoas com vínculos distintos) e FR-005 (rotina, recursos, barreiras, preferências, pontos fortes e o que o paciente considera importante) são requisitos de fase Inicial sem implementação. As tabelas órfãs `cadastro.pessoa_relacionada` e `cadastro.relacao_paciente`, criadas em `20261017113000`, não atendem FR-002: guardam a relação como texto livre cifrado e admitem uma linha por par paciente/pessoa, o que não expressa os sete vínculos tipados nem mais de um vínculo para a mesma pessoa.

## What Changes

- Criar `cadastro.contexto_cuidado_versao` e `cadastro.rede_cuidado_versao`: documentos versionados, imutáveis e cifrados por paciente, no mesmo molde de `cadastro.anamnese_versao`.
- Criar as operações privadas `api.contexto_cuidado_privado` e `api.rede_cuidado_privado`, cada uma com owner dedicado, autorização revalidada sob trava, idempotência por chave e auditoria obrigatória em todo caminho, inclusive negativa de identidade Auth sem perfil.
- Expor duas rotas Netlify desligadas por flag, com validação de domínio na fronteira, e duas telas montáveis para a ficha.
- Manter o vínculo de FR-002 estritamente descritivo: ele não concede acesso nem soma permissão. A autorização continua em `cadastro.acesso_paciente` e na concessão de equipe.
- Manter o vínculo de FR-005 com objetivos do plano dentro do próprio documento cifrado, sem tocar em `objetivoSchema`, que já está em produção.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `caso-e-anamnese`: entregar FR-002 e FR-005 na fase Inicial.

## Impact

Duas tabelas novas, dois owners novos, duas rotas desligadas por flag e duas telas não ligadas em `web/main.ts`. Nenhuma migration existente é alterada. Nenhuma operação remota é autorizada por esta change.
