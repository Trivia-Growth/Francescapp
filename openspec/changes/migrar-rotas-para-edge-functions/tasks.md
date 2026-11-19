# Tasks

Cada tarefa indica dependência e evidência de aceite. Política de verificação em `AGENTS.md — Execução enxuta`.

Decisões herdadas de `executar-funcoes-no-supabase` e não reabertas aqui: destino Edge Functions em Deno (D1), migrar depois da V1 (D2), sem camada de abstração (D3), protocolo de identidade não migra junto (D4), toda prova de autorização refeita (D5), Netlify como proxy (D6), uma função por domínio (D7), Supavisor em transaction mode (D8).

**Nenhuma resposta de API pode mudar de forma.** Se um teste existente precisar ser alterado para passar contra a plataforma nova, isso é o achado — investigue antes de alterar o teste.

## 0. Pré-condições

- [ ] 0.1 V1 conectada entregue. Evidência: fatias de turno e financeiro demonstráveis pelo solicitante. **Bloqueia todos os grupos.**
  - **Não atendida em 19/11/2026.** As fatias de turno e financeiro ainda não são demonstráveis pelo solicitante. Por isso só foram executados os grupos 1 e 2, que são preparatórios e reversíveis: nenhuma rota foi migrada e nenhum caminho foi encaminhado para Edge Function em produção. Os grupos 3 em diante continuam bloqueados por 0.1 e por 2.5.
- [ ] 0.2 Supabase local com Docker funcionando, com os testes do repositório executando contra ele. Evidência: saída de uma suíte de domínio rodando no ambiente local. Sem isso não há onde provar a migração — registrar bloqueio, não prosseguir.
  - **Bloqueada em 19/11/2026.** Docker 29.5.2 e Supabase CLI 2.116.0 presentes; as imagens foram baixadas, mas `supabase start` abortou e reverteu os contêineres: `failed to start docker container "supabase_db_ffcmapp": Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint supabase_db_ffcmapp (...): Bind for :::55322 failed: port is already allocated`. A porta 55322 está ocupada por `supabase_db_Sinergica-SO`, pilha local de **outro projeto**, que não foi parada por não ser desta frente. Alternativas que exigiriam decisão do solicitante: parar a outra pilha ou mudar a porta em `supabase/config.toml`.
  - Enquanto isso, a prova de banco usou o PostgreSQL descartável que o repositório já usa (`initdb` + `pg_ctl` em diretório temporário), agora também em `scripts/testar-conexao-supavisor-local.sh`.
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
- [ ] 1.3 Implementar a conexão por Supavisor em transaction mode, sem pool próprio no isolate. Evidência: conexão estabelecida e uma consulta autorizada executada no ambiente local (D8).
  - `supabase/functions/_shared/edge/conexao-supavisor.ts`: uma conexão por invocação, sem pool no isolate, tudo em `SET LOCAL` dentro da transação (`statement_timeout` e `ROLE`), que é o que o transaction mode admite. TLS obrigatória fora de `localhost`/`127.0.0.1`.
  - Executado sob **Deno**, o runtime do isolate, contra PostgreSQL descartável: `LC_ALL=C sh scripts/testar-conexao-supavisor-local.sh`. Conexão estabelecida, consulta autorizada devolvendo a linha, consulta **negada** para papel sem grant, `SET LOCAL ROLE` vigorando dentro da transação e papel de login de volta entre invocações.
  - **Parcial, e a parte que falta é o Supavisor.** Não há Supavisor no ambiente local (o pooler só existe no projeto remoto) e `supabase start` está bloqueado por 0.2. A prova contra o pooler real continua pendente; não foi simulada.
- [ ] 1.4 Reavaliar o cache de 30 segundos de configuração no ciclo de vida do isolate e **medir a partida a frio**. Evidência: medição registrada aqui, com o número obtido; a medição de 13/11/2026 não vale como referência (design E5).
  - **Medição de 19/11/2026**, sob Deno 2.9.5, contra PostgreSQL local sem TLS, por `scripts/testar-conexao-supavisor-local.sh`:
    - processo frio: 0,34 s de relógio no total; 19,8 ms do início do módulo até a primeira consulta concluída; primeira consulta 18,8 ms; segunda consulta no mesmo processo 6,5 ms.
    - segundo processo, com cache de módulo quente: 0,09 s de relógio; primeira consulta 12,8 ms; segunda 6,6 ms.
    - Leitura: a **primeira** consulta custa cerca de **2× a segunda** (12,8 ms contra 6,6 ms) só pelo estabelecimento da conexão, sem TLS e sem pooler. Com Supavisor e TLS esse custo cresce.
  - **Não é a partida a frio da plataforma.** Isto mede o isolate Deno local, não o Edge Runtime do Supabase, que está bloqueado por 0.2. O número acima não substitui a medição exigida por 3.4; serve de linha de base e de alerta.
  - Reavaliação do cache de 30 s: `cache` e `emVoo` de `configuracao-servidor.ts` são estado de módulo, logo **por isolate**. Como o isolate é efêmero e numeroso, a janela de 30 s tende a valer para pouquíssimas requisições cada, e a retentativa de 150 ms do caminho frio passa a ser exercitada com muito mais frequência do que no processo Netlify. Nada foi alterado: mudar o cache agora mudaria comportamento sem medição da plataforma real. Registrado como decisão a tomar com o número de 3.4 em mãos.
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
- [ ] 2.3 Provar que o cookie de sessão selado atravessa o proxy e é lido pela Edge Function pela mesma cadeia de validação, com `x-sessao`, CSRF e atestado intactos. Evidência: teste positivo e negativo de sessão numa Edge Function com sessão emitida pela rota Netlify (design E2, D4).
  - Provado no transporte: o cookie selado por `criarCodecDeCookiesSessaoIsolada`, mais `x-sessao`, `x-csrf` e `origin`, atravessam o proxy byte a byte, e do outro lado `verificarProtecaoDeComando` — a **mesma** cadeia de validação — aceita (positivo) e recusa cookie adulterado e origem estranha (negativos).
  - Também provado que o cliente não escolhe a credencial de invocação: `authorization` e `apikey` vindos do cliente são descartados pelo proxy.
  - **Achado, e ele muda a leitura de E2:** o cookie selado tem `Path=/api/sessao` (`supabase/functions/_shared/sessao/nucleo.ts`). O navegador só o envia para `/api/sessao/*`. Para as outras 38 rotas quem viaja é o cabeçalho `x-sessao`, mais `x-csrf` nos comandos. A frase de E2 — "o cookie de sessão selado ... é encaminhado à Edge Function" — vale literalmente para a rota `auth`, não para o conjunto. A conclusão de E2 continua de pé, mas pelo cabeçalho, não pelo cookie.
  - **Parcial:** o atestado de operação não foi exercitado de ponta a ponta, porque isso exige RPC no banco e a pilha local está bloqueada por 0.2. A prova em Edge Function publicada depende de 2.5 e de publicação.
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
- Registrar a medição de partida a frio obtida em 1.4 e 3.4 onde a próxima pessoa a encontre — a medição de 13/11/2026 ficou enterrada num comentário de código e quase foi transposta por engano.
