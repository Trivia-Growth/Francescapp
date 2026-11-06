# Proposal

## Why

Enquanto o acesso Google está indisponível, é necessário colher feedback de uma demonstração local com cadastros fictícios que persistam entre reinícios.

## What Changes

- Disponibilizar acesso por senha ao servidor local e cadastro e consulta persistentes de pessoas fictícias.
- Identificar a demonstração e a restrição a dados fictícios; falhas de acesso ou armazenamento não devem parecer sucesso.
- Excluir deploy, integrações remotas, dados reais e autenticação ou autorização de produção. FR-035 e demais requisitos de identidade permanecem inalterados; este acesso não comprova seu atendimento.

## Capabilities

### New Capabilities

- `feedback-local-ficticio`: acesso e cadastro persistente exclusivos da demonstração local.

### Modified Capabilities

Nenhuma.

## Impact

Scripts de feedback local e interface de demonstração em `web/demonstracao.*`. Não altera o sistema conectado de produção nem suas decisões de identidade.


A demonstração inclui revisão e armazenamento local de relatos fictícios por paciente, para feedback visual; não é envio nem publicação clínica.
