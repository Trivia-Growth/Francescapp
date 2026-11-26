# Spec Delta

## MODIFIED Requirements

### Requirement: FR-037 — Permitir revogar vínculos, definir substituição temporária da case manager e

**Fase de origem**: Inicial. **Decisão aplicável**: DF-024, 19/11/2026.

O produto SHALL atender a este comportamento: Permitir revogar vínculos, definir
substituição temporária da case manager e revisar autorizações. A substituição temporária
SHALL valer por período declarado e somente no caso indicado; durante o período a
substituta SHALL ser a case manager atual daquele caso, inclusive para efeito de ação.
Fora do período o titular SHALL voltar a ser o atual sem ação manual. A substituição NÃO
SHALL conceder acesso ao conteúdo do caso nem alcançar outros casos ou a carteira.

#### Scenario: Condição de aceite FR-037

- **WHEN** a funcionalidade FR-037 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir revogar vínculos, definir substituição temporária da case manager e revisar autorizações. A configuração individual da agenda global deve separar “Pode visualizar” e “Pode editar”: sem consulta autorizada, negar acesso; com apenas consulta, negar alterações; para atualizar, exigir consulta e edição autorizadas. Revogar edição não revoga consulta ainda válida. Conferir permissões ao executar a ação, não somente na interface. Todas as alterações de acesso devem manter data, responsável e motivo; permissões de agenda não concedem acesso clínico aos casos.

#### Scenario: Substituta age dentro do período, no caso substituído

- **WHEN** Administrador registrou substituição vigente e a substituta, com acesso ao caso
  e habilitação própria, aprova o plano de crise daquele caso
- **THEN** o sistema SHALL aceitar o ato e registrá-lo em auditoria como permitido

#### Scenario: Substituta é negada fora do período

- **WHEN** a mesma substituta tenta o mesmo ato antes do início ou depois do fim do período
- **THEN** o sistema SHALL negar, inclusive em repetição do mesmo pedido, e auditar como negado

#### Scenario: Substituta é negada em outro caso

- **WHEN** a substituta tenta agir como case manager em caso diferente do substituído,
  inclusive por acesso direto ao banco sob o papel interno da fatia
- **THEN** o sistema SHALL negar sem gravar carimbo

#### Scenario: Titular continua podendo agir durante a substituição

- **WHEN** o titular do caso age enquanto há substituição vigente
- **THEN** o sistema SHALL aceitar o ato, porque a substituição cobre ausência e não retira alçada

#### Scenario: Período sobreposto é recusado pelo banco

- **WHEN** duas transações concorrentes tentam registrar substituições com períodos que se
  sobrepõem no mesmo caso
- **THEN** o banco SHALL aceitar uma e recusar a outra, sem depender de verificação na aplicação

#### Scenario: Encerramento antecipado devolve o poder ao titular imediatamente

- **WHEN** Administrador encerra a substituição antes do fim declarado
- **THEN** o sistema SHALL negar o ato seguinte da substituta sem esperar a data de fim,
  preservando o registro e os dois eventos de auditoria

#### Scenario: Substituição não concede acesso ao caso

- **WHEN** a substituta designada não tem acesso vigente em `cadastro.acesso_paciente`
- **THEN** o sistema SHALL continuar negando leitura e ação no caso

#### Scenario: Só Administrador registra ou encerra substituição

- **WHEN** perfil Profissional ou Família tenta registrar ou encerrar substituição
- **THEN** o sistema SHALL negar no servidor e no banco e auditar como negado
