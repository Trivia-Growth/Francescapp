# Revisão no Sol — S-02: preparação da fundação

## Retomada vigente — 01/11/2026

O solicitante aprovou permanentemente Supabase nativo sem custo adicional no plano vigente, conforme D-14 da mudança. O histórico abaixo é preservado, não uma lista cumulativa de bloqueadores: desafio/JWKS próprios, cifra de refresh, prova por geração e autoridade adicional de sessão foram dispensados. Permanecem concessões, RLS, revogação, auditoria, cifra de campos e atestado de escrita aplicáveis. A revisão do desenho nativo e as provas reais continuam pendentes; S-02 não está aprovada. Início Google, callback, admissão, consulta e saída têm código local e testes com fixtures; não há publicação comprovada.

Revisão estática independente em 01/11/2026, posterior a D-14: não confirmou achado novo além dos bloqueios já conhecidos. Callback concorrente ainda pode sobrescrever cookies fora de ordem; leituras de `auth.identities`/`auth.sessions` nas operações privadas precisam de solução e prova de revogação concorrente. Permanecem sem comprovação Auth/Vault reais, canal do executor, grants finais e jornada integrada. A admissão local prepara vinculação de pré-concessão por HMAC, mas Google único OAuth e `identity_data.custom_claims.hd` precisam de prova no projeto. SQL e handlers privados não têm execução concedida à aplicação; testes com fixtures não substituem S-02 integrada. Os tokens Google são descartados neste login; Calendar/Drive ainda não estão ativados.

Preparação posterior: migrations privadas `20261106180000` e `20261106190000` propõem bloqueios Auth e wrappers com owners restritos, ainda sem execução concedida à aplicação. Testes locais usam Auth/Vault fictícios; a carteira no teste dos wrappers é substituída por fixture. Revisão corrigiu verificação inicial dos triggers das FKs, mas ela não garante que permaneçam habilitados após a migration nem impede operações privilegiadas com `session_replication_role=replica`. A ordem dos locks e o privilégio `UPDATE(id)` necessário ao owner precisam de comprovação e revisão no ambiente real. Adaptador de cofre com pool injetado também requer prova de TLS, identidade e grants; suas leituras de chaves ocorrem em transações separadas. Nada disso conclui S-02 ou autoriza ativação.

Correção local posterior: operações privadas passaram a obter bloqueios de Auth e revalidar expiração após espera e antes de retornar sucesso. Wrappers usam subtransação para reverter efeitos e registrar a negativa sem PII na transação externa. Testes descartáveis exercitaram composição, criação e carteira com expiração após espera, assinatura real e Auth/Vault fictícios; falha de auditoria bloqueou a resposta. Revisão estática independente não encontrou novo problema no recorte. Ordem dos locks, privilégios, integração real e S-02 continuam pendentes.

Admissão/consulta nativas também foram ajustadas para bloquear registros Auth e revalidar expiração. Testes locais de duas conexões exercitaram expiração durante espera e após escrita de admissão, confirmando rollback de usuário, concessão e sessão; a auditoria da transação também é revertida nesse último caso. O helper legado privado `sessao_atual_valida` ainda usa `statement_timestamp`; revisão não encontrou caminho exposto atual, mas seu eventual uso exige nova análise. A aplicação parcial da cadeia deixa essas RPCs indisponíveis até as migrations posteriores de bloqueio e grants. Auth/gateway reais e S-02 permanecem não comprovados.

**Estado:** revisão independente realizada em 27/10/2026; não aprovada. Não libera integração de
operações protegidas. **Base:** `e76bec57ef18728bc916a18eb2e5b3204c5617eb`,
mais alterações locais rastreadas e arquivos novos, ainda sem commit. Mudança:
`openspec/changes/fundar-identidade-e-seguranca-backend/`.

## Escopo para revisão independente

- Banco: `supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql`,
  `20261026143000_fundacao_grants_rls.sql`,
  `20261026150000_fundacao_auditoria_idempotencia.sql` e
  `20261026153000_fundacao_vault.sql`.
- Provas SQL: `supabase/tests/fundacao_d05_schema.sql`,
  `fundacao_d06_autorizacao.sql`, `fundacao_d09_auditoria_idempotencia.sql` e
  `fundacao_d08_vault.sql`.
- Cifra/cofre: `supabase/functions/_shared/cifra-autenticada.ts`,
  `cofre-vault.ts` e testes correspondentes; contratos em
  `packages/contracts/src/rpc.ts`.
- Identidade/sessão: `supabase/functions/_shared/identidade/` e `sessao/`,
  testes e documentos em `docs/desenvolvimento/`. O fluxo Google externo,
  rotas HTTP, refresh/logout e bootstrap ainda não estão integrados.

Revisar o estado completo, inclusive arquivos não rastreados: `git diff HEAD`
isoladamente não os inclui. A revisão deve examinar padrões do projeto e
aderência a D-02–D-09/D-13, com os cenários de autorização da mudança.

## Evidência disponível e limites

- Em 29/10/2026, consulta de leitura ao histórico remoto identificou as quatro
  primeiras versões da fundação. Seus comandos, reconstruídos a partir do
  histórico e comparados após normalização de espaços, correspondem aos
  arquivos locais. As versões `20261027160000`, `20261027170000` e
  `20261028100000` não constavam no histórico. O catálogo consultado continha
  as funções e objetos Vault exigidos e não continha as duas roles novas;
  não havia dependências catalogadas da função de auditoria antiga. Isso não
  descarta chamadores externos nem comprova segurança de integração.
  O solicitante autorizou as três migrações e a credencial temporária da CLI.
  A simulação listou somente essas versões; em seguida, a CLI aplicou as três
  e a consulta ao histórico confirmou as sete versões esperadas. A API de
  migração não foi usada, pois gera versões próprias. Nenhuma credencial ou
  dado pessoal foi salvo.
- Após a aplicação, consulta ao catálogo confirmou a assinatura nova de
  auditoria, owner dedicado do leitor Vault, execução negada a `anon` e
  `authenticated`, executor sem acesso direto à view, e ambos os papéis sem
  login. Porém `postgres` consta como membro tanto do owner quanto do executor,
  com concessões por `supabase_admin` e opção de administração, mesmo após a
  revogação prevista na migração; ambas têm `SET` e `INHERIT` desativados.
  O banco informa PostgreSQL 17.11 e `postgres` tem `CREATEROLE` sem ser
  superusuário. A documentação do PostgreSQL 17 descreve concessão automática
  com essas opções ao criador de uma role, compatível com o observado; com
  `ADMIN`, o criador ainda pode conceder a si próprio opções adicionais. É
  necessário revisar a cadeia de privilégios real, sem usar `postgres` como
  runtime nem alterar papéis privilegiados sem nova análise.
  S-02 permanece não aprovada e a aplicação das migrações não comprova login,
  operações protegidas ou leitura de Vault pelo runtime real.
- Revisão independente complementar, em 29/10/2026, nos eixos de padrões e
  especificação, sobre a migração `20261027170000` aplicada e os adapters
  `cofre-vault-postgres.ts` e `pool-cofre.ts`, incluindo arquivos locais não
  rastreados e base `e76bec5`: o operador `postgres` pode conceder a si opções
  de acesso ao owner por ter `ADMIN`, portanto não deve ser usado como runtime.
  A validação do nome do login no pool não comprova seus privilégios nem a
  autenticidade da CA. O owner consegue ler outros segredos da view Vault; a
  função restringe a referência, mas seu isolamento depende da cadeia de papéis.
  Falta provar identidade real de execução, ausência de poderes adicionais e
  acesso direto, TLS/CA/pooler do alvo e proteção de logs. Os revisores não
  executaram testes nessa passagem; tarefas 2.4.2 e 2.4.3 seguem pendentes.
- A [documentação de conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
  descreve suporte a login PostgreSQL próprio no pooler compartilhado, com
  usuário no formato papel e referência do projeto, e indica o modo transacional
  para funções serverless. Nesse modo, estado de sessão não persiste entre
  transações e prepared statements não são suportados no pooler compartilhado.
  O adapter experimental usa `SET LOCAL ROLE` dentro da transação e não nomeia
  prepared statements, mas isso não comprova compatibilidade do endpoint, TLS,
  identidade ou permissões reais. O host deve vir da configuração do projeto,
  sem inferência pela região; naquele momento provisionamento e segredos ainda
  aguardavam autorização específica.
- O solicitante autorizou posteriormente criar a identidade restrita e
  configurar a credencial server-only. Antes de executá-lo, consulta ao alvo
  mostrou `log_statement=ddl`, `log_min_error_statement=error`,
  `log_parameter_max_length=-1` e rastreamento superior por
  `pg_stat_statements`. A consulta inicial `has_parameter_privilege` retornou
  falso, mas um teste posterior como executor da Management API conseguiu
  aplicar `SET LOCAL` sobre os parâmetros dentro de transação revertida;
  consulta na mesma modalidade confirmou `session_user` e `current_user`
  como `postgres`;
  portanto essa consulta isolada não demonstra impedimento efetivo. A
  [orientação Supabase para credenciais](https://supabase.com/kb/troubleshooting/provisioning-credentials-without-log-exposure)
  alerta que comandos SQL com senhas e falhas podem expor valores, inclusive
  no histórico de consultas, e desaconselha reconstruí-los em SQL dinâmico.
  O canal de provisionamento de senha de role própria ainda não foi comprovado
  seguro neste alvo; nenhuma identidade, senha ou segredo foi criado por essa
  autorização. Não suprimir logs globais nem substituir a identidade restrita
  por `postgres`; validar alternativa segura e rotação antes de prosseguir.
- Uma prova somente de leitura enviou `ALTER ROLE ... PASSWORD $1` ao parser
  remoto com parâmetro fictício: PostgreSQL retornou erro de sintaxe `42601`
  antes de qualquer alteração. A [gramática do PostgreSQL 17](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/parser/gram.y)
  exige literal de string no campo de senha, portanto não se pode presumir
  que bind comum elimine o risco de logs nesse comando. Não houve role ou
  credencial criada pela prova. O comando `psql \password` evita enviar senha
  em claro, mas seu verificador continua sensível em logs de falha; a política
  de observabilidade e o caminho operacional ainda exigem solução comprovada.
- Em consulta à API de logs do projeto, duas consultas restritas para o fluxo
  PostgreSQL retornaram HTTP 200 com erro de backend no corpo. Não foi possível
  confirmar a visibilidade nem a redação dos registros; nenhum teste canário
  com criação de role foi executado e a ausência de resultados não foi tratada
  como evidência. O provisionamento de senha permanece pendente.
- Consulta posterior aos logs com janela explícita voltou a responder. Uma
  role de teste com senha comprovadamente fictícia foi criada e revertida na
  mesma transação; o catálogo confirmou sua ausência. A consulta aos logs não
  encontrou o evento, portanto não comprova redação. A consulta restrita a
  `extensions.pg_stat_statements` encontrou um registro associado à role com o
  valor fictício presente. Isso comprova exposição do literal nessa via para a
  prova executada, não a retenção de credenciais reais. Não usar esse método
  para senha ou verificador real; identidade e segredo seguem não criados.
- Uma segunda prova aplicou, somente na transação, os controles recomendados
  pelo Supabase para logs e estatísticas antes de criar uma role com valor
  fictício, terminando em rollback. A role não persistiu e nenhuma ocorrência
  desse valor foi encontrada em `pg_stat_statements`. Outra transação produziu
  erro intencional com valor fictício sob os mesmos controles; não houve
  ocorrência nas estatísticas nem nos logs consultados. A busca de logs
  encontrou o evento da prova anterior de sucesso, mas o controle de erro sem
  proteção ainda não apareceu. Assim, a ausência do erro protegido nos logs é
  inconclusiva; faltam comprovar ingestão do controle negativo, demais canais
  e o comportamento operacional antes de usar credencial real.
- A consulta posterior encontrou o controle de erro sem proteção: o valor
  fictício apareceu nos metadados de um evento, embora não no texto exibido.
  O erro protegido e o sucesso protegido também tiveram eventos localizados,
  sem o valor fictício no texto ou metadados; nenhum dos valores protegidos
  apareceu nas fontes de logs consultadas ou nas estatísticas SQL. A busca se
  limita aos registros disponíveis e à janela examinada: não prova ausência
  em infraestrutura externa, logs não consultáveis ou falhas diferentes.
  É necessária revisão do fluxo de provisionamento e de recuperação antes de
  enviar credencial real; nenhuma foi criada ou configurada até esta prova.
- A revisão independente pediu conexão SQL única: verificar controles antes de
  enviar a senha, impedindo que erro anterior exponha o restante da consulta à
  Management API. Foi emitida credencial temporária da CLI, validade informada
  de 300 segundos, sem registrá-la. A tentativa pelo pooler com verificação TLS
  falhou com `SELF_SIGNED_CERT_IN_CHAIN`; a CA autenticada do projeto não está
  disponível nesta configuração. Não desativar verificação TLS nem confiar em
  certificado obtido da própria conexão não autenticada. Login e segredo do
  runtime continuam não provisionados.
- Posteriormente, foi localizado o endereço do certificado público no
  [código oficial do painel Supabase](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
  Com a CA obtida por HTTPS desse endereço, o pooler aceitou conexão da CLI com
  verificação de cadeia e hostname ativa. Na mesma sessão, controles `SET LOCAL`
  foram aplicados e seus valores conferidos antes de um `CREATE ROLE` com valor
  fictício; a transação foi revertida e o papel não permaneceu. Falha fictícia
  separada também foi testada. Nenhum valor das duas provas apareceu nas
  estatísticas ou logs disponíveis; a configuração retornou aos valores
  anteriores após rollback. Consulta posterior encontrou dois eventos do
  controle positivo de erro sem proteção, com o valor fictício presente em
  um deles. A prova cobre somente os canais e a janela consultados; a revisão
  do procedimento completo permanece necessária. Conexão temporária foi
  encerrada; não houve criação de login ou segredo de runtime.
- Plano autorizado para a próxima operação: criar `ffcmapp_vault_login` sem
  poderes administrativos e com opção SET, mas sem INHERIT ou ADMIN, apenas
  para `ffcmapp_vault_executor`; armazenar sua senha exclusivamente como
  `FFCM_VAULT_DB_PASSWORD` em segredo de Edge Functions. Antes da operação,
  o catálogo confirmou que esses nomes não existiam e não havia funções Edge
  publicadas. Segredos Edge são do projeto e ficam disponíveis às suas funções,
  portanto futuras funções devem ser confiáveis e revisadas antes de publicação.
  Se o resultado do commit ou do armazenamento for incerto, conferir o estado
  autoritativo e não liberar integração; se o login existir sem armazenamento
  confirmado ou falhar teste crítico, desativá-lo e documentar a situação.
  Esta autorização não inclui deploy, bootstrap ou concessão a pessoas.
- Operação autorizada executada em 29/10/2026: `ffcmapp_vault_login` foi criado
  após conferir controles na sessão TLS autenticada, e a credencial foi enviada
  ao segredo Edge `FFCM_VAULT_DB_PASSWORD`; a listagem posterior confirmou o
  digest correspondente sem exibir a credencial. O catálogo confirmou LOGIN,
  NOINHERIT, ausência de superusuário, CREATEROLE, CREATEDB, REPLICATION e
  BYPASSRLS, e vínculo com executor com SET, sem INHERIT ou ADMIN. A conexão
  real aceitou TLS/identidade e negou leitura direta da view, execução direta
  do leitor e SET ROLE do owner; aceitou SET LOCAL ROLE do executor, negou uma
  referência ausente e restaurou a identidade após rollback. As conexões foram
  encerradas. A primeira limpeza de variáveis não removeu a referência à senha
  ainda guardada no objeto do cliente; ela foi identificada e descartada após
  o teste posterior. Naquele momento não havia prova de leitura
  positiva de chave pelo runtime, nem entrega/isolamento por função Edge,
  rotação, concorrência ou o fluxo integrado; não houve deploy. Os segredos
  Edge são compartilhados pelas funções do projeto: isolamento por função
  não é demonstrado. S-02, 2.4.2 e 2.4.3 continuam pendentes.
- Teste posterior usou conexão real com TLS e o login restrito para ler uma
  chave fictícia de 32 bytes pelo leitor SQL após `SET LOCAL ROLE` do executor;
  o valor coincidiu e o papel original foi restaurado após commit. A fixture
  foi identificada por nome único, criada especificamente para a prova e
  removida por ID e nome exatos; consulta independente confirmou zero registros
  restantes. A leitura ocorreu por cliente local com a credencial antes mantida
  em memória, não por função Edge implantada nem pelo adapter de produção;
  portanto não comprova runtime Edge, rotação, isolamento de segredos ou S-02.
- Consulta posterior ao catálogo para o login restrito não encontrou
  privilégios diretos ou herdados de leitura/escrita sobre tabelas e views de
  `public`, `identidade`, `cadastro`, `auditoria`, `operacao` ou `vault`. A
  cadeia de memberships consultada contém somente `ffcmapp_vault_executor`.
  A função preexistente `public.rls_auto_enable` tem EXECUTE acessível por
  PUBLIC, mas seu retorno é `event_trigger`; não foi alterada. Essa consulta
  de catálogo não cobre todos os schemas do provedor nem substitui testes de
  execução e isolamento em Edge Functions.
- Após as três migrações, foram executados no projeto remoto, em transações
  revertidas, `fundacao_d09_correlacao.sql`,
  `fundacao_d08_vault_privilegios.sql` e `fundacao_d06_sessao_vinculo.sql`:
  os três passaram. Consulta posterior verificou zero usuários, pacientes,
  operações e nomes de segredo das fixtures verificadas. A prova do Vault usa
  `SET ROLE`, não a identidade de conexão do runtime; a de sessão usa claims
  fictícios e não comprova validação JWT, rota HTTP ou RLS de toda a aplicação.
- Depois da migração de correlação, `fundacao_d09_auditoria_idempotencia.sql`
  passou no Supabase em transação revertida: repetição idêntica, conflito por
  digest diferente, rollback por falha de auditoria e bloqueio de edição e
  exclusão da trilha. Consulta posterior encontrou zero usuários, operações e
  eventos identificados pela fixture. Não comprova revalidação de autorização
  após revogação nem RPC real de concessão; 2.3 permanece pendente.
- Consulta somente de leitura ao catálogo após as migrações encontrou 13
  tabelas nos schemas internos e `public.usuario`, todas com RLS habilitada,
  sem privilégio direto de SELECT/INSERT/UPDATE/DELETE para `anon` ou
  `authenticated`; cinco funções internas não têm EXECUTE para essas roles.
  A verificação não prova comportamento de policies, acesso por outros papéis,
  nem defaults de objetos futuros. O problema conhecido do EXECUTE padrão de
  funções criadas por `postgres` permanece pendente; 2.2 não está concluída.
- As suítes D-05, D-06, D-09 e D-08 foram executadas no projeto Supabase de
  testes autorizado, com transações revertidas. D-08 foi repetida com sucesso
  em 27/10/2026. Não houve prova por runtime do backend: D-08 chamou o leitor
  pelo canal privilegiado de teste.
- D-06 verifica RLS habilitada e privilégios no catálogo. A condição de
  existência foi ajustada para conferir ambos os helpers. Permanecem pendentes
  provas de privilégios globais e por owner, além de defaults por schema, com
  testes que criem objetos de prova.
- Em 27/10/2026, `fundacao_d06_sessao_vinculo.sql` passou no projeto de teste
  com rollback. Com claims simulados e fixtures fictícias, os helpers
  permitiram acesso administrativo à carteira e ao paciente vinculado e negaram outro paciente, sessão não admitida,
  usuário inativo e concessão, vínculo ou sessão revogados. É prova SQL dos
  helpers, não verificação criptográfica de JWT nem prova HTTP/RPC ou de todos
  os perfis. Consulta posterior confirmou ausência dos dois usuários Auth e
  pacientes fictícios. O teste de defaults do criador `postgres` continua falhando.
- O teste posterior revelou erro `22P02` para identificadores de sessão e
  usuário inválidos. A migração `20261028100000_sessao_identificador_invalido.sql`
  foi preparada para negá-los sem conversão inválida; passou com a matriz em
  transação revertida. Uma revisão independente identificou divergência entre
  fontes de claims de `auth.uid()` e `auth.jwt()`: a definição instalada foi
  conferida, o guard alinhado a `auth.uid()` e cenários divergentes passaram.
  Revisão independente da versão ajustada não encontrou bloqueador para JSON
  válido e UUID canônico; alertou que formatos alternativos são rejeitados e
  JSON malformado ainda pode lançar erro. Testes adicionais de sessão de outro
  usuário, sessão ausente, inativação e revogação passaram em rollback. A
  migração não está aplicada no banco e não comprova JWT ou endpoint HTTP.
- D-09 demonstra idempotência e rollback do registro de requisição quando a
  auditoria falha. Em 27/10/2026, `agent_a_auditoria_concessao.sql`, executado
  junto com a migração de correlação em transação revertida no Supabase de
  teste, confirmou rollback integral da alteração de concessão, do ledger e do
  evento quando a auditoria falha, além do caminho positivo. Esse teste compõe
  SQL de teste diretamente; ainda não demonstra a RPC real de concessão nem
  revalidação de autorização em uma repetição após revogação.
- O núcleo AES-GCM/HMAC tem testes puros de envelope, AAD, chave anterior e
  falha fechada. Persistência real, recriptografia e recuperação não foram
  comprovadas. As constraints de formato do banco não verificam por si só que
  o conteúdo do envelope é criptografia válida.
- O leitor SQL do Vault nega roles públicas nos testes existentes; o adapter
  TypeScript só possui executor fictício. Faltam identidade de execução real,
  transporte de servidor, grants mínimos e teste positivo/negativo desse caminho.
  Não se deve atribuir ao backend uma credencial de proprietário/superusuário.
- Em 27/10/2026, `supabase/tests/fundacao_s02_vault_roles.sql` testou em
  transação revertida um owner e um backend sem login: o backend conseguiu ler
  uma chave fictícia por função restrita, mas não acessar a view diretamente;
  referências fora do prefixo ou ausentes não retornaram chave. A role owner
  precisou de `USAGE` no schema Vault, `SELECT` na view e `EXECUTE` em
  `vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)`; sem
  este último, a consulta falhou com permissão negada. O owner com acesso à
  view pode ler outros segredos: isolá-lo do runtime é essencial. Consulta após
  rollback confirmou ausência das duas roles, função e segredo de teste.
  O backend foi simulado com `SET ROLE`, não com conexão de runtime; a função
  de prova não substitui a função de produção, sua validação ou grants reais.
  A função criptográfica é interna do provedor e depende de revisão de
  compatibilidade antes de qualquer migração permanente.
- Em 27/10/2026, a migração proposta `20261027170000_vault_owner_restrito.sql`
  e o teste `fundacao_d08_vault_privilegios.sql` passaram juntos em uma
  transação remota revertida: o leitor real sob owner dedicado devolveu os
  valores fictícios corretos a um executor sem acesso direto ao Vault; anon e
  authenticated não executam a função. A revisão independente encontrou
  sintaxe incompatível com PostgreSQL 15, dependência implícita de transação e
  prova insuficiente de referência correta; os arquivos foram ajustados e a
  prova remota repetida. A reavaliação independente encontrou teste negativo
  insuficiente: a referência fora do prefixo não existia. A fixture foi
  corrigida para criar segredo fictício fora do prefixo, e a prova passou
  novamente com rollback. PostgreSQL 15 não foi executado e a fixture ajustada
  ainda precisa de reavaliação. O teste usa `SET ROLE`, não um runtime
  real; naquele momento a migração ainda não havia sido aplicada permanentemente
  (foi aplicada em 29/10, conforme evidência acima) e não corrige defaults de
  funções criadas por `postgres`.
- Cookies/JWT/CSRF e validação de ID Token Google têm núcleos puros; não são
  prova de rotas, desafio único, JWKS remoto, troca Supabase, admissão,
  refresh/logout ou bootstrap.

## Parecer independente de 27/10/2026

Revisor: `gpt-6.1-sol`, execução separada em modo somente leitura, base e
arquivos locais acima. Parecer: manter S-02 pendente. Trinta e quatro
verificações puras passaram; SQL, Deno e integração não foram executados nessa
revisão. Achados:

1. Defaults de funções: `REVOKE ... IN SCHEMA` não remove o `EXECUTE` global
   herdado de `PUBLIC`. Funções atuais têm revogação explícita; exposição atual
   não foi demonstrada. Em 27/10/2026, D-06 criou função transitória e falhou
   com `FALHA: EXECUTE padrão expõe função futura`; a transação foi revertida.
   O owner observado é `postgres`: alterar seu default global também afeta
   funções futuras fora da fundação. Preparar owner dedicado e testar seu
   escopo antes de alterar esse default. Experimento transacional
   `supabase/tests/fundacao_s02_owner_isolado.sql` confirmou que uma role sem
   login, após assumir a própria identidade e revogar seu default global, cria
   funções sem `EXECUTE` público. A role e a função de teste foram revertidas;
   consulta posterior confirmou sua ausência. Isso não altera o owner real nem
   corrige o default de funções criadas por `postgres`.
2. Auditoria: o helper grava o ID do ledger em `evento.request_id`, em vez do
   request original do contrato. Correção preparada na migração aditiva
   `20261027160000_auditoria_correlacao_request.sql`: recebe o UUID original e
   recusa ausência. Em 27/10/2026, a migração e os testes de correlação e
   idempotência passaram em transações separadas revertidas no Supabase de
   teste. Revisão independente estática verificou a correção e indicou teste
   negativo ausente para request nulo: acrescentado e aprovado em rollback.
   Repetição e conflito não geram um novo evento de auditoria neste helper;
   a granularidade por tentativa e a revalidação de autorização ainda precisam
   ser resolvidas nas RPCs. Não aplicada permanentemente.
3. Perfil: o contrato de atualização aceita `familia`, mas a concessão de equipe
   aceita somente `administrador`/`profissional` e D-02 exige espelhamento.
   Em 27/10/2026, o solicitante reservou a transição à jornada familiar. Os
   contratos HTTP e RPC foram ajustados e possuem testes positivos e negativos;
   a implementação e a autorização no banco seguem pendentes em 4.1.
4. Os testes atuais de 2.2/2.3 não demonstram todos os critérios de autorização,
   rollback de concessão e repetição após revogação; tarefas reabertas. D-06
   foi corrigido para exigir ambos os helpers e passou antes da inclusão do
   novo teste negativo de defaults.

Faltam ainda executor real e identidade restrita para o Vault, persistência e
rotação comprovadas, e integração de sessão. Não há aprovação nem mudança de
autorizações operacionais por este parecer.

## Achados preliminares da interface e transporte em 27/10/2026

Revisões independentes em andamento reproduziram, com respostas e identidades
fictícias, dois cenários que bloqueiam a liberação da interface: a abertura de
outra aba pode substituir o cookie CSRF e impedir o encerramento na primeira;
e uma revalidação indisponível após cadastro sem confirmação descarta a chave
de idempotência, permitindo que uma nova tentativa use outra chave. Corrigir e
testar ambos antes de integração e testes de usabilidade; as reproduções não
comprovam Auth, RPC ou persistência reais. A revisão S-02 segue não aprovada.

Em 27/10/2026, um teste de interface com DOM e respostas fictícias reproduziu
a troca indevida da chave e passou após preservar o pedido em memória durante
revalidação inconclusiva, restaurando-o apenas para a mesma identidade com
capacidade administrativa vigente. O teste também verificou que outra
identidade não recebe os dados do pedido. Recarregar ou fechar a página ainda
perde a pendência; não há reconciliação persistente nem prova de banco real.
O problema de CSRF entre abas permanece aberto: retomar o CSRF sem vinculação
à sessão poderia encerrar uma sessão de outra identidade. A solução precisa
ser revista junto do contrato e das rotas reais de sessão.

Em 27/10/2026, `web/sessao-abas.test.ts` tornou a reprodução repetível: o
cliente e o transporte reais, com respostas de desafio/login fictícias,
retornaram `403 sem_permissao` ao sair após outra aba solicitar desafio. Na
primeira execução, o teste foi registrado como falha esperada; isso não era
evidência de correção nem de Auth, revogação ou integração real.

Atualização posterior: o contrato e o núcleo agora distinguem cookie CSRF do
desafio e da sessão; o teste de duas abas passa para o cenário de desafio
fictício, e o núcleo nega cookie de sessão como desafio e origem indevida.
Esse teste não comprova a rota real nem a troca de identidade em outra aba:
a vinculação da saída à sessão correta e a revisão independente do contrato
continuam pendentes. S-02 permanece não aprovada.

Revisão independente reproduziu a aceitação de CSRF da sessão A
com cookie refresh da sessão B pelo transporte anterior. O transporte foi
alterado para selar no refresh o CSRF emitido na mesma resposta e negar
combinações distintas; testes cobrem saída e renovação para outro session_id e
outro usuário. A prova independente da sessão pretendida pelo chamador ainda
falta. O refresh selado também contém usuário e session_id verificados no JWT
da emissão, devolvidos apenas ao servidor; rechecagem da autoridade vigente e
correspondência com o provedor continuam pendentes, assim como a revisão do
diff alterado. Não há rota real
conectada a esse núcleo; S-02 permanece bloqueada para integração.

Parecer independente sobre o diff local (`gpt-6.1-sol`, base `e76bec5`):
P1, contrato de logout/refresh não prova sessão pretendida; P2, faltam testes
de substituição por outra sessão/identidade e de refresh; P2, testar rejeição
de ciphertext renomeado entre tipos de cookie, não apenas nomes ausentes.
O parecer não libera S-02 nem valida Auth ou banco reais.

Revisão independente posterior encontrou uma corrida adicional: a resposta
atrasada do logout de uma aba pode limpar cookies de uma sessão criada depois
em outra aba. A leitura dos cookies de entrada não impede essa corrida de
resposta. A limpeza condicionada e testes de respostas fora de ordem permanecem
bloqueadores antes da integração; não considerar logout completo. Também foi
encontrado refresh que se tornava cookie grande após serialização e cifra: o
transporte passou a recusar o cookie selado acima de 4.096 bytes; teste local
do caso passou. Reavaliar o diff após esta alteração.

O teste HTTP de saída atrasada reproduziu a corrida e foi inicialmente marcado
como falha esperada em `http.test.ts`. Teste adicional com
executor fictício do Vault e cifra real verificou leitura da versão anterior
após trocar a chave ativa, sem nome em claro no envelope. Não comprova Vault
remoto, persistência, recuperação ou rotação operacional.

Atualização posterior: o transporte em desenvolvimento usa cookies com seletor
aleatório por emissão e exige contexto validado para limpar apenas os cookies
da sessão correspondente. O teste HTTP de saída atrasada passou localmente;
não comprova revogação nem rotas reais. Revisão independente em dois eixos
identificou outra corrida: falha de consulta de login antigo apagava um login
posterior. A correção recebeu teste de regressão. Também identificou acúmulo
de cookies e ausência de vínculo da renovação: o transporte agora oferece
resposta de renovação vinculada ao contexto validado e ao mesmo usuário e
session_id. A política de sessões abandonadas/recarregamento, as corridas
envolvendo Auth e revogação, renovação no navegador e desafios simultâneos
continuam pendentes. Reavaliação independente observou que uma resposta de
renovação atrasada ainda pode recriar cookies depois da limpeza de logout;
duas renovações com respostas invertidas também podem substituir CSRF e refresh.
O tombstone do banco precisa impedir a reabertura, mas não prova limpeza no
navegador. Esses interleavings exigem protocolo e testes antes da integração.
S-02 continua não aprovada e não autoriza integração protegida.

Os dois interleavings foram reproduzidos em `http.test.ts`: após aplicar saída
e depois renovação atrasada, reaparecem dois cookies; respostas de renovações
invertidas levam a `sem_permissao` com o CSRF da emissão mais recente. Ambos
estão identificados como falhas esperadas, não como correções. Os testes usam
apenas transporte local e não verificam a autoridade do banco ou o Auth.
Uma defesa adicional impede reutilizar um mesmo contexto validado para emitir
duas respostas de renovação; ela não serializa requisições distintas e não
corrige as duas falhas esperadas acima.

Após aprovação do solicitante, D-04 passou a prever refresh cifrado no
servidor e resposta de renovação sem `Set-Cookie`. O código anterior com
refresh em cookie não comprova o novo contrato e não deve ser integrado.
O núcleo de desafio Google usa nonce selado e hash SHA-256 hexadecimal; uma
revisão independente confirmou o formato e apontou dependência do relógio e da
atomicidade do banco, além de controles HTTP ainda ausentes. Entradas mal
tipadas e falha do adapter foram tratadas com erro sanitizado em testes locais;
o adapter fictício não comprova consumo único em PostgreSQL nem login Google.
Posteriormente o transporte local passou a emitir cookie de identidade sem
refresh e a renovar sem `Set-Cookie`; os dois cenários HTTP antes registrados
como falhas esperadas passaram localmente. Revisão independente ressaltou que
cookies abandonados ainda acumulam e podem exceder o limite do cabeçalho;
coordenação persistente, Vault, revogação e renovação no cliente ainda faltam.
Os testes HTTP não são prova desses controles ou de integração com Supabase.
Nova inspeção confirmou o risco de disponibilidade: entradas repetidas ou
recargas podem deixar cookies de sessões antigas até o fechamento do navegador;
quando o cabeçalho ultrapassa 8.192 bytes, o transporte também recusa a sessão
atual. Não remover o limite nem apagar cookies de outra sessão sem resolver o
ciclo de vida preservando o isolamento entre abas.

Foi preparado núcleo de cifra do refresh vinculado por AAD à sessão e ao
usuário, com testes de adulteração e entrada inválida usando chaves fictícias.
Revisão independente pediu validação de Unicode e identidade ausente, corrigidas
localmente. Reavaliação independente não encontrou regressão de AAD e decifrou
fixture sintética do formato anterior, gerada com implementação AES-GCM
independente. Não se trata de fixture histórica de produção. A validação rejeita
texto iniciado por BOM; isso restringe a entrada, sem corrupção silenciosa. O
núcleo não conecta o Vault nem persiste credenciais.

Em nova execução local do teste `cifra-refresh.test.ts`, os cinco casos passaram,
incluindo rejeição de adulteração e de identidade de outra sessão. As chaves e
credenciais eram fictícias; o resultado não comprova integração com Vault,
persistência ou revogação no Supabase.

Um primeiro desenho SQL de coordenação de renovação passou em PostgreSQL
temporário isolado, mas a revisão independente identificou concorrência não
protegida com revogação da concessão/desativação do usuário e impacto em sessões
existentes. Foi retirado da sequência automática e preservado somente como
`supabase/drafts/20261029110000_sessao_renovacao_fencing.sql`. Falta definir
ordem de locks compartilhada com as operações de revogação, comprovar corridas
em conexões distintas e planejar a transição. Não aplicar o rascunho; S-02 segue
sem aprovação. Não houve migração remota.

O rascunho foi ajustado para bloquear concessão, usuário e sessão nessa ordem e
revalidar após os locks. Em PostgreSQL temporário, testes com duas conexões
observaram espera por lock e resultado coerente nas duas ordens de inativação
e revogação simuladas. O roteiro está em `supabase/tests/fundacao_d04_concorrencia.md`;
não prova RPCs reais de revogação. Revisão independente mantém o rascunho
bloqueado: faltam transição segura das sessões existentes, comprovação de commit
antes de chamar Auth e definição de owner/runtime restritos; funções SECURITY
INVOKER não devem receber acesso direto a tabelas que permita contornar fencing.
Também faltam revogação durável e provas de que reativar usuário ou concessão
não ressuscita sessão anterior; a constraint do envelope não comprova cifra
autêntica. Esses controles continuam obrigatórios antes de integrar.

Atualização: rascunho adiciona guardas de admissão, transição de concessão e
imutabilidade de sessão revogada. Testes PostgreSQL isolados com duas conexões
exercitaram admissão versus revogação simulada; continuam faltando RPC de
negócio autorizada e auditada, owner real, limites de operações em lote e provas
dos caminhos privilegiados. Experimento separado com role NOLOGIN e RLS forçada
negou acesso direto do runtime a tabela fictícia; não comprova privilégios das
funções reais. Nenhuma migração foi promovida ou aplicada remotamente.

Adapter Google usa fonte JWKS fixa e valida audiência, `azp` e emissão futura;
os testes usam respostas fictícias. A revisão identificou que o cache anterior
não seguia `Cache-Control` do provedor e podia reter uma chave retirada. Google real, troca
Supabase e autorização continuam não comprovados.

Foi preparado um adapter de autenticação técnica server-only com respostas
HTTP e credenciais fictícias. Testes e revisão identificaram mutação da
configuração de verificação e cancelamento bloqueante; as correções receberam
testes locais. Ele não admite sessão, não concede perfil e não demonstra login
no Supabase real ou o acesso da identidade excepcional.

Na análise do logout externo, o código público do Supabase Auth em seu ramo
principal prevê logout global quando não encontra a sessão, inclusive quando o
escopo solicitado é local. A versão e o comportamento do projeto real não foram
verificados. Não conectar ou chamar esse logout como se o escopo local estivesse
garantido; provar o comportamento do alvo e preservar outras sessões antes de
integrar. Fonte: <https://github.com/supabase/auth/blob/master/internal/api/logout.go>.

Admissão técnica: o contrato interno passou a exigir envelope cifrado de
refresh. O rascunho `supabase/drafts/20261030120000_admissao_tecnica.sql`
grava sessão, credencial e auditoria na mesma transação. Testes PostgreSQL
isolados cobrem entrada permitida, identidade sem exceção, usuário inativo,
concessão revogada, tombstone, replay e rollback em falha de auditoria. A
revisão independente não libera integração: falta runtime de privilégio mínimo,
vínculo da identidade comprovada, testes de concorrência e prova no Supabase.
Negativas auditadas só persistem com commit; entrada sem request_id válido não
tem correlação auditável. O fluxo Google precisa ainda vincular o consumo do
desafio à tentativa para impedir replay entre troca Auth e admissão.

Teste adicional `fundacao_d04_admissao_concorrente.sql` passou em PostgreSQL
isolado com duas conexões: inativação/revogação simuladas antes da admissão,
admissão antes da inativação e replay simultâneo. Após revisão, o teste verifica
os PIDs bloqueado e bloqueador e recusa execução fora de banco/socket locais
específicos antes de criar dados. A revogação simulada não é a RPC real nem
comprova sua auditoria, privilégios do runtime ou Auth/Vault. O teste confirma
transações internas e cria fixtures comprometidas no banco descartável: nunca
executá-lo em Supabase remoto ou instância compartilhada.

Desafio Google: o rascunho `supabase/drafts/20261031120000_desafio_google.sql`
e os testes D-03 foram exercitados em PostgreSQL 17 temporário e isolado, sem
Docker. Os testes cobrem consumo único concorrente e expiração durante espera
por lock, verificada pelo relógio do banco. Também verificam revogação explícita
de execução para PUBLIC, anon e authenticated em papéis simulados. Uma segunda
revisão estática confirmou que o teste exige bloqueio antes do prazo e liberação
após expiração; isso pressupõe que o relógio do banco não recue durante o teste.
A revisão
independente não libera integração: SECURITY INVOKER exige acesso direto à
tabela, e faltam runtime restrito, commit confirmado antes da troca Auth e
vínculo do desafio à admissão. Os testes como owner não demonstram privilégios
efetivos no Supabase. O rascunho não é migração e não deve ser aplicado.

Atualização: o adapter passou a limitar a reutilização pelas diretivas de cache,
idade e relógio monotônico. Revisão independente encontrou problemas no recuo do
relógio, cancelamento de respostas e cache de JWKS inválido; os três foram
corrigidos e a reavaliação não encontrou novo bloqueador nesse escopo. Testes
usam fetch fictício; respostas sem prazo válido falham fechadas e podem afetar
disponibilidade. Prova Google real, integração e S-02 continuam pendentes.

O cliente passou a tentar renovar uma vez somente em leituras com 401, sem
repetir mutações; testes simulados cobrem deduplicação e respostas atrasadas.
Falha incerta encerra a sessão local do cliente e exige novo login. A rota real,
concorrência entre instâncias e revogação no banco continuam sem integração.

## Ameaças e decisões para S-02

Consulta operacional somente leitura ao projeto informado: a credencial
disponível neste notebook retornou HTTP 401 à API de gerenciamento. Nenhum
estado do projeto foi inferido, nem houve alteração remota. Uma nova sessão CLI
será necessária para futuras consultas; autenticação não autoriza migração,
bootstrap, alteração de segredos ou deploy. O token exposto em conversa deve
ser revogado pelo titular, se ainda estiver ativo.

Executor PostgreSQL do cofre preparado sem conexão ao produto: faz consulta
parametrizada dentro de transação, assume `ffcmapp_vault_executor` localmente e
descarta conexão em erro. PostgreSQL descartável comprovou leitura fictícia,
negação direta antes/depois da transação e recusa de tabela interna. Não havia
Vault real nesse teste. Revisão apontou que o pool ainda precisa de identidade
de login dedicada com privilégio mínimo, TLS verificado e controle de
logs; `SET ROLE` não limita poderes originais do login fora da transação. A role
de login e seu vínculo não existem nas migrações reais, e o executor pode ler
qualquer referência permitida pelo prefixo. Não conectar sem S-02 e provas
efetivas em Supabase; 2.4.2 continua pendente.
O executor passou a recusar pool sem `connectionTimeoutMillis` inteiro positivo;
isso não prova funcionamento do timeout sob falha de rede, nem autenticação do
servidor ou privilégio do usuário da conexão.
Um construtor de pool dedicado configura CA, verificação do certificado e
hostname pelo TLS, limite de uma conexão e timeout; não aceita URL que possa
substituir SSL. Teste posterior com dois PostgreSQL locais descartáveis e
certificados fictícios confirmou conexão TLS válida e recusas específicas por CA
incorreta e nome divergente usando Node/pg e Deno 2.9.5 local com o mesmo
driver. O teste não comprova o certificado ou o runtime Edge do Supabase. Bloquear
alguns nomes privilegiados não comprova privilégio mínimo; outro login pode ter
poderes equivalentes. Tampouco se comprovou que a CA fornecida seja a correta,
a compatibilidade do pooler ou o limite global entre instâncias. Não registrar
configuração, senha, objeto pool ou erros brutos. Essa peça não está conectada.
Prova local adicional combina TLS Deno, executor PostgreSQL, papel fictício,
leitura de chaves fictícias e cifra/decifra; acesso direto e referência ausente
são negados. A função de chave é uma fixture no PostgreSQL, não o Vault ou a
cadeia de papéis do Supabase. O cluster de teste usa `trust` somente no socket
privado de administração e exige SCRAM para TCP; Node e Deno aceitaram a senha
fictícia correta e rejeitaram a incorreta. Isso não comprova credencial, login
restrito real ou configuração do pooler Supabase.

O núcleo de cifra impede novas gravações se a chave AES ativa repetir material
de outra versão, sem impedir a leitura de aliases históricos. Uma chave ativa
distinta permite novas gravações e preserva a leitura anterior. Antes de ativar
em ambiente persistente é obrigatório conferir os IDs históricos e planejar
transição preservando os envelopes. O teste puro não comprova rotação no Vault
nem persistência real.
Uma prova parcial posterior persistiu nome e contato cifrados fictícios no
schema da migração em PostgreSQL descartável, rotacionou o nome e reverteu
uma escrita parcial manualmente após falha de chave. Não comprova rollback
automático em operação real. Usou acesso privilegiado e chaves
fictícias; não demonstra Vault, RPC, auditoria de rotação ou Supabase remoto.

Compatibilidade Deno: os imports relativos dos contratos compartilhados foram
ajustados para apontar para os arquivos TypeScript reais. O comando
`pnpm run typecheck:deno` verifica entradas selecionadas e suas dependências;
o módulo de renovação também foi importado em Deno local. Uma segunda execução
sem resolução por `node_modules` revelou dependência `zod` não resolvida; um
mapa de imports Deno com versões fixas e lock próprio corrigiu essa execução
local. A configuração local confere a igualdade das versões com os manifests
pnpm. A verificação integra o gate da fundação e exige Deno instalado. Isso não
demonstra o bundle, a adoção do mapa por uma função implantável, o runtime
remoto ou a publicação de Edge Functions. A revisão também
apontou que Vite exige Node 22.12 ou superior; a faixa declarada foi ajustada.
O executor e o handler experimentais de cadastro também apresentavam imports
incompatíveis com Deno; os caminhos e o mapa do pacote interno foram ajustados.
O gate verifica essas entradas e o Deno local as importa sem `node_modules`.
Isso não transforma os módulos experimentais em rotas ou operações autorizadas.

Atestado de operação: o desenho foi atualizado para JSON canônico RFC 8785.
Um experimento TypeScript usa dados e chave fictícios; não foi conectado a
nenhuma operação. Após revisão independente, passou a retornar instantâneos
canônicos antes da primeira espera assíncrona, com limites defensivos e testes
parciais de Unicode e números. Os limites internos não substituem limitação de
bytes na entrada HTTP nem garantem proteção contra objetos executáveis. O
contrato interno descreve os instantâneos, mas a entrada RPC ainda não os
transporta nem assegura que a operação execute exatamente a entrada assinada.

O rascunho SQL `supabase/drafts/20261101100000_atestado_jcs_experimento.sql`
passou em PostgreSQL 17 isolado com teste positivo e alterações fictícias.
Não é RPC de produção: aceita chave do chamador apenas para o experimento,
condição que permitiria forjar assinaturas se exposta. Não comprova privilégios,
validade temporal, JWT, autoridade ou canonicalização JCS completa. O núcleo e
o rascunho não demonstram integração com Vault ou Supabase e não estão aprovados
para uso; exigem contrato integrado, verificações no banco e nova revisão S-02.

Um segundo experimento local separa a chave do chamador usando função interna e
papéis fictícios. A revisão confirmou o escopo limitado: não prova o Vault nem
privilégios efetivos no Supabase; faltam verificação de JWT, sessão, prazo,
autorização, limites e tratamento de indisponibilidade. A execução como
SECURITY DEFINER e a cadeia de owners/grants exigem revisão e provas específicas
antes de qualquer integração.

O preparo experimental de cadastro valida o DTO, cifra dados fictícios, calcula
digest lógico por uma dependência própria e reconstrói a entrada a partir dos
instantâneos assinados. Testes locais verificam repetição e mutação; não provam
que as chaves reais sejam distintas, nem que a RPC confira a entrada, a sessão,
autoridade ou Vault. Um terceiro rascunho SQL exercita prazos e contexto com
identidade simulada, inclusive expiração durante espera; isso não comprova JWT
real, replay ou atomicidade da operação protegida.

O contrato experimental de criação de paciente passou a incluir metadados AAD
por campo no conteúdo assinado. A checagem estrutural desses metadados não
autentica a tag AES-GCM. Há também rascunho de transação de cadastro em banco
isolado; a revisão identificou pendências em concorrência com revogação/perfil,
estados pendentes de idempotência, auditoria de negativas e privilégios reais.
O teste do rascunho não seguiu TDD completo, e os resultados com fixtures não
comprovam RPC, autorização, Vault ou Supabase reais. Não integrar o rascunho.

Atualização do rascunho: testes locais passaram para finalização do ledger,
inserções de paciente e auditoria suprimidas, e ordens concorrentes de criação
contra revogação ou rebaixamento simulados. A criação adquiriu locks de
concessão, usuário e sessão nessa ordem e revalidou o atestado após espera.
Os testes usam operações e papéis fictícios, não as RPCs reais de alteração de
autoridade, JWT ou Vault; não resolvem as provas e revisões de S-02.
O experimento também passou a auditar certas negativas após conferir a prova e
o ator simulados, e a sanitizar UUID inválido. Ainda faltam distinguir falha
operacional de chave de prova inválida e tratar repetição da auditoria; os GUCs
das fixtures não comprovam identidade real nem atribuição auditável no Supabase.

Foi preparado apenas um schema interno de estados de reconciliação de cadastro.
Foi acrescentada consulta SQL experimental por ator e ordenação por criação/ID,
com auditoria sob identidades simuladas. Ela não comprova consulta autorizada no
Supabase; uma transação iniciada antes do cursor pode confirmar depois da página
e ficar ausente; a emissão de cursor opaco no fluxo real ainda não foi comprovada. Não existe ainda consulta
conectada após reinício; portanto o risco de criar
duplicata depois de resultado incerto continua aberto. O identificador de
resultado pode ser vinculável a uma pessoa e requer proteção e logs mínimos.
A interface alerta sobre navegação ou saída com cadastro incerto sem persistir
dados do paciente; navegadores podem ignorar o alerta e ele não substitui a
consulta após recarga, falha do dispositivo ou nova entrada.
O handler HTTP experimental e o SQL de teste passaram a receber o mesmo
`request_id` para resposta e auditoria. A ligação HTTP→SQL real, autoridade
transacional, emissão de cursor opaco e proteção de logs ainda não foram
comprovadas; os testes usam adapters e identidades fictícios.
Foi preparado um módulo isolado que cifra um cursor UUID com AES-GCM e o
vincula a usuário e sessão; testes locais recusam alteração, outra identidade e
outra chave. O handler experimental usa esse módulo em testes com adapter
fictício; não está ligado à consulta real nem ao Vault. A chave deve
ser exclusiva e sua provisão, rotação, disponibilidade, ausência em logs e
validade de cursores antigos precisam de desenho e revisão; o módulo não define
expiração nem prova paginação completa ou ausência de transações em trânsito.
O contrato HTTP planejado e o adapter experimental normalizam UUIDs validados
para manter a correlação com PostgreSQL. A correspondência com auditoria na
RPC efetiva ainda exige teste integrado; nenhuma rota foi publicada.
Uma correção local agenda revalidação quando o retorno à aba ocorre durante
cadastro ou outra revalidação. Se o cadastro permanece incerto ao perder a
sessão, a tela exibe aviso sem dados do paciente. Isso não impede nova tentativa
após recarga e não substitui reconciliação autorizada. Enquanto a página segue
aberta, a conta que perdeu um pedido incerto fica impedida de iniciar outro,
inclusive após troca temporária de conta; o marcador não contém dados do
paciente e existe apenas em memória. Não há desbloqueio automático ou prova
após reinício. A tela
agora oculta a carteira durante espera e revalidação, com aviso de verificação;
o teste exercita retorno durante cadastro, confirmação de acesso e revogação.
O risco de duplicidade após reinício permanece aberto até solução integrada.

Na renovação, revisão identificou que confirmação de commit perdida pode deixar
credencial disponível mesmo sem confirmação ao chamador; a invalidação do
rascunho não corrige essa janela se o banco estiver indisponível. Não integrar
esse protocolo antes de uma solução revisada com persistência de estado,
concorrência e resultado incerto comprovados.
Foi aprovada a consulta ao banco autoritativo para confirmar uma tentativa
incerta. Novo experimento de tentativa/geração passou em testes locais de
persistência e revogação, mas ainda libera a credencial se a resposta da própria
liberação se perder; outra instância pode iniciar renovação. Ele não satisfaz a
condição aprovada de bloqueio global quando a confirmação for impossível e não
deve ser integrado.
Foi aprovada prova aleatória por geração mantida apenas na memória da aba; uma
renovação em outra aba ou recarga pode exigir novo login. Experimentos locais
vinculam geração, verificador, envelope e tentativa e testam revogação; não
comprovam Vault, JWT ou autorização real. A prova enviada como argumento SQL
pode aparecer em logs e o hash funciona como credencial no seam experimental;
ambos devem ficar protegidos. Nenhuma RPC real exige a prova ainda. A solução
precisa impedir bypass direto e demonstrar confirmação e concorrência antes de
integrar ou afirmar que a sessão está segura.
Na admissão experimental, o verificador inicial é associado ao par
usuário/sessão, geração inicial e credencial cifrada na mesma transação;
testes locais separam tombstone e concessão revogada e verificam rollback se
auditoria ou prova falharem. TypeScript e SQL passaram a calcular o digest
sobre os 32 bytes da prova; a conversão e o canal reais ainda não foram
integrados, e o verificador não pode ser tratado como dado público ou logado.

Um helper SQL experimental valida ator derivado do JWT, sessão, concessão,
geração e prova; testes PostgreSQL isolados cobrem identidade diferente,
prova incorreta e revogação. Ainda não é usado pelas operações protegidas:
os drafts anteriores continuam insuficientes e não podem ser promovidos como
integração segura. A prova em memória e os cabeçalhos do cliente também não
substituem a validação transacional no banco. O canal efetivo precisa impedir
exposição da prova e do seu hash em logs de SQL, erros, intermediários e
telemetria; configuração e evidência nos serviços reais ainda estão pendentes.
Revisões da fatia também identificaram uma corrida: a renovação pode confirmar
uma nova prova enquanto a saída envia a anterior; a sessão no servidor pode
continuar ativa se a saída for negada. O cliente descarta a resposta atrasada,
mas isso não comprova revogação no servidor. É necessário um protocolo de saída
concorrente e testes integrados antes de aceitar a S-02.
O cliente agora impede novas ações ao iniciar a saída e espera uma renovação
da própria aba em andamento antes de usar a prova atualizada. Se a renovação
falha, não afirma revogação e não envia a prova antiga; testes usam transporte
fictício. Isso não resolve renovação de outra instância, perda de resposta ou
indisponibilidade do banco: a revogação efetiva continua sem comprovação.
Uma ponte HTTP de saída foi preparada sem rota publicada: verifica o transporte
de sessão antes de chamar o executor e só emite limpeza dos cookies após
resultado local válido. Testes usam executor fictício; a ponte não implementa
nem comprova a revogação, sua atomicidade, o signout externo ou sua segurança
em concorrência. Não conectá-la até aprovação da S-02 e execução integrada.
Um rascunho SQL de revogação foi testado com a tabela real de sessão e
auditoria da migração base, prova e identidade fictícias, e papel de teste
limitado à função. A escrita da revogação e da auditoria ocorre na mesma
transação; o teste cobre prova/geração/usuário incorretos, repetição e falha
da auditoria. A tabela de prova, o gateway e os papéis são fixtures: o draft
não prova integração com renovação, RLS, Vault, Supabase Auth, nem segurança
do canal de verificador. A prova anterior continua incapaz de confirmar saída
após outra geração; a corrida e o signout externo seguem abertos.
Revisão encontrou que o owner de teste não atravessa o RLS real: ao habilitar
RLS sem política para esse papel, a chamada falha fechada. A fixture teve seus
grants de atualização reduzidos por coluna e passou a verificar explicitamente
rollback antes da repetição. É preciso projetar e testar políticas e privilégios
com a sequência completa das migrações; não conceder bypass para contornar a
falha. Negativas esperadas também precisam de política de auditoria que não
atribua a um ator uma identidade não comprovada.
Na sequência, um experimento aplicou também a migração de grants/RLS da
fundação e acrescentou políticas para owner fictício NOLOGIN, não herdado pelo
runtime de teste. Revogação válida funcionou, prova incorreta e acesso direto
foram negados, com grants de leitura e escrita restritos por coluna. As
políticas do owner cobrem todas as linhas dessas tabelas: sua segurança depende
da função SECURITY DEFINER e da inexistência de login, herança ou outros meios
de assumir esse papel. É uma alternativa a revisar, não uma política pronta
para produção; ainda faltam testes da cadeia real de papéis, auditoria de
negativas, concorrência e proteção do verificador no canal e nos logs.
O experimento passou a bloquear escrita em usuário, concessão e prova por
políticas restritivas, inclusive na presença de outras políticas permissivas;
mantém locks e repetição da saída. O rascunho D-04 de tombstone também foi
aplicado ao teste e recusou reabertura ou alteração posterior da revogação.
Essas políticas não impedem o owner de revogar diretamente uma sessão ativa
sem auditoria se ele puder ser assumido ou alcançar outras funções; a cadeia
de papéis, execução e catálogo reais seguem como condição de S-02.
No PostgreSQL descartável, duas conexões comprovaram espera por lock nas duas
ordens entre o rascunho de saída e o rascunho anterior de início/finalização de
renovação: após revogação, a finalização ou início foram negados. Outra prova
simulou a troca da geração diretamente na tabela fictícia e confirmou recusa
da prova antiga após a espera. Isso não integra a renovação com a tabela de
prova, não corrige a perda de confirmação do rascunho anterior e não comprova
concorrência Auth/HTTP/Vault ou revogação no Supabase.
A conexão da saída usou o papel restrito fictício, enquanto a conexão de
renovação usou o proprietário da instância descartável; portanto a prova não
valida os privilégios do executor real de renovação. Foram adicionados limites
de tempo às consultas e processos do teste para evitar espera indefinida.
Novo rascunho liga credencial, tentativa, geração e verificador em tabelas do
teste com schema da fundação; início, persistência, liberação e confirmação
usam locks ordenados. Teste com duas conexões observa a confirmação esperar a
liberação e distingue commit de rollback. Após revisão, confirmação na mesma
transação da liberação é negada mediante identificação da transação. Isso é
apenas evidência local: é necessário revisar semântica de transação/pool e
testar PostgreSQL real, privilégios, logs e falhas de rede.
As rotinas antigas não exigem prova, e o helper de autorização ainda usa outra
tabela sem conferir estado da credencial. Não conceder esses caminhos nem
integrar enquanto não existir um único estado autoritativo e testes diretos.
A recuperação de confirmação perdida da persistência foi preparada no módulo
TypeScript e no SQL experimental: exige consulta ao primário e confirmação da
mesma tentativa, prova e envelope em transação distinta, inclusive quando a
persistência retorna sucesso. Caso a confirmação
seja negativa ou indisponível, falha fechado. O bloqueio inicial também exige
confirmação independente antes da chamada Auth. Testes locais observam espera
e rollback nas duas etapas; nenhum adapter de banco real está conectado, e o
contrato de conexão/transação e as falhas de rede reais continuam pendentes.
Um adapter experimental posterior usa `pg` e transações independentes contra
uma fixture PostgreSQL descartável, com papel de teste sem acesso direto às
tabelas. Testes adicionais exercitam concorrência de duas tentativas e o
orquestrador com cifra fictícia, Auth simulado e resposta perdida após commit
da persistência; confirmam uma única chamada Auth e rejeição da prova anterior.
Também exercitam saída confirmada durante Auth simulado: a renovação falha e
a prova antiga não volta a funcionar. A composição de políticas permissivas é
testada com barreiras restritivas para as tabelas de autoridade na fixture.
Não comprovam Supabase, Auth real, Vault, TLS ou operação protegida.
A revisão identificou que o limite de espera do pool pertence à configuração
do chamador (definido apenas na fixture), e que parâmetros SQL sensíveis não
podem aparecer em logs. Antes do
uso real faltam validar esses controles e testar falhas de rede reais,
concorrência e revogação integradas ao runtime. As permissões da fixture não são proposta
de privilégios de produção; S-02 continua pendente.
Um novo helper isolado usa a mesma prova e credencial da renovação e rejeita
prova antiga, credencial em troca, outra identidade e sessão revogada; não lê
o envelope cifrado. Testes usam claims simulados. A revisão identificou que
claims em variáveis SQL podem ser forjados por uma conexão direta e que
consultar um booleano em transação separada cria corrida. O helper não recebe
grant de execução pelo runtime de teste: uma futura operação protegida deve
verificar JWT pelo gateway confiável e chamar o helper dentro da mesma
transação dos locks e do efeito. Não há operação de paciente ligada a ele.

Revisão adicional do cadastro experimental identificou que a função devolvia
apenas ID e versão, mas o executor exige o DTO administrativo completo. Uma conexão
direta poderia confirmar a gravação e depois rejeitar a resposta. A repetição
também devolvia a versão registrada no ledger, não necessariamente a projeção
atual exigida por D-09. Além disso, a criação ainda não verifica a prova da
geração vigente na mesma transação do efeito. Antes de integrar, alinhar o
contrato e a projeção após reautorização; provar ausência, obsolescência,
renovação concorrente e revogação da prova, sem confiar em claims SQL forjáveis.
Os rascunhos continuam sem autorização para execução pelo runtime real.

O rascunho foi ajustado para projetar os envelopes administrativos vigentes,
inclusive contatos, na primeira resposta e na repetição. A repetição registra
evento próprio de leitura antes de devolver dados e falha fechada se a
auditoria não for inserida. Fixtures SQL locais verificaram projeção após
alteração, ausência de duplicação e falhas de auditoria. A revisão independente
dos dois eixos não identificou nova falha específica no ajuste de auditoria.
Um teste separado executado em PostgreSQL descartável validou as respostas da
criação e da repetição pelo contrato TypeScript, após alteração do cadastro.
Esse teste é pulado na suíte padrão sem configuração explícita do cluster;
sua execução específica passou, com assinatura e envelopes fictícios. Faltam
prova da cifra real, concorrência da repetição com edição/revogação, limite de
contatos e privilégios efetivos.

Um experimento posterior compõe o helper de prova vigente e a chamada de
cadastro na mesma transação, sem grants públicos. A fixture isolada cobre prova
vigente, prova ou geração incorreta, credencial em troca, prova antiga após
rotação, outra identidade e sessão revogada. Como substitui cadastro e auditoria
por doubles, não comprova a operação completa, concorrência entre conexões,
contrato de saída ou auditoria. O parâmetro de prova no canal SQL continua
sensível a logs; JWT confiável, isolamento de privilégios e Vault reais também
precisam de prova. O experimento não está integrado nem aplicado remotamente.

Uma fixture adicional compôs os rascunhos de autorização, criação e auditoria
sem substituir as duas últimas funções. Ela verificou prova inválida, criação
com prova vigente, renovação em curso, prova anterior e rollback por falha de
auditoria; foi reexecutada após a alteração da projeção. Executa como usuário
privilegiado com claims e chave fictícios, em uma conexão; não comprova gateway,
privilégios de runtime, concorrência ou operação remota.

Um rascunho posterior compõe reconciliação com verificação da prova de sessão
na mesma transação, sem grants públicos. Testes em banco descartável negaram
prova ausente, incorreta ou antiga e sessão revogada. Após revisão, negativas
da fixture não são atribuídas a claims de usuário não comprovados. Persistem
pendências de gateway e executor confiáveis, limite de volume da auditoria,
falha de auditoria, concorrência e cursor consistente; a consulta não foi
integrada nem aplicada remotamente.

Em outro teste local com duas conexões, início da renovação e cadastro foram
executados nas duas ordens. Após correção de um possível falso positivo, a
prova observou espera em lock e identificou a conexão bloqueadora antes do
commit; o cadastro foi negado quando a renovação venceu e a renovação aguardou
quando o cadastro venceu. O teste usa dados fictícios e cluster temporário com
commits; não comprova gateway, Vault ou privilégios reais. O mesmo teste passou
nas duas ordens entre cadastro e revogação local: verificou o bloqueador, a
ausência de paciente e ledger quando a revogação venceu, e o ledger concluído,
auditorias e tombstone quando o cadastro venceu. São fixtures SQL com identidade
fictícia e conexões privilegiadas; não demonstram logout HTTP ou Auth externo.
Os quatro cenários podem ser reproduzidos por
`rtk proxy sh scripts/testar-cadastro-concorrencia-local.sh`: o comando cria
cluster exclusivo sem TCP, limita esperas SQL e preserva o diretório temporário.
Em execução local posterior, os quatro cenários passaram e o servidor foi
parado. Os limites SQL não são prazo de processo para travamentos do sistema.

O adapter isolado de troca Google valida token, nonce e identidade retornada
com respostas fictícias; testes de incompatibilidade e prazo passaram. Ainda
não consome desafio nem comprova pré-concessão, e uma troca pode criar ou
vincular conta Auth antes da autorização local. A interrupção da requisição não
comprova que o provedor deixou de criar conta ou sessão. Não conectar a rota
antes de resolver esses efeitos e verificar o formato e a configuração reais.

Bootstrap técnico: o schema atual exige subject Google em toda concessão
vinculada, incompatível com a exceção técnica por senha sem prova Google. Um
rascunho aditivo e testes isolados exploram método técnico restrito sem inventar
subject; não foram promovidos a migração. Revisão identificou que UUID da conta
existente, e-mail aprovado e projeto real ainda precisam de vínculo independente,
além de isolamento efetivo do operador e retry compatível com cifra aleatória.
Somente testes em banco fictício foram autorizados; não houve bootstrap remoto.

O leitor HTTP isolado de entrada técnica valida origem, CSRF do desafio, DTO e
limites de leitura, com erros sanitizados. Testes de proxy incluem corpo que
não termina, senha válida com escapes e falha operacional. Não existe rota
ativa conectada por esse leitor; o handler futuro deverá usar seu mapeamento
de erros e impor limites de corpo também na borda antes da alocação de chunks.
O codec existente não distingue toda falha interna de cifra de cookie inválido.
Isso não comprova concessão, allowlist, Auth real ou admissão de sessão.

A composição HTTP experimental de entrada técnica chama admissão antes de
consultar a sessão e construir a resposta. Revisão identificou que falha após
admissão, ou perda da resposta após seu envio, pode deixar sessão ativa sem a
prova/cookie entregues. Antes de integrar, definir e provar tratamento de
sessão órfã, incluindo resultado incerto; uma compensação após erro local não
prova que a resposta chegou ao navegador. A composição permanece não exposta.
Nos testes fictícios, credenciais recusadas e concessão negada retornam a mesma
resposta 401; falhas operacionais retornam 503 sanitizado. Cookies de sucesso
são conferidos quanto a atributos e vínculo com a sessão. Os códigos efetivos
de erro do Supabase ainda precisam ser verificados para evitar enumeração por
diferença de resposta; essa evidência não resolve a sessão órfã.

Análise complementar distingue controle de acesso e limpeza operacional. A
perda da resposta, por si só, não prova que um atacante recebeu o JWT; o risco
depende da posse desse JWT e de um caminho acessível que dispense a prova. A
prova em memória só fecha a falha se todas as operações, inclusive renovação,
reconciliação e leitura, exigirem sua geração vigente na mesma transação da
autorização e do efeito. O helper `identidade.sessao_atual_valida` e rascunhos
que o utilizam ainda não exigem essa prova; não há bypass público comprovado,
e os rascunhos não estão autorizados para runtime. A limpeza das sessões não
entregues é questão separada: não declarar revogação ou inventar expiração;
exige procedimento seletivo, auditado e política operacional aprovada.
Em banco descartável com migrações locais, `authenticated` não tinha USAGE
nos schemas internos nem EXECUTE nos dois helpers examinados; chamada direta
foi negada. Como owner, ambos os helpers aceitaram sessão fictícia ativa sem
prova, confirmando risco de composição se algum caminho for exposto no futuro.
Esse teste não inspecionou todos os grants ou objetos do ambiente remoto e não
prova ausência global de bypass.

Nova conferência somente leitura no projeto de teste: as 13 tabelas da
fundação examinadas têm RLS; as 12 tabelas dos quatro schemas internos não
concedem SELECT efetivo a `anon` ou `authenticated`, e as cinco funções desses
schemas não concedem EXECUTE efetivo a esses papéis. No catálogo consultado não
havia views, materialized views ou sequências nesses quatro schemas. O padrão
global efetivo de funções criadas por `postgres` inclui EXECUTE para `PUBLIC`;
isso não prova exposição das funções atuais nem acesso ao schema, mas exige
controle para objetos futuros. `ffcmapp_vault_owner` tem padrão global de
funções restrito ao próprio owner. A leitura não verificou todas as políticas,
heranças, schemas expostos ou comportamento de criação futura. Nenhum grant
ou default privilege foi alterado; 2.2 continua pendente.

Em PostgreSQL descartável, um owner dedicado sem login foi testado com padrão
global de funções restrito: funções fictícias em dois schemas negaram EXECUTE
a `anon` e `authenticated`, sem alterar ACL anterior ou default do executor.
A transação foi revertida. O experimento não demonstra que o operador do
Supabase possa criar ou assumir esse owner, transferir funções existentes nem
impedir criação por outros owners; SECURITY DEFINER e memberships reais ainda
exigem revisão e testes. Nenhuma mudança de privilégios foi aplicada remotamente.

Outra fixture descartável separou proprietário da função e da tabela, aplicou
FORCE RLS e testou uma função SECURITY DEFINER com search_path fixo. O executor
fictício recebeu somente a linha permitida; SELECT direto em ambas as colunas
e execução por `anon`/`authenticated` foram negados. Não usa ator ou JWT real,
nem demonstra escrita, auditoria, memberships de runtime ou políticas reais;
não conclui 2.2. Objetos e papéis da fixture foram revertidos.

Conferência posterior somente leitura no catálogo remoto: `postgres` possui
CREATEROLE, BYPASSRLS e CREATE nos quatro schemas internos; os papéis de owner
e executor do Vault não possuem CREATE neles. Os vínculos diretos registrados
de `postgres` para esses dois papéis têm ADMIN, mas não SET nem INHERIT; o login
do Vault pode assumir somente o executor entre esses vínculos. Esses atributos
não comprovam que uma migração futura consiga assumir um novo owner nem que
esse modelo esteja aprovado: caminhos indiretos e privilégios necessários
devem ser verificados. `postgres` não é identidade segura para runtime.

Os ativos são chaves, dados identificáveis, sessões, concessões e trilha de
auditoria. As fronteiras relevantes são navegador → proxy → banco e runtime
confiável → função interna → Vault. Revisar acesso direto ou indevido ao Vault,
uso de credencial privilegiada para contornar autorização, leitura de outro
paciente, persistência sem cifra, revogação ignorada e alteração sem auditoria.
Um operador com poderes equivalentes ao proprietário do banco permanece fora
da proteção prometida pelo Vault.

**Decisão necessária:** revisar os achados e o desenho do executor interno com
identidade restrita; exigir provas positivas e negativas e definir quais
correções são necessárias antes de autorizar a integração protegida. A aprovação
de S-02 não autoriza deploy, bootstrap ou uso de dados reais.

No experimento de cadastro, conflito de idempotência agora registra negativa
antes de responder; falha na auditoria impede a resposta normal. Testes em
PostgreSQL descartável, sem Docker, cobriram conflito sequencial e concorrente,
falha de auditoria e correlação de ator e requisição. A concorrência usa
fixtures e locks de identidade compartilhados: não comprova JWT, Vault ou
integração Supabase reais. O rascunho não foi publicado nem a tarefa concluída.

A projeção experimental de cadastro decifra envelopes fictícios com AAD de
paciente ou contato e valida o DTO completo antes de devolvê-lo. Testes com
cifra real cobrem opcionais e rejeição por identidade incorreta. A projeção não
autoriza a leitura, não prova o vínculo entre contato e paciente e não está
conectada a rota; a RPC e o banco devem garantir essas condições. A decifração
de contatos é sequencial; limites de volume continuam pendentes para integração.
Uma projeção básica separada rejeita campos administrativos adicionais e
envelopes de outro paciente; permanece sujeita às mesmas pré-condições de
autorização, auditoria e revisão antes de conectar à aplicação.

Nova consulta somente leitura à API de gerenciamento retornou HTTP 401 usando
a credencial já presente no ambiente local. O acesso ao projeto não pôde ser
confirmado; nenhuma alteração remota ocorreu nessa consulta.

Nova consulta somente leitura com credencial autorizada teve sucesso. O login
do Vault pode assumir apenas ele próprio e o executor, não o owner; login e
executor não leem diretamente `vault.decrypted_secrets`, nem podem criar no
schema `identidade`. O executor executa o leitor restrito; `anon` e
`authenticated` não. Login, executor e owner não têm SUPERUSER, CREATEROLE,
CREATEDB ou BYPASSRLS; somente o login possui LOGIN. A consulta de catálogo
não comprova a conexão real do backend, TLS, proteção de logs ou leitura de
segredo pelo runtime; S-02 e 2.4.2 permanecem pendentes.

Nova execução de `node --test scripts/test-tls-cofre.mjs` passou: a prova usa
PostgreSQL descartável, certificados fictícios e os adapters locais em Node e
Deno. Também passou `pnpm run typecheck:deno`, agora incluindo o adapter Google
e a projeção de paciente. Isso não demonstra execução em Edge nem configurações
ou certificados do projeto remoto.

Foi preparada composição server-only experimental de pool, executor, leitura de
material e cifra; o pool é encerrado em sucesso e falha. A prova Deno com TLS
fictício passou para cifra/decifra, CA incorreta, referência ausente e chave
ativa não configurada. A revisão observou que o encerramento do pool não tem
prazo próprio: avaliar falhas reais de rede antes da integração. A função não
está conectada a endpoint, não lê configuração Edge e não comprova o Vault
remoto, nem a entrega ou isolamento dos segredos. S-02 e 2.4.2 seguem abertos.

Diagnóstico adicional: `connectionTimeoutMillis` limita aquisição/conexão, e
`statement_timeout` depende de o servidor receber e responder à consulta; uma
rede que deixa de responder pode manter a operação aberta. O driver `pg`
oferece `query_timeout`, mas não encerra sozinho a conexão ao expirar. O
executor já descarta o cliente nas falhas tratadas; falta combinar prazo do
driver e descarte e provar, com conexão real e interrupção controlada de
tráfego, retorno sanitizado, encerramento do socket e liberação do pool. Uma
simulação de consulta que nunca responde reproduziu a espera, mas não prova
isoladamente o comportamento do driver ou da rede real. Não há correção
implantada e a limitação continua bloqueando integração protegida.

No rascunho de cadastro, entradas com AAD ou envelope inválidos após prova e
autoridade verificadas agora registram negativa antes da resposta. Teste local
em PostgreSQL descartável cobriu os quatro ramos, repetição idempotente,
falha de auditoria e ausência de paciente ou ledger parcial. A identidade e
o atestado são fixtures; entradas sem identidade confiável não são atribuídas
a um ator e exigem observabilidade sanitizada antes da integração real.
O teste de contrato de criação e repetição, normalmente ignorado sem fixture,
foi executado com PostgreSQL descartável e passou. Confere a resposta da RPC
experimental contra o contrato tipado; não comprova JWT, Vault ou Supabase reais.
O mesmo teste passou usando cifra autenticada real e pacientes fictícios:
conferiu o envelope no banco, decifrou a resposta e observou a versão atual no
retry. A alteração de versão foi feita por usuário privilegiado da fixture;
não comprova ACL, auditoria nem criptografia integrada ao Vault remoto.
Também foi preparado, sem ligação à RPC, o envelope cifrado para novo e-mail
ou telefone fictício. O AAD vincula campo e identificador do contato; vínculo
ao paciente e autorização dependem do banco. Cada preparação gera novo ID, por
isso a integração precisa preservar a idempotência do pedido e reconciliar
repetições antes de uso; testes puros não comprovam persistência ou Vault.
O comando experimental de criação também prepara digest lógico e atestado,
normalizando UUIDs antes de assinar para que sua capitalização não altere a
identidade da tentativa. Testes usam cifra e atestador locais; não comprovam
verificação da assinatura, vínculo, auditoria ou idempotência no banco real.
O contrato interno de criação de contato agora exige AAD de valor com tabela,
ID e formato vinculados ao contato; o preparo usa o mesmo AAD ao cifrar e o
inclui no snapshot assinado. É alteração incompatível com entradas anteriores
sem AAD. Os testes verificam estrutura, não autenticidade da tag nem validação
SQL; a RPC real e a revisão de sua integração ainda não existem.
Um rascunho SQL isolado da criação de contato foi preparado e exercitado em
PostgreSQL temporário: inclui recusa de prova/perfil/AAD inválidos, vínculo ao
paciente, repetição sem duplicar e auditoria de cada leitura, inclusive falha
da auditoria. A revisão identificou e o executor corrigiu colisões de auditoria
e referência a contato inexistente nos retries; a prova local foi repetida com
sucesso. Gateway/JWT, Vault, tag GCM, acesso direto, concorrência e revogação
reais não foram comprovados. O rascunho não tem grants de runtime e não foi
aplicado ao Supabase; a tarefa 4.2 permanece aberta.
Prova adicional reutilizou o cluster descartável da equipe, com transação
revertida: comando TypeScript com cifra real e atestador JCS fictício foi
aceito pelo SQL experimental, e adulteração do AAD após assinatura foi negada
sem duplicar contato ou ledger. O cluster foi parado; essa prova não cobre JWT,
Vault, privilégios de runtime, concorrência ou Supabase reais.
Na mesma fixture, cinco testes integrados passaram: incluem criação e retry
negados depois da revogação da sessão, com autoridade inicialmente válida,
sem retorno de dados ou efeitos novos e com negativa auditada. Nos casos de
concessão, o trigger exige revogar a sessão primeiro; portanto a prova cobre o
estado combinado e não isola a verificação da concessão. Tudo foi revertido.
Outra prova local usou duas conexões e observou o bloqueio real entre criação
de contato e saída: quando a saída venceu, a criação foi negada; quando a
criação venceu, a saída aguardou. Assinatura e prova foram verificadas antes da
disputa e o prazo após a espera. A fixture usa identidade e assinatura SQL
fictícias; não comprova JWT, Vault ou concorrência no Supabase. O clone de teste
foi removido seletivamente após confirmação; o banco original foi preservado.
Para 4.4, foi preparada validação server-only experimental da consulta e da
resposta de auditoria, com filtros e DTO estritos, correlação de request e
negação preservada. Testes com RPC fictícia cobrem página vazia e não vazia,
campos extras, falhas sanitizadas e request divergente. A validação não comprova
Admin, paginação ou registro transacional da própria leitura; campos textuais
devem ser limitados a metadados autorizados no banco. Não há rota integrada.
O preparo experimental de paciente também normaliza UUIDs antes do digest e
atestado. Se houver ledger anterior produzido com UUID em maiúsculas, será
necessário avaliar compatibilidade antes de ativar o código; não se presume
existência ou ausência desses registros.
Na revisão da edição de contato, foi identificada incompatibilidade: o
contrato exige motivo cifrado, mas o destino de persistência e o AAD do motivo
ainda precisam ser definidos e revisados. A preparação incompleta foi retirada
para não devolver o motivo em texto claro; edição continua pendente.

O adapter de chaves Google consultou o endpoint público de JWKS e rejeitou um
token fictício com identificador de chave inexistente. A prova não usa conta ou
credencial Google e não demonstra login válido, concessão ou criação de sessão.

Atualização: o pool experimental agora define `query_timeout` de 15 segundos e
o executor recusa pools sem prazo de consulta. Em PostgreSQL descartável, um
proxy TCP bloqueou respostas depois de estabelecer TLS; durante `BEGIN`, o
executor retornou erro sanitizado, descartou o cliente e os dois sockets foram
encerrados antes da limpeza. A prova passou em Node; Deno foi verificado no
caminho normal, não sob interrupção. Resposta perdida de `COMMIT`, demais
pontos de falha e comportamento do pooler remoto seguem sem prova. Não há
deploy; S-02 e integração permanecem pendentes.

Prova adicional no PostgreSQL descartável: em Node, o proxy reteve a resposta
ao `COMMIT` e outra conexão observou o servidor em estado ocioso com `COMMIT`
executado; o leitor retornou erro sanitizado e descartou cliente e sockets.
Em Deno, após TLS confirmado, uma interrupção anterior ao início da transação
produziu timeout sanitizado e pool sem clientes. A suíte completa passou; a
prova de `COMMIT` perdido não foi repetida em Deno. Esses testes não comprovam
runtime Edge, pooler remoto ou os demais casos de falha de rede.

O solicitante confirmou que a consulta administrativa de auditoria deve
mostrar o autor individual ou o operador restrito. Os contratos preparados
exigem exatamente uma dessas identificações e rejeitam eventos inválidos;
isso não comprova autorização administrativa, consulta ao banco ou interface
integrada. A implementação real e suas provas seguem pendentes na S-02.
Na revisão independente, identificou-se que o banco permite texto arbitrário
em `operador_restrito`: sua proveniência, formato e tratamento de registros
existentes precisam ser definidos antes de expor a consulta, para evitar
divulgação indevida. Também é necessário alinhar os limites de `acao` e
`tipo_objeto` entre banco e contrato; atualmente eventos válidos no banco
podem exceder os 120 caracteres aceitos pelo contrato. Esses achados não foram
resolvidos e bloqueiam a integração da consulta.
Em particular, o bootstrap experimental recebe `p_operador` como texto e o
grava diretamente na trilha, validando apenas presença e tamanho. Já a
admissão técnica experimental utiliza um identificador constante para a
negativa. A revisão precisa cobrir tanto a escrita quanto a leitura, sem
presumir que todos os operadores tenham a mesma origem ou que dados já
registrados possam ser alterados ou excluídos.

Decisão do solicitante: operadores técnicos sem usuário do aplicativo devem
usar identificador técnico cadastrado e controlado; registros antigos devem
ser revisados antes de sua exibição. A decisão não define uma limpeza de dados
nem autoriza alteração remota. O desenho, os testes de origem e permissão e a
compatibilidade com a trilha anterior ainda precisam ser implementados e
revisados antes da exposição da consulta.

Proteção temporária no handler experimental: uma página que contenha qualquer
operador restrito é recusada integralmente com erro sanitizado; páginas com
autor individual continuam aceitas. Testes de interface fictícios passaram,
mas não comprovam cadastro de operador, revisão de registros, autorização ou
consulta real. Essa recusa provisória não encerra a tarefa 4.4 e deverá ser
substituída pela verificação autorizada no banco antes da integração.

Experimento SQL descartável de cadastro de operador: um identificador ativo
foi associado a uma identidade de conexão fictícia; operadores desconhecidos,
inativos e de outro papel foram negados. A revisão encontrou que um grant amplo
na fixture permitia forjar o autor individual; a fixture foi restringida por
colunas e um teste negativo passou. A associação a `session_user` não comprova
a identidade no gateway ou pooler Supabase. Permanecem sem prova a concorrência
entre desativação e escrita, a revisão de registros antigos, administração
auditada do cadastro e privilégios de runtime reais. O experimento não é
migração, não libera a leitura e não encerra 4.4; servidor descartável parado.

Prova adicional sob READ COMMITTED em PostgreSQL descartável: o rascunho usa
lock compartilhado na linha do operador até o commit da escrita. Duas conexões
comprovaram as duas ordens: desativação primeiro faz a inserção posterior ser
negada; inserção primeiro termina antes da desativação. Os testes observaram o
bloqueio real e foram revisados independentemente. Identidade da conexão foi
simulada; gateway, pooler, grants reais, revisão de histórico e administração
auditada continuam sem prova. O banco e a role fictícios exclusivos dessa prova
foram removidos após verificação; o banco original foi preservado e o servidor
parado. Nada foi aplicado ao Supabase remoto.

O executor experimental de criação de paciente agora projeta a resposta
autorizada cifrada para DTO administrativo; erros de cifra falham sem resposta
parcial. Os testes usam RPC fictícia e não comprovam autorização ou auditoria.
A revisão observou que uma falha após a RPC pode ocorrer depois do commit: o
handler real deve tratar o resultado como incerto e reconciliar pela mesma
operação idempotente, sem nova criação presumida. O vínculo entre resposta e
operação também depende do ledger transacional autorizado, inclusive em retry;
o teste de AAD isolado não demonstra esse vínculo. A integração permanece
bloqueada e a tarefa 4.2 não está concluída.

O executor experimental agora distingue erro anterior ao envio de resultado
incerto após iniciar a RPC, inclusive resposta incompatível ou falha de
decifragem. Não repete a chamada automaticamente. O handler real ainda deve
reconhecer essa distinção e acionar reconciliação; respostas de erro da RPC
dependem de contrato transacional real comprovado, inclusive indisponibilidade.
Os testes usam RPC fictícia e não comprovam commit ou autorização real.

O executor trata códigos de erro fora das três negativas previstas no SQL
experimental como resultado incerto, inclusive indisponibilidade. Essas
negativas dizem respeito apenas à tentativa atual: não provam que tentativa
anterior com a mesma chave não confirmou. O consumidor deve manter a pendência
até reconciliação autorizada; nenhum retry ou limpeza da pendência é presumido.

Na tela, uma negativa posterior a resultado incerto não apaga mais o pedido
nem sua chave durante a mesma permanência na página. Testes web e revisão
independente cobrem essa correção. O marcador continua apenas na memória da
aba: recarga e outras abas exigem reconciliação autorizada no servidor antes
de liberar nova criação. A correção não substitui essa integração.

No adapter experimental de renovação Auth, o mesmo prazo limita a espera de
fetch, leitura do corpo e validação JWT, mesmo se a dependência ignorar o
cancelamento. Respostas tardias são descartadas; o cancelamento é best effort
e não comprova que o Auth deixou de rotacionar o refresh. Os 12 testes locais
passaram e a revisão verificou a rejeição tardia. Fencing, armazenamento e
integração real continuam sujeitos às provas e à revisão S-02.

O adapter de login técnico também limita fetch, leitura e validação JWT ao
mesmo prazo e rejeita resultados tardios; 12 testes fictícios passaram e a
alteração foi revisada. O timeout não revoga sessão que o Auth possa ter
criado: não admissão local, expiração e tratamento externo de eventual sessão
órfã ainda precisam de prova antes da integração.

No adapter Google, o prazo agora cobre digest e validação do ID Token antes da
troca, além da rede e validação do JWT Supabase após ela. Testes fictícios
confirmam que a troca não começa após expiração da etapa anterior e que
resultados tardios não são aceitos; a correção foi revisada. O prazo não
cancela necessariamente trabalho criptográfico, busca JWKS ou efeito de troca
já iniciada, nem comprova login Google ou Supabase real.

O desafio Google exige confirmação booleana verdadeira do consumo e preserva
o TTL validado contra mutação posterior. Os 12 testes fictícios passaram e a
alteração foi revisada. Ainda faltam prazo no adapter de persistência, prova
de consumo atômico e expiração no banco real, além da integração de cookies e
Auth. Falha de comunicação no consumo não permite presumir desafio reutilizável.

No desafio experimental, registro e consumo aguardam no máximo até a expiração
do desafio e não aceitam confirmação tardia; 15 testes passaram e o diff foi
revisado. A operação no banco não é cancelada nem revertida por esse prazo.
O TTL pode chegar a 600 segundos e não limita cifra/digest anteriores; a
integração precisa prazo operacional próprio, descarte de conexão, relógios
coerentes e prova de atomicidade real. Consumo incerto exige novo desafio.

Leitura experimental da carteira: fixture PostgreSQL local exercitou perfis,
vínculo, sessão, prova, paginação e auditoria; o teste de usuário inativo usa
sessão ativa e request próprio para identificar a negativa auditada. A revisão
não libera integração: SECURITY INVOKER foi testado como superusuário, não há
prova de grants/RLS de runtime, expiração durante bloqueio, concorrência de
revogação ou auditoria de atestado inicialmente inválido. JWT e perfis são
fictícios; o cursor interno exige proteção antes do navegador. O teste local
passou sem Docker e os servidores de fixture foram parados. Não é RPC de
produção e a tarefa 4.2 permanece pendente.

Teste local adicional de concorrência da carteira observou bloqueio real nas
duas ordens: revogação anterior impede leitura do vínculo; leitura anterior
termina antes da revogação. O runner cria cluster e banco dedicados, verifica
seu contexto e encerra o servidor; a guarda reduz execução acidental, não é
fronteira contra superusuário e ainda carece de testes negativos específicos.
A prova usa identidades fictícias e superusuário, não demonstra privilégios ou
RLS reais nem libera integração.

Atualização da carteira: teste concorrente passou a executar ambas as leituras
com o papel executor restrito; revisão independente confirmou bloqueios e
resultados observados. Claims e segredos são fictícios e a conexão de teste
capaz de assumir esse papel não comprova memberships ou gateway reais.

Na reserva experimental de cadastro, colisão concorrente de UUID entre atores
é rejeitada sem atualizar o ator perdedor; teste de duas conexões passou e foi
revisado. O experimento ainda não comprova identidade autorizada, emissão de
geração vinculada à sessão ou escrita real de paciente e auditoria. O banco
temporário exclusivo da prova foi removido sem lixeira; o original foi
preservado. Nenhuma dessas provas libera integração nem encerra 4.2.

Foi preparado handler HTTP de desafio com cookies separados de nonce e CSRF,
origem verificada e erros sanitizados. Testes fictícios cobrem emissão tardia
e respostas invertidas, preservando cookie de sessão; um desafio antigo ainda
pode invalidar o mais novo. Os prazos de leitura e emissão são separados, de
até cinco segundos cada. Antes de expor, faltam limitação de emissão, limpeza
de registros tardios e prova do repositório real. A leitura experimental da
carteira também projeta respostas cifradas para DTO básico; requer RPC
autorizada e cursor protegido antes do HTTP. Nenhum desses handlers está
conectado ao runtime ou comprova a jornada integrada.

O desafio CSRF da entrada técnica foi separado do desafio Google no contrato,
cliente e handler preparado, sem criar nonce ou registro Google para login por
senha. Testes locais de contrato e interface passaram; testes simulados de
cookies em ordens diferentes recusam o CSRF técnico deslocado sem mudar a
sessão ativa. As duas entradas ainda compartilham cookie de desafio: uma pode
invalidar a outra; concorrência real de navegador e login Google ponta a ponta
não foram comprovados. Handlers não estão expostos e limitação de abuso segue
necessária antes da publicação.

O handler experimental de carteira valida consulta, cursor cifrado vinculado
ao usuário e sessão, e revalida autorização antes da resposta. Testes usam
adapters fictícios; autorização transacional, auditoria, configuração de logs
de URL e provisionamento da chave ainda devem ser provados no runtime real.

A migração local de leitura de chave de atestado utiliza namespace separado e
catálogo de referências autorizadas vazio por padrão. Testes com Vault
fictício cobrem ausência, valores inválidos, referência inativa e acesso
direto negado. Não comprovam privilégios no Vault real, operação auditada do
catálogo ou rotação; um executor que já leu uma chave pode reter sua cópia.

O contrato da criação inclui reserva e geração no digest e atestado; os
consumidores locais foram atualizados e os testes de contratos e cadastro
passaram, com seis testes de integração ignorados. Um wrapper SQL experimental
liga reserva e gravação na mesma transação, mas ainda não é operacional com
executor restrito: caminhos antigos são negados no teste e o próprio wrapper
também falha sem privilégios internos. Falta desenho de proprietário restrito,
emissão confiável da geração e provas de concorrência e revogação. Nada disso
foi aplicado remotamente ou libera S-02.

A cadeia experimental de cadastro recebeu owners dedicados sem login e sem
superusuário para prova de sessão, atestado e cadastro. A revisão identificou
execução pública indevida no assinador de teste; o privilégio foi revogado e
testado. Em PostgreSQL local descartável, um teste sob papel executor restrito
criou e repetiu cadastro e rejeitou adulteração e sessão revogada, sem permitir
acesso direto às funções internas. Essa prova usa claims, chaves e geração
fictícios. As políticas do owner de cadastro são amplas e os caminhos
transitivos ainda exigem revisão independente; ela não comprova privilégios
mínimos, gateway ou autorização no Supabase real.

O verificador SQL de atestado permanece em `supabase/drafts/`, fora das
migrações: ainda não comprova todos os requisitos, incluindo canonicalização
RFC 8785. O adaptador PostgreSQL de admissão é experimental e não está ligado
ao runtime; a função e o papel que propõe ainda precisam existir e ter seu
modelo de confiança comprovado. Perda de resposta ao confirmar transação exige
tratamento e não pode ser interpretada como reversão. Nada disso foi aplicado
remotamente ou libera a revisão S-02.

Após mover o verificador para rascunhos, o runner local de carteira, Vault
fictício e verificador terminou com código zero e encerrou o PostgreSQL
descartável. Essa execução não testa o Vault ou as permissões do Supabase real.

Revisão independente do experimento não identificou novo desvio concreto, mas
apontou falta de provas de privilégios por coluna, acesso direto a tabelas e
helpers e memberships transitivas. O teste local foi ampliado para verificar
essas permissões nos papéis executor, anon e authenticated; a fixture passou
no clone descartável. Isso não valida as políticas amplas do owner nem os
papéis reais do Supabase. A validação JWT no adaptador experimental
passou a ter prazo de cinco segundos: resultado tardio é ignorado e não inicia
conexão; três testes passaram. O trabalho criptográfico em andamento não é cancelado. Testes com
adaptador fictício não comprovam a identidade no banco ou a recuperação de
resultado incerto de COMMIT.

Na reserva experimental, testes com gatilhos fictícios que suprimem a
gravação do efeito ou a confirmação da reserva reproduziram uma possibilidade
de sucesso incompleto. O wrapper agora exige uma linha em cada gravação e
lança erro para reverter a transação se isso não ocorrer; o teste no clone
descartável passou. A correção ainda exige revisão independente e não prova
comportamento ou privilégios do Supabase real.

A revisão pediu que os testes identificassem a falha exata, em vez de aceitar
qualquer exceção com o mesmo código, e verificassem também a reversão da
auditoria de criação. A fixture foi reforçada e passou novamente no clone;
não substitui a revisão do estado integrado nem a prova no Supabase.

O handler local da entrada técnica impõe prazo global de 15 segundos e não
retorna cookies em falha ou resposta tardia. Os testes do proxy passaram
(89 testes). Revisão independente observou que o prazo não cancela Auth ou
admissão em andamento: uma sessão pode ser criada após o erro, sem cookie
entregue. Antes de expor a rota, definir e comprovar revogação, expiração ou
reconciliação para esse caso; também faltam provas de leitura e composição
tardias. O handler continua desconectado.

O prazo foi propagado à preparação da entrada: se Auth, cifra ou geração de
prova terminarem tarde, a admissão não é iniciada. Teste HTTP com cifra tardia
reproduziu a falha e passou após a correção; 90 testes do proxy passaram.
Cancelamento não desfaz Auth ou admissão já iniciados e não resolve, por si
só, sessão órfã ou confirmação HTTP perdida.

A interface interna experimental de entrada técnica foi alinhada ao executor
PostgreSQL: o JWT validado segue somente entre módulos de servidor e não é
enviado nos parâmetros SQL; JWT e hash não são enumeráveis no contexto de
admissão. Isso reduz serialização acidental, mas não impede inspeção direta
nem substitui política de logs. A suíte de funções passou com 197 testes;
função SQL, papel e canal reais seguem inexistentes ou não comprovados.
O resultado interno também passou a manter token e prova não enumeráveis;
teste verifica serialização e acesso pelo consumidor. Isso não impede logs
deliberados ou inspeção direta.

A abertura experimental de reserva passou a exigir capacidade vinculada à
sessão; teste fictício cobriu ausência, validade e geração antiga. A emissão
e recuperação dessa capacidade ainda não são confiáveis nem implementadas
para o runtime. Revisão encontrou que a auditoria da abertura pode ser
suprimida sem erro e que a coordenação com alterações da capacidade ainda
exige prova de concorrência. A abertura agora exige registro efetivo de cada
evento de auditoria; testes locais cobrem supressão silenciosa e reversão.
O vínculo de capacidade não tem lock próprio nessa fixture, e futura revogação
precisa comprovar coordenação; a abertura segue sem autorização de integração.

O handler experimental de carteira passou a transportar identidade, JWT,
prova e geração em contexto por requisição, sem estado compartilhado entre
consultas, e revalida identidade, sessão, prova e geração antes da resposta.
Teste fictício cobre concorrência e troca de geração. A suíte de cadastro
passou com 71 testes e seis ignorados. A porta de autorização ainda deve
validar JWT de verdade; SQL, atestado, Vault e auditoria reais não estão
conectados, e a rota permanece fechada.

Foi preparado transporte assinado experimental para listar pacientes. Após
revisão, o preparador compara a consulta e os metadados assinados com os
valores esperados e recusa divergências. A suíte de cadastro passou com 81
testes e seis ignorados; a revisão não identificou novo bypass concreto.
O banco ainda precisa verificar MAC, digest, JWT e autorização em transação;
o preparador não está ligado ao runtime.

Um executor PostgreSQL experimental para a carteira valida JWT e deriva dele
as claims usadas na transação local; a consulta é parametrizada e o resultado
só é liberado após `COMMIT` confirmado. Teste simulado para resposta ROLLBACK
reproduziu erro anterior e passou após correção. Os testes não comprovam canal,
gateway, papel, TLS, logs ou privilégio no Supabase: claims SQL são forjáveis
fora de um canal restrito e a rota permanece fechada.

Uma prova local integrou executor de carteira TypeScript, JWT e atestado
fictícios ao PostgreSQL descartável, sob login e executor restritos de
fixture. Consulta permitida, prova errada, sessão revogada, auditoria após
commit e acesso direto negado foram testados. `auth.uid`/claims e revogação
foram simulados; não demonstram gateway, RPC de revogação, TLS, Vault ou
permissões reais no Supabase.
Após revisão, a prova passou a confirmar o papel efetivo e o código 42501 nas
negativas diretas, além de verificar dois pacientes para Admin e apenas o
paciente vinculado para Profissional. O runner local passou novamente; a
revisão confirmou os ajustes por leitura. As limitações de identidade,
revogação e ambiente real permanecem.

Uma prova adicional atravessou handler HTTP experimental, validador JWT,
assinador, executor SQL e cifra com fixtures: Admin recebeu dois pacientes e
Profissional apenas o vinculado; prova errada e sessão revogada foram negadas
e auditoria consultada após commit. A composição foi feita no teste e não há
endpoint real; claims e revogação usam fixtures. A revisão pediu reforço do
guard do cluster descartável antes de considerar a prova reproduzível com
segurança; Supabase, gateway e Vault reais continuam não comprovados.
O guard foi reforçado com verificação de tipo, proprietário e modo do
diretório/socket antes da conexão; o runner local passou novamente e a revisão
confirmou a correção por leitura. Não protege contra processo malicioso com o
mesmo usuário; o teste deve continuar usando seu runner exclusivo.

A porta experimental de carteira valida JWT e extrai identidade de suas
claims, prova e geração dos cabeçalhos. Testes fictícios cobrem assinatura,
expiração, issuer, audiência e cabeçalhos inválidos; configuração é copiada
para evitar mutação externa. O estado retornado não comprova prova vigente,
vínculo ou revogação, que continuam dependentes do banco e da S-02.

O fluxo Google experimental combina desafio, validador JWKS e troca Auth;
testes com serviços fictícios cobrem nonce, assinatura e replay. Cancelamento
cooperativo impede iniciar troca após consumo tardio, mas não interrompe uma
operação já iniciada. Após revisão, o sinal também foi propagado à validação
Google para impedir iniciar Auth quando ela termina após cancelamento; teste
fictício cobriu a corrida. Pré-concessão, consumo atômico real, sessão órfã e
integração com Google/Supabase seguem pendentes; nenhuma rota foi exposta.

Foi preparado repositório PostgreSQL experimental para o desafio Google, com
consultas parametrizadas e confirmação de COMMIT antes de retornar consumo.
Após revisão, teste em PostgreSQL descartável forçou e observou bloqueio de
duas tentativas antes de liberar a transação: uma consumiu e a outra foi
negada. A prova usa papel privilegiado de fixture; não comprova grants, canal,
limpeza/quota ou Supabase real. Perda do COMMIT continua resultado incerto.

Foram preparados dois experimentos locais adicionais: owner/executor restritos
para o desafio Google e vínculo único entre desafio consumido e sessão para
concessão já vinculada. Revisão identificou risco de reabrir desafio por
outra policy e uso após expiração. As fixtures foram ajustadas e os testes
locais passaram. Ainda faltam primeira vinculação, credencial/prova de sessão,
identidade e Vault reais, grants de produção e S-02; não representam login
funcional.

A revisão posterior encontrou que um conflito na inserção da sessão podia
esperar além do prazo e admitir desafio expirado. O rascunho passou a conferir
novamente o prazo após a inserção; teste local forçou a espera e verificou
rollback. Para isolar o conflito, a conexão de controle usou superusuário e
`session_replication_role=replica`: não é prova de FKs nem do fluxo produtivo.
A revisão confirmou que essa configuração foi limitada à conexão bloqueadora,
sem desabilitar triggers da chamada avaliada.

Dois experimentos locais adicionais trataram de concessão Google: o primeiro
vínculo de uma conta Auth sem usuário local, e a admissão de concessão já
vinculada com credencial e prova de sessão. Testes fictícios cobriram
repetição, concessão revogada e rollback; não comprovam JWT, Google, HMAC,
Vault, privilégios reais ou concorrência completa. A revisão identificou que
triggers podem alterar valores no primeiro vínculo sem que `FOUND` detecte.
As fixtures passaram a conferir os valores persistidos de vínculo, sessão,
credencial e prova; testes de adulteração e supressão passaram localmente e
estão em revisão. A verificação exige acesso sensível pelo owner, ainda sem
privilégios mínimos comprovados. Reativação de usuário local preexistente e
normalização do e-mail seguem sem decisão; rascunhos ficam fora do runtime.

Foi preparada composição local da primeira concessão Google com credencial
cifrada e prova de sessão. Testes fictícios verificaram sucesso e rollback
em supressão ou adulteração. A variante para concessão já vinculada ganhou
rechecagem de expiração após inserir a prova; teste de atraso passou. Revisão
por leitura não encontrou novo bypass concreto. Teste posterior atrasou
separadamente a gravação da credencial e da prova na primeira concessão e
confirmou rollback após expiração. O atraso de trigger não demonstra disputa
real de lock; privilégio, JWT, HMAC e Vault reais seguem sem prova e nenhuma
dessas composições está no runtime.
Uma composição HTTP Google experimental foi preparada sem rota pública. A
revisão apontou que falta de concessão retorna 403, enquanto credencial Google
inválida ou falha do provedor retorna 503 genérico. A classificação deve
separar invalidez comprovada de indisponibilidade sem revelar concessões;
esta pendência impede exposição. O prazo limita o handler, mas não comprova
cancelamento ou rollback de operações externas já iniciadas.

Correção parcial: credencial Google comprovadamente inválida e concessão
negada passaram a retornar 401 público genérico; falhas de JWKS, rede e
resultados incertos permanecem 503. Cabeçalho crítico não suportado é recusado
antes de buscar chaves. Replay de desafio ainda retorna 503 na prova local;
é necessária classificação que não confunda rejeição e falha de repositório.

Uma prova local percorreu HTTP Google, desafio PostgreSQL, JWKS e Auth
fictícios, cifra, admissão SQL e sessão HTTP. Testou cookies, repetição,
concessão ausente, papel de admissão, acesso direto negado e auditoria. A
consulta de sessão e o repositório de desafio usam privilégios de fixture;
Google, HMAC, gateway e Supabase reais não foram comprovados.
Um seletor SQL experimental escolhe entre primeira concessão e concessão já
vinculada. A revisão identificou que buscar apenas pelo e-mail atual negava
acesso após alteração de endereço; o experimento passou a localizar vínculo
por UUID e subject e usar HMAC para concessão pendente. O caso alterado passou
localmente, mas concorrência, autorização do canal e grants continuam
pendentes; não ligar ao runtime.

Teste local com duas conexões observou as duas ordens entre seleção Google e
revogação simulada: revogação anterior negou sessão; seleção anterior foi
seguida de revogação das sessões e desativação do usuário. O helper de sessão
fictício negou acesso após revogação. Não existe RPC real de revogação nesse
teste; UPDATEs privilegiados, claims e ausência de auditoria são limitações,
portanto não comprovam JWT, permissões ou S-02 no runtime.
O fluxo TypeScript experimental também preserva a referência do desafio e seu
hash a partir do desafio consumido, sem enumerar credenciais no resultado.
Testes cobrem mutação tardia da entrada e serialização. A suíte de funções
passou com 211 testes e três ignorados; não comprova integração externa.

Uma composição TypeScript experimental cifra o refresh, gera prova e passa
a admissão Google por portas server-only; HMAC e executor reais continuam
ausentes. Revisão e testes locais são parciais; cancelamento não desfaz uma
admissão em andamento. Não expor antes de S-02 ou tratar doubles como runtime.

Teste local de cofre via TLS carregou chaves AES fictícias v1/v2, leu dado
antigo, recriptografou com o mesmo AAD e rejeitou ausência/reuso de material.
HMAC permaneceu separado. A prova não demonstra rotação auditada, Vault/Edge
reais ou recuperação integrada; a tarefa 2.4.3 continua pendente.
Revisão identificou que erros de carregamento poderiam produzir falso positivo
nas negativas; o teste passou a isolar as operações e exigir o erro esperado.
O runner local foi repetido e passou.

A carteira experimental tem prazo global: autorização ou consulta tardia
não prossegue para a próxima etapa nem retorna dados. A suíte de cadastro
passou com 73 testes e seis ignorados. O prazo não cancela SQL já iniciado;
o executor real ainda precisará de prazo e descarte de conexão apropriados.
No verificador SQL em rascunho, assinatura inválida continua negada, enquanto
chave indisponível agora produz erro de serviço sanitizado; prova com Vault
fictício passou. Revisão confirmou que exceções propagam sem autorizar, mas
logs reais de SQL e comparação de MAC ainda precisam de verificação.
Revisão adicional encontrou que a projeção podia iniciar novas decifragens
após o prazo do handler. O sinal agora é verificado antes de cada campo e
paciente; teste de decifragem tardia passou. A suíte de cadastro passou com
74 testes e seis ignorados. SQL ou decifragem já iniciados não são cancelados
automaticamente pelo prazo HTTP.

Um experimento local tentou vincular a emissão da reserva à prova existente
da sessão. O teste confirmou repetição antes do fechamento e rejeição da
geração antiga após o fechamento, mas revelou um contraexemplo: a mesma prova
de sessão permite solicitar a próxima geração previsível sem comprovar que
essa capacidade foi recebida antes. Assim, a opção testada não demonstra
proteção contra todas as emissões atrasadas e não deve ser integrada. Faltam
protocolo de emissão/recuperação, revogação concorrente e provas reais.

Outra fixture testou capacidade opaca rotacionada sob lock: rejeitou o token
antigo após o fechamento. Porém, quando a resposta com a nova capacidade é
perdida, armazenar somente seu hash impede recuperá-la; a abertura permanece
bloqueada. Ainda não há protocolo aprovado e comprovado de reemissão ou
recuperação após essa perda. O experimento não prova concorrência, emissão
inicial, auditoria, canal nem integração real e não deve ser exposto.

Uma fixture adicional testou barreira de reconciliação em duas conexões:
quando a barreira vence, abertura antiga é negada; quando a abertura vence,
a barreira a observa. O experimento também demonstrou um contraexemplo após
perda de resposta: nova sessão pode receber ausência apesar de existir uma
reserva cancelada. Falta ledger recuperável; o modelo não atende D-09 e não
pode ser integrado. Identidade, auditoria, cifra e revogação são fictícias ou
não foram testadas.

A fixture foi ampliada com ledger sem dados de paciente: uma nova sessão
fictícia do mesmo ator recupera a reserva anterior, enquanto outro ator não a
recebe; nova abertura fica bloqueada enquanto houver registro. Testes com
duas conexões e perda de resposta passaram. Falta política de confirmação e
baixa, além de identidade, auditoria e integração reais; D-09 permanece
pendente e o experimento não pode ser exposto.
Teste local adicional executou preparação, cifra e assinatura reais com dados
fictícios contra a função SQL reservada sob papel de fixture; conferiu
gravação protegida, auditoria, negativa após revogação simulada e rollback de
paciente/idempotência/efeito. A revisão identificou contaminação quando duas
suítes eram executadas juntas; os bancos passaram a ser clonados antes de
testes mutantes e o runner com ambas as opções passou. Claims, capacidade e
adapter RPC foram montados no teste, não comprovam gateway ou reserva real.
Revisão encontrou que a supressão silenciosa de gravação do ledger ou da época
podia aparentar sucesso. A fixture agora exige uma linha em ambas as gravações;
testes com gatilhos de supressão verificaram erro e rollback, e repetiram as
duas ordens concorrentes. Revisão independente confirmou esses controles;
ainda falta provar privilégios transitivos do executor real.

Um novo rascunho experimental de admissão usa a mesma tabela fictícia de prova
da saída. Teste em PostgreSQL descartável cobriu admissão, saída, repetição,
outra conta, tombstone e rollback ao falhar a gravação da prova. A falha
inicial do teste foi por arquivo inexistente, não por asserção comportamental;
o ciclo TDD não ficou completo. Renovação integrada, privilégios reais,
auditoria, resultado incerto e sessão órfã continuam sem comprovação.
Após revisão, o teste passou a afirmar explicitamente que a outra conta
fictícia existe em Auth e usuário, mas não possui exceção técnica; ela é
negada. Chamadas diretas pelos papéis anon e authenticated também foram
negadas no PostgreSQL descartável. Isso não comprova Auth ou grants reais.

O teste local que combinou admissão, renovação e saída identificou gerações
iniciais divergentes entre credencial e prova. O rascunho agora inicializa
ambas na geração 1 na mesma transação. A prova passou em transações separadas,
rejeitando prova anterior após renovação e prova nova após saída; revisão não
encontrou novo defeito concreto. Claims e execução privilegiada são fictícios:
concorrência, identidade, Vault e privilégios reais continuam pendentes.
Teste adicional suprimiu a atualização da geração e confirmou erro específico
e rollback de sessão, credencial, prova e auditoria.

A fixture de admissão com owner/executor sem login executou localmente, mas
revisão independente identificou risco de personificação: o executor pode
informar IDs de uma conta técnica válida sem prova independente de vínculo ao
JWT no banco. O teste de conta não autorizada não prova esse caso. Os grants
amplos do owner foram reduzidos por coluna na fixture; testes locais negaram
alteração de perfil/concessão e leitura de coluna desnecessária. Ainda é
necessário revisar as policies e comprovar o canal/identidade e os privilégios
reais. Não promover nem expor o rascunho: ele não comprova S-02 nem integração.
Teste posterior demonstrou outro limite: o owner da fixture consegue alterar
a geração inicial de credencial de outra sessão, inclusive revogada. O teste
reverteu a alteração; o vínculo da atualização à sessão recém-admitida ainda
precisa de desenho seguro e prova. Não aceitar contexto controlável como
substituto dessa garantia.
Uma variante local insere a credencial diretamente na geração 1 e removeu
UPDATE e leitura do envelope pelo owner; testes locais de admissão, renovação
e saída passaram. A revisão encontrou que um gatilho pode adulterar o envelope
inserido sem detecção nessa variante. A fixture passou a comparar o envelope
e o teste de adulteração confirmou rollback. Isso exigiu devolver SELECT do
envelope ao owner: teste demonstra que ele pode ler envelopes de outra sessão.
O isolamento permanece insuficiente; a identidade do executor também é
bloqueadora. Nenhuma dessas variantes está pronta para promoção.

Um experimento adicional tentou restringir leitura do envelope pelo `xmin`
da sessão. O teste demonstrou que um UPDATE sem alteração na sessão antiga
pode mudar esse marcador e tornar a credencial antiga legível. Portanto, esse
mecanismo não comprova criação na transação nem isolamento e foi descartado
como solução; o rascunho permanece identificado como inseguro, sem runtime.
Outro experimento local usou digest gerado do envelope: negou leitura direta
do envelope ao owner e detectou alteração por gatilho anterior à inserção.
Um gatilho privilegiado e adiado alterou o envelope após a conferência; o
teste executou a ação adiada e terminou em rollback, sem comprovar commit.
Esse contraexemplo pressupõe um caminho privilegiado, não demonstra ataque
pelo executor restrito. Digests alheios permaneceram visíveis. A variante
não comprova isolamento real nem resolve identidade e não deve ser promovida.
Um experimento separado simulou emissão de recibo por gateway e consumo por
executor restrito. Negou, no PostgreSQL descartável, identidade, sessão e
digest divergentes, repetição, expiração e emissão direta pelo executor.
O gateway e seus claims eram fictícios: não demonstram validação JWT nem
isolamento de papéis no Supabase. Revisão apontou ausência de vínculo
completo à operação e aos bytes efetivos, capacidade aleatória, concorrência,
atomicidade com admissão/auditoria e testes de grants reais. A emissão
autenticada exige revisão do desenho; o experimento não é endpoint nem libera
S-02, e não deve ser promovido.
O experimento de recibo ganhou teste com duas conexões: a segunda foi
observada aguardando a primeira antes do commit, e apenas uma operação e
auditoria fictícias foram registradas. Falha induzida reverteu consumo e
escritas na fixture. Isso não comprova gateway ou transação real de admissão.

A preparação do cliente Google revelou outra pendência de S-02: respostas de
entradas concorrentes podem sobrescrever cookies no navegador antes de o
JavaScript descartar uma resposta antiga. Desafios e sessões entre abas exigem
desenho e prova específicos, inclusive respostas invertidas e limpeza limitada;
contador de geração na memória não resolve esse efeito. Não habilitar a entrada
Google nem considerar o acesso técnico seguro contra essa corrida por esses
testes.
Os desafios técnico e Google foram alterados localmente para usar seletor e
cookies por tentativa. Uma resposta tardia limpa somente os cookies da própria
tentativa; testes HTTP simulam respostas invertidas e mistura de seletores,
CSRF e nonce. A revisão por leitura não encontrou mistura ou limpeza de sessão
alheia nesse trecho. Desafios abandonados ainda ocupam cookies até expirar;
limitação de abuso, quota e comportamento no navegador real seguem pendentes.
Isso não demonstra integração real nem encerra S-02.
Foi incluída mitigação local para cabeçalhos grandes e acúmulo observado de
desafios, sem limpar cookies existentes; a tela deixou de emitir desafio só
para consultar disponibilidade. Três tentativas abandonadas ainda podem negar
novas emissões até expirarem; chamadas paralelas ou sem cookies podem exceder
o limite observado. Não é rate limit global nem prova de resistência a abuso;
comportamento em navegador e limite efetivo de infraestrutura seguem pendentes.
A consulta HTTP experimental agora transmite ao adapter de autoridade o JWT
validado, como propriedade não enumerável; a prova também não é enumerável.
Isso reduz exposição acidental por serialização, mas não impede leitura ou
registro explícitos. Testes locais negaram JWT inválido/expirado e prova ou
geração malformadas antes da chamada à autoridade. Gateway, autorizações e
revogação reais continuam sem comprovação.
A investigação da consulta real confirmou que a RPC contratada
`api.consultar_sessao_atual` ainda não foi implementada. O helper existente
verifica sessão e concessão, mas não prova e geração; não pode ser usado como
substituto. A prova persiste apenas em experiências, e sua passagem ao banco
exige conferir o canal e a política efetiva de logs antes de uso real. Toda
operação protegida precisa verificar a prova; não apenas essa consulta.
Na análise do canal, observou-se que mesmo o hash da prova é credencial de
reapresentação se aceito diretamente pelo banco. Parâmetros SQL podem aparecer
em logs de instrução ou erro, telemetria e extensões; parâmetros preparados,
isoladamente, não provam sigilo. Antes da integração, avaliar todas as camadas
com canários fictícios e controles positivos, sem desativar auditoria. Um nonce
de uso único ou assinatura vinculada não impede corrida de captura anterior ao
consumo; tampouco dispensa análise de logs. Configurações reais não foram
revalidadas nesta análise e nenhuma alteração remota foi feita.
Outro experimento separou o criador de sessão/credencial em owner dedicado;
o chamador não recebeu SELECT dos envelopes ou provas. Entretanto, o owner
interno ainda lê registros de outras sessões e o helper confia em identidade
passada por parâmetro sem comprovar autoridade. Não demonstra isolamento nem
pode ser promovido; o teste foi escrito após o draft, sem ciclo TDD completo.

Um teste local integrou o executor TypeScript de admissão ao PostgreSQL
descartável usando login e papel dedicados da fixture. Cobriu admissão,
JWT inválido ou divergente, outra conta fictícia sem exceção e acesso direto
negado à prova e ao helper. A conexão local usou `trust`, sem TLS; Auth,
Vault, canal service-only, logs e privilégios reais no Supabase não foram
comprovados. O banco confia no executor para comprovar a identidade: se esse
canal for comprometido, a fixture não tem prova criptográfica independente.
Após revisão que identificou uso do papel incorreto nas negativas, o teste foi
corrigido: ativa o papel do executor em transações separadas, confirma o papel
efetivo, prova chamada permitida e negativas de acesso direto. O teste voltou
a passar; a revisão confirmou a correção por leitura.

O cliente web limita respostas JSON a 1 MiB e compartilha o prazo da chamada
com a leitura do corpo; excesso e falha em mutações preservam resultado
incerto. Após revisão, respostas descartadas por mudança de sessão ou tipo
inválido também têm o corpo cancelado sem bloquear a interface. A suíte web
passou com 52 testes. O limite deve ser revisto se os contratos crescerem;
isso não prova comportamento de uma rota publicada.
Na interface local, erro de cursor em página posterior agora permite retorno
à primeira página pela atualização da lista; falha temporária preserva a
navegação para trás sem mostrar dados antigos. Testes web passaram (54/54),
sem validação visual em navegador ou endpoint real.
