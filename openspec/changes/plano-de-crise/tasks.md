# Tarefas — plano de crise (FR-020)

## 1. Domínio e contrato

- [x] 1.1 Modelar o conteúdo exigido pelo requisito: responsáveis, contatos, limites do
  serviço e data de revisão.
  **Evidência:** `packages/contracts/src/plano-crise.ts`; `validarPlanoCrise` recusa
  chave desconhecida, id repetido, lista acima de 50 itens, data inexistente e texto
  vazio ou acima do limite.
  **Limitação deliberada:** nenhuma regra exige pelo menos um responsável ou um contato.
  Exigir isso seria regra clínica nova; a tela pede o preenchimento de cada item criado,
  mas não decide quantos itens o plano precisa ter.
- [x] 1.2 Contrato HTTP isolado, sem tocar o `rotas.ts` compartilhado.
  **Evidência:** `packages/contracts/src/plano-crise-http.ts` (consultar, salvar e
  aprovar) e `packages/contracts/src/habilitacao-plano-crise.ts` (listar e gravar a
  marca), no mesmo padrão de `saude-http.ts`.
- [x] 1.3 Registrar o AAD da nova tabela.
  **Evidência:** `metadadosAadPlanoCriseSchema` em `packages/contracts/src/rpc.ts`; o
  ramo de `supabase/functions/_shared/cifra-autenticada.ts` passou a cobrir
  `cadastro.plano_crise_versao` junto dos demais documentos versionados por paciente,
  porque o formato é idêntico e a `tabela` entra na ligação.
  **Nota de integração:** esses dois arquivos são compartilhados; a alteração é aditiva
  (um membro novo na união, um literal novo na condição).

## 2. Banco — marca de habilitação

- [x] 2.1 Colunas da marca na concessão, com CHECK de perfil.
  **Evidência:** `supabase/migrations/20261118100000_habilitacao_plano_crise_concessao.sql`
  — `habilitado_plano_crise`, `habilitacao_versao`, `habilitacao_por_usuario_id`,
  `habilitacao_em` e `concessao_habilitacao_perfil_chk`.
  **Prova:** `sh scripts/testar-plano-crise-local.sh` — saída 0; o bloco
  `ADMIN_HABILITADO_ACEITO` tenta marcar a concessão de administrador direto na tabela e
  exige `check_violation`.
  **Limitação deliberada:** o CHECK não exige `estado = 'vinculada'`; isso quebraria a
  revogação de uma concessão marcada. O estado é exigido na gravação e na aprovação. Ver
  `design.md`.
- [x] 2.2 Operação administrativa de listar e gravar a marca, com owner dedicado.
  **Evidência:** mesma migration — `operacao.habilitacao_plano_crise_privada`,
  `api.habilitacao_plano_crise_privado` e `ffcmapp_habilitacao_crise_owner`. O bloco de
  autorização é cópia literal do de `operacao.aprovador_plano_operacao_privada`
  (administrador por Google Workspace ou exceção técnica), sem alteração de lógica.
  **Prova:** no mesmo script — profissional recebe `sem_permissao` e nada é gravado;
  administrador lista a equipe, marca, repete a chave sem dobrar a versão, recebe
  `conflito` com versão esperada velha e `conflito` ao tentar marcar administrador.

## 3. Banco — plano e aprovação

- [x] 3.1 Tabela imutável versionada e carimbo de aprovação insert-only.
  **Evidência:** `supabase/migrations/20261118110000_plano_crise_versoes_privadas.sql` —
  `unique(paciente_id, versao)`, restrição de sequência com auto-FK, CHECK estrito do
  envelope, RLS ligada, `revoke all` dos quatro papéis e trigger que bloqueia UPDATE e
  DELETE nas duas tabelas.
- [x] 3.2 Operação privada com três ações, atestado, trava, idempotência e auditoria
  obrigatória em todos os caminhos.
  **Evidência:** `supabase/migrations/20261118120000_plano_crise_operacoes_privadas.sql`,
  com owner dedicado `ffcmapp_plano_crise_owner`. Aprovar exige perfil `profissional` e
  `habilitado_plano_crise` lido sob `for share` na mesma transação.
- [x] 3.3 Grant dos wrappers para `authenticated`, com asserções defensivas.
  **Evidência:** `supabase/migrations/20261118130000_grant_plano_crise_teste.sql`
  (`WRAPPER_INESPERADO` / `ACL_INICIAL_INESPERADA`, `SET ROLE` antes do grant).
- [x] 3.4 Provas positivas e negativas de autorização.
  **Prova:** `sh scripts/testar-plano-crise-local.sh` — saída 0
  (`supabase/tests/plano_crise_operacoes_local.sql`).
  Positivas: gravação versão 1 sem aprovação; reenvio da mesma chave devolve o mesmo
  registro com `repeticao`; profissional habilitado aprova e a leitura passa a mostrar o
  carimbo; o carimbo guarda a concessão que o autorizou; edição cria versão 2 sem
  aprovação.
  Negativas: profissional **sem** a marca recebe `sem_permissao` e nada é gravado;
  administrador recebe `sem_permissao` ao aprovar; aprovar a versão antiga depois de
  editar devolve `conflito`; segunda aprovação da mesma pessoa devolve `conflito` sem
  duplicar carimbo; mesma chave com digest diferente devolve `conflito_idempotencia`;
  AAD de outra tabela é recusado; sessão encerrada e concessão revogada perdem o acesso;
  MAC falso é recusado antes de qualquer leitura; identidade Auth sem perfil fica
  auditada sem criar usuário; depois de desmarcar, a aprovação é recusada e o carimbo
  antigo permanece.
  Antes do grant, o script exige que `anon`, `authenticated` e `service_role` não
  alcancem os wrappers nem as tabelas, que os owners não sejam membros de nada, que o
  owner do plano não enxergue `nome_cifrado` nem a anamnese, e que nenhum dos dois possa
  gravar `perfil`, `estado` ou `email_cifrado` da concessão.

## 4. Servidor

- [x] 4.1 Composição interna do plano de crise, sem rota nem privilégio de banco.
  **Evidência:** `netlify/functions/_shared/plano-crise-nativo.ts`,
  `compor-plano-crise-nativo.ts`, `executor-plano-crise-nativo.ts` e
  `entrada-plano-crise-nativa.ts`, no mesmo desenho da fatia de saúde: atestado assinado
  no servidor, revalidação de identidade antes e depois da RPC, teto de corpo, prazo e
  cancelamento.
- [x] 4.2 Composição interna da marca de habilitação, administrador-only também no
  servidor (defesa em profundidade, não substituto da checagem no banco).
  **Evidência:** `netlify/functions/_shared/habilitacao-crise-nativa.ts`,
  `compor-habilitacao-crise-nativo.ts`, `executor-habilitacao-crise-nativo.ts` e
  `entrada-habilitacao-crise-nativa.ts`. O e-mail da concessão é decifrado no servidor,
  nunca no navegador.
- [x] 4.3 Rotas atrás de flag desligada por padrão.
  **Evidência:** `netlify/functions/plano-crise.ts` e
  `netlify/functions/habilitacao-plano-crise.ts`, ambas exigindo
  `FFCM_PLANO_CRISE_ATIVO === 'true'`.
- [x] 4.4 Prova de integração com PostgreSQL descartável.
  **Prova:** `sh scripts/testar-plano-crise-integrada-local.sh` — 1 teste, passando
  (`netlify/functions/_shared/plano-crise-postgres-local.test.ts`). Cobre leitura vazia,
  gravação com cifra e AAD fechando ponta a ponta, recusa de aprovação sem a marca,
  recusa de gravação da marca por profissional, listagem da equipe com e-mail decifrado,
  gravação da marca por administrador, aprovação bem-sucedida, nova versão sem aprovação
  e sessão encerrada perdendo o acesso.

## 5. Tela

- [x] 5.1 Seção da ficha com os quatro conteúdos do requisito e os dois avisos
  obrigatórios sempre visíveis.
  **Evidência:** `web/plano-crise.ts` e `web/servico-plano-crise-http.ts`. Os avisos são
  constantes da tela, não campos do plano.
- [x] 5.2 Tela de administração da marca.
  **Evidência:** `web/habilitacao-plano-crise.ts` e
  `web/servico-habilitacao-plano-crise-http.ts`. A caixa fica desabilitada para quem não
  pode ser marcado, com a razão escrita ao lado; desmarcar continua disponível.
- [x] 5.3 Provas de tela.
  **Prova:** `pnpm exec vitest run web/plano-crise.test.ts` — 4 testes, passando. Prendem
  os dois avisos obrigatórios, a aprovação usando a versão lida, a recusa por falta de
  habilitação **sem** derrubar a ficha, o aviso de que editar exige nova aprovação e a
  marca só oferecida a profissional com acesso ativo.
- [ ] 5.4 Fiação em `web/main.ts`.
  **Pendente por limite de escopo:** este trabalho não edita `web/main.ts`,
  `web/index.html` nem `web/styles.css` para não conflitar com as demais frentes em
  andamento. Os trechos exatos a colar estão no resumo da entrega.
  **Consequência:** a seção e a tela existem e são testadas, mas ainda não aparecem na
  navegação.

## 6. Verificação

- [x] 6.1 `pnpm run verificar:rapido`.
  **Resultado:** lint passa. O typecheck falha **apenas** em
  `netlify/functions/_shared/solicitacao-titular-nativa.ts` e
  `compor-solicitacao-titular-nativa.ts`, arquivos de outra frente em andamento, não
  tocados aqui.
  **Prova de que a falha não é desta fatia:** `pnpm run typecheck:proxy` lista exatamente
  esses dois arquivos e nenhum dos arquivos desta entrega; `pnpm run typecheck:web` passa
  limpo.
- [ ] 6.2 Revisão independente de dois eixos sobre o diff da fatia.
  **Pendente.**

## 7. Ativação

- [ ] 7.1 Aplicar as quatro migrations no projeto de teste e ligar
  `FFCM_PLANO_CRISE_ATIVO`.
  **Pendente:** exige autorização explícita para operação remota; não executada.
- [ ] 7.2 Registrar na habilitação quem aprova, com a Edilaine, antes do primeiro plano
  real.
  **Pendente:** enquanto ninguém estiver marcado, nenhum plano pode ser aprovado — por
  desenho.
