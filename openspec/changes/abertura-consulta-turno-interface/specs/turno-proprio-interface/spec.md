# Spec Delta

## Purpose

Tornar abertura e consulta do próprio turno utilizáveis na ficha da equipe, preservando autorização e recuperação de operações de FR-055 na fase Inicial.

## ADDED Requirements

### Requirement: FR-055 — Interação de abertura e consulta própria

Na fase Inicial, a ficha da equipe SHALL permitir ao profissional abrir explicitamente e consultar seu turno aberto no caso. Consulta SHALL recuperar o turno após recarga sem ID clínico persistido no navegador. Identidade, relógio e autorização SHALL permanecer no servidor e banco.

#### Scenario: Turno próprio após recarga
- **WHEN** profissional com sessão e vínculo vigentes consulta sua ficha de turno
- **THEN** recebe seu turno aberto naquele caso ou vazio real confirmado, sem turnos de outro profissional

#### Scenario: Autorização revogada
- **WHEN** sessão, concessão ou vínculo deixam de ser válidos
- **THEN** consulta e abertura são negadas pelo servidor e banco, inclusive por acesso direto, sem expor conteúdo

#### Scenario: Falha não vira vazio ou sucesso
- **WHEN** consulta ou abertura falham, retornam conteúdo inválido ou resposta ambígua
- **THEN** interface apresenta erro e recuperação, sem dados fictícios e sem afirmar ausência ou abertura

### Requirement: FR-055 — Recuperação explícita da abertura

Interface SHALL recuperar reserva e resultado pendente sem duplicar abertura. Resultado confirmado SHALL ser consultado antes do reconhecimento. Encerrar a barreira SHALL ser distinto de encerrar turno clínico, que permanece indisponível nesta fatia.

#### Scenario: Resposta perdida
- **WHEN** abertura tem resposta perdida e a pessoa solicita recuperação
- **THEN** sistema reconcilia operação, consulta o turno confirmado e só depois reconhece o recibo

#### Scenario: Pendência em outro caso
- **WHEN** recuperação aponta caso diferente da ficha atual
- **THEN** interface mantém recibo pendente, orienta consultar ficha de origem e não carrega conteúdo daquele caso

#### Scenario: Uso no celular e teclado
- **WHEN** pessoa usa seção em viewport estreita ou por teclado
- **THEN** ações permanecem identificadas, estados são anunciados e não há dependência de áudio
