# Documentos institucionais

## Purpose

Preservar os requisitos de documentos institucionais do projeto Francescapp aprovado, com rastreabilidade e sem alterar seu escopo na migração para OpenSpec.

**Migração**: 14/10/2026. **Estado**: referência funcional; não comprova implementação.

As fases Inicial/Evolução são as da proposta de origem. Evolução continua a validar; Inicial não confirma por si só recorte de entrega, hipóteses ou decisões técnicas pendentes. Consultar [fundação](../../../docs/projeto/fundacao.md) e [contexto de negócio](../../../docs/projeto/contexto-negocio.md).

## Requirements

### Requirement: FR-029 — Organizar anexos por pessoa acompanhada, categoria, origem, data, autor do

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Organizar anexos por pessoa acompanhada, categoria, origem, data, autor do envio e versão. A busca deve respeitar audiência e permitir identificar o documento atual e o indisponível.

#### Scenario: Condição de aceite FR-029

- **WHEN** a funcionalidade FR-029 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Organizar anexos por pessoa acompanhada, categoria, origem, data, autor do envio e versão. A busca deve respeitar audiência e permitir identificar o documento atual e o indisponível.

### Requirement: FR-030 — Guardar anexos no Google Drive institucional administrado pela Francescato, em

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Guardar anexos no Google Drive institucional administrado pela Francescato, em organização vinculada ao caso. A pessoa que envia deve classificar o anexo e confirmar sua audiência antes de concluir.

#### Scenario: Condição de aceite FR-030

- **WHEN** a funcionalidade FR-030 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Guardar anexos no Google Drive institucional administrado pela Francescato, em organização vinculada ao caso. A pessoa que envia deve classificar o anexo e confirmar sua audiência antes de concluir.

### Requirement: FR-031 — Manter controle do compartilhamento de anexos tanto no sistema quanto

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Manter controle do compartilhamento de anexos tanto no sistema quanto no Google Drive institucional. A gestão prevista deve impedir acesso público e sinalizar compartilhamentos incompatíveis com a audiência do caso.

#### Scenario: Condição de aceite FR-031

- **WHEN** a funcionalidade FR-031 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter controle do compartilhamento de anexos tanto no sistema quanto no Google Drive institucional. A gestão prevista deve impedir acesso público e sinalizar compartilhamentos incompatíveis com a audiência do caso.

### Requirement: FR-032 — Oferecer exportação autorizada por caso ou período de registros, plano

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Oferecer exportação autorizada por caso ou período de registros, plano, pendências e relação de anexos, identificando conteúdo indisponível e preservando autoria e datas. O destinatário e o propósito devem ser registrados.

#### Scenario: Condição de aceite FR-032

- **WHEN** a funcionalidade FR-032 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Oferecer exportação autorizada por caso ou período de registros, plano, pendências e relação de anexos, identificando conteúdo indisponível e preservando autoria e datas. O destinatário e o propósito devem ser registrados.

### Requirement: FR-033 — Permitir à Francescato obter seus registros e anexos autorizados ao

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir à Francescato obter seus registros e anexos autorizados ao encerrar o uso do produto, em formato consultável, com entrega e conferência registradas. Exportação de um caso deve preservar dados de terceiros e conteúdo profissional que demande tratamento específico.

#### Scenario: Condição de aceite FR-033

- **WHEN** a funcionalidade FR-033 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir à Francescato obter seus registros e anexos autorizados ao encerrar o uso do produto, em formato consultável, com entrega e conferência registradas. Exportação de um caso deve preservar dados de terceiros e conteúdo profissional que demande tratamento específico.

### Requirement: FR-034 — Oferecer segundo provedor de arquivos ou mudança de provedor com

**Fase de origem**: Evolução.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Oferecer segundo provedor de arquivos ou mudança de provedor com conferência de documentos, acesso e versões; não perder vínculos ou declarar concluída uma transferência incompleta.

#### Scenario: Condição de aceite FR-034

- **WHEN** a funcionalidade FR-034 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Oferecer segundo provedor de arquivos ou mudança de provedor com conferência de documentos, acesso e versões; não perder vínculos ou declarar concluída uma transferência incompleta.

## Jornadas e testes independentes preservados

As jornadas abaixo foram migradas sem alteração dos exemplos de aceite. Não indicam execução de testes ou aprovação de hipóteses.

### User Story 8 - Guardar e encontrar documentos sob gestão da Francescato (Priority: P1)

Como case manager ou profissional autorizado, organizo laudos, exames, relatórios, imagens e termos por caso, classificados em um espaço do Google Drive sob administração da Francescato.

**Why this priority**: É parte da centralização solicitada e reduz dependência de contas pessoais dos participantes.

**Independent Test**: Localizar um documento fictício, conferir sua versão e observar o comportamento quando ele estiver indisponível.

**Acceptance Scenarios**:

1. Dado um anexo enviado, quando for classificado, então ficará vinculado à pessoa acompanhada e terá categoria, data do documento, origem, autor do envio e audiência.
2. Dado um arquivo indisponível no espaço conectado, quando alguém tentar abri-lo, então verá o problema e a orientação de regularização; o documento não será apresentado como disponível.
3. Dado um participante com acesso revogado, quando tentar abrir um documento pelo sistema ou pela forma de compartilhamento gerida pelo projeto, então o acesso será negado. Cópias já obtidas serão tratadas pela política de confidencialidade, sem promessa de recolhimento remoto.
