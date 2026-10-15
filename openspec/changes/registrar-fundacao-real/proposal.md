# Proposal

## Why

O projeto foi aprovado para uso real, mas o mockup não cobre integralmente configuração, cadastro e operação. A demonstração deve continuar como referência, sem limitar o produto nem esconder falhas durante os testes pelo frontend.

## What Changes

- Confirmar operação exclusiva da Francescato e todo o núcleo inicial na primeira entrega: cadastro, anamnese, diário, anexos, agenda, plano e pendências, incluindo identidade, permissões e governança. Evoluções já identificadas não são promovidas automaticamente ao núcleo.
- Confirmar que a Francescato pode acessar documentos pelo app e pelo Drive institucional; familiares acessam somente pelo app, sempre no escopo autorizado.
- Confirmar OpenRouter como integração de IA e transcrição. Whisper será acessado por essa integração; modelo específico, limites, política de dados e qualidade ainda serão validados. Não planejar OpenAI/Groq diretos como integrações adicionais de produção sem nova decisão.
- Registrar que o solicitante criará contas exclusivas para a Francescato; o Drive continuará institucional. Identificadores, administradores, acessos e ambientes ainda serão definidos, sem solicitar segredos na conversa.
- Adotar três perfis fixos no núcleo: Administrador, Profissional e Família. Edilaine poderá delegar a administração; administradores acessam a carteira completa, configurações, cadastros e gestão de acessos. Os demais acessam pacientes vinculados, com visão da equipe ou da família conforme o perfil, sem matriz extensa por funcionalidade.
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
| IA e transcrição | “OpenRouter tudo então”, após confirmação de disponibilidade de Whisper/Groq. |
| Contas | Serão criadas contas exclusivas para a Francescato; Drive institucional. |
| Administração | Edilaine poderá delegar a outras pessoas, com perfil Administrador e acesso à carteira completa e funções administrativas. |
| Perfis iniciais | Administrador, Profissional e Família; vínculo por paciente para não administradores, sem matriz extensa de permissões. |
| Visibilidade por perfil | Profissional: visão da equipe nos pacientes vinculados. Família: próprios relatos e conteúdo disponibilizado nos pacientes vinculados. Agenda global mantém consulta/edição separadas. |
| Mock e falhas | Arquivar a demonstração fora da base ativa; não mascarar falhas em testes pelo frontend. |
| Jornada real | Mock insuficiente, especialmente configuração e cadastro; não copiar suas limitações para o produto. |

## Capabilities

### New Capabilities

- `integridade-operacional`: resultados reais, falhas explícitas, isolamento de simulações e verificação das jornadas completas no frontend.

### Modified Capabilities

- `documentos-institucionais`: detalhar FR-031 para acesso familiar somente pelo app e acesso institucional autorizado também pelo Drive, mantendo audiência e revogação.
- `sigilo-e-governanca`: registrar perfis fixos, delegação administrativa, carteira completa para administradores e escopo por paciente/perfil para os demais, preservando auditoria e controles da agenda global.

## Impact

O repositório contém uma aplicação demonstrativa em HTML/JS, não uma aplicação conectada: `mockup/app.js` usa dados iniciais, armazenamento local e simulações de transcrição/anexos. `mockup/build-portable.mjs` produz a distribuição em `output/mockup/`. Não há backend ou frontend de produção a corrigir nesta captura.

A futura limpeza afetará esses dois diretórios e suas referências em README/design/verificadores, sem apagar o histórico. `output/proposta-edilaine.html` usa fontes de `mockup/assets/`: mover a demonstração sem preservar esses recursos quebraria a proposta. A futura mudança deverá conservar os arquivos e licenças e conferir o HTML comercial e os PDFs.

O perfil Administrador é uma concessão explícita, não uma consequência de entrar pelo Workspace. Sua carteira completa não depende de vinculação individual a cada paciente. No futuro design, a matriz de testes de FR-035/SC-011 distinguirá esse perfil de profissionais e familiares sem vínculo, preservando os testes negativos; este registro não altera o método de login. A simplificação também não introduz notas clínicas privadas detalhadas no núcleo nem modifica a privacidade de rascunhos prevista em FR-036.

A integração OpenRouter está confirmada, mas sua escolha não confirma controles de roteamento, fallback ou retenção disponíveis para transcrição. A documentação consultada em 14/10/2026 lista Whisper e Groq e declara limitações específicas nesse endpoint: [transcrição](https://openrouter.ai/blog/tutorials/transcription-on-openrouter/), [Groq no OpenRouter](https://openrouter.ai/provider/groq). Essas condições devem ser conferidas no planejamento; não reutilizar sem verificação os controles de chat.

### Limite desta captura

Somente proposta e deltas de requisitos. Nenhum mock foi arquivado, nenhum provedor foi chamado com áudio, nenhuma conta foi provisionada e nenhuma aplicação foi implementada. A captura não declara prontidão para executar tarefas de produção.

### Pendências preservadas

Local institucional do Drive e organização de pastas; concessão/revogação coerente de acesso direto; configuração Google e envio de convites; jornadas administrativas reais e concessão inicial do perfil Administrador; modelo de transcrição, limites, qualidade e guarda do áudio; funções adicionais de IA do núcleo; ambientes, recuperação e políticas de dados. Os três perfis e a delegação estão confirmados; dúvidas materiais restantes serão perguntadas antes de gerar design e tarefas executáveis.
