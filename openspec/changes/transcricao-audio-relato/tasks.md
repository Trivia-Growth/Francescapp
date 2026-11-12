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
  **Bloqueio operacional:** o arquivo está sob edição simultânea de outras frentes; a
  coordenação pediu para não editá-lo. O trecho exato foi entregue no resumo final, junto do
  CSS sugerido. O componente foi desenhado para ser montado pela fatia de diário
  (FR-008/012), que está em andamento em paralelo.
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

- [ ] 6.1 Prazo de 30 dias do áudio abandonado: a coluna `expira_em` é gravada e há índice
  parcial para a varredura, mas **não existe rotina que apague e avise**. O requisito pede
  "prazo de 30 dias com aviso"; hoje só o prazo está registrado. Precisa de uma tarefa
  agendada, que não existe na plataforma ainda.
- [ ] 6.2 Estado `falha` da exclusão não é alcançável nesta fatia. Ver `design.md`, seção
  "Estado `falha` da exclusão". O que o requisito exige de fato — não apresentar
  indisponibilidade como descarte concluído — está coberto por `pendente`, provado no SQL e
  no teste de tela.
- [ ] 6.3 Revisão de audiência antes de publicar pertence à fatia de diário. Ver
  `design.md`, seção "Audiência: o que ficou para o diário".
