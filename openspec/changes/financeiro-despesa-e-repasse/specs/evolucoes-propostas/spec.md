# Spec Delta

## MODIFIED Requirements

### Requirement: FR-047 — Acompanhar despesas relacionadas ao cuidado, autorização e comprovantes, separando acesso

**Fase de origem**: Evolução.

Acompanhar despesas relacionadas ao cuidado, autorização e comprovantes, separando acesso financeiro de dados de saúde. Cobrança, contabilidade e gestão de investimentos não integram este requisito.

Por decisão de 17/11/2026, este requisito deixa de ser evolução proposta e passa a integrar o produto, detalhado em FR-069. A separação entre acesso financeiro e dados de saúde SHALL ser controle de autorização verificado no servidor e no banco, não organização de tela: audiência de cuidado NÃO SHALL conceder acesso financeiro, e audiência financeira NÃO SHALL conceder acesso a conteúdo clínico.

#### Scenario: Condição de aceite FR-047

- **WHEN** a funcionalidade FR-047 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Acompanhar despesas relacionadas ao cuidado, autorização e comprovantes, separando acesso financeiro de dados de saúde. Cobrança, contabilidade e gestão de investimentos não integram este requisito.

#### Scenario: Separação provada nas duas direções
- **WHEN** pessoa com audiência de cuidado consulta o financeiro, e pessoa com audiência financeira consulta conteúdo clínico do caso
- **THEN** ambas as operações são negadas no servidor e no banco, e nenhuma das duas audiências é inferida a partir da outra
