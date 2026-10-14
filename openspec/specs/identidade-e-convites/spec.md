# Identidade e convites

## Purpose

Preservar os requisitos de identidade e convites do projeto Francescapp aprovado, com rastreabilidade e sem alterar seu escopo na migração para OpenSpec.

**Migração**: 14/10/2026. **Estado**: referência funcional; não comprova implementação.

As fases Inicial/Evolução são as da proposta de origem. Evolução continua a validar; Inicial não confirma por si só recorte de entrega, hipóteses ou decisões técnicas pendentes. Consultar [fundação](../../../docs/projeto/fundacao.md) e [contexto de negócio](../../../docs/projeto/contexto-negocio.md).

## Requirements

### Requirement: FR-035 — Permitir entrada com conta individual ativa do Google Workspace da

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir entrada com conta individual ativa do Google Workspace da Francescato e conceder acesso por pessoa, caso, finalidade e tipo de informação, com vínculo válido e identidade individual. O papel genérico ou uma conta geral não devem liberar toda a carteira.

#### Scenario: Condição de aceite FR-035

- **WHEN** a funcionalidade FR-035 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir entrada com conta individual ativa do Google Workspace da Francescato e conceder acesso por pessoa, caso, finalidade e tipo de informação, com vínculo válido e identidade individual. O papel genérico ou uma conta geral não devem liberar toda a carteira.

### Requirement: FR-051 — Permitir que Edilaine cadastre o familiar, seu e-mail e o

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir que Edilaine cadastre o familiar, seu e-mail e o vínculo autorizado com o caso, e envie um convite inicial de ativação. Distinguir convite pendente, falha de envio e ativação concluída; o envio não concede autorização além do vínculo definido.

#### Scenario: Condição de aceite FR-051

- **WHEN** a funcionalidade FR-051 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir que Edilaine cadastre o familiar, seu e-mail e o vínculo autorizado com o caso, e envie um convite inicial de ativação. Distinguir convite pendente, falha de envio e ativação concluída; o envio não concede autorização além do vínculo definido.

### Requirement: FR-052 — Permitir ao familiar definir sua própria senha após validar o

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir ao familiar definir sua própria senha após validar o convite inicial e entrar posteriormente com e-mail e senha. A ativação não deve disponibilizar dados antes da conclusão do fluxo; Edilaine não precisa conhecer a senha. O login da equipe continua pelo Google Workspace.

#### Scenario: Condição de aceite FR-052

- **WHEN** a funcionalidade FR-052 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir ao familiar definir sua própria senha após validar o convite inicial e entrar posteriormente com e-mail e senha. A ativação não deve disponibilizar dados antes da conclusão do fluxo; Edilaine não precisa conhecer a senha. O login da equipe continua pelo Google Workspace.

### Requirement: FR-053 — Oferecer “Esqueci minha senha” no login familiar, com solicitação por

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Oferecer “Esqueci minha senha” no login familiar, com solicitação por e-mail e definição de nova senha por link válido. Não revelar publicamente a existência de uma conta nem criar cadastro ou vínculo a partir da recuperação.

#### Scenario: Condição de aceite FR-053

- **WHEN** a funcionalidade FR-053 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Oferecer “Esqueci minha senha” no login familiar, com solicitação por e-mail e definição de nova senha por link válido. Não revelar publicamente a existência de uma conta nem criar cadastro ou vínculo a partir da recuperação.

### Requirement: FR-054 — Rejeitar links de ativação/recuperação inválidos, expirados ou já utilizados e

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Rejeitar links de ativação/recuperação inválidos, expirados ou já utilizados e orientar a obtenção de novo link. Ativar a conta, entrar ou recuperar senha não deve criar ou restaurar vínculos revogados; conferir autorização antes de exibir dados do caso.

#### Scenario: Condição de aceite FR-054

- **WHEN** a funcionalidade FR-054 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Rejeitar links de ativação/recuperação inválidos, expirados ou já utilizados e orientar a obtenção de novo link. Ativar a conta, entrar ou recuperar senha não deve criar ou restaurar vínculos revogados; conferir autorização antes de exibir dados do caso.

## Jornadas e testes independentes preservados

As jornadas abaixo foram migradas sem alteração dos exemplos de aceite. Não indicam execução de testes ou aprovação de hipóteses.

### User Story 11 - Entrar com a conta institucional (Priority: P1)

Como integrante da Francescato, entro com minha conta individual do Google Workspace e acesso somente os casos, anexos e agendas para os quais fui autorizado.

**Why this priority**: Evita criação de senhas paralelas, vincula as ações a uma identidade institucional e torna a entrada e a saída de pessoas da equipe mais simples de administrar.

**Independent Test**: Demonstrar o acesso de duas contas fictícias do Workspace, uma vinculada ao caso e outra sem vínculo, além da consulta à agenda geral.

**Acceptance Scenarios**:

1. Dada uma conta ativa do Google Workspace da Francescato, quando entrar no sistema, então a pessoa será identificada individualmente e verá apenas o escopo de casos e ações que lhe foi atribuído.
2. Dada uma conta do Workspace sem vínculo com determinado caso, quando buscar a pessoa acompanhada ou tentar abrir um anexo e um compromisso desse caso, então não obterá dados nem metadados protegidos.
3. Dada a agenda global institucional configurada e o acesso marcado para um membro da equipe, quando esse membro entrar, então verá seus compromissos permitidos na visão consolidada, sem que a conta compartilhada conceda acesso a dados clínicos fora das regras do caso.

### User Story 12 - Ativar e recuperar o acesso familiar (Priority: P1)

Como familiar convidado por Edilaine, recebo um link inicial por e-mail, defino minha senha e depois entro com e-mail e senha para participar dos casos autorizados. Se esquecer a senha, consigo definir uma nova por um link enviado ao meu e-mail.

**Why this priority**: Permite à família participar sem conta institucional, com entrada administrada por Edilaine e recuperação de acesso sem depender de ela conhecer ou fornecer senhas.

**Independent Test**: Com um familiar fictício cadastrado por Edilaine, executar convite, definição de senha, saída, novo login e recuperação de senha, conferindo o acesso permitido e o negado no celular.

**Acceptance Scenarios**:

1. Dado o cadastro de um familiar com e-mail e vínculo autorizado ao caso, quando Edilaine enviar o convite, então o destinatário receberá o link inicial e o cadastro indicará ativação pendente; enviar o e-mail não significará que a conta já foi ativada.
2. Dado um convite válido, quando o familiar abrir o link e concluir a definição da própria senha, então poderá usar a plataforma somente no escopo autorizado e, nos acessos seguintes, entrar com e-mail e senha.
3. Dado um familiar que esqueceu a senha, quando selecionar “Esqueci minha senha” e informar seu e-mail, então poderá receber um link de recuperação; com link válido, definirá uma nova senha e conseguirá entrar com ela.
4. Dado um link expirado, inválido ou já utilizado, quando tentar ativar a conta ou redefinir a senha, então verá uma orientação para obter um novo link, sem liberação de dados do caso.
5. Dado um vínculo de caso revogado, quando o familiar entrar ou redefinir sua senha, então esse caso continuará inacessível. Recuperação de credencial não cria ou restaura autorização.
6. Dada a recuperação solicitada para um e-mail não cadastrado, quando o pedido for enviado, então a resposta pública não revelará se existe uma conta, nem criará cadastro ou acesso ao caso.
