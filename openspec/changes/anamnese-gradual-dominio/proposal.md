# Proposal

## Why

FR-003 exige anamnese gradual e identificação de seções incompletas. Um recorte de domínio permite exercitar estados e pendências sem antecipar decisões clínicas ou simular persistência.

## What Changes

- Definir recorte parcial para representar estados de resposta e identificar campos ausentes ou pendentes entre os esperados fornecidos pelo chamador.
- Preservar fonte e data associadas às respostas resolvidas; não inferir diagnóstico ou conteúdo.
- Registrar que o módulo local existente é trabalho em andamento, sem comprovar integração nem FR-003 completo.
- Excluir definição de seções, campos, critérios clínicos de completude, armazenamento, permissões e uso de dados reais.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `caso-e-anamnese`: detalhar comportamento parcial de FR-003, fase Inicial, sem alterar ou substituir requisito original.

## Impact

Domínio TypeScript e testes locais em `packages/cadastro`; eventual interface e persistência dependem de mudança posterior. Antes de dados reais, definir modelo e regras de preenchimento, controle de acesso por paciente e audiência, proteção e recuperação de dados, além de comprovar autorização no servidor e banco e integração real. Não há autorização para operação remota.
