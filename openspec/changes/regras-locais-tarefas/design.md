# Design

## Context

FR-017 é referência funcional, não evidência de implementação. Há uma demonstração local existente em `web/demonstracao.html` e `web/demonstracao.ts`; o projeto também mantém regras de domínio em pacotes próprios. Ver proposta e delta para o recorte.

## Goals / Non-Goals

**Goals:** Isolar regras confirmadas de conclusão e estados para exercício local com exemplos fictícios.

**Non-Goals:** Persistência, integração, autorização, classificação de prioridade ou uso com dados reais.

## Decisions

- Usar regras puras e prévia local, aproveitando padrões existentes. Alternativa conectada dependeria de autorização por caso e decisões materiais ainda não definidas.
- Preservar ação ou justificativa na conclusão; rejeitar valores vazios. Não especificar transições adicionais nem níveis de prioridade, pois não foram confirmados.
- Não inferir autorização de identidade, vínculo, audiência ou agenda a partir da demonstração. A integração futura exige desenho e provas próprios.

## Risks / Trade-offs

- [Prévia confundida com produto conectado] → Identificação visível de dados fictícios e ausência de persistência.
- [Regras locais confundidas com FR-017 completo] → Manter requisito integral e pendências explícitos; não declarar aceitação completa.
