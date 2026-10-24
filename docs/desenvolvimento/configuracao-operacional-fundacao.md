# Configuração operacional da fundação

Esta configuração prepara a fundação local; não conecta, publica ou valida
nenhum serviço remoto. Valores reais ficam somente no ambiente do runtime e
nunca em `.env.example`, logs, respostas HTTP ou fixtures.

## Módulo e interface

`supabase/functions/_shared/configuracao.ts` é o módulo de configuração por
fluxo. Sua interface é `carregarConfiguracao(fluxo, fonte)`: retorna apenas a
configuração validada daquele fluxo ou lança `ErroConfiguracaoIndisponivel`.
Não há valores padrão, configuração implícita nem fallback para um provedor.
O módulo recebe a fonte de configuração do runtime, sem acessar `process.env`,
para manter a mesma implementação utilizável por uma Edge Function e pelo
proxy Node futuro.

| Fluxo | Variáveis obrigatórias | Não depende de |
| --- | --- | --- |
| `cadastro` | `FFCM_SUPABASE_URL`, `FFCM_SUPABASE_ANON_KEY` | OpenRouter, Google e chave de cookie |
| `sessao` | Variáveis de cadastro, `FFCM_COOKIE_SEALING_KEY`, `FFCM_ALLOWED_ORIGINS` | OpenRouter e Google |
| `entrada_google` | Variáveis de sessão, `FFCM_GOOGLE_OAUTH_CLIENT_ID`, `FFCM_GOOGLE_WORKSPACE_DOMAIN` | OpenRouter |
| `openrouter` | `OPENROUTER_API_KEY` | Supabase, Google e cookies |

`FFCM_COOKIE_SEALING_KEY` deve ser material base64url canônico de ao menos 32
bytes.
`FFCM_ALLOWED_ORIGINS` aceita origens exatas separadas por vírgula; HTTPS é
obrigatório, exceto `localhost`/`127.0.0.1` em HTTP para desenvolvimento local.
URL Supabase aceita somente a origem/base, sem caminho adicional, credenciais,
query string ou fragmento. A chave anônima identifica o alvo e não é segredo de servidor; service role e Vault
continuam reservados para seus adapters server-only e tarefas próprias.

Se faltar ou for inválido um requisito, o módulo falha fechado. O adapter HTTP
deve convertê-lo pelo contrato D-09 em
`configuracao_indisponivel`, com a mensagem fixa `Configuração necessária
indisponível.`. O `request_id` é UUID criado internamente pelo servidor e não
aceita valor de cabeçalho, corpo ou outra entrada do chamador. A resposta não
revela qual variável faltou, valor, stack, e-mail, token ou resposta de
provedor. A ausência de OpenRouter só afeta o fluxo explícito de IA e não
bloqueia o cadastro.

## Registro seguro

`supabase/functions/_shared/log-seguro.ts` só aceita o catálogo fechado de
eventos operacionais de configuração. Qualquer chave adicional, getter ou
combinação não enumerada é recusada e não é serializada. Assim, e-mail,
tokens, corpo da requisição e valores de configuração não têm caminho para o
log desse módulo. Falha do destino de log retorna `false`; ela não transforma
uma configuração ausente em sucesso.

## Ambiente

Copie `.env.example` apenas para uma fonte local ignorada pelo Git e preencha
os valores no ambiente de execução. Não use a conta, token, senha ou UUID
compartilhados durante o planejamento como exemplo de ambiente. Não há
provisionamento, alteração remota, migração ou bootstrap nesta etapa.

## Referências e limites

A implementação aplicou a referência JavaScript/TypeScript web da skill de
segurança: segredos ficam fora do browser e dos logs, erros externos são
sanitizados e a configuração não é derivada de entrada não confiável. Não há
referência específica para Deno/Edge Functions nessa skill; por isso o módulo
é TypeScript sem dependência Node e precisa de validação adicional no runtime
Deno quando houver uma função executável. A referência Next.js não se aplica:
este projeto não usa Next.js.

O módulo não valida JWT, cookies, CSRF, Google, Supabase, OpenRouter, RLS ou
Vault; cada controle permanece na tarefa correspondente. Testes com fonte em
memória comprovam o comportamento de configuração, não uma integração externa.
