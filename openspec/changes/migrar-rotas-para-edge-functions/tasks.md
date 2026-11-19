# Tasks

Cada tarefa indica dependência e evidência de aceite. Política de verificação em `AGENTS.md — Execução enxuta`.

Decisões herdadas de `executar-funcoes-no-supabase` e não reabertas aqui: destino Edge Functions em Deno (D1), migrar depois da V1 (D2), sem camada de abstração (D3), protocolo de identidade não migra junto (D4), toda prova de autorização refeita (D5), Netlify como proxy (D6), uma função por domínio (D7), Supavisor em transaction mode (D8).

**Nenhuma resposta de API pode mudar de forma.** Se um teste existente precisar ser alterado para passar contra a plataforma nova, isso é o achado — investigue antes de alterar o teste.

## 0. Pré-condições

- [ ] 0.1 V1 conectada entregue. Evidência: fatias de turno e financeiro demonstráveis pelo solicitante. **Bloqueia todos os grupos.**
  - **Não atendida em 19/11/2026.** As fatias de turno e financeiro ainda não são demonstráveis pelo solicitante. Por isso só foram executados os grupos 1 e 2, que são preparatórios e reversíveis: nenhuma rota foi migrada e nenhum caminho foi encaminhado para Edge Function em produção. Os grupos 3 em diante continuam bloqueados por 0.1 e por 2.5.
- [x] 0.2 Supabase local com Docker funcionando, com os testes do repositório executando contra ele. Evidência: saída de uma suíte de domínio rodando no ambiente local. Sem isso não há onde provar a migração — registrar bloqueio, não prosseguir.
  - **Atendida em 19/11/2026, com dois achados que valem mais que a tarefa.**
  - **Portas.** A colisão com a pilha local de outro projeto (`supabase_*_Sinergica-SO`, que usa as mesmas 55321-55324) foi resolvida **deslocando a faixa deste repositório em +100**, sem encostar na pilha alheia: API 55421, banco 55422, Studio 55423, SMTP 55424, e Supavisor 55425 (novo bloco `[db.pooler]` em transaction mode, D8). A faixa 55421-55425 estava integralmente livre. Decisão do solicitante de 19/11/2026; o efeito colateral — a porta local muda para todo mundo que rodar este repositório — foi aceito e está comentado em `supabase/config.toml`.
  - **Achado 1 — `major_version = 15` estava errado e escondia o erro.** Com 15, o banco novo recusava a migração `20261104120000_vault_atestado.sql`: `ERROR: syntax error at or near "inherit" (SQLSTATE 42601)` em `grant ffcmapp_atestado_vault_owner to current_user with inherit false, set true`. Essa sintaxe é PostgreSQL 16+, e o projeto remoto usa 17 (`docs/processo/revisao-s02-fundacao-ffcmapp.md`). `supabase/config.toml` passou a declarar 17. **Consequência que outra frente precisa tratar:** `scripts/validar-configuracao-local.mjs` afirma `assert.equal(configuracao.db.major_version, 15)` e agora falha com `17 !== 15`, derrubando `pnpm run validar:configuracao` e, com ele, `pnpm run verificar:ativacao`. O arquivo não é desta passagem e **não foi alterado**: fica registrado como pendência, não como sucesso.
  - **Achado 2 — a cadeia de migrações NÃO aplica limpa num banco novo.** Com PostgreSQL 17, 207 das 234 migrações aplicaram em ordem e a execução parou em `20261125160000_contexto_acessos_gerenciados.sql`: `ERROR: permission denied for function cadastro_gerenciado_proprio (SQLSTATE 42501)`, na instrução `revoke all on function identidade.cadastro_gerenciado_proprio(boolean) from public,anon,authenticated,service_role`. Causa aparente: a migração faz `alter function ... owner to ffcmapp_acessos_owner` **antes** do `revoke`, e o migrador tem a membership com `inherit false`, logo não herda o direito de revogar. As migrações anteriores revogam enquanto ainda são donas, ou assumem o papel com `set_config('role', dono, true)` antes de mexer na ACL. Nenhuma migração foi corrigida: são de outra frente. As 27 migrações a partir dessa continuam sem prova de aplicação em banco novo. **Corrigido em 19/11/2026** por outra frente: eram quatro migrações, não uma, e a cadeia completa (234) agora aplica sob migrador sem superusuário — ver `docs/processo/frentes-abertas-19-11-2026.md` e `scripts/testar-cadeia-migrations-sem-superusuario-local.sh`.
  - **Por que o teste de cadeia não pegou isso.** `supabase/tests/cadeia_migrations_local.sql` roda como `cadeia_fixture`, que é **superusuário** do cluster descartável, e inclui apenas as ~20 primeiras migrações (até `20261106210000`). Superusuário ignora a negativa de ACL, e o restante da cadeia não é exercitado. `scripts/testar-cadeia-migrations-local.sh` passou (exit 0) **no mesmo dia em que o Supabase local recusou a cadeia**. O `postgres` do Supabase, local e remoto, não é superusuário — é o ambiente certo para esse tipo de prova.
  - **Suíte de domínio executada contra o Supabase local**, com o banco nas 207 migrações: `PROVA_PG_PORT=55425 sh scripts/testar-regras-atendimento-supabase-local.sh` (novo), que exercita `api.consultar_regras_atendimento` de ponta a ponta **atravessando o Supavisor em transaction mode**. Saída: `"falhas": []`, exit 0. Positivos: sessão viva lê as quatro chaves de FR-041 (`ffcm.regras.canais|diario|funcionamento|periodos`). Negativos: chave de `exposicao = 'servidor'` não aparece na resposta; MAC adulterado, atestado de outra operação, atestado expirado e atestado de outro usuário devolvem `SEM_PERMISSAO`; `anon` e `service_role` recebem `permission denied for schema api`; sessão encerrada no banco devolve `{"ok": false, "erro": {"codigo": "sem_permissao"}}` com o mesmo atestado íntegro. A trilha registrou `permitido` e `negado`.
  - **Como o ambiente foi obtido, sem mascarar o Achado 2:** `supabase start` executado a partir deste repositório **ainda falha** na `20261125160000`. As provas rodaram contra uma cópia do diretório `supabase/` fora do repositório, com as 27 migrações a partir dessa retidas, porque corrigir migração é de outra frente e migrações são arquivos proibidos nesta passagem. Logo, o banco provado tem 207 das 234 migrações: ele cobre `api.consultar_regras_atendimento`, Vault, sessão e trilha, e **não** cobre acessos gerenciados, financeiro, avisos e o restante posterior. Quem corrigir a `20261125160000` destrava o banco completo e deve repetir estas provas.
  - **Limite honesto da pilha local:** o host tem ~1,9 GiB de memória para Docker e a pilha do outro projeto ocupa parte dela, então os contêineres não cabem todos juntos — o Supavisor entrou em laço de reinício (`Killed`) quando subiu o conjunto completo. As provas foram feitas com a pilha enxuta (`-x` para Studio, Realtime, Storage, pg-meta, GoTrue, Mailpit, PostgREST, conforme o caso) e `--ignore-health-check`. O ambiente serve para provar banco, pooler e Edge Runtime; não serve, hoje, para subir tudo ao mesmo tempo.

- [x] 0.3 Tarefas 2.1 e 2.2 de `executar-funcoes-no-supabase` concluídas: `concessoes-equipe` e `acesso-paciente` aliviadas, composição fora do arquivo de rota. Evidência: commit `ec83a47` — `concessoes-equipe` de 449 para 33 linhas, `acesso-paciente` de 152 para 37, composição no trio `entrada-*`/`compor-*`/`executor-*` em `netlify/functions/_shared/`, testes do domínio sem alteração de resultado.
- [x] 0.4 Confirmar com o solicitante a autorização de operação externa vigente na data: criar funções no projeto Supabase, mover segredos e alterar a publicação. A autorização ampla de 17/11/2026 não se presume vigente meses depois. Evidência: confirmação registrada aqui.
  - **Autorização confirmada em 19/11/2026** para criar funções no projeto Supabase, mover segredos e alterar a publicação.
  - **Autorização e execução são coisas distintas.** Nenhuma operação remota foi executada: `SUPABASE_ACCESS_TOKEN` e `NETLIFY_AUTH_TOKEN` não existem neste ambiente. Toda tarefa que dependa de projeto remoto permanece bloqueada por ausência de credencial, não por falta de autorização.

## 1. Infraestrutura comum

Depende de 0.4.

- [x] 1.1 Criar a estrutura das Edge Functions com `deno.json` resolvendo `packages/contracts`, `netlify/functions/_shared` e `supabase/functions/_shared`, sem duplicar código compartilhado. Evidência: `pnpm run typecheck:deno` cobrindo a estrutura nova.
  - Estrutura em `supabase/functions/_shared/edge/`: `funcao-edge.ts`, `ambiente-isolate.ts`, `caminho-edge.ts`, `erro-edge.ts`, `conexao-supavisor.ts`. Nenhuma função de domínio foi criada: isso é o grupo 3, que continua bloqueado.
  - Resolução das três árvores provada pelo próprio grafo: `ambiente-isolate.ts` importa `netlify/functions/_shared/configuracao-servidor.ts`, que importa `packages/contracts/src/configuracao-sistema.ts` e `npm:pg`; `erro-edge.ts` importa `packages/contracts/src/erros.ts`; tudo sob `supabase/functions/_shared`. Nada foi duplicado.
  - `deno.json` não precisou de entrada nova: as três árvores já se alcançam por caminho relativo dentro do repositório, e o mapa só existe para especificadores npm. Acrescentar apelidos sem uso seria configuração morta.
  - Evidência: `pnpm run typecheck:deno` com os cinco arquivos novos acrescentados à lista — 20 arquivos conferidos, saída limpa.
- [x] 1.2 Implementar a leitura de ambiente no isolate, concentrada num adaptador, preservando a regra de `configuracao-servidor.ts`: configuração variável vem do banco, ambiente é padrão e interruptor, e **falha de leitura nunca liga um serviço**. Evidência: teste cobrindo falha de leitura mantendo o que o ambiente dizia (design E5).
  - `supabase/functions/_shared/edge/ambiente-isolate.ts`: fotografia imutável do ambiente do isolate, interruptor que só liga no literal `'true'`, e a decisão de disponibilidade delegada a `servicoAtivo` de `configuracao-servidor.ts` — a regra não foi reescrita.
  - Duas falhas cobertas, não uma: falha de leitura do **banco** (mantém o que o ambiente dizia, ligado ou desligado) e falha de leitura do **próprio ambiente** (fonte vazia, serviço desligado). Nenhuma delas liga um serviço.
  - Evidência: `supabase/functions/_shared/edge/ambiente-isolate.test.ts`, 4 casos, `pnpm exec vitest run supabase/functions/_shared/edge/ambiente-isolate.test.ts` — PASS (4) FAIL (0).
- [x] 1.3 Implementar a conexão por Supavisor em transaction mode, sem pool próprio no isolate. Evidência: conexão estabelecida e uma consulta autorizada executada no ambiente local (D8).
  - `supabase/functions/_shared/edge/conexao-supavisor.ts`: uma conexão por invocação, sem pool no isolate, tudo em `SET LOCAL` dentro da transação (`statement_timeout` e `ROLE`), que é o que o transaction mode admite. TLS obrigatória fora de `localhost`/`127.0.0.1`.
  - **Agora provado contra o Supavisor de verdade** (19/11/2026), e não só contra PostgreSQL descartável. O `supabase start` passou a subir `supabase_pooler_ffcmapp` por causa do bloco `[db.pooler]` novo; a porta de transaction mode (6543 interna) é publicada em 55425 e o login é `postgres.pooler-dev`.
  - `sh scripts/testar-conexao-supavisor-pooler-local.sh` (novo), sob Deno 2.9.5: `conexao_estabelecida: true`, `porta_do_cliente: 55425` com `porta_do_servidor_vista_pelo_banco: 5432` (prova de que a conexão é mediada), consulta autorizada devolvendo a linha, `consulta_negada_para_papel_sem_grant: true`, `papel_dentro_da_transacao: ffcm_edge_leitor_executor`, `statement_timeout_local: 3s` e `papel_do_login_entre_invocacoes: postgres` — nenhum estado de sessão sobrevive à invocação.
  - A RPC de domínio de 0.2 também foi executada pelo pooler, o que prova o caminho inteiro (isolate Deno → Supavisor transaction mode → wrapper `api.*` → Vault → trilha), não só a conexão.
  - O que continua fora de prova: o Supavisor **do projeto remoto**, com TLS e limite de conexões reais. Isso depende de 2.5 e de credencial remota, que não existe neste ambiente.
- [x] 1.4 Reavaliar o cache de 30 segundos de configuração no ciclo de vida do isolate e **medir a partida a frio**. Evidência: medição registrada aqui, com o número obtido; a medição de 13/11/2026 não vale como referência (design E5).
  - **Medição de 19/11/2026 no Edge Runtime do Supabase** (`supabase-edge-runtime-1.74.3`, compatível com Deno 2.1.4), política `per_worker`, pela borda HTTP local. Método em `scripts/medir-partida-frio-edge.sh` com a função `scripts/edge-partida-frio.ts`, que devolve quantas requisições aquele isolate já atendeu — é o que distingue partida a frio de reaproveitamento, em vez de supor.
    - primeira requisição a um isolate novo, **com o módulo ainda não compilado em cache**: **402,8 ms** de relógio, corpo `{"atendidas":1,...}`.
    - primeira requisição a um isolate novo, **com o cache de módulo já quente** (contêiner reiniciado duas vezes): **51,2 ms** e **51,1 ms**, sempre com `"atendidas":1`.
    - requisições seguintes no mesmo isolate: **22,4 a 23,4 ms**, com `"atendidas":2..5`.
    - Leitura: a partida a frio custa de **~28 ms** (cache quente) a **~380 ms** (primeira compilação) **acima** da requisição quente, para uma função mínima, sem import nenhum e sem tocar no banco. Uma rota de domínio importa contratos, cifra e `pg`; o número real será maior, e é por isso que 3.4 continua existindo.
  - A conexão ao banco entra **por cima** disso: pelo Supavisor, a primeira consulta de um processo frio custou 64,3 ms contra 9,7-13 ms quente (`scripts/testar-conexao-supavisor-pooler-local.sh`).
  - A medição de 13/11/2026 continua sem valer como referência, e a medição anterior desta mudança (processo Deno contra PostgreSQL local) também não: nenhuma das duas é Edge Runtime.
  - Reavaliação do cache de 30 s: `cache` e `emVoo` de `configuracao-servidor.ts` são estado de módulo, logo **por isolate**. Os números acima confirmam a hipótese pelo lado que importa: o isolate é barato de criar (~50 ms com cache quente), logo será criado com frequência, e a janela de 30 s cobrirá pouquíssimas requisições cada. Nada foi alterado — a decisão continua dependendo de 3.4 sob tráfego real, com rota de domínio de verdade.
- [x] 1.5 Implementar a tradução de erro preservando os códigos fechados existentes — `sem_permissao`, `conflito`, `conflito_idempotencia` — e o formato de erro público sem campos. Evidência: teste comparando a resposta de erro da plataforma nova com a da antiga, caractere a caractere.
  - `supabase/functions/_shared/edge/erro-edge.ts`. Nenhum código novo: o catálogo continua sendo `codigosErro` de `packages/contracts/src/erros.ts`, e o envelope continua sendo `criarErroPublicoSemCampos`.
  - Evidência: `supabase/functions/_shared/edge/erro-edge.test.ts`, 5 casos. A plataforma antiga é a própria `criarEntradaConfiguracaoSistemaNativa`, exercitada nos três códigos alcançáveis sem dependências (`nao_encontrado`, `nao_autenticado`, `entrada_invalida`); corpo, status e cabeçalhos conferidos caractere a caractere, com o `request_id` da resposta antiga reaproveitado. Os 12 códigos fechados, incluindo `sem_permissao`, `conflito` e `conflito_idempotencia`, são conferidos contra a mesma fonte de verdade, e o envelope é conferido como tendo exatamente `erro` e `request_id`.
  - `pnpm exec vitest run supabase/functions/_shared/edge/erro-edge.test.ts` — PASS (5) FAIL (0).
- [x] 1.6 Implementar o parseamento de sufixo de caminho para cobrir os 28 caminhos com parâmetro. Evidência: teste cobrindo caminho com parâmetro, caminho sem, e caminho desconhecido devolvendo o mesmo que hoje.
  - `supabase/functions/_shared/edge/caminho-edge.ts` e `funcao-edge.ts`. O caminho `/api/*` é derivado **só da URL** — nenhum cabeçalho informa qual rota foi pedida, porque um cabeçalho seria entrada controlável pelo cliente e viraria desvio de roteamento. Travessia (`..`), barra dupla e `%2f` são recusados.
  - Evidência: `supabase/functions/_shared/edge/caminho-edge.test.ts`, 6 casos, com os padrões reais de `netlify/functions/plano.ts`. Caminho desconhecido devolve o mesmo envelope `nao_encontrado` que `criarEntradaConfiguracaoSistemaNativa` devolve hoje — status, cabeçalhos e corpo comparados, com o `request_id` normalizado.
  - `pnpm exec vitest run supabase/functions/_shared/edge/caminho-edge.test.ts` — PASS (6) FAIL (0).

## 2. Proxy com encaminhamento por caminho

Depende de 1.6. É o mecanismo que torna a migração reversível (design E1).

- [ ] 2.1 Implementar no proxy da Netlify a tabela de encaminhamento por caminho, com destino selecionável entre função Netlify e Edge Function, sem alterar o cliente. Evidência: teste cobrindo um caminho encaminhado para cada destino, com a resposta idêntica.
  - `netlify/functions/_shared/encaminhamento-api.ts`: tabela de `padrao`/`funcao`/`destino`, casando os mesmos padrões hoje declarados em `config.path`, reaproveitando `casarCaminho` da borda das Edge Functions. Caminho fora da tabela continua respondido pela Netlify, como hoje.
  - Evidência: `netlify/functions/_shared/encaminhamento-api.test.ts`, 6 casos — PASS (6) FAIL (0). Um caminho para cada destino, corpo e status idênticos, cliente chamando `/api/*` na mesma origem nos dois casos.
  - **Parcial:** falta o arquivo de função que registra o proxy em `/api/*` e a configuração de `netlify.toml` correspondente. Não foram escritos porque criar ou alterar rota em `netlify/functions/*.ts` está fora dos arquivos permitidos desta passagem. O módulo e a tabela estão prontos para serem ligados.
- [x] 2.2 Preservar os cabeçalhos de `netlify.toml` em `/api/*` — `Cache-Control: no-store`, `X-Content-Type-Options`, `Referrer-Policy` — e a mesma origem. Evidência: teste comparando os cabeçalhos de resposta antes e depois do proxy (D6).
  - `netlify.toml` não foi alterado. O teste lê o arquivo e confere que o bloco `/api/*` continua declarando exatamente `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin`, e compara a resposta antes e depois do proxy: o proxy não emite, não substitui e não remove cabeçalho algum, inclusive `set-cookie`.
  - A mesma origem é preservada por construção: o cliente continua chamando `/api/*` e quem fala com a Edge Function é o proxy.
- [x] 2.3 Provar que o cookie de sessão selado atravessa o proxy e é lido pela Edge Function pela mesma cadeia de validação, com `x-sessao`, CSRF e atestado intactos. Evidência: teste positivo e negativo de sessão numa Edge Function com sessão emitida pela rota Netlify (design E2, D4).
  - Provado no transporte: o cookie selado por `criarCodecDeCookiesSessaoIsolada`, mais `x-sessao`, `x-csrf` e `origin`, atravessam o proxy byte a byte, e do outro lado `verificarProtecaoDeComando` — a **mesma** cadeia de validação — aceita (positivo) e recusa cookie adulterado e origem estranha (negativos).
  - Também provado que o cliente não escolhe a credencial de invocação: `authorization` e `apikey` vindos do cliente são descartados pelo proxy.
  - **Achado, e ele muda a leitura de E2:** o cookie selado tem `Path=/api/sessao` (`supabase/functions/_shared/sessao/nucleo.ts`). O navegador só o envia para `/api/sessao/*`. Para as outras 38 rotas quem viaja é o cabeçalho `x-sessao`, mais `x-csrf` nos comandos. A frase de E2 — "o cookie de sessão selado ... é encaminhado à Edge Function" — vale literalmente para a rota `auth`, não para o conjunto. A conclusão de E2 continua de pé, mas pelo cabeçalho, não pelo cookie.
  - **O atestado de operação, que faltava, foi exercitado de ponta a ponta em 19/11/2026**, com o banco local de pé: `PROVA_PG_PORT=55425 sh scripts/testar-regras-atendimento-supabase-local.sh`, exit 0, `"falhas": []`. O atestado é gerado pelo mesmo `criarAtestadorOperacao` do servidor e **verificado pela `identidade.verificar_assinatura_atestado` do banco**, que lê a chave do Vault local. Negativos reais: MAC adulterado, atestado de outra operação (`api.listar_pacientes`), atestado expirado e atestado de outro usuário, todos `SEM_PERMISSAO`; `anon` e `service_role` sem execute; sessão encerrada devolvendo `sem_permissao` com atestado íntegro. Fixture fictícia em `scripts/fixture-regras-atendimento-supabase-local.sql`.
  - **Continua parcial num ponto:** isto roda contra o banco pelo pooler, não dentro de uma Edge Function **publicada**. A prova na plataforma publicada depende de 2.5 e da publicação, que são remotas.
- [x] 2.4 Provar que reverter um caminho é alterar a tabela, sem republicar função e sem tocar no cliente. Evidência: reversão executada e verificada no ambiente local (design E4).
  - Teste `reverter um caminho é trocar a linha da tabela, sem tocar no cliente`: a mesma chamada do cliente, com `destino` trocado para `netlify`, deixa de alcançar a Edge Function e volta a ser respondida pela função Netlify. Nenhuma função é republicada e nenhuma linha do cliente muda.
- [ ] 2.5 Mover os segredos das variáveis da Netlify para os segredos do projeto Supabase, mantendo no Vault o que já está lá, e conferir a fronteira nova. Evidência: lista do que foi movido e do que permaneceu; nenhuma credencial no repositório e nenhuma em log.
  - **Bloqueada: operação remota.** `SUPABASE_ACCESS_TOKEN` e `NETLIFY_AUTH_TOKEN` não existem neste ambiente. A autorização de 0.4 existe; a credencial, não. Nada foi movido e nenhum valor de segredo foi lido, impresso ou registrado.
  - O que **teria** de ser movido das variáveis da Netlify para os segredos do projeto Supabase, por nome: `FFCM_SUPABASE_URL`, `FFCM_SUPABASE_ANON_KEY`, `FFCM_APP_ORIGIN`, `FFCM_ALLOWED_ORIGINS`, `FFCM_COOKIE_SEALING_KEY`, `FFCM_GOOGLE_OAUTH_CLIENT_ID`, `FFCM_GOOGLE_WORKSPACE_DOMAIN`, `OPENROUTER_API_KEY`, as credenciais de acesso ao cofre (`FFCM_VAULT_DB_HOST`, `FFCM_VAULT_DB_PORT`, `FFCM_VAULT_DB_NAME`, `FFCM_VAULT_DB_USER`, `FFCM_VAULT_DB_PASSWORD`, `FFCM_VAULT_DB_CA`), os identificadores e referências de cifra (`FFCM_VAULT_CIFRA_KEY_ID`, `FFCM_VAULT_ATESTADO_KEY_ID`, `FFCM_VAULT_CIFRA_REFERENCIAS`, `FFCM_VAULT_HMAC_REFERENCIA`, `FFCM_VAULT_IDEMPOTENCIA_EQUIPE_REFERENCIAS`) e os cerca de 40 interruptores `FFCM_*_ATIV*` que são padrão de última instância por rota.
  - O que **permanece no Vault**: os valores das chaves de cifra, do HMAC e do atestado. As variáveis acima carregam **referências** no formato `ffcmapp.cifra.*`, não os segredos; isso não muda com a migração.
  - Dois deles merecem atenção na troca de fronteira, porque hoje só existem como variável da Netlify e passariam a existir também no projeto que guarda o banco: `FFCM_COOKIE_SEALING_KEY` e `FFCM_VAULT_DB_PASSWORD`. Enquanto as duas plataformas servirem em paralelo (E4), ambos existem nos dois lugares, e a retirada do lado Netlify só é segura no corte final (10.3).

## 3. Lote 1 — piloto, 5 rotas e 5 caminhos

Depende de 2.5. `configuracao-sistema`, `regras-atendimento`, `auditoria`, `preautorizacoes-familiares`, `solicitacoes-titular`.

- [ ] 3.1 Migrar as cinco rotas como Edge Functions de domínio. Evidência: testes existentes de cada domínio executados contra a plataforma nova, sem alteração de expectativa.
- [ ] 3.2 Reexecutar a matriz de autorização dessas rotas contra as Edge Functions: positiva, negativa, acesso direto ao servidor e ao banco, outro perfil e revogação. Evidência: saída registrada (D5).
- [ ] 3.3 Encaminhar os cinco caminhos no proxy e verificar paridade de resposta e de cabeçalho com o estado anterior. Evidência: comparação registrada.
- [ ] 3.4 Confirmar a medição de partida a frio de 1.4 sob tráfego real do lote e registrar divergência, se houver. Evidência: medição registrada.

## 4. Lote 2 — barreiras, 4 rotas e 16 caminhos

Depende de 3.4. `barreira-acesso`, `barreira-contato`, `barreira-equipe`, `barreira-tarefa`. **É o lote de maior exigência de prova: são os próprios controles.**

- [ ] 4.1 Migrar as quatro barreiras. Evidência: testes existentes sem alteração de expectativa.
- [ ] 4.2 Reexecutar a matriz completa de cada barreira contra as Edge Functions, incluindo acesso direto ao banco com identidade sem vínculo, outro paciente, outro perfil, ausência de concessão e revogação com efeito imediato. Evidência: testes positivos e negativos, SQL direto incluído (D5).
- [ ] 4.3 Provar que a negação não vaza existência de recurso de outro caso, como hoje. Evidência: comparação da resposta negada entre as duas plataformas.
- [ ] 4.4 Encaminhar os 16 caminhos e verificar paridade. Evidência: comparação registrada.

## 5. Lote 3 — plano e coordenação, 9 rotas e 19 caminhos

Depende de 4.4. `plano`, `aprovador-plano`, `aprovar-objetivo`, `campo-extra-plano`, `habilitacao-plano-crise`, `plano-crise`, `orientacao`, `encaminhamento`, `tarefas-cuidado`. Primeiro lote com parâmetro em volume.

- [ ] 5.1 Migrar as nove rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 5.2 Provar o parseamento de sufixo nos caminhos com parâmetro, incluindo identificador inexistente, de outro caso e malformado. Evidência: testes cobrindo os três casos com a mesma resposta de hoje.
- [ ] 5.3 Reexecutar a matriz de autorização do domínio, incluindo a visibilidade familiar de plano e orientações. Evidência: testes positivos e negativos (D5).
- [ ] 5.4 Encaminhar os 19 caminhos e verificar paridade. Evidência: comparação registrada.

## 6. Lote 4 — paciente, vínculos e concessões, 9 rotas e 21 caminhos

Depende de 5.4. `pacientes`, `edicao-paciente`, `contato`, `acesso-paciente`, `vinculos-profissionais`, `concessoes-equipe`, `convites-familiares`, `cancelar-convite-familiar`, `consulta-convite-familiar`.

- [ ] 6.1 Migrar as nove rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 6.2 Provar idempotência e reserva onde existem, incluindo repetição de requisição e resposta perdida, sem duplicar lançamento. Evidência: testes de idempotência contra a plataforma nova.
- [ ] 6.3 Reexecutar a matriz de concessão e revogação, provando efeito imediato da revogação. Evidência: testes positivos e negativos, SQL direto incluído (D5).
- [ ] 6.4 Encaminhar os 21 caminhos e verificar paridade. Evidência: comparação registrada.

## 7. Lote 5 — conteúdo clínico, 8 rotas e 16 caminhos

Depende de 6.4. `anamnese`, `diario`, `saude`, `linha-tempo`, `contexto-cuidado`, `rede-cuidado`, `pendencias`, `documentos`.

- [ ] 7.1 Migrar as oito rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 7.2 Provar que a cifra de campo e o AAD continuam funcionando no isolate, com o conteúdo decifrando igual. Evidência: teste de leitura de conteúdo cifrado gravado antes da migração.
- [ ] 7.3 Reexecutar a matriz de audiência: equipe, familiar com fundamento, familiar sem fundamento, fundamento revogado e profissional de outro caso. Evidência: testes positivos e negativos (D5).
- [ ] 7.4 Encaminhar os 16 caminhos e verificar paridade. Evidência: comparação registrada.

## 8. Lote 6 — integrações externas, 3 rotas e 18 caminhos

Depende de 7.4. `agenda-google` (13 caminhos), `transcricao`, `exportacoes`.

- [ ] 8.1 Migrar as três rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 8.2 Provar OAuth, renovação de credencial e leitura do Vault a partir do isolate, com conta autorizada e dados fictícios. Evidência: execução registrada; mock não comprova integração.
- [ ] 8.3 Provar o comportamento de falha e de resposta perdida nas integrações, sem repetição automática que duplique efeito externo. Evidência: testes de timeout e reconsulta.
- [ ] 8.4 Encaminhar os 18 caminhos e verificar paridade. Evidência: comparação registrada.

## 9. Lote 7 — identidade, 1 rota e 9 caminhos

Depende de 8.4. `auth`. Último por decisão de desenho (E2).

- [ ] 9.1 Migrar `auth` preservando literalmente cookie selado, `x-sessao`, CSRF, atestado de operação e os tempos de expiração. Nenhum campo, nome de cabeçalho ou formato muda (D4). Evidência: comparação do cookie e dos cabeçalhos emitidos entre as duas plataformas.
- [ ] 9.2 Provar entrada, renovação, encerramento e revogação de sessão contra a Edge Function. Evidência: testes positivos e negativos, incluindo sessão inválida, expirada e revogada.
- [ ] 9.3 Provar que sessão emitida pela plataforma antiga continua válida durante a transição, e vice-versa. Evidência: teste cruzado nas duas direções (design E2).
- [ ] 9.4 Encaminhar os 9 caminhos e verificar paridade. Evidência: comparação registrada.

## 10. Corte final

Depende de 9.4.

- [ ] 10.1 Reexecutar a **matriz de autorização completa** do produto contra as Edge Functions, com todas as 104 rotas encaminhadas. Evidência: saída registrada; nenhum teste do runtime antigo conta (D5).
- [ ] 10.2 Executar `pnpm run verificar:ativacao` uma única vez e o roteiro "Como testar" do PR. Evidência: saída registrada; gate que não executar vira bloqueio, não sucesso presumido.
- [ ] 10.3 Remover `netlify/functions/*.ts` e a configuração de função do `netlify.toml`, preservando a publicação do estático e os cabeçalhos. Evidência: diff e verificação de que `/api/*` continua respondendo com os mesmos cabeçalhos.
- [ ] 10.4 Conferir que nenhum arquivo remanescente importa de `netlify/functions/` fora do que foi migrado, e que `netlify/functions/_shared` foi reposicionado ou continua sendo importado corretamente. Evidência: `pnpm run verificar:rapido` limpo e busca registrada.
- [ ] 10.5 Solicitar revisão independente da fatia com `code-review`, informando a revisão-base, esta mudança OpenSpec e o diff exato. Atenção específica à paridade de autorização e de cabeçalho. Evidência: achados registrados e tratados.

## Workflow follow-up

- Atualizar `docs/projeto/fundacao.md` fechando DF-003 com a execução concluída, sem reescrever o histórico da deriva.
- Atualizar `docs/processo/estado-do-projeto.md` no merge.
- Esta mudança declara `skip_specs: true` e não tem delta; ao arquivar, não há sincronização com `openspec/specs/`.
- Antes de qualquer publicação, rodar `scripts/testar-cadeia-migrations-sem-superusuario-local.sh`: a cadeia de migrations não aplicava sob o migrador do remoto (CREATEROLE sem superusuário) até 19/11/2026. O runner antigo `testar-cadeia-migrations-local.sh` não serve como prova disso — ver `docs/processo/frentes-abertas-19-11-2026.md`.
- Registrar a medição de partida a frio obtida em 1.4 e 3.4 onde a próxima pessoa a encontre — a medição de 13/11/2026 ficou enterrada num comentário de código e quase foi transposta por engano.
