# Spec Delta

## ADDED Requirements

### Requirement: Histórico contínuo por paciente

O acompanhamento SHALL manter histórico contínuo por paciente, preservado nas pausas e retomadas, sem dividir o cuidado em episódios independentes ou exigir novo histórico a cada retorno. Registros anteriores SHALL preservar datas, autoria, versões e audiências. Fase Inicial; complementa FR-001 a FR-007, sem promover a evolução FR-022 ao núcleo.

#### Scenario: Pausar o acompanhamento

- **WHEN** uma alteração autorizada colocar o acompanhamento em pausa
- **THEN** a situação mantém data e motivo conforme FR-001 e os registros anteriores permanecem no histórico do paciente, respeitadas suas audiências.

#### Scenario: Retomar o acompanhamento

- **WHEN** ocorrer uma retomada autorizada do acompanhamento
- **THEN** os novos registros continuam o histórico do mesmo paciente; a retomada não apaga ou sobrescreve registros e versões anteriores nem exige cadastro de outro paciente para reiniciar o diário.

#### Scenario: Consultar períodos anteriores

- **WHEN** um participante autorizado consultar o histórico por período
- **THEN** pode localizar os registros permitidos antes e depois de uma pausa, distinguindo acontecimento, registro e retificação; continuidade não elimina os filtros ou a procedência da informação.

#### Scenario: Retomada não restaura autorização revogada

- **WHEN** o acompanhamento for retomado e um participante estiver sem vínculo ou com autorização revogada
- **THEN** o histórico contínuo não restaura seu acesso; consultas e ações continuam sujeitas a perfil, vínculo e audiência válidos.
