# Proposal

## Why

FR-003 exige anamnese gradual e identificação de seções incompletas. Um recorte de domínio permite exercitar estados e pendências sem antecipar decisões clínicas ou simular persistência.

## What Changes

- Definir recorte parcial para representar estados de resposta e identificar campos ausentes ou pendentes entre os esperados fornecidos pelo chamador.
- Preservar fonte e data associadas às respostas resolvidas; não inferir diagnóstico ou conteúdo.
- Registrar que o módulo local existente é trabalho em andamento, sem comprovar integração nem FR-003 completo.
- Preparar persistência local com dados fictícios, preservando histórico versionado e controle de acesso; não definir seções, campos ou critérios clínicos de completude.
- Decisão provisória de 04/11/2026: todos os colaboradores ativos com concessão vigente podem consultar e editar anamnese, sem exigir vínculo individual por paciente; regra sujeita à definição da FFCM. Família não recebe acesso por inferência.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `caso-e-anamnese`: detalhar comportamento parcial de FR-003, fase Inicial, sem alterar ou substituir requisito original.

## Impact

Domínio TypeScript e testes locais em `packages/cadastro`; a persistência local requer integração segura ainda pendente. Antes de dados reais, definir regras de preenchimento, audiência, proteção e recuperação de dados, além de comprovar autorização no servidor e banco e integração real. Não há autorização para operação remota.
