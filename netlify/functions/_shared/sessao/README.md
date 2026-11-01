# Transporte HTTP de sessão — entrega parcial da 3.2.1

Escopo do executor B: somente esta pasta. Referências: D-04/D-09 da mudança
`fundar-identidade-e-seguranca-backend`, contratos S-01 e
[`nucleo-sessao-3.2.1.md`](../../../../docs/desenvolvimento/nucleo-sessao-3.2.1.md).
**A tarefa 3.2.1 permanece aberta.**

## Interface disponível

`criarTransporteHttpSessao(fonte, { configuracaoJwt })` carrega a configuração
existente do fluxo `sessao`. A chave JWT deve vir de configuração confiável do
servidor, nunca do cliente; seu issuer precisa corresponder à URL Supabase
configurada. Não há descoberta de chaves, chamada Auth, leitura de ambiente ou
chamada RPC neste módulo.

- `lerComandoComCookie(request, 'renovarSessao' | 'sairSessao')` exige POST,
  caminho contratual sem query, origem exata, seletor `x-sessao` e CSRF comparado ao cookie selado.
  Aceita somente JSON `{}` conforme o contrato compartilhado. A identidade
  selada contém o CSRF emitido na mesma resposta; combinações de sessões
  diferentes são recusadas. Retorna exclusivamente ao chamador server-side a
  identidade/sessão verificadas na emissão, sem refresh. Não realiza refresh/logout nem
  consulta a autoridade vigente: a futura rota deve revalidar essas informações
  no banco e conferir o resultado do Auth antes de produzir qualquer efeito.
- `lerIdentidadeDaConsulta(request)` exige GET `/api/sessao`, sem query e com
  Bearer único. Verifica assinatura, issuer, audience, algoritmo, validade,
  UUID do usuário e `session_id` pelo núcleo existente. Retorna somente esses
  UUIDs; perfil do JWT não concede autoridade. O chamador ainda precisa consultar
  a autoridade local auditada antes de responder.
- `responderEntrada({ sessao, accessToken })` serializa dados
  server-side já admitidos/rechecados. Valida o DTO compartilhado, verifica JWT,
  correspondência de usuário e estado ativo, gera CSRF e sela identidade com o
  mesmo CSRF. Emite
  envelope D-09 e dois `Set-Cookie` separados, com HttpOnly, Secure, SameSite=Lax,
  caminho `/api/sessao` e sem Domain. Não aceita esses dados como corpo de uma
  rota pública. O DTO, sozinho, não comprova admissão local.
- `responderSaida(resultado, contexto)` valida o resultado contratual com encerramento
  local verdadeiro e preserva `pendencia_externa`; limpa somente cookies do
  contexto retornado pela leitura validada. O chamador precisa ter persistido
  revogação dessa sessão antes de invocá-lo. Cada contexto é consumido na
  primeira tentativa de resposta, inclusive quando o resultado é inválido.
- `responderRenovacao(entrada, contexto)` exige contexto de renovação validado,
  mantém o seletor e compara usuário e session_id do JWT recebido com o contexto.
  Cada contexto é consumido na primeira tentativa de resposta, inclusive quando
  a serialização falha; uma nova tentativa exige nova leitura validada.
  Não envia `Set-Cookie` nem altera o CSRF.
  Não substitui as rechecagens de autoridade e revogação antes e depois do Auth.
- `responderFalhaHttpSessao(erro)` funciona inclusive quando a configuração
  impede criar o transporte. Falhas JWT retornam 401; origem/CSRF, 403; entrada,
  422; configuração/infraestrutura, 503. Mensagens vêm do catálogo público,
  sem corpo externo, detalhes de validação ou stack.

Todas as respostas produzidas pelo módulo têm `Cache-Control: no-store` e
`X-Content-Type-Options: nosniff`. Não há CORS permissivo, logs, armazenamento
web, redirecionamentos ou parâmetros de URL para tokens. O `request_id` é UUID
gerado no servidor. Cookies HTTPS são obrigatórios neste transporte; não há
seleção de HTTP baseada em cabeçalhos enviados pelo cliente.

Limites de transporte: JSON de comando até 4.096 bytes, cabeçalho Cookie até
8.192 caracteres. Não são políticas de duração/retenção da sessão. Duplicidade
dos nomes de cookie de sessão é recusada antes de abri-los. Cookies refresh do
formato anterior são recusados; nenhum formato de sessão foi implantado.

Cada emissão recebe seletor UUID aleatório, diferente do identificador Auth,
enviado no corpo e mantido em memória pelo cliente. Os nomes dos cookies de
sessão incluem o seletor, que também integra o AAD da cifra: resposta atrasada
de saída não limpa cookies de outra emissão. O seletor não é autenticação;
origem, CSRF e identidade selada continuam obrigatórios. `responderEntrada` gera
um novo seletor para login; renovação deve usar `responderRenovacao`. A futura
rota precisa tratar respostas concorrentes e revogação antes de uso real.
Cookies de sessões abandonadas podem acumular e atingir o limite do cabeçalho;
solução e política de ciclo de vida precisam de revisão antes da publicação.

## Segurança e limites de confiança

Entradas controladas pelo cliente são URL, método, cabeçalhos, cookies e corpo.
Configuração, chave JWT e resultado da autoridade local pertencem ao servidor.

| Caminho de abuso | Controle existente nesta entrega | Evidência/limite |
| --- | --- | --- |
| Comando por origem maliciosa ou CSRF divergente | Origem exata, cookie CSRF autenticado e comparação do núcleo | Negativas em `http.test.ts`; sem endpoint público |
| JWT de outro projeto, sem sessão, expirado ou assinatura inválida | Verificação criptográfica e issuer vinculado ao alvo configurado | `http.test.ts`; não prova revogação local |
| Autopromoção por corpo/JWT | Corpo estrito `{}`, extração somente de UUIDs | Não existe rota de admissão; perfil depende de RPC futura |
| Vazamento de refresh/erro externo ou confusão de cookies | Transporte não recebe refresh; identidade selada, atributos restritos, erros sanitizados e duplicatas recusadas | Testes Request/Response e socket; guarda cifrada no servidor ainda não implementada |

Não há handler default, export `handler`, configuração de rota ou entrypoint
`index`/`_shared` nesta pasta. São auxiliares para composição futura, conforme a
[interface Request/Response e convenção de entrypoints do Netlify](https://docs.netlify.com/build/functions/get-started/).
O repositório inspecionado não oferece handler executável de sessão em
`supabase/functions/`; conectar uma rota agora exigiria inventar uma integração
ou ultrapassar o escopo permitido. Nenhuma rota vazia/fake foi criada.

Admissão e consulta da autoridade local são da 3.2.2. Rechecagens antes/depois
do Auth, revogação irreversível, tombstone e corrida refresh/logout são da 3.3.
Google/desafio/nonce, login técnico, rate limiting, composição das rotas,
integração Supabase/Netlify e revisão independente continuam pendentes.

## Verificação desta entrega

TDD registrou falhas antes das implementações de leitura, duplicatas, limite
de corpo, tipo JSON, identidade JWT, resposta/cookies, limpeza, vínculo do
issuer e limites de cookie/refresh.

```bash
rtk proxy pnpm exec vitest run netlify/functions/_shared/sessao/http.test.ts
rtk proxy pnpm exec vitest run netlify/functions/_shared/sessao/http.test.ts supabase/functions/_shared/sessao/nucleo.test.ts supabase/functions/_shared/configuracao.test.ts
rtk proxy pnpm exec biome check netlify/functions/_shared/sessao
rtk proxy pnpm run typecheck:funcoes
rtk proxy pnpm exec tsc --noEmit --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --skipLibCheck --allowImportingTsExtensions --isolatedModules --esModuleInterop --types node netlify/functions/_shared/sessao/http.ts netlify/functions/_shared/sessao/http.test.ts netlify/functions/_shared/sessao/http.transporte.test.ts
rtk proxy pnpm exec vitest run netlify/functions/_shared/sessao/http.transporte.test.ts
```

Resultados em 27/10/2026: 37 testes próprios passaram; 72 testes passaram na
execução conjunta com núcleo/configuração. Lint e ambas as verificações de
tipagem passaram. O typecheck existente de funções não inclui Netlify; por
isso o comando TypeScript adicional é necessário.

O teste `http.transporte.test.ts` abre servidor Node em `127.0.0.1`, usa `fetch`
real e preserva os dois `Set-Cookie` ao converter Response em resposta HTTP.
Confere ida/volta de cookies e CSRF e negação de origem maliciosa. A fixture
serve apenas para serialização, sem adapter Auth/RPC falso. Sua execução
falhou antes das asserções de rede no sandbox do executor, com `listen EPERM`.
Na execução integrada posterior neste notebook, `pnpm run test:proxy` passou
com 38 testes, incluindo o teste por socket. Isso não comprova integração
Netlify, Auth, Google ou PostgreSQL.

OpenSpec CLI não disponível (`openspec: No such file or directory` e
`pnpm exec openspec`: comando não encontrado); requisitos foram consultados
nos artefatos locais. Nenhum manifest, migration, checkbox OpenSpec ou arquivo
fora de `netlify/functions/` foi alterado por esta entrega. Sem deploy, push,
operações remotas, dados reais ou agentes.
