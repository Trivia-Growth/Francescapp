# Proposal

## Why

Documentos são parte do núcleo inicial, mas ainda não há jornada conectada ao Drive institucional nem contrato de acesso validado. Esta mudança prepara sua implementação sem antecipar decisões materiais.

## What Changes

- Detalhar guarda e acesso a anexos no Drive compartilhado, com vínculo ao paciente, classificação, audiência e revogação (FR-029 a FR-031, fase Inicial).
- Explicitar indisponibilidade e proibir substituição silenciosa de armazenamento.
- Separar contrato local confirmado da integração real, condicionada às decisões e autorizações pendentes.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `documentos-institucionais`: detalhar guarda e canais de acesso institucionais confirmados em `registrar-fundacao-real`.

## Impact

Contratos de domínio, autorização de caso/audiência, integração Google Drive e interface futura. Nenhum deploy, migração remota ou alteração do Drive é autorizado por este artefato. Exportação FR-032/033 e FR-034 (Evolução) ficam fora do recorte.
