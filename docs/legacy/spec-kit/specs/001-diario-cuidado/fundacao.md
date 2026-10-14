# Fundação do desenvolvimento do Francescapp

**Data**: 2026-10-10

**Branch**: `codex/fundacao-desenvolvimento`

**Estado**: decisões fornecidas registradas; esclarecimentos em andamento. Este documento ainda não é um plano de implementação.

**Especificação funcional**: [spec.md](spec.md)

## Decisões confirmadas pelo solicitante

| ID | Decisão | Origem e limite da decisão |
| --- | --- | --- |
| DF-001 | Iniciar a preparação do desenvolvimento a partir das especificações | Aprovação do projeto por Edilaine informada em 2026-10-10. Detalhes pendentes serão esclarecidos antes da implementação. |
| DF-002 | Utilizar Supabase | Infraestrutura da aplicação, incluindo servidor e banco de dados, conforme a proposta. Região, ambientes, autenticação, execução e recuperação ainda precisam ser definidos. |
| DF-003 | Utilizar Netlify | Serviço escolhido para a infraestrutura. Configuração de publicação, ambientes e eventual execução de funções ainda não foram definidos. |
| DF-004 | Utilizar OpenRouter | Serviço escolhido para IA. Modelos, funcionalidades, tratamento de dados, limites e relação com a transcrição de áudio ainda precisam ser confirmados. |
| DF-005 | Integrar Google Drive institucional | Anexos classificados por paciente e sob administração da Francescato, conforme a validação anterior. Conta responsável, local de guarda e modelo de acesso ainda precisam ser definidos. |
| DF-006 | Integrar Google Calendar para consulta e atualização pelo sistema | Exibir compromissos existentes e permitir atualização na origem pelo sistema. Cada profissional terá sua agenda na própria conta Google; o e-mail compartilhado manterá a agenda global, com “Pode visualizar” e “Pode editar” separados na configuração individual. Consulta não concede edição; ações de escrita e regras de sincronização ainda precisam ser definidas. |
| DF-007 | Manter acesso individual da equipe com Google Workspace | Decisão anterior preservada. Domínio, provisionamento, revogação e entrada de profissionais externos precisam ser esclarecidos. A entrada familiar foi confirmada em DF-011. |
| DF-008 | Seguir o padrão de código do projeto de atendimento | Localizado em `/home/lucas/projetos/Atendimento` e inspecionado na revisão `748500f3422f29e2f42330fffede371dc16ccf12`. Os padrões de referência e as adaptações necessárias estão em [referencia-atendimento.md](referencia-atendimento.md). |
| DF-009 | Usar a identidade da Francescato fornecida pelo marketing da Edilaine | O solicitante obterá os materiais com o time de marketing. O site orienta a marca; a proposta comercial da Trívia e o mockup não constituem o design final. |
| DF-010 | Perguntar em caso de dúvida, sem inferir | Escolhas não confirmadas permanecerão pendentes. Recomendações técnicas serão apresentadas como recomendações, com decisão registrada após resposta. |
| DF-011 | Acesso familiar por convite inicial do Supabase, seguido de e-mail e senha | Edilaine cadastra e convida o familiar; o destinatário define a própria senha pelo link inicial. Os acessos seguintes usam e-mail e senha, com “Esqueci minha senha” e recuperação por e-mail. Não substitui o login Google Workspace da equipe nem amplia permissões por caso. |

## Material de partida

- A especificação funcional contém 12 jornadas, requisitos FR-001 a FR-054, critérios SC-001 a SC-012, regras de acesso propostas e distinção entre núcleo inicial e evoluções.
- O mockup demonstra os fluxos, mas não é uma implementação conectada dos serviços.
- A constituição em `.specify/memory/constitution.md` ainda é o template do Spec Kit, sem princípios ratificados. Seus exemplos não constituem decisões do projeto.
- A proposta comercial menciona Whisper para até 50 horas de áudio. A escolha atual de OpenRouter não confirma substituição, manutenção ou fornecedor/modelo para transcrição.
- As metas do piloto e as hipóteses de negócio identificadas em `spec.md` ainda precisam de validação; não serão promovidas a compromissos técnicos automaticamente.

## Decisões a esclarecer

As áreas abaixo permanecem parcialmente abertas após a revisão dos documentos e as respostas do solicitante. As decisões confirmadas estão na tabela acima; não serão escolhidas alternativas para os pontos restantes sem esclarecimento.

| Área | O que permanece pendente | Por que precisa ser definido na fundação |
| --- | --- | --- |
| Escopo de entrada em produção | Funcionalidades da primeira entrega e participantes iniciais | Determina o recorte das specs de desenvolvimento e dos critérios de aceite. |
| Identidade e autorização | Participantes externos, domínio Workspace, concessão de acesso, conta familiar já existente e políticas de convite, senha e sessão | A entrada familiar foi confirmada em DF-011; os detalhes restantes determinam limites, recuperação e revogação sem ampliar permissões. |
| Organização e casos | Operação exclusivamente Francescato, vínculos entre paciente, casos e períodos de acompanhamento | Determina limites de acesso e relações persistidas, sem converter hipóteses em regras. |
| Documentos | Drive compartilhado ou pasta institucional, conta responsável, categorias e acesso direto aos arquivos | Determina continuidade institucional, organização e coerência entre acesso no aplicativo e no Drive. |
| Agenda | Criação/cancelamento, edição de séries e conflitos | Consulta e atualização pelo sistema, agendas nas contas individuais dos profissionais e agenda global em e-mail compartilhado com permissões separadas de visualização e edição foram confirmados em DF-006. Os pontos restantes determinam sincronização, alcance da escrita e responsabilidades. |
| Áudio e IA | Provedor/modelo de transcrição, funções de IA na primeira entrega, revisão, duração e guarda do original | Determina fluxo de registro, orçamento de uso e tratamento de dados enviados a serviços externos. |
| Dados e operação | Ambientes, região, recuperação, retenção, segredos, auditoria e responsáveis pelas contas dos serviços | Determina a operação verificável e a continuidade do produto. |
| Escala e metas | Casos, usuários, volume de anexos/áudio e expectativas de resposta/recuperação | Determina limites e critérios de capacidade sem inventar números. |
| Marca e experiência | Materiais oficiais, tipografia licenciada, componentes e aprovação do marketing | Determina a interface final e sua validação no celular. |

## Acesso familiar confirmado

Fluxo de negócio: Edilaine cadastra o familiar e seu vínculo autorizado → envia convite inicial → familiar abre o link e define a senha → passa a entrar com e-mail e senha. A tela de login oferece “Esqueci minha senha”; um link de recuperação válido permite definir uma nova senha. Convites e redefinições não concedem acesso a casos por si só.

O “primeiro magic link” solicitado representa o convite de ativação, e não uma escolha de login sem senha para todos os acessos. O Supabase documenta o [envio de convite por e-mail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) e a [recuperação de senha por e-mail, seguida de definição da nova senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail). Consulta realizada em 2026-10-10; são capacidades verificadas, não um contrato técnico já implementado.

No planejamento serão definidos callbacks e redirecionamentos permitidos, envio de e-mails em produção, expiração e reenvio de convites, política de senha/sessão e tratamento de identidade já existente. Não foram escolhidos prazos, provedor de e-mail ou políticas numéricas nesta etapa.

## Referência de código inspecionada

O solicitante indicou o projeto vizinho. O diretório local é `Atendimento`, com inicial maiúscula. A inspeção foi somente de leitura; o projeto de referência não foi alterado. As evidências estão em [referencia-atendimento.md](referencia-atendimento.md).

- Base de referência: React 19, Vite, TypeScript estrito, TanStack Router, pnpm e Turbo.
- Módulos em `domain`, `application`, `infrastructure` e `interfaces`, com contratos explícitos nas fronteiras.
- Supabase/PostgreSQL, migrações versionadas, políticas de acesso no banco e testes de acesso permitido/negado.
- Edge Functions em Deno, integrações isoladas em adapters e segredos tratados no servidor.
- Netlify com configuração de build, rotas e cabeçalhos versionada.
- Tailwind e componentes base no padrão shadcn/ui; tokens visuais do Francescapp dependerão da marca fornecida pelo marketing.
- Biome, Vitest, testes SQL/Deno e Playwright para verificação proporcional ao risco da mudança.

Esses padrões são a referência indicada pelo solicitante. Topologia de ambientes, login Google, permissões por caso, integração de escrita no Drive e políticas de uso de IA ainda precisam ser detalhados para a Francescato.

## Condições para consolidar o plano técnico

1. Manter a rastreabilidade para a referência de código já inspecionada e confirmar adaptações quando dependerem de novas decisões.
2. Registrar as respostas que definem o recorte inicial e os limites de acesso, dados e integrações.
3. Consolidar os princípios do projeto na constituição, a partir das decisões confirmadas.
4. Gerar `plan.md`, `research.md`, `data-model.md`, contratos de integração e guia de validação com rastreabilidade para os requisitos funcionais.
5. Gerar `tasks.md` após a revisão de consistência das decisões e do plano.

Enquanto houver decisões fundamentais pendentes, as specs podem evoluir, mas o desenho de banco, os contratos técnicos e as tarefas dependentes não serão declarados prontos para implementação.
