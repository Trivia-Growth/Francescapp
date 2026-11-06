# Proposal

## Why

Objetivos e revisões precisam permanecer acessíveis por caso para coordenar o cuidado sem apagar compromissos anteriores. FR-015 e FR-016 são requisitos iniciais de referência, ainda sem implementação comprovada.

## What Changes

- Planejar registro de objetivos da pessoa e da equipe, área, responsável, situação inicial, observação do progresso e data de revisão por caso.
- Preservar estados previstos e histórico consultável de revisões, com motivo, data e responsável; manter dados vinculados ao caso e sujeitos à autorização e audiência aplicáveis.
- Planejar jornada conectada com dados fictícios, sem afirmar que persistência ou integração já funcionam.
- Excluir tarefas, encaminhamentos, orientações, plano de crise e evoluções FR-021/022 deste recorte. Não chamar o plano de PTS sem validação da equipe.
- Pendentes: campos e responsáveis de validação clínica, periodicidade por caso, matriz de leitura e escrita por perfil, vínculo e audiência. Não inferir regras clínicas nem acesso familiar.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `plano-e-coordenacao`: detalhar cenários de FR-015/016 sem alterar sua fase Inicial.

## Impact

Futuras alterações em contratos, servidor, persistência Supabase e interface; integração e migração remota não estão autorizadas por esta proposta. Depende da fundação de identidade, autorização e caso, cujas evidências devem ser verificadas no momento da implementação.
