# Diário e evolução

## Purpose

Preservar os requisitos de diário e evolução do projeto Francescapp aprovado, com rastreabilidade e sem alterar seu escopo na migração para OpenSpec.

**Migração**: 14/10/2026. **Estado**: referência funcional; não comprova implementação.

As fases Inicial/Evolução são as da proposta de origem. Evolução continua a validar; Inicial não confirma por si só recorte de entrega, hipóteses ou decisões técnicas pendentes. Consultar [fundação](../../../docs/projeto/fundacao.md) e [contexto de negócio](../../../docs/projeto/contexto-negocio.md).

## Requirements

### Requirement: FR-008 — Permitir relatos familiares por texto ou áudio com data do

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir relatos familiares por texto ou áudio com data do acontecimento, categoria, descrição, contexto, ação tomada e solicitação de retorno. Apenas data e descrição são obrigatórias no relato simples.

#### Scenario: Condição de aceite FR-008

- **WHEN** a funcionalidade FR-008 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir relatos familiares por texto ou áudio com data do acontecimento, categoria, descrição, contexto, ação tomada e solicitação de retorno. Apenas data e descrição são obrigatórias no relato simples.

### Requirement: FR-009 — Oferecer modelos curtos de síntese profissional por área, configurados com

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Oferecer modelos curtos de síntese profissional por área, configurados com a equipe: atividade, observações compartilháveis, progresso, orientação e próximo passo. A publicação exige data, autor identificado e síntese.

#### Scenario: Condição de aceite FR-009

- **WHEN** a funcionalidade FR-009 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Oferecer modelos curtos de síntese profissional por área, configurados com a equipe: atividade, observações compartilháveis, progresso, orientação e próximo passo. A publicação exige data, autor identificado e síntese.

### Requirement: FR-010 — Transcrever áudio em português para rascunho editável, permitir ouvir o

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Transcrever áudio em português para rascunho editável, permitir ouvir o original e revisar texto e audiência antes de publicar. Não transcrever sessões completas por padrão. Deve haver alternativa por texto.

#### Scenario: Condição de aceite FR-010

- **WHEN** a funcionalidade FR-010 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Transcrever áudio em português para rascunho editável, permitir ouvir o original e revisar texto e audiência antes de publicar. Não transcrever sessões completas por padrão. Deve haver alternativa por texto.

### Requirement: FR-011 — Associar imagem ou documento ao registro e apresentar origem e

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Associar imagem ou documento ao registro e apresentar origem e audiência. Um anexo não pode ampliar o acesso ao registro ao qual está associado.

#### Scenario: Condição de aceite FR-011

- **WHEN** a funcionalidade FR-011 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Associar imagem ou documento ao registro e apresentar origem e audiência. Um anexo não pode ampliar o acesso ao registro ao qual está associado.

### Requirement: FR-012 — Permitir rascunho, publicação e retificação justificada. Registros publicados não podem

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir rascunho, publicação e retificação justificada. Registros publicados não podem ser reescritos sem histórico identificado; restrição e atendimento de direitos devem seguir a política de dados.

#### Scenario: Condição de aceite FR-012

- **WHEN** a funcionalidade FR-012 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir rascunho, publicação e retificação justificada. Registros publicados não podem ser reescritos sem histórico identificado; restrição e atendimento de direitos devem seguir a política de dados.

### Requirement: FR-013 — Mostrar ao remetente envio, consulta e retorno, quando aplicável, como

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Mostrar ao remetente envio, consulta e retorno, quando aplicável, como situações distintas. A consulta não encerra automaticamente uma solicitação.

#### Scenario: Condição de aceite FR-013

- **WHEN** a funcionalidade FR-013 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Mostrar ao remetente envio, consulta e retorno, quando aplicável, como situações distintas. A consulta não encerra automaticamente uma solicitação.

### Requirement: FR-014 — Permitir indicar necessidade de atenção e converter relato ou evolução

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir indicar necessidade de atenção e converter relato ou evolução em ação com responsável. A sinalização humana deve manter motivo, data e encaminhamento.

#### Scenario: Condição de aceite FR-014

- **WHEN** a funcionalidade FR-014 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir indicar necessidade de atenção e converter relato ou evolução em ação com responsável. A sinalização humana deve manter motivo, data e encaminhamento.

## Jornadas e testes independentes preservados

As jornadas abaixo foram migradas sem alteração dos exemplos de aceite. Não indicam execução de testes ou aprovação de hipóteses.

### User Story 2 - Registrar um acontecimento em casa (Priority: P1)

Como familiar ou cuidador autorizado, registro um acontecimento, o contexto e o que foi feito, por texto ou áudio, podendo anexar uma imagem.

**Why this priority**: O cuidado acontece também fora das sessões; as informações da rotina precisam chegar com contexto e autoria.

**Independent Test**: Um participante registra um acontecimento fictício pelo celular, sem acessar conteúdo profissional.

**Acceptance Scenarios**:

1. Dado um familiar autorizado no caso, quando selecionar “Registrar acontecimento”, então poderá informar quando ocorreu, categoria, descrição, contexto, ação tomada e necessidade de retorno.
2. Dado um áudio com trecho incerto, quando for apresentada a transcrição, então o autor poderá ouvir, corrigir e revisar a audiência antes de publicar; o trecho incerto não será completado como fato.
3. Dado um registro enviado à coordenação, quando o familiar acompanhar o envio, então distinguirá “enviado”, “consultado” e “retorno registrado”; envio ou leitura não serão apresentados como atendimento concluído.
4. Dado um registro com indicação de atenção imediata, quando iniciar o preenchimento, então verá as instruções de crise acordadas e os limites de resposta do serviço antes de depender do diário.

### User Story 3 - Compartilhar uma evolução profissional curta (Priority: P1)

Como profissional da equipe, registro a síntese necessária à coordenação após o atendimento, usando um modelo da minha área.

**Why this priority**: Sem baixo esforço de preenchimento, a centralização não terá informação atualizada.

**Independent Test**: Um profissional registra uma síntese fictícia e gera um encaminhamento para outro participante autorizado.

**Acceptance Scenarios**:

1. Dado um atendimento realizado, quando o profissional registrar a evolução, então poderá preencher atividade, observações relevantes, relação com um objetivo, orientação e próximo passo.
2. Dada informação que deve permanecer no registro profissional restrito, quando preparar a síntese, então o profissional selecionará apenas o necessário ao cuidado compartilhado e verá os destinatários antes de confirmar.
3. Dada uma evolução publicada com erro, quando o autor corrigi-la, então a retificação terá data, motivo e autoria e preservará o histórico de versões para os responsáveis autorizados.
