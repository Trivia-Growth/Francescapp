# Spec Delta

## ADDED Requirements

### Requirement: Preparação textual do relato familiar (FR-008, fase Inicial)

A preparação do relato simples SHALL aceitar data do acontecimento e descrição como campos obrigatórios, e categoria, contexto, ação tomada e solicitação de retorno como opcionais. A preparação isolada MUST NOT ser apresentada como envio ou publicação.

#### Scenario: Dados mínimos
- **WHEN** são fornecidas data do acontecimento e descrição
- **THEN** a preparação aceita os dados sem exigir campos opcionais.

#### Scenario: Dados obrigatórios ausentes
- **WHEN** falta data do acontecimento ou descrição
- **THEN** a preparação identifica a ausência e não considera os dados completos.

#### Scenario: Campos opcionais informados
- **WHEN** categoria, contexto, ação tomada ou solicitação de retorno são informados
- **THEN** a preparação preserva seus valores para revisão, sem classificá-los como diagnóstico.

#### Scenario: Preparação sem publicação
- **WHEN** a preparação local termina
- **THEN** não afirma envio, consulta ou retorno, nem concede acesso ao relato.

#### Scenario: Revisão local isolada
- **WHEN** o componente isolado recebe dados válidos fictícios
- **THEN** permite revisar os campos como texto e informa que nada foi salvo ou enviado.

#### Scenario: Limite da demonstração
- **WHEN** o componente isolado é apresentado
- **THEN** informa que se destina a dados fictícios, que o conteúdo será perdido ao sair e que não é canal de atendimento ou emergência.
