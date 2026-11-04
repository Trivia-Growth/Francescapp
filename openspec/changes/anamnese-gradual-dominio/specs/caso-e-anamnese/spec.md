# Spec Delta

## ADDED Requirements

### Requirement: Identificação parcial de pendências da anamnese

Para apoiar FR-003 (fase Inicial), o domínio SHALL identificar campos esperados sem resposta ou com estado pendente, agrupados por seção fornecida. A identificação não SHALL declarar completude clínica nem substituir FR-003 integral.

#### Scenario: Campo ausente ou pendente

- **WHEN** uma seção fornecida contiver campo esperado sem resposta ou com estado pendente
- **THEN** o resultado identifica a seção e distingue os campos ausentes dos pendentes.

#### Scenario: Informação desconhecida ou não aplicável

- **WHEN** campo esperado tiver resposta desconhecida ou não aplicável
- **THEN** o resultado não o identifica como ausente ou pendente, sem inferir informação clínica.

#### Scenario: Proveniência de resposta resolvida

- **WHEN** uma resposta informada, desconhecida ou não aplicável for representada no domínio
- **THEN** sua fonte e data permanecem associadas à resposta; informação relatada não se torna diagnóstico confirmado por essa representação.
