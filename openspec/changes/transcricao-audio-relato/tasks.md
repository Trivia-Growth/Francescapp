# Tarefas — transcrição de áudio (FR-010)

## 1. Domínio e contrato

- [x] 1.1 Modelar o ciclo do áudio: transcrição automática, texto revisado, confirmação da
  revisão e estado da exclusão como campos distintos.
  **Evidência:** `packages/contracts/src/transcricao.ts` — `transcricaoSchema`,
  `estadoExclusaoAudioSchema`, e os tetos `AUDIO_BYTES_MAXIMO` (300 KB),
  `AUDIO_BYTES_POR_PARTE` (18 KiB) e `AUDIO_SEGUNDOS_MAXIMO` (300), com o cálculo que liga
  um ao outro registrado no próprio arquivo.
  **Decisão:** `duracaoMaximaEfetiva` faz a configuração do banco poder BAIXAR o teto,
  nunca subir — valor ausente ou fora de faixa cai no padrão, jamais em "sem limite".
- [x] 1.2 Partir e juntar o áudio em partes cifráveis.
  **Evidência:** `partirAudio` / `juntarAudio` em `transcricao.ts`; recusam áudio vazio,
  acima do teto e base64 malformado.
- [x] 1.3 Registrar o AAD da nova tabela, com `parte` na ligação.
  **Evidência:** `metadadosAadAudioTranscricaoSchema` em `packages/contracts/src/rpc.ts` e
  o ramo correspondente em `supabase/functions/_shared/cifra-autenticada.ts`, que exige
  `parte >= 1` para o áudio e `parte = 0` para texto.
  **Prova:** `npx vitest run netlify/functions/_shared/transcricao-nativa.test.ts` — o caso
  "cifra áudio em partes ligadas" confirma que uma parte não abre na posição de outra.
- [x] 1.4 Contrato HTTP isolado, sem tocar o `rotas.ts` compartilhado.
  **Evidência:** `packages/contracts/src/transcricao-http.ts`.
  **Decisão:** `ouvir` devolve o áudio embutido na resposta, não uma URL de arquivo. Um
  endereço de mídia atravessaria a autorização da aplicação e sobreviveria à exclusão.

## 2. Banco

- [x] 2.1 Tabela com ciclo de vida protegido.
  **Evidência:** `supabase/migrations/20261119120000_audio_transcricao_privado.sql` — RLS
  ligada, `revoke all` dos quatro papéis, CHECKs ligando revisão↔texto revisado e
  exclusão↔ausência do áudio, e trigger que recusa DELETE, alteração de coluna imutável,
  substituição ou ressurreição do áudio, reescrita da revisão e reversão da exclusão.
  **Decisão registrada no arquivo:** diferente das outras fatias, esta tabela é mutável em
  colunas nomeadas. Uma tabela imutável não representaria "exclusão pendente" sem inventar
  uma versão por tentativa de apagar.
- [x] 2.2 Operação privada com atestado, trava, idempotência e auditoria obrigatória.
  **Evidência:** `supabase/migrations/20261119130000_audio_transcricao_operacoes_privadas.sql`,
  owner dedicado `ffcmapp_audio_transcricao_owner`, UPDATE só nas seis colunas do ciclo de
  vida e sem DELETE.
- [x] 2.3 Grant do wrapper para `authenticated`, com asserções defensivas.
  **Evidência:** `supabase/migrations/20261119150000_grant_audio_transcricao_teste.sql`
  (`WRAPPER_INESPERADO` / `ACL_INICIAL_INESPERADA`, `SET ROLE` antes do grant).
- [x] 2.4 Provas positivas e negativas de autorização.
  **Prova:** `sh scripts/testar-audio-transcricao-local.sh` — saída 0.
  Positivas: registro guarda áudio e transcrição e nasce com `exclusao_estado` em
  `nao_solicitada`; prazo de 30 dias gravado; reenvio da mesma chave devolve o mesmo
  registro com `repeticao=true` sem criar segundo áudio; leitura devolve as duas partes;
  confirmação da revisão grava o instante e deixa a exclusão `pendente`; exclusão confirma,
  zera o áudio e preserva transcrição, texto revisado e autoria; repetir a exclusão é
  seguro; ler depois da exclusão devolve áudio nulo com o estado explicando.
  Negativas: nenhum acesso de `anon`/`authenticated`/`service_role` antes do grant; owner
  isolado (não vê `nome_cifrado`, sem DELETE, sem membros, sem UPDATE em
  `transcricao_cifrada`/`duracao_segundos`/`paciente_id`); `anon`/`service_role` continuam
  sem execute depois do grant; mesma chave com digest diferente devolve
  `conflito_idempotencia`; AAD de outro campo recusado; duração acima de 300 s, mime
  desconhecido e áudio vazio recusados; excluir antes da revisão devolve `conflito` e não
  apaga nada; segunda revisão com chave nova devolve `conflito`; **outro profissional
  vinculado ao mesmo caso recebe `nao_encontrado` ao tentar ouvir áudio alheio**; sessão
  encerrada, perfil `familia` e concessão revogada devolvem `sem_permissao`; MAC forjado
  recusado com `insufficient_privilege`; identidade Auth sem perfil é auditada por
  `ator_auth_id` sem criar usuário; trigger recusa DELETE, ressurreição do áudio, alteração
  de coluna imutável e reversão da exclusão; falha ao gravar auditoria desfaz tudo.
- [x] 2.5 Catálogo de opções na configuração do sistema.
  **Evidência:** `supabase/migrations/20261119110000_configuracao_sistema_opcoes.sql` —
  coluna `opcoes`, CHECK de formato por função IMMUTABLE, CHECK que exige o valor corrente
  dentro da lista, e `operacao.configuracao_sistema_operacao_privada` devolvendo e validando
  `opcoes`. O owner da operação continua sem UPDATE nessa coluna.
  **Prova:** `sh scripts/testar-configuracao-opcoes-local.sh` — saída 0. Cobre: listagem
  entrega as opções; chave sem catálogo continua livre; valor do catálogo aceito; valor fora
  do catálogo recusado com `ENTRADA_INVALIDA`; escrita direta fora do catálogo e opção em
  branco recusadas pelo CHECK; leitor do servidor não enxerga a coluna.
  **Achado corrigido durante a prova:** função usada em CHECK roda como quem escreve, então
  faltava `grant execute` ao owner da operação — sem isso QUALQUER update na tabela falhava
  com "permission denied for function". O teste pegou; o grant está na migration.
- [x] 2.6 Leitor de segredo de integração no Vault.
  **Evidência:** `supabase/migrations/20261119100000_vault_segredo_integracao.sql` — papéis
  `ffcmapp_segredo_integracao_owner`/`_executor`, lista de referências autorizadas restrita
  ao prefixo `ffcmapp.integracao.`, e a função falhando fechada
  (`CONFIGURACAO_INTEGRACAO_AUSENTE`) quando o segredo não existe.
  **Limitação:** não provisiona segredo. Ver item 5.1.

## 3. Camada HTTP

- [x] 3.1 Composição, entrada, executor, adaptador do provedor e função.
  **Evidência:** `netlify/functions/_shared/{transcricao-nativa,compor-transcricao-nativa,`
  `entrada-transcricao-nativa,executor-transcricao-nativo,openrouter-transcricao,`
  `segredo-integracao}.ts` e `netlify/functions/transcricao.ts`, com teto de corpo derivado
  do teto de áudio, limite de 75 s na composição e flag `FFCM_TRANSCRICAO_ATIVA` desligada.
  **Prova:** `npx vitest run netlify/functions/_shared/transcricao-nativa.test.ts` — 8 testes
  passando. Cobre: fala e áudio não aparecem legíveis no transporte; partes ligadas à própria
  posição; AAD e atestado corretos; **falha do provedor não persiste nada** e não chega a
  executar a RPC; duração acima do teto configurado barrada antes de chamar o provedor;
  **autorização negada impede o áudio de sair para o provedor externo**; `conflito`,
  `conflito_idempotencia`, `nao_encontrado` e `sem_permissao` mapeados sem confundir conflito
  com permissão; leitura recompõe o áudio na ordem; queda de sessão depois de iniciar a
  mutação vira `pendencia_externa`.
- [x] 3.2 Modelo e teto de duração lidos do banco.
  **Evidência:** `textoConfigurado` e `numeroConfigurado` em
  `netlify/functions/_shared/configuracao-servidor.ts`; `textoConfigurado` recebe a lista
  fechada e cai no padrão se o valor estiver fora dela.
- [x] 3.3 Serviço do navegador isolado.
  **Evidência:** `web/servico-transcricao-http.ts`, no padrão de `servico-saude-http.ts`
  (revalidação de identidade antes e depois, teto de resposta, `redirect: 'error'`).

## 4. Tela

- [x] 4.1 Componente de gravação, revisão e descarte.
  **Evidência:** `web/transcricao-audio.ts` — estados de gravando/transcrevendo/erro em
  `role=status` com `aria-live`, contador de duração, teto de gravação, e o campo de texto
  sempre editável.
  **Prova:** `npx vitest run web/transcricao-audio.test.ts` — 6 testes passando. Cobre:
  formatos do contrato; **sem microfone a alternativa por texto segue utilizável**;
  **permissão negada é informada sem bloquear o relato escrito**; **a transcrição automática
  não é tratada como revisão** (nada é confirmado nem publicado antes do botão); confirmação
  dispara a exclusão e informa o descarte concluído; **exclusão pendente não é apresentada
  como descarte concluído** e a regularização fica ao alcance.
  **Achado corrigido durante a prova:** `Blob.arrayBuffer()` não existe em todo navegador
  que grava áudio (nem no jsdom); `bytesDoBlob` passou a cair no `FileReader`. A reprodução
  do original também ficou tolerante: se o navegador não criar a mídia, a revisão continua
  sem o áudio ao lado, em vez de perder o rascunho.
  **Decisão:** o rascunho é ACRESCENTADO ao que já estava escrito, não substitui — apagar
  texto humano por causa de uma transcrição seria perder trabalho.
- [x] 4.2 Escolha do modelo na tela de administração.
  **Evidência:** `web/configuracao-sistema.ts` — chave de texto com `opcoes` vira `select`;
  valor fora da lista atual aparece marcado como "(fora da lista atual)" em vez de sumir.
- [ ] 4.3 Ligar o componente em `web/main.ts` / na tela de diário.
  **Código conferido em 18/11/2026:** `web/main.ts`, seção Diário da ficha da equipe,
  já monta `montarDiario` com `montarTranscricaoAudio`, paciente atual e
  `criarServicoTranscricaoHttp(identidadeAtual)`. O Diário recebe somente texto revisado;
  publicação e audiência continuam ações próprias. Família permanece por texto: autorização
  de áudio familiar não integra este recorte. Bloqueio antigo por edição simultânea removido.
  **Correção de ciclo de vida:** sair da montagem encerra o gravador e tracks; callback
  `stop` e leitura assíncrona do Blob conferem montagem ativa antes de iniciar envio.
  Respostas tardias não invalidam acesso de uma montagem seguinte.
  **Evidência pendente:** dois testes de regressão escritos em `web/transcricao-audio.test.ts`
  (saída durante gravação e durante leitura do arquivo), **não executados** por instrução
  do solicitante. Navegador e leitor de tela igualmente adiados nesta passagem;
  hooks existentes de commit/push são preservados.
  **Suposição UX conservadora:** somente uma gravação pendente por montagem. Nova gravação
  fica bloqueada até revisão humana e descarte confirmado do original atual, incluindo
  regularização de pendência/falha. Texto humano continua editável e preservado; essa trava
  não publica nem exige publicação. Botão de revisão volta utilizável na gravação seguinte.
  Terceiro teste escrito, **não executado**, cobre preservação do original/revisão,
  bloqueio durante descarte pendente e liberação após regularização, sem apagar texto humano.
  4.3 permanece aberta até validação; existência da fiação não comprova aceite.
- [ ] 4.4 Verificação visual real no navegador e passagem de leitor de tela.
  **Pendente:** depende de 4.3 e da ativação da flag.

## 5. Ativação

- [ ] 5.1 Cadastrar a chave do provedor no Supabase Vault.
  **Pendente — ação do solicitante, não do código.** A referência já está cadastrada; falta o
  VALOR. No Supabase Vault, criar um segredo com o nome exato:

      ffcmapp.integracao.openrouter

  e o token do OpenRouter como valor. **Não envie a chave por chat nem a coloque em
  arquivo do repositório.** Enquanto o segredo não existir, a leitura falha fechada e a
  transcrição fica indisponível — nunca "ligada sem credencial".
- [ ] 5.2 Conceder o executor do segredo ao papel de runtime (passo operacional fora de
  migration, igual ao do cofre):

      grant ffcmapp_segredo_integracao_executor to <FFCM_VAULT_DB_USER> with inherit false, set true;

  **Pendente.**
- [ ] 5.3 Aplicar as seis migrations no projeto de teste e ligar `ffcm.transcricao.ativa`.
  **Pendente:** exige autorização explícita para operação remota; não executada.
- [ ] 5.4 **A integração com o OpenRouter NÃO foi comprovada ponta a ponta.** Nenhuma
  chamada real ao provedor foi feita: não há chave cadastrada e não houve autorização para
  operação externa. O que está provado é a composição local com a porta injetada
  (`transcricao-nativa.test.ts`) — adaptador com `fetch` dublê, não o serviço real. O
  formato de resposta assumido é `{ "text": "..." }` do endpoint
  `POST /api/v1/audio/transcriptions`; se o provedor divergir disso, a transcrição falha
  fechada e nada é persistido, mas a correção será de código. Não marcar esta fatia como
  integrada antes de uma prova real.
- [ ] 5.5 Revisão independente de dois eixos sobre o diff da fatia.
  **Pendente.**

## 6. Limitações registradas

- [ ] 6.1 Prazo de 30 dias do áudio abandonado com aviso: rotina privada, scheduler e
  aviso administrativo implementados; falta comprovar o aviso na jornada autenticada
  publicada. **Expurgo desligado** preserva a trava não destrutiva desta execução.

  **Decidido em 17/11/2026: o expurgo roda em `pg_cron`, no próprio Supabase.** É o recurso
  nativo que a diretriz de 01/11/2026 manda preferir, roda perto do dado e mantém o expurgo
  na mesma transação auditada das demais operações. Descartadas: varredura na leitura (o
  áudio só sumiria quando alguém abrisse a tela, deixando dado pessoal além do prazo) e
  rotina externa agendada (acrescenta serviço, segredo e mais uma superfície a autorizar).

  Evidência: job criado em migração, teste cobrindo áudio vencido apagado com aviso
  registrado, áudio dentro do prazo preservado, e falha de expurgo virando pendência
  explícita em vez de descarte presumido.
**Aviso administrativo preparado em 18/11/2026 (P2):** migration aditiva
`20261125070000_audio_expurgo_aviso_admin.sql` expõe somente flag ativa e último recibo
(data, falhas, apagados), sem identificadores de áudio/pessoa, conteúdo, causa bruta ou segredo.
Consulta própria `api.consultar_expurgo_audio`, com atestado vinculado à operação,
autorização Admin/sessão e auditoria; nenhuma permissão para executar limpeza. Reusa owner
e controles Admin existentes. BFF existente atende GET `?operacao=expurgo`; tela Integrações
mostra pendência operacional, última execução, ausência de recibo e flag desligada honestamente.
Leitura não ativa flag nem executa job. `scripts/testar-audio-expurgo-aviso-admin-local.sh`:
exit 0 / `AUDIO_EXPURGO_AVISO_ADMIN_OK`, PostgreSQL descartável, Admin positivo,
Profissional/Família e Admin revogado negativos, recibo direto e RPC sem atestado negados. UI: 2 testes;
BFF/entrada: 11 testes focais, todos aprovados. Lint/typecheck em `verificar:rapido` conferidos.
Revisão SPEC P2 corrigida: migration preserva membership preexistente (concedente/opções)
e CREATE preexistente no schema; remove somente concessões temporárias próprias.
Prova focal com migrador NOSUPERUSER, sem SET/CREATE prévios e com SET/CREATE prévios,
compara snapshot integral de pg_auth_members e ACL do schema antes/depois: exit 0 /
`AUDIO_EXPURGO_AVISO_ADMIN_OK`. Sem TypeScript alterado nesta correção; quick não repetido.
Revisão independente dos dois eixos concluída; P2 de grants resolvido e runner SQL
reexecutado pelo revisor, saída 0. Migration `25070000` aplicada e registrada no remoto,
owner esperado, EXECUTE `authenticated` e negativas `anon`/`service_role` conferidos.
Isso não prova autorização funcional por identidade. **6.1 permanece aberta:** aviso
na jornada autenticada publicada e ativação funcional ainda pendentes.

- [ ] 6.2 Estado `falha` da exclusão não é alcançável nesta fatia. Ver `design.md`, seção
  "Estado `falha` da exclusão". O que o requisito exige de fato — não apresentar
  indisponibilidade como descarte concluído — está coberto por `pendente`, provado no SQL e
  no teste de tela.
- [ ] 6.3 Revisão de audiência antes de publicar pertence à fatia de diário. Ver
  `design.md`, seção "Audiência: o que ficou para o diário".


## Retomada 18/11/2026 — expurgo preparado

`20261125030000_audio_expurgo_privado.sql` adiciona job privado sob owner sem login/bypass,
RLS por vencimento e revisão ausente, marcador `exclusao_por_expiracao` não gravável pelo owner
da API e função sem EXECUTE para papéis da aplicação. Lote de até 500 com `SKIP LOCKED`,
sem conteúdo clínico em auditoria. Apaga somente áudio abandonado vencido; conserva textos,
autor e histórico. Auditoria `audio_expirado` registra aviso; falha desfaz descarte daquela
linha e recibo em `operacao.audio_expurgo_execucao` registra contagem de pendências.
`20261125030100_audio_expurgo_cron.sql` instala `pg_cron` e agenda a cada 15 minutos.

Prova `scripts/testar-audio-expurgo-local.sh`: exit 0 / `AUDIO_EXPURGO_OK`, incluindo matriz
existente de autorização da transcrição; vencido excluído com aviso, vigente preservado,
papéis da aplicação sem execução/marcador, falha de auditoria preserva áudio e registra falha.
Teste local comprova função/RLS. Na retomada, `25030000`/`25030100` aplicadas no remoto,
job único/ativo confirmado e execução de 18/11/2026 10:30 UTC `succeeded`, com flag false
e saída antes de tocar áudios. Prova scheduler real, sem descarte; aviso publicado pendente.

Cadastrar em **Configuração do sistema / Segredos das integrações** o nome
`ffcmapp.integracao.openrouter`. Depois ligar `ffcm.transcricao.ativa`, escolher
`ffcm.transcricao.modelo` e teto `ffcm.transcricao.duracao_maxima_segundos` na configuração.
Flag e leitor Vault já estavam funcionais. Nenhuma requisição paga/externa realizada.
**Suposição conservadora:** aviso nesta passagem é registro auditado e recibo operacional;
notificação externa não foi implementada. Backlog acima de 500 será processado em lotes
subsequentes; execução pode acrescentar até intervalo do job ao prazo nominal de 30 dias.

### Correções após revisão independente — 18/11/2026

- Usuário operacional que aplica migration/agendará cron recebe EXECUTE explícito somente em
  `operacao.expurgar_audio_abandonado()`, mais USAGE em `operacao`. Grant sobrevive à retirada
  da membership temporária no owner. Papéis da aplicação continuam sem acesso.
- Scheduler valida privilégios de quem agenda antes de registrar job; se as migrations forem
  executadas por usuários diferentes, ausência de privilégio bloqueia instalação.
- **SUPOSIÇÃO CONSERVADORA / TRAVA NÃO DESTRUTIVA:** cron pode ser instalado nesta noite,
  mas `ffcm.transcricao.expurgo_ativo` nasce **false** no catálogo editável. Função retorna
  antes de tocar áudios enquanto desligada. Somente Administrador deve habilitar explicitamente
  após conferir dados e autorizar limpeza; instalação não descarta dados existentes.
- Owner restrito lê somente chave/valor dessa configuração por policy específica.
- `scripts/testar-audio-expurgo-local.sh`: exit 0 / AUDIO_EXPURGO_OK. Usuário real da migration
  é rebaixado para NOSUPERUSER antes de executar função, sem membership owner. Flag false
  preserva fictício vencido; true expurga somente vencido; vigente permanece; falha de auditoria
  reverte descarte e registra pendência; perfis app seguem negados.
- pg_cron real/scheduler remoto não exercitados. Sem limpeza remota, segredo real, commit ou push.

### Catálogo publicado OpenRouter — 18/11/2026

- Nova migration aditiva `20261125060000_configuracao_transcricao_catalogo.sql`: catálogo
  limitado aos IDs publicados `openai/whisper-large-v3` e `openai/whisper-large-v3-turbo`.
  Não altera migration histórica, modelo escolhido, flags ou segredos. Preflight `FOR UPDATE`
  exige catálogo original e modelo já publicado; erro estável orienta correção explícita,
  em vez de substituir silenciosamente escolha ou aceitar catálogo divergente.
- **SUPOSIÇÃO conservadora:** os três aliases `groq/*` semeados não são tratados como válidos
  por estarem ausentes do catálogo público. Não houve inferência de equivalência/fornecedor.
  Fontes primárias e limites constam em design, seção de 18/11/2026.
- `rtk proxy sh scripts/testar-configuracao-transcricao-catalogo-local.sh`: exit 0,
  `CATALOGO_TRANSCRICAO_OK`. Teste executa SQL real da nova migration contra PostgreSQL
  descartável: positivo para ambos modelos publicados; negativo para valor legado e catálogo
  divergente, conferindo snapshot integral do catálogo antes/depois e preservação de estado.
- Sem TypeScript alterado; nenhum gate amplo repetido. Revisão independente e aplicação
  ficam com coordenação. Nenhuma credencial/áudio/custo/consulta paga/operação remota;
  preparo documental e teste SQL não comprovam API real.

## 7. Correção (auditoria visual 11/2026): autorização antes do provedor externo

Achado: a borda HTTP (`compor-transcricao-nativa.ts`, `autorizar`) só conferia sessão Auth
e usuário ativo antes de `transcrever`; perfil, concessão, sessão aberta e paciente só eram
decididos em `api.transcricao_operacao_privada`, DEPOIS da chamada ao OpenRouter. Família,
concessão revogada, usuário inativo, sessão encerrada ou Auth sem perfil mandavam o áudio ao
provedor; o banco negava e nada persistia. Viola o cenário "Autorização antes do envio ao
provedor" da spec. O teste `transcricao-nativa.test.ts` dublava a porta `autorizar` e não
via isso.

- [x] 7.1 Pré-autorização no banco, sem escrita além da auditoria do negado.
  **Evidência:** `supabase/migrations/20261128250000_audio_transcricao_pre_autorizacao.sql` —
  `api.autorizar_transcricao_audio(uuid, uuid)` sob `ffcmapp_audio_transcricao_owner`, com a
  mesma fonte da operação privada desde a DF-023 (`identidade.contexto_acesso_vigente` +
  policy `audio_transcricao_paciente`). Privilégios temporários só quando ausentes, devolvidos
  ao estado anterior.
  **Prova:** `sh scripts/testar-audio-pre-autorizacao-local.sh` → saída 0 (PostgreSQL 17
  descartável, fixture da DF-023). Positivos: administrador, case manager e profissional nos
  métodos interno e Google; administrador legado Google. Negativos (`sem_permissao` +
  auditoria): família nos dois métodos, método trocado no JWT, paciente inexistente, usuário
  inativo, concessão revogada, sessão encerrada, Auth sem perfil (auditado pelo id Auth, sem
  criar usuário); sem JWT → exceção; `anon`/`service_role`/`public` sem EXECUTE; nada gravado
  em `audio_transcricao`/`requisicao`.
  **Contraprova:** trocar `autorizado:=found` por `autorizado:=true` → saída 3,
  `PRE_PACIENTE_INEXISTENTE`. Revertido.
- [x] 7.2 A borda chama a pré-autorização em `registrar`, antes de `transcrever`.
  **Evidência:** `compor-transcricao-nativa.ts` (`preAutorizar`); resposta validada por
  schema estrito; erro ou resposta estranha → `servico_indisponivel`, sem provedor.
  **Prova:** `compor-transcricao-nativa.test.ts` (composição real, só cliente/cofre/config/
  executor dublês): negado não chama provedor nem executor; falha/resposta estranha não chama
  provedor; autorizado chama o provedor depois da pré-autorização. O teste antigo foi
  renomeado para dizer o que prova (só a ordem dentro de `operarTranscricaoNativa`).
  **Contraprova:** voltar a porta para `async () => inicial` → os 3 casos falham. Revertido.
- [x] 7.3 Recorte por caso (`cadastro.acesso_paciente`) no áudio.
  **Decisão do dono, 27/11/2026, opção (a):** profissional exige acesso vigente ao caso;
  administrador alcança todos os casos (decisão de 24/11/2026). A operação de áudio não
  conferia acesso ao caso (anamnese confere; diário não confere para interno).
  **Evidência:** `supabase/migrations/20261128260000_audio_transcricao_recorte_caso.sql` —
  policy RESTRITIVA em `cadastro.paciente` para o owner da fatia, somada à permissiva
  `audio_transcricao_paciente`. Vale para a pré-autorização, a operação privada
  (registrar/ouvir/revisar/excluir) e as policies de `cadastro.audio_transcricao`.
  **Prova:** `sh scripts/testar-audio-pre-autorizacao-local.sh` → saída 0. Pré-autorização:
  case manager e profissional (interno e Google) com acesso ao caso A passam; no caso B, sem
  acesso, são negados; administrador passa nos dois. Operação privada: case manager grava no
  caso A, é negado no caso B; depois da revogação não ouve o próprio áudio e a
  pré-autorização nega; família negada (matriz 7.1); `anon` sem EXECUTE nas duas funções.
  **Contraprova:** trocar `ap.revogada_em is null` por `true` → saída 3,
  `OP_REVOGADO_OUVE_AUDIO` (autor revogado ainda ouvia o áudio). Revertido.
  **Efeito registrado:** quem perde o caso também não exclui o próprio áudio pendente; o
  expurgo de 30 dias (6.1) continua cobrindo o áudio abandonado.
- [ ] 7.4 Tela (`web/main.ts:1136`): oferecer o gravador só quando
  `/api/transcricao/disponibilidade` declarar disponível. Não é controle de segurança.
  **Com o worker da casca React**, ao portar a seção de áudio.

Limites: a cadeia completa sem superusuário
(`scripts/testar-cadeia-migrations-sem-superusuario-local.sh`) para ANTES desta migration, em
`20261124160000_segredos_integracoes_cofre_gerenciado.sql` (papel
`ffcmapp_segredos_integracoes_owner` inexistente) — defeito anterior, fora deste escopo.
Migration não aplicada em ambiente remoto (exige autorização).
