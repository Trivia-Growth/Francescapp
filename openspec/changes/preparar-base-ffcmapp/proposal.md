# Proposal

## Why

O FFCMApp foi aprovado para desenvolvimento, mas a base contém apenas demonstração e materiais de apresentação. Antes de implementar jornadas reais, é necessário isolar a demonstração e preservar as dependências dos documentos, sem transplantar simulações ou configurações de outro produto.

## What Changes

- Planejar o arquivamento recuperável de `mockup/` e `output/mockup/` fora da base ativa, conforme autorização já registrada em `registrar-fundacao-real`.
- Preservar proposta comercial, PDFs, fontes/licenças, imagens recebidas e histórico; corrigir os caminhos ativos afetados pelo arquivamento.
- Preparar ferramentas locais e documentação de desenvolvimento segundo o Atendimento, sem implementar telas, regras de paciente ou integrações nesta mudança.
- Acrescentar verificações de preservação e isolamento com testes positivos e negativos; não aceitar verificações vazias ou sucesso simulado.
- Usar FFCMApp como nome atual, sem renomear repositório remoto, domínios ou reescrever snapshots históricos.

### Limite e dependências

Esta é somente a preparação local. Não reduz a primeira entrega aprovada: os 45 requisitos iniciais continuam incluídos e as 9 evoluções continuam separadas. Não implementa login, banco, autorização, Drive, agenda, transcrição ou interface final. Não define ambientes, retenção ou relações entre paciente e acompanhamento.

O comportamento funcional de honestidade operacional, perfis e documentos pertence à mudança [registrar-fundacao-real](../registrar-fundacao-real/proposal.md), que permanece aberta. Esta mudança executará apenas o pré-requisito de isolamento ali descrito; não sincroniza nem arquiva aquela mudança por conta própria.

## Capabilities

### New Capabilities

Nenhuma. Preparação de ferramentas e organização do repositório, sem comportamento funcional novo. `skip_specs: true` evita criar um requisito artificial apenas para satisfazer o fluxo.

### Modified Capabilities

Nenhuma. FR/SC e fases permanecem intactos; rastreabilidade de suporte: FR-042 e isolamento da demonstração em `registrar-fundacao-real/specs/integridade-operacional/spec.md`. Isolar o mock não comprova atendimento de FR-042.

## Impact

- Afeta futuramente diretórios de demonstração, recursos de fonte da proposta e referências de documentação; nenhum arquivo será movido durante a especificação.
- Ferramentas próprias na raiz/scripts; configurações do Atendimento são referência de leitura, não conteúdo a copiar integralmente.
- Evidência reconsultada em 15/10/2026 no Atendimento: revisão `a0d4f57f2684fad40f60d936cd3dda36353b675f`, limitada a manifests, workspace, TypeScript, Biome e Turbo. Não é uma nova auditoria de autenticação nem substitui a inspeção anterior.
- Sem chamadas de IA, provisionamento, migrações remotas, deploy, push ou uso de dados reais.

Plano das próximas especificações e decisões pendentes: [roteiro de desenvolvimento](../../../docs/projeto/roteiro-especificacoes.md).
