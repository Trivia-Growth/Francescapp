# Design

## Context

As specs preservam FR-029 a FR-031; o delta `registrar-fundacao-real` confirma Drive compartilhado e canais distintos. Não há integração de documentos demonstrada. A referência Atendimento orienta organização e validação de fronteiras, não determina permissões ou credenciais deste produto.

## Goals / Non-Goals

**Goals:** delimitar a jornada e os controles verificáveis antes da conexão real.

**Non-Goals:** exportação, mudança de provedor, provisão ou configuração remota e acesso a dados reais.

## Decisions

- Guarda no Drive compartilhado confirmado, nunca Meu Drive como fallback. Alternativa de outro provedor contraria decisão vigente.
- Autorização deve conferir identidade, vínculo ao caso e audiência no servidor; acesso institucional direto exige coerência com compartilhamento gerido. Interface ou vínculo isolados não autorizam.
- Integração e segredos permanecem no servidor. Organizar por pastas de paciente e categorias gerais e de cuidado; família acessa somente pelo app. Formato de credencial, detalhes de audiência e política de revogação permanecem pendentes.
- Contrato isolado sem consumidor não prova integração e adiciona abstração prematura; implementar com a primeira operação real após decisões.

## Risks / Trade-offs

- Acesso direto ao Drive pode divergir do app: definir e provar concessão, detecção de compartilhamento incompatível e revogação antes da ativação.
- Falha entre Drive e banco pode deixar arquivo órfão: projetar reconciliação e recuperação após definição da integração.
- Testes fictícios não comprovam permissões ou acesso remoto: exigir prova conectada com dados fictícios, sob autorização específica.

## Migration Plan

Nenhuma operação remota autorizada. Após decisões, planejar implantação, reversão e conferência seletiva antes de executar.

## Open Questions

Bloqueadores materiais, não decisões adiáveis para implementação: identificador e raiz do Drive; detalhes operacionais da organização; identidade e consentimento Google; modelo e alterações de compartilhamento direto; audiência e sua revogação; tipos e limites de arquivos; tratamento de mudanças externas e falhas parciais. Confirmar com solicitante e registrar decisões antes de tarefas dependentes.
