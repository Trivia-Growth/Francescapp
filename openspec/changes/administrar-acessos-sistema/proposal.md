# Proposal

## Why

O Administrador consegue conceder acesso Google à equipe, mas não criar pelo sistema uma conta com nome, login e senha. O pedido explícito de 18/11/2026 autoriza quatro funções de acesso e entrada pelo Google da organização ou por conta interna administrada.

## What Changes

- Nova área Administração > Acessos: criar e consultar contas, nome, e-mail de login, função e método de entrada.
- Funções Administrador, Case Manager, Familiar e Profissional; uma função por conta. Case Manager mantém autorização clínica por caso, conforme DF-021.
- Contas internas usam senha no Supabase Auth; contas Google exigem identidade institucional e cadastro aprovado. Senha nunca compõe cadastro de negócio, auditoria, recibo ou consulta.
- Adaptar autorização hoje acoplada exclusivamente ao Google para reconhecer o método interno aprovado, preservando vínculo, audiência, habilitação clínica e revogação.
- Provisionamento auditado e recuperável por operação, com estado honesto quando o resultado do Auth for incerto.
- **BREAKING (regra de admissão):** DF-023 substitui a exclusividade Google da equipe e a restrição da senha à exceção técnica. Convites existentes e acessos válidos permanecem.

## Capabilities

### New Capabilities

Nenhuma. Administração de contas pertence à identidade existente.

### Modified Capabilities

- `identidade-e-convites`: FR-035, FR-052 e novos requisitos de administração de acessos e provisionamento seguro.

## Impact

Supabase Auth nativo; tabelas e RPCs privadas de identidade; admissão e consumidores SQL hoje exclusivos de Google; contratos TypeScript; BFF Netlify; login e nova área web. Não inclui atribuição automática de casos, alteração de senha de contas existentes, exclusão de usuários, troca/revogação de acessos, convite automático, recuperação nova, agenda OAuth ou criação de conta real durante o desenvolvimento.

**SUPOSIÇÕES CONSERVADORAS:** login significa e-mail; cada conta recebe um método aprovado; função Case Manager não atribui casos; conta Familiar sem vínculo entra sem carteira; colisão com conta existente exige resolução separada, sem sobrescrita ou fusão por e-mail.
