# Proposal

## Why

O grupo 2 de `turno-e-execucao-do-cuidado` prepara abertura e consulta, mas ainda não oferece interação na ficha da equipe. Esta fatia torna esse recorte utilizável sem esperar relatórios, aferições ou passagem de turno.

## What Changes

- Seção de turno próprio na ficha da equipe, com consulta, abertura explícita e recuperação de operação pendente.
- Consulta auditada `GET /api/pacientes/:paciente_id/turnos/atual`, retornando turno aberto do profissional atual ou `null`, para recuperar após recarga sem guardar dados clínicos no navegador.
- Reuso das reservas e reconciliação existentes; autorização permanece no servidor e banco.
- Encerramento clínico indisponível até a síntese publicada do grupo 3. A tarefa 13.1 original permanece aberta.

## Capabilities

### New Capabilities

- `turno-proprio-interface`: interação de abertura e consulta própria vinculada a FR-055, sem duplicar o domínio de turno da change principal.

### Modified Capabilities

Nenhuma spec principal alterada. FR-055 está no delta ainda não sincronizado de `turno-e-execucao-do-cuidado`.

## Impact

`web/servico-turno-http.ts`, `web/turno-proprio.ts`, contratos HTTP, handler/RPC de consulta atual e migration aditiva local. Sem dependência nova, deploy, migration remota ou ativação. Autorização de 18/11/2026 permite implementar localmente após planejamento; validações adiadas pelo solicitante.
