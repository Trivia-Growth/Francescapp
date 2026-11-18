# Design

## Context

FR-015/016 são referência, não prova de implementação. `packages/contracts/src/anamnese.ts` mostra contratos validados e versão esperada; não comprova integração do plano. A referência Atendimento recomenda domínio sem I/O, contratos explícitos e autorização no servidor e banco.

## Goals / Non-Goals

**Goals:** definir fatia conectada e histórico verificável, preservando decisões clínicas.

**Non-Goals:** conduta clínica automatizada, tarefas e demais requisitos de coordenação, ou liberar dados reais.

## Decisions

- Tratar objetivo e revisões por caso, com versões imutáveis e atualização concorrente condicionada à versão esperada. Sobrescrever registro perderia histórico; manter versões exige transação e testes de concorrência.
- Usar contratos tipados e validação em fronteira, persistência no Supabase com proteção de conteúdo e auditoria conforme fundação vigente. Avaliar disponibilidade e limites nativos antes de adotar recursos; não criar serviços adicionais sem lacuna concreta.
- Autenticação, vínculo por caso e audiência são controles distintos; agenda não concede acesso. A decisão provisória de colaboradores está delimitada abaixo; não presumir acesso familiar ou autorização pela atribuição clínica. A matriz definitiva permanece pendente e nenhuma exposição conectada deve ser ativada sem seus controles e provas.
- Motivo e responsável integram revisão, com data gerada em fonte confiável. Não definir transições clínicas ou intervalos automáticos.

## Recorte local provisório para implementação

Para preparar a integração, aplicar provisoriamente a decisão de anamnese: colaboradores ativos com concessão de equipe vigente podem ler e editar objetivos de qualquer caso, sem vínculo individual; família e permissões de agenda não concedem acesso por inferência. Sessão, identidade e concessão devem ser revalidadas no servidor e banco, inclusive na revogação concorrente. A matriz definitiva e eventual acesso familiar continuam pendentes; este recorte não autoriza ativação nem dados reais.

O contrato local já contém descrição, área, responsável, situação inicial, observação de progresso, data de revisão e estado. Cada objetivo deve ter identificador estável e versões imutáveis vinculadas ao caso; revisão exige versão esperada e motivo, com ator e data derivados da fronteira confiável. Entrada e metadados não podem escolher identidade de auditoria. Uma transação deve autorizar, conferir versão, gravar nova versão e auditar; conflito ou falha de auditoria não pode alterar o histórico. Não inventar campos adicionais, regras clínicas, periodicidade ou responsável pela validação.

## Decisões do solicitante (10/11/2026) — campos extras e aprovação

Fecham parte das pendências de 1.1/1.2:

- **Campos extras**: Edilaine (Administrador) pode criar campos extras do objetivo pela própria plataforma. Catálogo **global** (mesma lista em todo objetivo de todo caso, não por caso/tipo de objetivo). Quatro tipos: texto livre, número, data e lista de opções (as opções da lista também são definidas pela Edilaine, 1 a 20 por campo). Não há periodicidade obrigatória de revisão (fica livre, profissional decide quando revisar). Valor dos campos extras preenchido por caso **ainda não está integrado** ao objetivo/envelope cifrado — só o catálogo (nome/tipo/opções/ativo) está implementado nesta rodada; ver "Estado da implementação" abaixo.
- **Aprovação**: é um carimbo (quem aprovou, quando), não um portão — qualquer colaborador com concessão vigente registra objetivo/revisão normalmente (mesmo modelo provisório da anamnese), e a aprovação não bloqueia nada. Edilaine aprova por padrão; ela pode indicar qualquer colaborador específico (não só outro Administrador) como aprovador extra. **Não implementado nesta rodada** — fica para a próxima sessão supervisionada, junto da integração dos campos extras ao objetivo.
- **Matriz de acesso do objetivo em si** (ler/editar objetivo e revisão): confirmado reaproveitar o modelo provisório da anamnese já descrito acima — sem mudança.

Nome/tipo/opções do campo extra não são conteúdo clínico do paciente (são definição de esquema, administrada por Administrador), por isso **não** entram no envelope cifrado — diferente do valor que um profissional viria a preencher por caso, que deve seguir cifrado como qualquer outro campo do objetivo quando essa integração existir.

## Estado da implementação (10/11/2026, trabalho noturno não supervisionado)

Implementado e testado localmente (PostgreSQL descartável, não aplicado em nenhum ambiente remoto):
- `supabase/migrations/20261116130000_campo_extra_plano_catalogo.sql`: tabela `cadastro.campo_extra_plano_catalogo` (nome, tipo, opções, ativo, versão), RLS habilitada, zero grants a `anon`/`authenticated`/`service_role`/`public`.
- `supabase/migrations/20261116140000_campo_extra_plano_operacoes_privadas.sql`: `operacao.campo_extra_plano_operacao_privada`/`api.campo_extra_plano_privado`, atestado HMAC obrigatório, autorização administrador-only (bloco de autorização copiado literalmente de `operacao.criar_concessao_equipe_privado`, sem alteração de lógica), idempotência via `operacao.requisicao`, auditoria em todo caminho permitido/negado, owner dedicado `ffcmapp_campo_extra_plano_owner` sem login nem bypass RLS.
- `supabase/tests/campo_extra_plano_local.sql` + `scripts/testar-campo-extra-plano-local.sh`: positivo (administrador lista, cria campo texto, cria campo lista com opções, edita com versão esperada), negativo (profissional negado, família negada, sessão revogada negada, tipo inválido rejeitado, lista sem opções rejeitada, texto com opções rejeitada, conflito de versão não altera registro, conflito de idempotência, falha de auditoria não deixa efeito parcial). Passou (exit 0). `pnpm run verificar:rapido` limpo.

**Feito (11/11/2026, sessão supervisionada) — lista de aprovadores e carimbo de aprovação:**
- `supabase/migrations/20261116150000_aprovador_plano_catalogo.sql`: `identidade.aprovador_plano_cuidado` (lista de aprovadores indicados, mutável com versão esperada) e `cadastro.objetivo_cuidado_aprovacao` (evento de aprovação insert-only, referencia `registro_id` — nunca muta a versão do objetivo, que é imutável).
- `supabase/migrations/20261116160000_aprovador_plano_operacoes_privadas.sql`: `operacao`/`api.aprovador_plano_operacao_privada`/`aprovador_plano_privado`, administrador-only (mesmo bloco copiado de `criar_concessao_equipe_privado`), lista/grava aprovador com idempotência e versão esperada.
- `supabase/migrations/20261116170000_aprovar_objetivo_plano_privado.sql`: `operacao`/`api.aprovar_objetivo_plano_operacao_privado`/`aprovar_objetivo_plano_privado` — carimba aprovação num `registro_id` específico. Autorização combina os dois padrões já usados no projeto: colaborador geral via Google Workspace (administrador OU profissional, igual `plano_cuidado_operacao_privada`) seguido da exceção técnica restrita a administrador (igual `criar_concessao_equipe_privado`); gate extra exige `perfil='administrador'` OU estar ativo em `aprovador_plano_cuidado`. Sem ledger de idempotência por chave — a unicidade natural `(registro_id, aprovador_usuario_id)` com `ON CONFLICT DO NOTHING` já torna a operação idempotente, decisão deliberada para não duplicar mecanismo sem necessidade (YAGNI).
- `supabase/tests/aprovador_plano_local.sql` + `scripts/testar-aprovador-plano-local.sh`: positivo (administrador aprova sempre, profissional indicado aprova depois de listado, replay idempotente não duplica), negativo (profissional não listado negado, família negada, registro_id inexistente dá conflito não entrada_invalida, profissional desativado perde a autorização, conflito de versão não altera o registro). Passou (exit 0) depois de corrigir um bug real descoberto na própria execução: `FOR SHARE` sobre `cadastro.objetivo_cuidado_versao` dava "permission denied" porque só select tinha sido concedido — Postgres exige privilégio de UPDATE (mesmo sem nunca escrever) para qualquer cláusula de travamento de linha (`FOR SHARE`/`FOR UPDATE`); corrigido com o mesmo par grant-update + policy `_lock` com `check(false)` já usado em todo o resto do projeto para esse exato propósito (eu tinha copiado esse padrão mecanicamente antes sem entender por quê — agora entendido e documentado). `pnpm run verificar:rapido` limpo.
- **Revisão independente desta adição**: pendente, quem implementou (eu) não pode aprovar a própria revisão.

**Ainda não implementado, fica para próxima sessão supervisionada:**
- Interface web para Edilaine gerenciar o catálogo e a lista de aprovadores (criar/editar/desativar campo e indicar/remover aprovador pela tela) e para o profissional preencher os campos extras e aprovar pelo formulário do objetivo — `web/plano-cuidado.ts` (466 linhas, uma função exportada só) e o par `web/servico-plano-http.ts` exigem rota HTTP nova (contrato + Netlify function) pra `api.campo_extra_plano_privado`/`aprovador_plano_privado`/`aprovar_objetivo_plano_privado`, que ainda não existe nenhuma; refatoração grande demais pra fazer pela metade, avaliada e não iniciada.

**Feito (10/11/2026, sessão supervisionada, ver tasks.md):** `objetivoSchema` ganhou `camposExtras` opcional (registro `campo_id → valor string`); `validarCamposExtras(valores, catalogo)` valida dinamicamente contra o catálogo corrente (tipo, opções de lista, campo desconhecido/inativo rejeitado), já que isso depende de dado em runtime e não cabe num schema estático. O VALOR do campo extra entra no mesmo envelope cifrado do objetivo (decisão já registrada acima), validado no cliente antes de cifrar — nenhuma mudança na função SQL do objetivo foi necessária nem feita.

O servidor deve validar entrada e cifrar conteúdo clínico com envelope autenticado e AAD vinculado ao caso, objetivo, versão e campo, conforme fundação aplicável. Banco recebe envelope, não texto clínico; leitura autoriza e audita antes de decifrar. Sem grant direto às tabelas e sem acesso público a chaves; wrappers, atestado e privilégios precisam de revisão e prova, não apenas reutilização nominal da anamnese. Falhas de cifra, atestado ou auditoria devem negar a operação sem fallback em texto claro. A implementação depende dos controles efetivamente disponíveis e não libera rotas antes de S-02.

## Ameaças e evidências provisórias (FR-015/016)

Ativos são conteúdo e histórico clínico, integridade da autoria e versões, credenciais e trilha de auditoria. Fronteiras previstas: navegador para servidor autenticado; servidor para RPC/banco e Vault; executor privilegiado para tabelas privadas. Atacante pode controlar entradas e identificadores ou usar sessão própria, inclusive após revogação; não se presume controle de chaves ou administração do banco. A exposição e operação reais dependem de confirmação antes do relatório final.

| Caminho de abuso | Impacto e prioridade provisória | Mitigação e evidência necessária |
|---|---|---|
| Familiar, sessão revogada ou acesso direto lê/altera objetivo alheio | Alto, dados clínicos e integridade expostos | Revalidar autorização no servidor e banco sob locks; testar anônimo, familiar, inativo, concessão/sessão revogada, acesso direto e caminhos privilegiados, além de colaborador permitido. |
| Troca de envelope entre caso, objetivo ou versão | Alto, conteúdo revelado ou atribuído incorretamente | Cifra autenticada e AAD vinculados aos identificadores e versão; testar adulteração e troca, sem retorno parcial. |
| Revisões concorrentes ou autoria forjada | Alto, perda de histórico ou atribuição falsa | Versão esperada e gravação atômica; ator e data confiáveis; testar concorrência e entrada que tente fornecer metadados. |
| Leitura ou alteração sem evidência, ou vazamento em logs | Alto, perda de rastreabilidade ou exposição clínica | Auditoria transacional mínima e logs sanitizados; testar falha de auditoria, negativa e ausência de conteúdo/segredos. |

A fundação descreve RPC auditada, cifra/AAD, Vault e atestado, mas suas tarefas registram S-02 e provas reais de Auth, Vault, grants e integração pendentes. Anamnese tem operações privadas e testes locais com fixtures; isso não comprova os controles do plano nem o ambiente remoto. A validação de hipóteses materiais, recuperação e matriz final continua pendente; prioridades acima são condicionais e não representam certificação.

## Risks / Trade-offs

- Conteúdo sensível ou versões anteriores expostas: autorização no servidor e banco, cifra aplicável, logs sanitizados e provas diretas positivas e negativas.
- Revisões concorrentes: controle de versão e erro explícito, sem substituir atualização anterior.
- Regras abertas: validar campos, responsáveis e audiência com equipe antes de disponibilizar fluxo. Proposta não atesta segurança nem integração.

## Migration Plan

Preparar migração aditiva local e testes; nenhuma operação remota ocorre sem autorização explícita. Antes de ativar, definir recuperação e reversão que preservem dados e histórico; uma reversão não elimina registros sem procedimento aprovado.

A gravação privada local exige chave idempotente e digest HMAC do comando lógico, atestados pelo servidor confiável. O recibo registra ator, operação e referência à versão, sem conteúdo clínico; repetição revalida autorização e retorna a versão original, inclusive quando identificadores gerados mudarem. Reuso com digest diferente ou paciente distinto gera conflito; gravação, recibo e auditoria compartilham transação. Integração real e concorrência específica ainda exigem prova.

## Camada HTTP do catálogo de campos extras (11/11/2026) — operação 1 de 3, provada

Seguindo o padrão já estabelecido (não exposto) de `plano-cuidado-nativo.ts`/`compor-plano-cuidado-nativo.ts`/`executor-plano-cuidado-nativo.ts` (operar → compor → executor, portas injetadas, atestado assinado no servidor via Vault, `criarIdempotenciaNativa` para o digest HMAC — não o padrão mais complexo de ID derivado de `concessoes-equipe.ts`, que não se aplica aqui porque `campo_id` já vem do cliente):

- `netlify/functions/_shared/campo-extra-plano-nativo.ts` (`operarCampoExtraPlanoNativo`, puro, portas injetadas, sem cifra/AAD/cursor — catálogo não é conteúdo clínico).
- `netlify/functions/_shared/compor-campo-extra-plano-nativo.ts` (wiring real: cofre, auth nativo, checagem administrador-only como defesa em profundidade — a autorização de verdade é da SQL).
- `netlify/functions/_shared/executor-campo-extra-plano-nativo.ts` (chama `api.campo_extra_plano_privado`).
- `netlify/functions/_shared/entrada-campo-extra-plano-nativa.ts` (parse HTTP → comando, usando `contratosRotas.listarCampoExtraPlano`/`gravarCampoExtraPlano`).
- `netlify/functions/campo-extra-plano.ts` (rota fina `/api/admin/campo-extra-plano`, atrás de `FFCM_CAMPO_EXTRA_PLANO_ATIVO`, desativada por padrão).
- `packages/contracts/src/plano-cuidado.ts`: `respostaCampoExtraPlanoPrivadaSchema`, `respostaAprovadorPlanoPrivadaSchema`, `aprovadorPlanoSchema`, `respostaAprovarObjetivoPlanoPrivadaSchema`, `aprovacaoObjetivoPlanoSchema` (as três operações, pra reduzir retrabalho quando a 2 e a 3 forem feitas).
- `packages/contracts/src/rotas.ts`: `contratosRotas.listarCampoExtraPlano`/`gravarCampoExtraPlano`/`listarAprovadorPlano`/`gravarAprovadorPlano`/`aprovarObjetivoPlano` (as cinco rotas já contratadas; só a primeira dupla tem camada HTTP real atrás).
- `supabase/migrations/20261116180000_grant_campo_extra_plano_teste.sql` (grant de EXECUTE a `authenticated` só pro ambiente de teste local, nunca aplicado remoto).
- `netlify/functions/_shared/campo-extra-plano-postgres-local.test.ts` + `scripts/testar-campo-extra-plano-integrada-local.sh`: teste de integração real (PostgreSQL descartável, papel `authenticated` de verdade, atestado/idempotência reais, Auth/Vault como fixture) cobrindo listar vazio, criar, editar com versão esperada, listar com os dois itens, e negativa de profissional (rejeitado pela própria SQL administrador-only, não pelo HTTP). Passou (exit 0).

**Decisão tomada sozinho, documentada**: `digest_idempotencia` usa HMAC simples via `criarIdempotenciaNativa`/`cifra.calcularHmac` (um único HMAC sobre o comando canônico), não o padrão de `calcularCandidatosConcessao` (múltiplas chaves versionadas derivando um ID determinístico) usado em `concessoes-equipe.ts` — esse padrão mais pesado existe porque lá o `concessao_id` TEM que ser derivado deterministicamente (o cliente não gera o id); aqui `campo_id` já vem do cliente fresco na intenção de criação, igual `objetivo_id` em `plano_cuidado_operacao_privada`, então só precisa de um fingerprint estável do comando — mesmo padrão que `plano-cuidado-nativo.ts` (ainda não exposto) já usa.

**Limitação de ambiente encontrada e contornada**: `pnpm run verificar:rapido`/`npx biome check` com múltiplos arquivos ou arquivos maiores falhou repetidamente com "Linter process terminated abnormally (possibly out of memory)" nesta sessão (memória do sistema genuinamente baixa, não é problema de conteúdo — confirmado checando `vm_stat`). Contornado rodando `./node_modules/.bin/biome` (binário local, sem overhead do `npx`) e arquivo por arquivo quando necessário; ao final, `./node_modules/.bin/biome check` no projeto inteiro (466 arquivos) passou limpo numa única chamada. `pnpm run verificar:rapido` deve ser reexecutado quando o ambiente tiver mais memória livre, para confirmar pela via oficial do projeto.

**Não feito nesta rodada, fica para continuar**: operação 2 (lista de aprovadores: `listar_aprovador_plano`/`gravar_aprovador_plano`, administrador-only, mesmo padrão exato da operação 1 — só trocar nomes de campo) e operação 3 (`aprovar_objetivo_plano`, autorização administrador-ou-aprovador, sem idempotência por chave — ver nota no código sobre `x-chave-idempotencia` exigido pelo envelope padrão mas não usado pela operação). Os contratos de rotas das três já existem (`contratosRotas`), faltando só operar/compor/executor/entrada/rota/teste das operações 2 e 3, seguindo o mesmo molde desta. Interface web (tela da Edilaine, formulário do profissional) continua totalmente pendente — depende desta camada HTTP existir primeiro, que agora existe parcialmente (1 de 3). Revisão independente desta camada HTTP ainda não feita.

## Decisão do solicitante (17/11/2026) — visibilidade do objetivo para a família

Fecha a pendência registrada em 1.2/"Recorte local provisório" ("família sem acesso por
inferência; matriz definitiva... permanece pendente"): a família passa a poder ler objetivos,
mas só por marcação explícita, nunca por inferência de perfil — consistente com o que já estava
decidido, não uma mudança dele. Resposta literal do solicitante: **"Na anotacoes criar opcao de
marcar como Interna ou publica"**.

- Quem já grava objetivo/revisão (colaborador com concessão vigente) marca cada versão como
  `interna` (padrão, preserva o comportamento anterior à coluna existir) ou `publica`.
- Família só lê a **lista** de objetivos (`api.ler_plano_cuidado`), filtrada para
  `visibilidade='publica'` da última versão de cada objetivo. Família não lê histórico
  (`api.ler_historico_objetivo_cuidado`) nem grava — nenhuma dessas duas capacidades foi pedida;
  manter o recorte mínimo evita inventar superfície de autorização não solicitada (YAGNI).
- Sem admin-only: ao contrário de documentos (onde o solicitante foi explícito sobre ser o admin
  quem alterna o flag), aqui qualquer colaborador que já tem autorização de escrita no objetivo
  decide a visibilidade dele — mesma autorização existente, campo adicional.

## Implementação (17/11/2026)

- `supabase/migrations/20261117230000_objetivo_cuidado_visibilidade.sql`: coluna aditiva
  `visibilidade text not null default 'interna' check (in ('interna','publica'))` em
  `cadastro.objetivo_cuidado_versao` — em claro (fora do envelope cifrado), porque o banco
  precisa filtrar por ela sem decifrar.
- `supabase/migrations/20261117240000_plano_cuidado_familia_privada.sql`: `create or replace
  function api.plano_cuidado_operacao_privada` (redefine a função já existente, como todas as
  evoluções anteriores desta mesma função) adicionando uma trilha familiar **só para
  `api.ler_plano_cuidado`** — mesma prova de `api.consultar_paciente_familiar_privado`
  (`cadastro.acesso_paciente` vigente, `identidade.sessao` método `familia` sem concessão,
  `amr=password`), nunca estendida a `gravar`/`historico` (a condição já checa
  `acao='api.ler_plano_cuidado'` antes de tentar autorizar como família, então os outros dois
  ramos nunca a alcançam — sem precisar repetir o gate de papel na validação de escrita). Filtro
  de visibilidade aplicado só na leitura da lista, via `filter (where papel='colaborador' or
  v.visibilidade='publica')` dentro do `jsonb_agg` — deliberadamente feito no agregado de saída,
  não na CTE de paginação por cursor, para o `proximo_cursor` continuar contando a partir do
  conjunto completo de ids (senão uma página inteira de objetivos internos faria o cursor
  "sumir" mesmo havendo mais objetivos à frente). Novas policies (RLS): `plano_owner_paciente_familiar`
  (segunda policy PERMISSIVE em `cadastro.paciente`, somada por OR à já existente do colaborador,
  sem tocar nela) e `plano_owner_acesso_familiar`/`_lock` em `cadastro.acesso_paciente`.
- **Bug real encontrado e corrigido na própria sessão**: a policy `_lock` nova foi escrita
  primeiro como `using (false) with check (false)` — e isso quebrou o `for share` da própria
  trilha familiar (não só a escrita), porque o Postgres aplica a `using` da policy de UPDATE
  (não só a de SELECT) para decidir se uma linha pode ser travada por `FOR SHARE`/`FOR UPDATE`.
  Sintoma: uma leitura simples (sem lock) encontrava a linha, a mesma leitura com `for share`
  não. Corrigido espelhando a `using` da policy de select (`usuario_id = auth_privado.uid()`),
  mantendo só o `with check (false)` para barrar escrita de fato — mesmo padrão que as outras
  policies `_lock` deste projeto já usam (`using(true)` ou a condição da policy de select, nunca
  `using(false)`); eu tinha generalizado errado a partir de um exemplo que coincidentemente usava
  `using(true)`.
- Contratos: `visibilidadeObjetivoSchema` (`plano-cuidado.ts`), adicionado como campo em claro
  irmão de `objetivo_id`/`versao` em `registroPlanoSchema` e no `registro` de `plano-http.ts`
  (nunca dentro de `objetivoSchema`/`conteudoPlanoSchema`, que vão para o envelope cifrado);
  `criar`/`revisar` passam a exigir `visibilidade` na entrada HTTP (opcional só na camada interna
  `Comando` do `_shared/plano-cuidado-nativo.ts`, para não quebrar testes unitários que chamam
  essa camada direto sem passar pelo contrato HTTP — default `'interna'` espelhando o default da
  coluna). `visibilidade` entrou também no digest de idempotência (`calcularDigestIdempotencia`)
  — sem isso, duas gravações com a mesma chave de idempotência mas `visibilidade` diferente
  seriam tratadas como repetição e a segunda seria silenciosamente ignorada.
- `web/plano-cuidado.ts`: seletor "Visibilidade para a família" (Interna/Pública) no formulário
  de criar/revisar; parâmetro `ehFamilia` oculta formulário, histórico e "Revisar objetivo",
  mostrando só a lista (com o rótulo de visibilidade) e a paginação. `web/ciclo-plano.ts`/
  `web/servico-plano-http.ts`: `visibilidade` roteado através do ciclo de criação; gate de fluxo
  do cliente HTTP corrigido para aceitar `modo-acesso==='familiar'` (mesma classe de achado já
  corrigida em `servico-regras-atendimento-http.ts`/`servico-diario-http.ts`). `web/main.ts`:
  `secoesDaFicha` da família ganhou a seção `'plano'` (não entra em `planoAberto` nem no
  mecanismo de reconfirmação de acesso do colaborador, que leva a `'visao'` — seção que família
  não tem; família não grava, não tem rascunho nem reserva a perder).
- Evidência: `supabase/tests/plano_cuidado_familia_local.sql` via
  `scripts/testar-plano-cuidado-familia-local.sh` (positivo: família lê só o objetivo público;
  negativos: sem `acesso_paciente` nega, tenta gravar nega e não persiste, tenta ler histórico
  nega, acesso revogado nega mesmo com sessão viva, sessão de equipe disfarçada — `amr=oauth` —
  não passa pela trilha familiar; regressão: colaborador continua lendo os dois objetivos,
  publica e interna, sem filtro) — passou (exit 0) depois de corrigir o bug da policy `_lock`
  acima. `pnpm run test:web` (405/405) e `pnpm run test:proxy` (397 passed/15 skipped, os
  skipped são os `*-postgres-local.test.ts` que exigem Postgres descartável e não rodam via
  vitest) sem regressão nos testes já existentes de plano-cuidado, depois de atualizar fixtures
  pré-existentes que não tinham `visibilidade` (ver tasks.md). `pnpm run verificar:rapido` limpo.
- **Sem ativação**: `ffcm.plano.ativo` não foi tocado; nenhuma migration aplicada remotamente;
  nenhuma flag alterada. Código pronto, decisão de subir é do solicitante.
- **Revisão independente desta adição ainda não feita** — quem implementou não aprova a própria
  revisão, mesma regra das adições anteriores desta fatia.

## Camada HTTP de aprovador e aprovar-objetivo (11/11/2026) — operações 2 e 3, provadas

Replicando o mesmo molde da operação 1 (lido como template literal), em paralelo à revisão independente da operação 1 (sem tocar nos arquivos dela):

- `netlify/functions/_shared/aprovador-plano-nativo.ts`/`compor-aprovador-plano-nativo.ts`/`executor-aprovador-plano-nativo.ts`/`entrada-aprovador-plano-nativa.ts` + `netlify/functions/aprovador-plano.ts` (`/api/admin/aprovador-plano`, atrás de `FFCM_APROVADOR_PLANO_ATIVO`): mesma estrutura administrador-only da operação 1, só trocando `campo_id/nome/tipo/opcoes` por `usuario_id_aprovador`.
- `netlify/functions/_shared/aprovar-objetivo-plano-nativo.ts`/`compor-aprovar-objetivo-plano-nativo.ts`/`executor-aprovar-objetivo-plano-nativo.ts`/`entrada-aprovar-objetivo-plano-nativa.ts` + `netlify/functions/aprovar-objetivo.ts` (`/api/plano/aprovar-objetivo`, atrás de `FFCM_APROVAR_OBJETIVO_PLANO_ATIVO`): mais simples (só POST, sem listar, sem `idempotencia`/`criarIdempotenciaNativa` — a operação não tem `chave_idempotencia`/`digest_idempotencia`/`auditoria_id` na SQL). Autorização na composição é a GERAL de colaborador (administrador OU profissional via Google Workspace, igual `plano_cuidado_operacao_privada`), não administrador-only — quem especificamente pode aprovar (administrador sempre, ou colaborador ativo na lista) é decidido só pela SQL, o HTTP não replica esse segundo gate.
- `supabase/migrations/20261116190000_grant_aprovador_plano_teste.sql`: grant de teste local pras duas funções (`api.aprovador_plano_privado`, `api.aprovar_objetivo_plano_privado`), nunca aplicado remoto.
- Testes de integração real (PostgreSQL descartável, papel `authenticated`, atestado real): `aprovador-plano-postgres-local.test.ts` (listar vazio, indicar aprovador, desativar, listar, negar profissional) e `aprovar-objetivo-plano-postgres-local.test.ts` (fixture de objetivo/versão inserida direto no banco, administrador aprova, replay idempotente sem duplicar, profissional não listado negado, registro inexistente dá conflito). Ambos passaram (exit 0).

**Bug de ambiente encontrado e corrigido**: o script `testar-aprovar-objetivo-plano-integrada-local.sh` falhava ao subir o PostgreSQL descartável com `could not create any Unix-domain sockets` — o prefixo do diretório temporário (`ffcm-aprovar-objetivo-integrada.XXXXXXXX`) combinado com o caminho longo do `TMPDIR` do macOS (`/var/folders/.../T/`) estourava o limite de 103 bytes de caminho de socket Unix do Postgres. Corrigido encurtando o prefixo para `ffcm-aprov-obj`. Os outros scripts desta mesma leva (`campo-extra-plano`, `aprovador-plano`) não bateram nesse limite por terem nomes mais curtos — vale atenção em scripts futuros.

**Typecheck e lint**: `tsc --project netlify/tsconfig.json` limpo; `biome check netlify/functions` limpo nos arquivos desta tarefa (um achado de formatação pré-existente em `compor-campo-extra-plano-nativo.ts`, fora do escopo — pertence à operação 1, não corrigido aqui pra não interferir na revisão independente em andamento dela).

**Ainda pendente**: interface web (tela da Edilaine pro catálogo/aprovadores, campos extras e botão de aprovar no formulário do profissional) — depende da camada HTTP completa, que agora existe (3 de 3). Revisão independente desta camada HTTP (operações 2 e 3) ainda não feita.
