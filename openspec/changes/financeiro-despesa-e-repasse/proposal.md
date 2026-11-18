# Proposal

## Why

A avaliação de ferramentas de 11/11/2026 apontou o controle financeiro do cuidado — despesa, comprovante e repasse por profissional — como item presente no Home Care Flow e ausente no FFCMApp. Em 17/11/2026 o solicitante decidiu trazê-lo para o produto, inclusive o repasse, que até então estava explicitamente fora de escopo.

Na operação atual, Fabiana cuida de compras e conferência financeira por fora do sistema, enquanto o turno de cada profissional já será registrado em `turno-e-execucao-do-cuidado`. Com o turno encerrado persistido, o repasse deixa de ser planilha paralela e passa a ser leitura do que foi efetivamente executado.

## What Changes

- Criar a capacidade `financeiro-do-cuidado`, com FR-068 a FR-070, fase de origem Evolução.
- Promover FR-047 (despesa, autorização e comprovante) de evolução proposta a requisito do produto, mantendo a separação entre acesso financeiro e dados de saúde.
- Registrar valor acordado de repasse por profissional, com vigência e autor, sem retroagir sobre períodos já apurados.
- Gerar linha de repasse a partir do turno encerrado de FR-055, referenciando o turno e o valor vigente à época.
- Criar a concessão de perfil financeiro, conferida no servidor e no banco, separada das concessões de cuidado.
- Registrar despesa do cuidado com autorização, comprovante anexado e responsável identificado.

### Exclusões deste recorte

- Folha de pagamento, obrigações trabalhistas, emissão fiscal, contabilidade e gestão de investimentos.
- Pagamento, transferência, integração bancária ou qualquer movimentação de dinheiro. O produto registra e apura; não paga.
- Cálculo de hora extra, adicional noturno, banco de horas ou qualquer regra trabalhista derivada da duração do turno.
- Cobrança da família, mensalidade, contrato ou precificação de serviço.
- Preço por paciente, orçamento de proposta comercial e qualquer dado da proposta da Trívia.

### Decisões aplicadas

Confirmadas pelo solicitante em 17/11/2026.

- **Financeiro entra no produto**, inclusive repasse por profissional. Substitui a exclusão registrada em 11/11/2026 em `turno-e-execucao-do-cuidado`.
- **Base do repasse**: turno realizado multiplicado por valor acordado **por turno**, cadastrado por profissional. Não é valor-hora, não é lançamento manual e não é apuração por duração aferida entre abertura e encerramento.
- **Turno não encerrado** entra na apuração como linha pendente de resolução, identificada e sem valor — não é omitido do período nem pago integralmente.
- **Sem ciclo de apuração travado** nesta versão: a apuração é consulta aberta por período, apresentando o instante da consulta. Um fechamento futuro não deve exigir quebra de contrato (design D3).
- **Despesa pertence ao caso**, sem teto e sem aprovação em duas etapas. Despesa da própria instituição, sem caso vinculado, segue fora do escopo.
- **Audiência**: Administrador e perfil financeiro (a Fabiana). Profissional **não** vê valores, nem os próprios. Família **não** vê nada do financeiro.

### Pendências que não podem ser inferidas

- A implementação está **suspensa** até a liberação do solicitante, como em `turno-e-execucao-do-cuidado`.

### Dependência

Este recorte **consome** `turno-e-execucao-do-cuidado`: sem turno encerrado persistido (FR-055), não há o que apurar. FR-070 não inicia antes de FR-055 estar implementado e verificado. FR-068 e FR-069 não dependem do turno e podem andar antes.

## Capabilities

### New Capabilities

- `financeiro-do-cuidado`: controle financeiro do acompanhamento — valor acordado de repasse por profissional, apuração de repasse a partir do turno realizado, despesa com autorização e comprovante, e a audiência financeira separada dos dados de saúde.

### Modified Capabilities

- `evolucoes-propostas`: FR-047 deixa de ser evolução proposta e passa a requisito do produto, com a audiência financeira definida e o comprovante tratado como anexo sujeito à autorização do caso.

## Impact

Novos contratos, funções e esquema com políticas RLS próprias. Introduz uma classe de dado que o produto ainda não tinha: valor devido a pessoa identificada. Isso cria uma fronteira de audiência nova — o profissional é titular do próprio dado de remuneração e, pela decisão de 17/11/2026, não o acessa pelo produto.

Reforça FR-036 (audiências distintas), FR-038 (fundamento de autorização), FR-039 (auditoria de consulta, alteração e exportação) e FR-042 (proteção de dado identificável). Não autoriza deploy, migração remota, concessão de acesso, integração bancária ou uso de dados reais.
