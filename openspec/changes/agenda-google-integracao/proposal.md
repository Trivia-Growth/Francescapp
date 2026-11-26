# Proposal

## Why

A agenda integra o núcleo inicial, mas sua conexão Google e as regras operacionais ainda precisam de decisões antes de implementação segura.

## What Changes

- Detalhar consulta, criação, alteração e cancelamento nas agendas autorizadas, com origem, autoria e confirmação externa (FR-023/025/049/050, Inicial).
- Preservar consulta e edição global separadas, sem conceder acesso clínico pela agenda.
- Registrar decisões materiais pendentes antes de definir tarefas executáveis; não ativar integração ou operar dados reais.
- Manter bloqueada operação incerta de conta anterior inacessível até comprovação na origem; não presumir revogação Google pela desconexão local.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `agenda-e-carteira`: detalhar integração Calendar e confirmação de operações, preservando requisitos e jornadas existentes.

## Impact

Contratos de agenda, autorização de identidade, caso e audiência, integração Google e interface futura. Carteira, avisos e registro de realização permanecem no núcleo inicial, fora deste recorte. A meta autoriza configuração, operações e migrações no projeto de teste e publicação manual; ativação depende de provas e revisão. Isso não autoriza dados reais nem limpeza.
