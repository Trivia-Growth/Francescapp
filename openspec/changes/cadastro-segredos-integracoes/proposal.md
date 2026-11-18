# Proposal

## Why

O objetivo noturno exige cadastrar dependências pela interface sem SQL manual. Hoje não existe escrita administrativa de segredos.

## What Changes

- Cadastro somente escrita no Vault, exclusivo Administrador no servidor e banco.
- Metadados de presença, versão, autoria e instante; nenhum valor é retornado.
- Substituição preserva versão anterior, mantendo nome canônico para leitores existentes.
- Catálogo fechado: Drive, OpenRouter e client ID/secret Google Calendar.

## Capabilities

### New Capabilities

- `segredos-integracoes`: administração somente escrita de credenciais externas, fase Inicial, conforme bloco 2 do briefing noturno; não altera IDs FR existentes.

### Modified Capabilities

Nenhuma.

## Impact

Contratos, rota Netlify `/api/admin/segredos-integracoes`, RPC privada atestada, migration Vault/metadados e tela administrativa. Sem novos fornecedores, leitura de segredo pela UI, exclusão, rollback de versão ou validação remota de credencial.
