# Referência de código: Atendimento

**Inspeção**: 2026-10-10

**Diretório**: `/home/lucas/projetos/Atendimento`

**Revisão**: `748500f3422f29e2f42330fffede371dc16ccf12`

**Origem**: o solicitante determinou seguir o padrão desse projeto e indicou o diretório vizinho.

**Método**: leitura de instruções, configurações, exemplos de código, testes e decisões registradas. Nenhuma mudança, execução de testes ou chamada aos serviços do Atendimento foi realizada.

## Padrões encontrados

Os caminhos da coluna de evidência são relativos à raiz do projeto Atendimento. As versões abaixo descrevem a referência consultada, não uma pesquisa de versões mais recentes.

| Área | Padrão observado | Evidência |
| --- | --- | --- |
| Aplicação web | React 19, Vite, TypeScript e TanStack Router em `apps/web` | `AGENTS.md`, `apps/web/package.json` |
| Organização | Workspace pnpm com `apps/*` e `packages/*`, orquestração por Turbo | `pnpm-workspace.yaml`, `package.json` |
| Runtime de build | Node 22 e pnpm 9.15.9 | `netlify.toml`, `.github/workflows/ci.yml` |
| Tipagem | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` e `noFallthroughCasesInSwitch` | `tsconfig.base.json` |
| Módulos | `apps/web/src/modules/<modulo>/{domain,application,infrastructure,interfaces}` | `.specify/memory/constitution.md`, `apps/web/src/modules/agente/` |
| Regras de negócio | Domínio sem I/O e sem framework; casos de uso com portas tipadas; integrações e persistência em adapters | `modules/agente/domain/configuracao.ts`, `modules/agente/application/portas.ts`, `modules/agente/infrastructure/repositorio-treinamento-supabase.ts` sob `apps/web/src/` |
| Fronteiras | Comunicação entre módulos por `core/events` ou contratos em `packages/shared`; evitar importação de internals de outro módulo | `.specify/memory/constitution.md`, `apps/web/src/core/events/`, `packages/shared/src/` |
| Vocabulário | Nomes de negócio em português; tipos e resultados explícitos; testes próximos ao código | `apps/web/src/core/sessao.ts`, `modules/agente/application/comparar-versoes.ts` e seu teste sob `apps/web/src/` |
| Banco | PostgreSQL no Supabase, migrações com timestamp, correções por novas migrações e mudanças aditivas | `.specify/memory/constitution.md`, `supabase/migrations/20261001160000_agenda_configuracao_gestao.sql` |
| Autorização | RLS habilitada e forçada como regra, autorização de escrita no servidor e testes positivos/negativos | `.specify/memory/constitution.md`, `supabase/tests/core_cofre_vault_autorizacao.sql` |
| Backend | Supabase Edge Functions em Deno, funções e adapters com testes | `supabase/functions/`, `.github/workflows/ci.yml` |
| Sessão | Access token em memória, refresh em cookie HttpOnly, requisições por proxy da mesma origem e proteção CSRF | `apps/web/src/core/sessao.ts`, `apps/web/src/core/infrastructure/cliente-supabase.ts`, `docs/adr/0001-autenticacao.md` |
| Credenciais de integração | Referências opacas, segredo acessível somente no servidor; Vault na decisão atual | `docs/adr/0037-cofre-no-supabase-vault.md`, `supabase/tests/core_cofre_vault_autorizacao.sql` |
| OAuth de calendário | Estado assinado e expirável, callback com consumo único e credenciais tratadas no servidor | `supabase/functions/calendario-oauth/estado.ts`, `docs/adr/0043-agendamento-conversacional-e-calendarios.md` |
| Erros e logs | Respostas externas com códigos sanitizados; log seguro aceita somente campos e combinações definidos | `supabase/functions/_shared/log-seguro.ts`, `apps/web/src/modules/agente/infrastructure/repositorio-treinamento-supabase.ts` |
| Interface | Tailwind, componentes base no padrão shadcn/ui, tokens de tema, estados de carregamento/vazio/erro e foco visível | `AGENTS.md`, `.specify/memory/constitution.md`, `apps/web/src/components/ui/` |
| Formatação | Biome; indentação com dois espaços, linha de 100 caracteres, aspas simples e ponto e vírgula quando necessário | `biome.json` |
| Testes | Vitest e Testing Library; testes SQL de acesso, Deno para funções e Playwright para jornadas críticas | `package.json`, `apps/web/package.json`, `.github/workflows/ci.yml`, `playwright.config.ts` |
| Publicação | Build e destino versionados, redirecionamento de SPA, cabeçalhos de segurança e política de cache | `netlify.toml` |
| CI | Dependências com lockfile congelado, lint, tipos, testes e build; banco/funções conforme impacto | `.github/workflows/ci.yml` |

## Aplicação ao Francescapp

A determinação de seguir o padrão de código orienta a estrutura em camadas, a tipagem, os adapters, as migrações, os testes e a configuração versionada. Os módulos do Francescapp serão definidos pelo seu domínio de cuidado; os módulos de CRM, vendas e atendimento comercial não constituem o modelo do novo produto.

Os arquivos e as decisões do Atendimento documentam como a referência funciona. Uma declaração em ADR ou constituição não é, por si, uma validação de que o comportamento passa em produção; essa inspeção não executou suas suítes. O plano do Francescapp deverá conter suas próprias provas de autorização e integração.

## Adaptações identificadas

| Tema | Situação na referência | Tratamento necessário no Francescapp |
| --- | --- | --- |
| Entrada da equipe | Convite com e-mail e senha no Atendimento | A equipe da Francescato entra pelo Google Workspace. O fluxo de login deve ser desenhado para essa decisão, mantendo a separação entre autenticação e autorização. |
| Familiares e cuidadores | Leads do Atendimento não entram na aplicação | Edilaine cadastra e convida o familiar por link inicial do Supabase; o destinatário define a senha e passa a usar e-mail/senha, com recuperação por e-mail. Adaptar o fluxo sem reutilizar os papéis de CRM ou ampliar acesso aos casos. Ver DF-011 em `fundacao.md`. |
| Permissões | Papéis internos de CRM | O Francescapp exige vínculo por caso e audiência por conteúdo. O papel sozinho não concede acesso a todos os pacientes. |
| Marca | Tokens e linguagem visual da Trívia/TriviAtende | Usar os materiais fornecidos pelo marketing da Edilaine. O padrão de componentes não determina cores, fontes ou densidade do produto. |
| Microfone | `netlify.toml` contém `microphone=()` | A política de publicação deverá permitir o microfone na origem do aplicativo para os registros de áudio previstos em FR-010. |
| Drive | ADR de fonte de conhecimento predominantemente de leitura | O Francescapp precisa enviar e classificar anexos no Drive institucional. O modelo de acesso e os escopos serão definidos para esse fluxo, sem transplantar os escopos descritos naquele ADR. |
| Calendário | Agenda comercial com reserva e criação de reuniões | Consulta e atualização pelo sistema foram confirmadas: cada profissional mantém a agenda na própria conta Google, e o e-mail compartilhado mantém a agenda global com permissões separadas de visualização e edição por usuário. Adaptar autorizações e sincronização; ações de escrita, séries e conflitos permanecem pendentes em DF-006. |
| IA e áudio | OpenRouter para geração; OpenAI para transcrição em integração separada | OpenRouter foi escolhido no Francescapp; manter ou substituir a transcrição descrita na proposta ainda precisa de confirmação. |
| Guarda | Políticas próprias de conversas comerciais | Os prazos e a guarda de registros de cuidado, anexos e áudios precisam de definição própria. |
| Ambientes | A referência tem decisões próprias sobre instância única e testes remotos | Ambientes, isolamento, contas responsáveis e uso de dados de teste serão definidos explicitamente para o Francescapp. |

## Pontos preservados para o planejamento

- O modelo técnico de identidade, autorização por caso e acesso aos arquivos depende das respostas do solicitante.
- As referências .specify/ desta inspeção pertencem ao Atendimento, não ao fluxo ativo do Francescapp. A escolha dos padrões acima não provisiona contas, não reutiliza credenciais e não publica o aplicativo.
- O processo ativo do Francescapp é OpenSpec; as diretrizes de engenharia estão em AGENTS.md e serão aplicadas com as decisões confirmadas e verificações deste produto.
- As versões exatas das dependências e ferramentas serão registradas no plano e no lockfile da implementação, a partir da referência inspecionada.
