# Spec Delta

## MODIFIED Requirements

### Requirement: FR-009 — Oferecer modelos curtos de síntese profissional por área, configurados com

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Oferecer modelos curtos de síntese profissional por área, configurados com a equipe: atividade, observações compartilháveis, progresso, orientação e próximo passo. A publicação exige data, autor identificado e síntese. Entre os modelos por área SHALL existir um modelo de passagem de turno, com os mesmos campos, usado como síntese de encerramento em FR-057. O conjunto de modelos permanece configurado pela equipe, sem modelo fixado em código.

#### Scenario: Condição de aceite FR-009

- **WHEN** a funcionalidade FR-009 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Oferecer modelos curtos de síntese profissional por área, configurados com a equipe: atividade, observações compartilháveis, progresso, orientação e próximo passo. A publicação exige data, autor identificado e síntese.

#### Scenario: Modelo de passagem de turno disponível
- **WHEN** profissional autorizado encerra turno e seleciona o modelo de passagem de turno
- **THEN** o modelo apresenta os campos previstos e a síntese publicada registra data, autor identificado e vínculo com o turno encerrado

#### Scenario: Publicação sem síntese é recusada
- **WHEN** a publicação é enviada sem síntese, sem data ou sem autor identificado
- **THEN** a publicação é recusada e nada é publicado

### Requirement: FR-013 — Mostrar ao remetente envio, consulta e retorno, quando aplicável, como

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Mostrar ao remetente envio, consulta e retorno, quando aplicável, como situações distintas. A consulta não encerra automaticamente uma solicitação. O produto SHALL distinguir ainda a ciência registrada — ato explícito do destinatário — da consulta, preservando quem registrou e quando. Ciência NÃO SHALL ser inferida a partir de consulta, abertura de tela ou tempo decorrido.

#### Scenario: Condição de aceite FR-013

- **WHEN** a funcionalidade FR-013 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Mostrar ao remetente envio, consulta e retorno, quando aplicável, como situações distintas. A consulta não encerra automaticamente uma solicitação.

#### Scenario: Ciência registrada é distinta de consulta
- **WHEN** o destinatário autorizado registra ciência de um conteúdo que já havia consultado
- **THEN** a ciência é persistida com identidade e instante, e o remetente passa a ver consulta e ciência como situações distintas

#### Scenario: Ciência não é inferida
- **WHEN** o destinatário apenas consulta o conteúdo, sem ato explícito de ciência
- **THEN** nenhuma ciência é registrada e a situação permanece como consultado

#### Scenario: Falha ao registrar ciência
- **WHEN** o registro de ciência não é confirmado pela persistência
- **THEN** a interface informa falha, a situação permanece como consultado e o remetente não vê ciência registrada

#### Scenario: Ciência por pessoa não destinatária é negada
- **WHEN** pessoa que não é destinatária do conteúdo, ou cujo acesso foi revogado, tenta registrar ciência, inclusive por acesso direto
- **THEN** a operação é negada e nenhuma ciência é registrada em nome de terceiro
