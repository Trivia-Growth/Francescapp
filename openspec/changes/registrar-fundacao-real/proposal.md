# Proposal

## Why

O projeto foi aprovado para uso real, mas o mockup não cobre integralmente configuração, cadastro e operação. A demonstração deve continuar como referência, sem limitar o produto nem esconder falhas durante os testes pelo frontend.

## What Changes

- Confirmar operação exclusiva da Francescato e todo o núcleo inicial na primeira entrega: cadastro, anamnese, diário, anexos, agenda, plano e pendências, incluindo identidade, permissões e governança. Evoluções já identificadas não são promovidas automaticamente ao núcleo.
- Confirmar que a Francescato pode acessar documentos pelo app e pelo Google Drive compartilhado institucional; familiares acessam somente pelo app, sempre no escopo autorizado. A organização interna de pastas ainda será validada.
- Adotar histórico contínuo por paciente, preservado nas pausas e retomadas, sem separar o acompanhamento em episódios independentes nem apagar autoria ou audiências.
- Confirmar OpenRouter como integração de IA e transcrição. Whisper será acessado por essa integração; modelo específico, limites, política de dados e qualidade ainda serão validados. Não planejar OpenAI/Groq diretos como integrações adicionais de produção sem nova decisão.
- Registrar que o solicitante criará contas exclusivas para a Francescato. O ambiente destinado à produção também será usado nos testes anteriores à liberação, somente com dados fictícios; identificadores, responsáveis, acessos e configuração ainda serão definidos, sem solicitar segredos na conversa.
- Exigir identificação de cadastros, registros, anexos e eventos de teste e limpeza seletiva com conferência antes da entrada de dados reais. Preservar configurações, acessos administrativos válidos e conteúdo institucional preexistente; esta decisão não autoriza exclusão agora nem reset indiscriminado do ambiente ou do Drive.
- Adotar três perfis fixos no núcleo: Administrador, Profissional e Família, com um único perfil por usuário, sem acúmulo. Edilaine poderá delegar a administração; administradores acessam a carteira completa, configurações, cadastros e gestão de acessos. Os demais acessam pacientes vinculados, com visão da equipe ou da família conforme o perfil, sem matriz extensa por funcionalidade.
- Exigir cadastro prévio dos profissionais por Administrador antes do acesso Google autorizado. Edilaine foi confirmada para a administração inicial; o solicitante também pediu acesso administrativo técnico. O projeto Supabase e a autenticação desse acesso técnico ainda precisam de confirmação para o cadastro efetivo; não versionar credenciais ou dados de configuração pessoais.
- Preservar as permissões individuais de visualizar/editar a agenda global e impedir que vínculo com paciente, por si só, exponha conteúdo interno da equipe à família. A autorização será conferida na operação real, não somente na interface.
- Definir honestidade operacional: falhas e integrações incompletas devem ser visíveis no frontend, sem dados de exemplo ou sucesso simulado como substituição de respostas reais.
- Planejar jornadas completas de configuração, cadastro e uso por perfil. As telas do mock orientam descoberta, não delimitam campos, etapas ou regras da aplicação real.
- Registrar como pré-requisito arquivar `mockup/` e `output/mockup/` fora da base ativa antes do desenvolvimento da aplicação. Preservar specs, proposta, PDFs, fontes e licenças; mocks de testes ficam isolados de runtime real.

### Decisões confirmadas nesta rodada

| Tema | Decisão do solicitante |
| --- | --- |
| Organização | Exclusivo Francescato. |
| Primeira entrega | Todo o núcleo, não uma versão reduzida. |
| Documentos | Francescato: Drive e app. Família: somente app. |
| Acompanhamento | Histórico contínuo por paciente, sem episódios independentes; preservar histórico nas pausas e retomadas. |
| Local dos anexos | Google Drive compartilhado institucional, não pasta no Meu Drive de uma conta. |
| Ambiente remoto | Mesmo ambiente para testes e futura produção; somente dados fictícios até a liberação. |
| Transição para uso real | Identificar e remover somente itens de teste, com conferência; preservar configurações, acessos administrativos válidos e conteúdo institucional preexistente. Nenhuma exclusão nesta captura. |
| IA e transcrição | “OpenRouter tudo então”, após confirmação de disponibilidade de Whisper/Groq. |
| Contas | Serão criadas contas exclusivas para a Francescato; Drive institucional. |
| Administração | Edilaine poderá delegar a outras pessoas, com perfil Administrador e acesso à carteira completa e funções administrativas. |
| Perfis iniciais | Administrador, Profissional e Família; um perfil por usuário, sem acúmulo; vínculo por paciente para não administradores, sem matriz extensa de permissões. |
| Entrada da equipe | Cadastro prévio por Administrador; Google identifica o usuário, mas não cria automaticamente autorização. |
| Administração inicial | Edilaine confirmada; acesso administrativo técnico também solicitado pelo responsável pelo projeto, ainda não criado. Projeto Supabase e método desse acesso técnico permanecem pendentes. |
| Visibilidade por perfil | Profissional: visão da equipe nos pacientes vinculados. Família: próprios relatos e conteúdo disponibilizado nos pacientes vinculados. Agenda global mantém consulta/edição separadas. |
| Mock e falhas | Arquivar a demonstração fora da base ativa; não mascarar falhas em testes pelo frontend. |
| Jornada real | Mock insuficiente, especialmente configuração e cadastro; não copiar suas limitações para o produto. |

## Capabilities

### New Capabilities

- `integridade-operacional`: resultados reais, falhas explícitas, isolamento de simulações, testes fictícios persistidos no mesmo ambiente e transição conferida para uso real.

### Modified Capabilities

- `caso-e-anamnese`: complementar FR-001 a FR-007 com histórico contínuo por paciente, sem ampliar audiências ou transformar retorno em novo histórico independente.
- `documentos-institucionais`: detalhar FR-029 a FR-031 para Drive compartilhado institucional, família somente pelo app e acesso institucional autorizado também pelo Drive, mantendo audiência e revogação.
- `sigilo-e-governanca`: registrar perfil único, cadastro prévio da equipe, delegação administrativa, carteira completa para administradores e escopo por paciente/perfil para os demais, preservando auditoria e controles da agenda global.

## Impact

O repositório contém uma aplicação demonstrativa em HTML/JS, não uma aplicação conectada: `mockup/app.js` usa dados iniciais, armazenamento local e simulações de transcrição/anexos. `mockup/build-portable.mjs` produz a distribuição em `output/mockup/`. Não há backend ou frontend de produção a corrigir nesta captura.

A futura limpeza afetará esses dois diretórios e suas referências em README/design/verificadores, sem apagar o histórico. `output/proposta-edilaine.html` usa fontes de `mockup/assets/`: mover a demonstração sem preservar esses recursos quebraria a proposta. A futura mudança deverá conservar os arquivos e licenças e conferir o HTML comercial e os PDFs.

O perfil Administrador é uma concessão explícita, não uma consequência de entrar pelo Workspace. Sua carteira completa não depende de vinculação individual a cada paciente. No futuro design, a matriz de testes de FR-035/SC-011 distinguirá esse perfil de profissionais e familiares sem vínculo, preservando os testes negativos; este registro não altera o método de login. A simplificação também não introduz notas clínicas privadas detalhadas no núcleo nem modifica a privacidade de rascunhos prevista em FR-036.

A integração OpenRouter está confirmada, mas sua escolha não confirma controles de roteamento, fallback ou retenção disponíveis para transcrição. A documentação consultada em 14/10/2026 lista Whisper e Groq e declara limitações específicas nesse endpoint: [transcrição](https://openrouter.ai/blog/tutorials/transcription-on-openrouter/), [Groq no OpenRouter](https://openrouter.ai/provider/groq). Essas condições devem ser conferidas no planejamento; não reutilizar sem verificação os controles de chat.

### Limite desta captura

Somente proposta e deltas de requisitos. Nenhum mock foi arquivado, nenhum provedor foi chamado com áudio, nenhuma conta foi provisionada, nenhum dado foi limpo e nenhuma aplicação foi implementada. A captura não declara prontidão para executar tarefas de produção. A confirmação do ambiente único não autoriza dados reais antes da liberação nem dispensa autorização, auditoria e recuperação aplicáveis.

### Pendências preservadas

Identificador do Drive compartilhado, raiz e organização de pastas; concessão/revogação coerente de acesso direto; cadastro mínimo, duplicidade e regras detalhadas de retomada; configuração Google e envio de convites; mecanismo restrito de concessão administrativa inicial, projeto Supabase e autenticação do acesso técnico solicitado; modelo de transcrição, limites, qualidade e guarda do áudio; configuração/região do ambiente único, recuperação e políticas de dados. Identificação técnica dos itens de teste, procedimento de limpeza e evidência de liberação serão definidos antes de qualquer remoção. Perfil único, cadastro prévio da equipe e as decisões anteriores estão confirmados; os pontos restantes não serão inferidos. Nenhuma conta administrativa foi criada nesta revisão.
