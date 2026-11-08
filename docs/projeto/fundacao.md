# Fundação do desenvolvimento do FFCMApp

**Data**: 2026-10-16

**Branch**: `codex/fundacao-desenvolvimento`

**Estado**: decisões fornecidas registradas; primeira fatia técnica proposta em [fundar-identidade-e-seguranca-backend](../../openspec/changes/fundar-identidade-e-seguranca-backend/proposal.md), com desenho de banco, contratos e tarefas para revisão. Backend ainda não implementado; outras fatias permanecem no roteiro.

**Especificações funcionais**: [openspec/specs](../../openspec/specs)

**Contexto e metas**: [contexto-negocio.md](contexto-negocio.md)

## Decisões confirmadas pelo solicitante

| ID | Decisão | Origem e limite da decisão |
| --- | --- | --- |
| DF-001 | Iniciar a preparação do desenvolvimento a partir das especificações | Aprovação do projeto por Edilaine informada em 2026-10-10. Detalhes pendentes serão esclarecidos antes da implementação. |
| DF-002 | Utilizar Supabase | Servidor e banco de dados da aplicação. Projeto informado e confirmado: `drdpuxcllpymtoskmuqv`, URL `https://drdpuxcllpymtoskmuqv.supabase.co`. Configuração, região efetiva, execução e recuperação devem ser conferidas antes de publicação; informar o alvo não autoriza migração. |
| DF-003 | Utilizar Netlify | Serviço escolhido para a infraestrutura. Publicação, configuração aplicável ao ambiente único e eventual execução de funções ainda não foram definidos. |
| DF-004 | Utilizar OpenRouter para IA e transcrição | Decisão “OpenRouter tudo então” registrada na fundação real. Original será apagado após revisão, conforme DF-020. Modelo, qualidade, limites, tratamento no processador e áudios abandonados ainda precisam de definição; não adicionar fornecedores diretos por inferência. |
| DF-005 | Integrar Google Drive compartilhado institucional | Anexos classificados por paciente e sob administração da Francescato. Drive compartilhado confirmado em 15/10/2026, não pasta no Meu Drive. É permitido propor a organização; identificador, raiz, categorias, responsáveis e concessão/revogação coerente de acesso direto ainda precisam ser definidos. Família somente pelo app. |
| DF-006 | Integrar Google Calendar para consulta, criação, alteração e cancelamento pelo sistema | Criação e cancelamento confirmados em 16/10/2026, junto de consulta/atualização. Cada profissional mantém agenda na própria conta Google; o e-mail compartilhado mantém a global, com “Pode visualizar” e “Pode editar” separados. Consulta não concede escrita. Confirmar na origem antes de informar conclusão; séries, conflitos, fuso e sincronização ainda exigem detalhamento. |
| DF-007 | Manter acesso individual da equipe com Google Workspace | Decisão anterior preservada. Domínio, provisionamento, revogação e entrada de profissionais externos precisam ser esclarecidos. A entrada familiar foi confirmada em DF-011. |
| DF-008 | Seguir o padrão de código do projeto de atendimento | Localizado em `/home/lucas/projetos/Atendimento` e inspecionado na revisão `748500f3422f29e2f42330fffede371dc16ccf12`. Os padrões de referência e as adaptações necessárias estão em [referencia-atendimento.md](referencia-atendimento.md). |
| DF-009 | Usar a identidade da Francescato | Logos e paleta de referência recebidos em 15/10/2026, preservados em [identidade-visual.md](identidade-visual.md). Fontes, manual/vetores e componentes finais ainda precisam de confirmação. A proposta comercial da Trívia e o mockup não constituem o design final. |
| DF-010 | Perguntar em caso de dúvida, sem inferir | Escolhas não confirmadas permanecerão pendentes. Recomendações técnicas serão apresentadas como recomendações, com decisão registrada após resposta. |
| DF-011 | Acesso familiar por convite inicial do Supabase, seguido de e-mail e senha | Edilaine cadastra e convida o familiar; o destinatário define a própria senha pelo link inicial. Os acessos seguintes usam e-mail e senha, com “Esqueci minha senha” e recuperação por e-mail. Não substitui o login Google Workspace da equipe nem amplia permissões por caso. |
| DF-012 | Nome do aplicativo: FFCMApp | Confirmado em 15/10/2026. Não renomeia automaticamente repositório, domínio, integrações, mock ou documentos históricos. |
| DF-013 | Histórico contínuo por paciente | Confirmado em 15/10/2026. Pausas e retomadas preservam o histórico, sem episódios independentes; não restauram vínculos revogados nem ampliam audiências. |
| DF-014 | Mesmo ambiente remoto para testes e futura produção | Confirmado em 15/10/2026. Utilizar o ambiente destinado à produção antes da liberação, somente com dados fictícios e operações reais configuradas. Não provisiona contas nem autoriza dados reais por nome/endereço do ambiente. |
| DF-015 | Limpeza seletiva e conferência antes do uso real | Alcance confirmado: cadastros, registros, anexos e eventos identificados como testes. Preservar configurações, acessos administrativos válidos e conteúdo institucional preexistente. Procedimento, identificação técnica e evidência de liberação serão detalhados; nenhuma exclusão está autorizada para execução agora. |
| DF-016 | Um perfil por usuário | Confirmado em 15/10/2026. Cada usuário com acesso concedido possui um único perfil entre Administrador, Profissional e Família, sem acúmulo; trocar perfil não mantém privilégios residuais do anterior. |
| DF-017 | Equipe com cadastro prévio por Administrador | Confirmada a entrada somente após cadastro e concessão por Administrador. Login Google identifica a pessoa, mas não cria automaticamente perfil ou acesso à carteira. |
| DF-018 | Administração inicial e acesso técnico individual | Edilaine confirmada para administração de negócio inicial. O solicitante autorizou exceção individual por e-mail/senha para acompanhamento técnico. A conta Supabase Auth foi criada e o login testado na operação autorizada anterior; o perfil Administrador da aplicação ainda não foi concedido. Bootstrap restrito está proposto, não executado. Isso não libera senha para toda a equipe; credenciais/identificadores pessoais não são versionados. |
| DF-019 | Cadastro mínimo sem CPF obrigatório | Confirmado em 16/10/2026: nome do paciente obrigatório; nome de preferência, nascimento e contatos opcionais; familiares e responsáveis vinculados separadamente. Relação pessoal não cria conta/permissão; não exigir anamnese completa para salvar o mínimo. Decisão de 08/11/2026 (change `ficha-do-paciente`): para casos novos, a partir da entrega 2, o cadastro exige nome, preferência, nascimento, ao menos um contato, situação e case manager, sem valor padrão; CPF, familiar e anamnese seguem não exigidos. O cadastro mínimo continua válido até a entrega 2 e para os casos já existentes, que mostram os campos ausentes como "a completar". |
| DF-020 | Apagar áudio original após revisão | Confirmado em 16/10/2026. Permitir ouvir/corrigir durante a revisão; após confirmação humana e salvamento do texto revisado, solicitar exclusão do original. Mostrar exclusão pendente/falha até confirmação, sem perder o texto. Retenção de abandonados/cópias e política do processador continuam a definir; não prometer eliminação fora do controle da aplicação. |

## Material de partida

- A especificação funcional contém 12 jornadas, requisitos FR-001 a FR-054, critérios SC-001 a SC-012, regras de acesso propostas e distinção entre núcleo inicial e evoluções.
- O mockup demonstra os fluxos, mas não é uma implementação conectada dos serviços.
- O processo ativo é OpenSpec, conforme a migração autorizada em 14/10/2026. AGENTS.md reúne as diretrizes adaptadas do HED, preservando a referência de código Atendimento. O antigo template de constituição está arquivado e nunca foi ratificado.
- A proposta comercial menciona Whisper para até 50 horas de áudio. OpenRouter foi confirmado também para transcrição; isso não define modelo específico, qualidade, política de dados ou retenção do endpoint. Consultar os limites registrados na mudança de fundação real.
- As metas do piloto e as hipóteses de negócio identificadas em `contexto-negocio.md` ainda precisam de validação; não serão promovidas a compromissos técnicos automaticamente.

## Decisões a esclarecer

As áreas abaixo permanecem parcialmente abertas após a revisão dos documentos e as respostas do solicitante. As decisões confirmadas estão na tabela acima; não serão escolhidas alternativas para os pontos restantes sem esclarecimento.

| Área | O que permanece pendente | Por que precisa ser definido na fundação |
| --- | --- | --- |
| Escopo de entrada em produção | Participantes iniciais e sequência das fatias de desenvolvimento | Todo o núcleo inicial já está confirmado; a execução por fatias não reduz a primeira entrega nem inclui evoluções automaticamente. |
| Identidade e autorização | Domínio/Client ID Workspace, identidade de Edilaine, envio de e-mails; conta familiar já existente e políticas de convite, senha e sessão | Projeto e exceção técnica confirmados; conta Auth técnica criada, autorização de aplicação pendente. Primeira fatia propõe bootstrap restrito e sessão; revisão não equivale a executar concessão. |
| Organização e casos | Duplicidade, representação e regras detalhadas de retomada/anamnese | Operação exclusiva, histórico contínuo e cadastro mínimo DF-019 confirmados (cadastro completo para casos novos a partir da entrega 2, decisão de 08/11/2026); os pontos restantes não serão inferidos. |
| Documentos | Identificador do Drive compartilhado, raiz, responsáveis, categorias e concessão/revogação do acesso direto | Drive compartilhado institucional confirmado; definir a organização e a coerência entre acesso pelo app e pelo Drive sem abrir conteúdo preexistente automaticamente. |
| Agenda | Edição de séries, conflitos, vínculo evento-paciente, fuso, lembretes e reconciliação | Consulta/criação/alteração/cancelamento confirmados em DF-006, com agendas individuais/globais e permissões de escrita separadas. Os pontos restantes precisam de contrato antes da implementação da integração. |
| Áudio e IA | Modelo de transcrição, limites/qualidade, tratamento pelo processador, áudio abandonado e cópias | Original apagado após revisão confirmada (DF-020), sem prazo inventado para abandono. Funções adicionais de IA continuam sujeitas à fase/escopo, sem promoção automática de FR-044. |
| Dados e operação | Região/configuração efetivas, recuperação, retenção, segredos e responsáveis; procedimento de transição | Projeto/ambiente único e alcance seletivo da limpeza confirmados. Auditoria e proveniência de teste estão no desenho técnico; políticas e evidências operacionais ainda são gates, sem autorizar reset ou dados reais. |
| Escala e metas | Casos, usuários, volume de anexos/áudio e expectativas de resposta/recuperação | Determina limites e critérios de capacidade sem inventar números. |
| Marca e experiência | Códigos oficiais/manual, arquivos vetoriais, tipografia licenciada, componentes e aprovação das aplicações da marca | Logos e paleta de referência já recebidos; os pontos restantes determinam a interface final e sua validação no celular. |

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
- Tailwind e componentes base no padrão shadcn/ui; tokens visuais do FFCMApp considerarão os materiais recebidos, sem tratar fontes e componentes provisórios como aprovados.
- Biome, Vitest, testes SQL/Deno e Playwright para verificação proporcional ao risco da mudança.

Esses padrões são a referência indicada pelo solicitante. Em 16/10/2026 houve reconsulta somente leitura ao Atendimento na revisão `a684d96c9cc044bcf391f558a69ac48db928b51d`; decisões adaptadas e limites estão no [desenho técnico](../../openspec/changes/fundar-identidade-e-seguranca-backend/design.md). Isso não certifica as suítes da referência. Configuração Google, escrita Drive/Calendar e políticas de IA ainda exigem suas evidências de integração.

## Transição do ambiente de testes para uso real

Utilizar o mesmo ambiente não transforma conteúdo fictício em fallback: testes manuais usam dados de teste por operações realmente persistidas e confirmadas. Configuração ausente, erro ou falta de permissão continuam visíveis.

Antes do uso real, conferir a limpeza dos cadastros, registros, anexos e eventos identificados como testes, inclusive nas integrações em que foram criados. Não limpar Drive/agenda em bloco ou presumir que conteúdo institucional anterior ao produto é teste. Um item com origem duvidosa fica para conferência, não remoção automática.

Configurações, acessos administrativos válidos e conteúdo institucional preexistente devem permanecer. Falha ou resultado parcial mantém a transição pendente. O procedimento, as evidências e a autorização de execução serão definidos antes de qualquer remoção; retenção de logs/cópias e demais políticas de dados continuam pendentes, sem promessa de eliminação fora do alcance confirmado.

Decisões normativas anteriores: [registrar-fundacao-real](../../openspec/changes/registrar-fundacao-real/proposal.md), ainda sem desenho/tarefas próprios concluídos. O novo [pacote de backend](../../openspec/changes/fundar-identidade-e-seguranca-backend/proposal.md) complementa esses deltas, sem reescrevê-los ou declarar implementação/prontidão do núcleo.

## Condições para consolidar o plano técnico

1. Manter a rastreabilidade para a referência de código já inspecionada e confirmar adaptações quando dependerem de novas decisões.
2. Registrar as respostas que definem o recorte inicial e os limites de acesso, dados e integrações.
3. Manter as diretrizes em AGENTS.md e o contexto OpenSpec consistentes com as decisões confirmadas.
4. Criar mudanças OpenSpec por entrega, com proposal.md, deltas de requisitos, design.md e tasks.md. O design deverá conter modelo de dados, contratos de integração e estratégia de validação quando pertinentes.
5. Revisar coerência e pendências antes de autorizar implementação; tarefas precisam de critérios e evidências rastreáveis.

Enquanto houver decisões fundamentais pendentes, as specs podem evoluir, mas o desenho de banco, os contratos técnicos e as tarefas dependentes não serão declarados prontos para implementação.
