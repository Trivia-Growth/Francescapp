# Proposal

## Why

FR-008 e FR-012 exigem diário familiar e rascunho; a preparação local existente não persiste conteúdo.

## What Changes

- Preparar armazenamento local privado para rascunhos textuais cifrados, sem rota nem privilégios de aplicação.
- Reutilizar `cadastro.acesso_paciente` como vínculo revogável, sem atribuir acesso por parentesco.
- Admissão familiar, autorização, publicação, audiência, crise, histórico de retificação e dados reais permanecem bloqueados até implementação e prova próprias.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `diario-e-evolucao`: preparação privada do rascunho textual dos requisitos FR-008 e FR-012, fase Inicial.

## Impact

Migração local de estrutura privada. Nenhuma operação remota, endpoint ou acesso familiar é ativado.
