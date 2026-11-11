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

## Domínio provisório (10/11/2026) — sem código, sem integração

O solicitante pediu rascunho só de domínio/design esta rodada, sem código isolado (a decisão "Contrato isolado sem consumidor não prova integração" acima continua valendo — nenhum arquivo de contrato ou migration foi criado por este rascunho). Esboço do que um registro de anexo institucional precisaria representar, para acelerar a modelagem quando as perguntas acima forem respondidas:

- Identificação: referência ao paciente/caso; referência ao arquivo no Drive (id do Google, não o conteúdo); nome visível, que pode divergir do nome real do arquivo no Drive se a organização de pastas exigir.
- Classificação: categoria (ex.: documento geral do paciente vs. documento de cuidado/clínico) — a proposta já decidiu "pastas de paciente e categorias gerais e de cuidado", mas a lista fechada de categorias é um dos bloqueadores pendentes, não inventada aqui.
- Audiência: quem pode ver/baixar o anexo pelo app (perfil + vínculo ao caso, controles distintos como em outras fatias) — a proposta já é explícita que "família acessa somente pelo app", nunca por link direto do Drive; o modelo de revogação de audiência individual permanece bloqueador aberto.
- Proveniência e estado: quem anexou, quando, e um campo de estado que distinga "disponível"/"indisponível" (consistente com a decisão de "explicitar indisponibilidade e proibir substituição silenciosa de armazenamento" já na proposta) — não inventa aqui um fluxo de reconciliação Drive↔banco, que depende das decisões de falha parcial ainda pendentes.
- Auditoria: leitura e escrita deste registro devem seguir o mesmo padrão transacional (RPC auditada, autorização no servidor) já usado nas demais fatias — sem detalhe novo, só reafirmando consistência.

Isto é prosa de preparação, não um contrato implementável: nenhum destes campos tem forma final (tipo, obrigatoriedade, enum fechado) até as perguntas de "Open Questions" serem respondidas pelo solicitante, incluindo com acesso real ao Drive/Workspace, o que não é algo resolvível numa sessão sem o solicitante presente.
