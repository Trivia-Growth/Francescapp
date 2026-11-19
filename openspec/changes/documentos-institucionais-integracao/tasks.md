# Tasks

## 1. Decisões para abertura da implementação

- [x] 1.1 Confirmar com solicitante os bloqueadores materiais do design para FR-029 a FR-031 e registrar decisões verificáveis nesta mudança; evidência: respostas e impactos reconciliados entre proposta, spec e design.

  **Resolvido em 12/11/2026, parcialmente.** Três bloqueadores do design caíram por decisão explícita do solicitante:

  - *Identificador e raiz do Drive*: vira configuração em banco, editável na tela de administração (`ffcm.documentos.drive_pasta_raiz`), pela diretriz de 11/11/2026 — "tudo que é variável deve ser preenchida no front e guardada no banco de dados". Em branco, o envio fica indisponível; nunca há substituição silenciosa do local de guarda.
  - *Formato de credencial / identidade Google*: conta de serviço, JSON no Supabase Vault sob a referência `ffcmapp.integracao.google_drive`, cadastrada pelo próprio solicitante. Nenhuma credencial entra no repositório.
  - *Lista fechada de categorias*: pela mesma diretriz, deixa de ser enum no código e vira `ffcm.documentos.categorias`, semeada com os tipos que a própria User Story 8 enumera ("laudos, exames, relatórios, imagens e termos") e editável na administração.

  O **endereço** do Google permanece fixo no código, de propósito, pelo mesmo critério já aplicado na frente de transcrição: endereço editável pela tela viraria alavanca para apontar a credencial do Vault a um servidor escolhido por quem editou.

  **Continua pendente de decisão**, e por isso não foi implementado: a política de revogação de audiência individual, os limites de tipo de arquivo além do teto de tamanho, e o tratamento de mudanças feitas diretamente no Drive (ver 1.3).

- [ ] 1.2 Implementar FR-029 a FR-031 com cenários de acesso autorizado, outro paciente/perfil, audiência, revogação, acesso direto e falha do Drive.

  **Banco** (faixa `20261120100000`–`20261120130000`, **nenhuma aplicada remotamente**):

  - `…100000_vault_segredo_integracao_json.sql` — estende o leitor de segredo de `20261119100000` com a coluna `formato` (`token` | `json`) e cadastra a referência do Drive. Sem isto a credencial do Google seria recusada pelo teto de 512 caracteres do leitor de token, e a guarda falharia fechada para sempre sem erro visível. O teto do formato `token` fica intacto: a frente de transcrição não foi afrouxada.
  - `…110000_documento_caso_privado.sql` — `cadastro.documento_caso` (identidade) e `cadastro.documento_caso_versao` (versões imutáveis, gatilho recusando UPDATE/DELETE). Semeia as três chaves de configuração, com o serviço **desligado** e a pasta raiz **em branco**.
  - `…120000_documento_caso_operacoes_privadas.sql` — `api.documento_operacao_privada` (ler/gravar) sob o owner `ffcmapp_documento_owner`, no padrão da fatia de saúde: atestado HMAC de 30s verificado no banco, revalidação de usuário/concessão/sessão sob `for share`, idempotência no ledger `operacao.requisicao`, auditoria obrigatória nos caminhos `permitido` e `negado`.
  - `…130000_grant_documento_caso_teste.sql` — grant a `authenticated` com as guardas `WRAPPER_INESPERADO` e `ACL_INICIAL_INESPERADA`.

  **Decisões de modelagem que valem revisão:**

  - *O que fica em claro*: `categoria`, `origem`, `data_documento`, `audiencia`, `estado`, autor e versão. FR-029 exige busca por esses eixos; mantê-los dentro do envelope cifrado jogaria a filtragem para o processo do servidor, que precisaria baixar e decifrar tudo para descartar o que a pessoa não pode ver — o vazamento que a audiência existe para evitar. **Custo assumido**: `origem` é texto livre e pode conter o nome de uma instituição.
  - *O `drive_file_id` é cifrado*, junto do nome visível e da descrição. Ele é uma capacidade: quem o tiver e tenha acesso à pasta abre o arquivo sem passar por esta autorização.
  - *Audiência reusa o vocabulário do diário* (`equipe` | `equipe_e_familia`), não um terceiro vocabulário para a mesma pergunta de negócio.
  - *Indisponível é estado, não ausência de linha.* O anexo que sumiu do Drive continua listado e marcado, com orientação de regularização — cenário 2 da User Story 8. `removido` sai da relação mas permanece na trilha.
  - *FR-031 pelo lado forte*: o adaptador **nunca** chama `permissions.create`. O arquivo nasce dentro da pasta compartilhada e herda as permissões dela. Não existe caminho de código que torne um anexo público, nem por engano de parâmetro.

  **Evidência executada:**

  - `sh scripts/testar-documento-caso-local.sh` → `NOTICE: DOCUMENTOS_OK` (PostgreSQL descartável, `supabase/tests/documento_caso_operacoes_local.sql`). Positivos: anexo novo em versão 1 com a relação já consistente e o envelope cifrado presente; replay com mesma chave e mesmo digest idempotente sem duplicar; versão 2 marcando indisponível com as duas versões preservadas. Negativos: mesma chave com digest diferente recusada como `conflito_idempotencia`; versão defasada recusada como `conflito`; documento de outro paciente recusado como `sem_permissao` **com auditoria de negativa gravada** e sem deixar nada no caso alheio; AAD apontando para outro paciente recusado; categoria e audiência vazias recusadas uma a uma; MAC falso recusado; identidade Auth sem perfil auditada em `ator_auth_id` sem criar usuário; concessão revogada e sessão encerrada fechando a porta na hora; `anon`/`authenticated`/`service_role` sem alcance antes do grant e `anon`/`service_role` sem alcance depois; owner sem login, sem superusuário, sem bypass de RLS, sem membros e sem enxergar `cadastro.paciente.nome_cifrado`; UPDATE e DELETE recusados nas versões; `removido` saindo da relação sem apagar histórico; e as três chaves de configuração nascendo com o serviço desligado e a pasta em branco.
  - `pnpm exec vitest run netlify/functions/_shared/documento-caso-nativo.test.ts` → 7 testes passando, cobrindo o que o teste SQL não alcança: o arquivo sobe ao Drive antes do registro; o `drive_file_id` do cliente é descartado em favor do que o Drive devolve; a recusa do banco **desfaz** o envio para não deixar arquivo de paciente sem vínculo; a falha da própria limpeza não transforma a recusa em outra coisa; gravação só de metadado não toca o Drive; sem guarda configurada o envio é recusado sem escolher outro local; e a recusa por falta de classificação ou audiência acontece **antes** de qualquer byte chegar ao Drive.
  - `pnpm run verificar:rapido` verde (lint e typecheck nos quatro projetos).

  **Servidor e tela**: `netlify/functions/documentos.ts` atrás de `DOCUMENTOS_ATIVOS = false` fixo **e** da variável `FFCM_DOCUMENTOS_ATIVOS`; `_shared/google-drive.ts`, `documento-caso-nativo.ts`, `compor-documento-caso-nativo.ts`, `entrada-documento-caso-nativa.ts`, `executor-documento-caso-nativo.ts`; contratos `documento-caso.ts` e `documento-caso-http.ts`; `web/documentos-caso.ts` e `web/servico-documentos-http.ts`.

- [ ] 1.3 Decisões e provas que **faltam** — registradas como pendência, não como conclusão.

  **A integração com o Google Drive NÃO foi comprovada ponta a ponta.** Nenhuma chamada real ao Google foi feita nesta passagem. O que está provado é a composição local com a porta injetada; testes com adapter fictício não comprovam integração externa, e a rota nasce desligada por constante no código além da variável de ambiente.

  Para o solicitante executar antes de qualquer ativação:

  1. Cadastrar no Supabase Vault um segredo com o nome exato **`ffcmapp.integracao.google_drive`**, contendo o JSON da conta de serviço. **Não enviar a credencial por chat nem colocá-la em arquivo do repositório** — a referência já está cadastrada, falta só o valor.
  2. Preencher `ffcm.documentos.drive_pasta_raiz` na tela de configuração com o identificador da pasta do Drive compartilhado institucional, e compartilhar essa pasta com o `client_email` da conta de serviço.
  3. O `grant ffcmapp_segredo_integracao_executor to <FFCM_VAULT_DB_USER> with inherit false, set true;` de `20261119100000` continua valendo e não precisa ser repetido.

  Pendências técnicas conhecidas, não silenciadas:

  - ~~**Leitura pela família não foi ligada.**~~ **Resolvido em 17/11/2026** (decisão do
    solicitante — "precisa estar marcado como publico; isso pode ser alterado pelo admin em
    qualquer arquivo"; quem altera é quem já grava o documento — administrador ou profissional,
    mesma autorização de escrita já existente, confirmado explicitamente ao solicitante antes de
    implementar). `supabase/migrations/20261124120000_documento_caso_familia_privada.sql`
    redefine `api.documento_operacao_privada` (`create or replace function`, mesma função já
    existente) com uma trilha familiar **só para `api.ler_documentos`** — mesma prova de
    `api.consultar_paciente_familiar_privado` (`cadastro.acesso_paciente` vigente,
    `identidade.sessao` método `familia`, `amr=password`). Família nunca grava. Nenhuma coluna
    nova: a leitura filtra pela MESMA `audiencia` que o colaborador já preenche
    (`equipe_e_familia` vs `equipe`) — "marcar como público" é só escolher a opção que já existe
    no formulário de envio. Trocar a audiência de um documento já existente usa o caminho de
    gravação de metadado que já existia (nova versão com o mesmo `drive_file_id`, sem reenviar
    ao Drive) — nenhum mecanismo novo precisou ser criado para isso. `web/documentos-caso.ts`
    ganhou parâmetro `ehFamilia` (oculta o formulário de envio, mostra só a lista já filtrada
    pelo banco); `web/servico-documentos-http.ts` teve o mesmo gate de fluxo corrigido que já
    tinha sido achado em `servico-regras-atendimento-http.ts`/`servico-diario-http.ts` (aceita
    `modo==='familiar'`); `web/main.ts` ganhou a seção `'documentos'` na ficha da família.
    Evidência: `supabase/tests/documento_caso_familia_local.sql` via
    `scripts/testar-documento-caso-familia-local.sh` — positivo (família lê só o documento
    público), 4 negativos (sem vínculo, tenta gravar, acesso revogado, sessão de equipe
    disfarçada), 1 regressão (colaborador continua vendo os dois) e 1 positivo adicional
    (colaborador troca a audiência do documento interno para público e a família passa a
    enxergá-lo na próxima leitura, sem recarregar nada) — passou (exit 0) de primeira, aplicando
    direto a lição já registrada em plano-cuidado-objetivos/design.md sobre a policy `_lock` de
    `cadastro.acesso_paciente` (`using` precisa espelhar a policy de select, nunca `using(false)`
    — `false` bloquearia o próprio `for share` da trilha familiar, não só a escrita).
    `pnpm run test:web` (405/405) e `pnpm run test:proxy` (397 passed/15 skipped) sem regressão —
    nenhum contrato mudou (a `audiencia` já era exposta), então nenhuma fixture precisou de
    ajuste, diferente do que aconteceu em plano-cuidado-objetivos. `pnpm run verificar:rapido`
    limpo. **Sem ativação**: `ffcm.documentos.ativo`/`DOCUMENTOS_ATIVOS` não foram tocados,
    nenhuma migration aplicada remotamente, nenhuma flag alterada. A integração real com o
    Drive, a prova de a família de fato alcançar o `drive_file_id` cifrado devolvido (sem
    vazamento, decifrado pelo mesmo caminho do colaborador) e a questão de permissão da PASTA do
    Drive em si para a conta Google da família (fora de escopo: depende da ativação da jornada
    de login familiar com Google real, não decidida agora) continuam como as pendências já
    registradas nesta tarefa — nenhuma delas foi resolvida por este trabalho, nem pretendia ser.
    **Revisão independente desta adição ainda não feita.**
  - **Decidido em 17/11/2026 — FR-031: sinalizar, nunca alterar.** O produto consulta as permissões do Drive, compara com a audiência do caso e levanta pendência para a coordenação quando divergem. NÃO remove compartilhamento por conta própria: revogar automaticamente pode cortar alguém que a Francescato autorizou por fora, por um motivo que o sistema desconhece. Evidência: teste cobrindo divergência detectada virando pendência, e nenhuma escrita de permissão no Drive.
  - **Arquivo órfão residual.** A ordem envio→registro tenta desfazer o envio quando o banco recusa; se a remoção também falhar, o arquivo fica na pasta sem vínculo. Não há varredura de reconciliação Drive↔banco — só o estado `indisponivel` para o caminho inverso, e ele hoje é marcado à mão.
  - **FR-031 "sinalizar compartilhamentos incompatíveis" não foi implementado.** Está garantido que o produto não cria compartilhamento; detectar um criado por fora exige consultar permissões no Drive real e uma decisão sobre o que fazer ao encontrá-lo.
  - **FR-032 e FR-033 (exportação) ficaram fora**, como o recorte desta change já previa. São fatia própria: dependem de ler conteúdo cifrado de todas as outras fatias e de registrar destinatário, propósito, entrega e conferência.
  - Sem prova de concorrência, de migrador sem superusuário, nem de integração HTTP real; o teste roda com Auth e Vault fictícios.
  - A tela ainda não está ligada à navegação (`web/main.ts` pertence à frente de integração central nesta sessão); o trecho de fiação foi entregue à coordenação.
  - Revisão independente de dois eixos não foi feita nesta passagem.

Nenhuma operação remota foi executada: nenhuma migration aplicada, nenhum deploy, nenhum commit, nenhuma alteração no Drive.


## Retomada 18/11/2026 — pronta para cadastrar chave, sem prova externa

- [ ] 1.4 Entregar os bytes do documento pela interface, com autorização vigente
  de caso/audiência, alvo específico auditado, negativa de outro paciente/perfil,
  revogação durante I/O e falha Google sem sucesso falso. **Implementação escrita
  nesta retomada:** GET de arquivo, consulta privada antes/depois do Drive, stream
  limitado ao teto existente, download binário com headers restritivos e botão na
  tela. Migration nova `20261125090000_documento_entrega_privada.sql` preparada,
  não aplicada. Testes helper/HTTP/adapter/UI/SQL escritos; runner
  `scripts/testar-documento-entrega-local.sh`. **Validação adiada por pedido do
  solicitante:** nenhum desses testes executado; revisão e integração real
  pendentes. Não usar as provas antigas de metadados como prova de entrega.

Removido interruptor constante `DOCUMENTOS_ATIVOS=false`: `ffcm.documentos.ativo` controla
rota com padrão conservador `false`; categorias e raiz seguem catálogo editável no banco.
Credencial continua nome canônico `ffcmapp.integracao.google_drive` (JSON conta de serviço),
a cadastrar em **Configuração do sistema / Segredos das integrações**. Preencher
`ffcm.documentos.drive_pasta_raiz` com ID da pasta institucional e ligar `ffcm.documentos.ativo`.

FR-031 consulta `/permissions` paginada, somente GET, após banco autorizar os documentos da
resposta. `anyone` diverge das duas audiências; domínio inteiro diverge de `equipe`.
Ausência de mapeamento verificável Google-destinatário/vínculo ativo não vira aprovação:
permissões nominais ou domínio da audiência familiar levantam revisão da coordenação.
Falha Google vira pendência de conferência indisponível; metadados autorizados continuam
legíveis sem segredo/raiz, envio continua falhando fechado. Nenhum caminho escreve ACL.
Pendências aparecem na lista da equipe, sem expor destinatários ou credencial à família.

**Suposição conservadora:** nenhuma ACL nominal pode ser declarada compatível só pelo tipo
`user`/`group`; checagem exata de destinatários exige autoridade de identidade ainda ausente.
Por isso há revisão necessária, não falso selo de conformidade. Pendência é reavaliada na
consulta; não foi criado workflow persistente independente de coordenação.

Provas: `google-drive.test.ts` 5 testes novos passaram (público, domínio, nominal,
paginação, erro); `scripts/testar-documento-caso-familia-local.sh` exit 0 inclui matriz
SQL de documentos e família. Nenhuma chamada Google real ou ativação foi feita.
Revisão independente e limite/conferência do Drive compartilhado continuam pendentes.


### Revisão de fonte da entrega de bytes — continuação de 18/11

Base fixa `abac1a6f2c7c3d68df52bfa4b8edf28e3c066b4a`, diff delimitado à entrega
(`ef12071` e ajuste de tipos `8c9df6d`), conferido no HEAD `6715f6a` e no patch local.
Dois revisores Sol, padrões/segurança e especificação, encontraram P1 na composição:
`{operacao:'ler',...comando}` recebia comando real `operacao:'entregar'` e sobrescrevia
a leitura antes de chegar ao banco. Corrigido por projeção explícita dos campos.
Releituras independentes afetadas sem P1/P2 de fonte restante na entrega.

`documento-entrega-composicao.test.ts` acrescenta três provas escritas atravessando
handler, composição e operação reais, com Auth/cofre/Drive/RPC fictícios: entrega e
ordem consulta/Drive/consulta; negativa antes do I/O sem buscar bytes; negativa após
I/O sem emitir bytes/attachment. Expectativa antiga de query recusada alinhada à
tabela HTTP vigente. Nenhum teste/check foi executado nesta revisão; gates de
RLS/autorização, Google real e ativação continuam pendentes.


## Correções adversariais de 19/11/2026 — PAD-01 e ESP-01/02/03

Tarefa 1.2 reaberta: implementação anterior não comprovava autorização antes do Drive,
organização por paciente nem edição de metadados existentes. Correções de fonte escritas:

- Prévia assinada `api.documento_preautorizar_privada`, autorizando **gravação e paciente**,
  com auditoria obrigatória antes de qualquer busca/criação de pasta ou upload. Sem persistir
  conteúdo/versão ou sucesso antecipado. RPC final reautoriza e audita atomicamente;
  profissional exige vínculo vigente também em leitura e escrita. Administrador conserva
  alçada existente. Ambos métodos DF-023 e legado são preservados pelo hash da função.
- Pasta por paciente com chave opaca HMAC e `appProperties`; arquivo novo usa identificador
  opaco como título. Nome visível permanece cifrado no banco. Consulta/reutilização da pasta
  só ocorre depois da prévia. Nenhum conteúdo/pasta preexistente é movido ou excluído.
  Reserva DB única por paciente+raiz precede criação com ID pré-gerado Google. Recovery/409
  conferem ID, MIME, parent, marcador e lixeira; nunca há adoção por nome/listagem.
- UI da equipe edita categoria/origem/data/audiência/estado do documento existente, preserva
  conteúdo e histórico, usa versão esperada e mesma chave/comando no replay. Incerteza oferece
  conferir resultado e repetir mesma alteração, sem reenviar arquivo. Família não recebe editor.
- Digest de upload é calculado antes do ID Drive e inclui hash dos bytes; replay já confirmado
  pela prévia não reenvia. Resposta final perdida não dispara exclusão de arquivo potencialmente
  vinculado. Nenhuma exclusão compensatória automática permanece, mesmo após recusa confirmada.
  Metadados sem arquivo consultam versão autorizada e preservam ID Drive; nova criação sem arquivo
  e troca de capacidade por payload são recusadas antes da RPC de gravação.

**Provas escritas, NÃO EXECUTADAS:** `documento-caso-nativo.test.ts` (ordem prévia/auditoria,
zero uploads nas negativas, auditoria indisponível, resposta final perdida),
`google-drive.test.ts` (reserva, pasta nova/reutilizada, recovery de timeout/409,
parent/marcador/MIME/lixeira divergentes, sem mover/apagar),
`web/documentos-caso-edicao.test.ts` (edição sem arquivo, família, replay, perda de acesso,
chave HTTP) e `supabase/tests/documentos_preautorizacao_local.sql` (matriz profissional A/B,
família, revogação, leitura/escrita/prévia, auditoria, replay, grants diretos).

Migrations preparadas `20261125180000_documentos_preautorizacao.sql` e
`20261125185000_documentos_pastas.sql`, não aplicadas.
Validações, lint/typecheck, SQL, browser e operações externas **adiados expressamente** pelo
solicitante. Nenhum gate executado nesta passagem; não ativar nem marcar 1.2 concluída.
Revisão independente de fonte ainda necessária. Testes existentes antigos não comprovam
estado novo. Provas reais Google/ACL e concorrência distribuída continuam pendentes.

**Limites:** provas reais Google/ACL, concorrência SQL com processos simultâneos e cadeia de
migrations continuam não executadas. Unicidade por paciente+raiz é imposta pela PK e ID de pasta
reservado antes de criar no Google; candidatos concorrentes reutilizam mesmo ID. Upload cujo
registro falhe pode ficar pendente no Drive: sem exclusão/reconciliação automática e sem mover
conteúdo preexistente. Retry após commit confirmado pela prévia não envia arquivo novamente.

Correções da revisão independente de fonte (19/11, ainda sem execução): a prévia e a reserva
revalidam expiração e sessão depois dos locks/INSERTs/auditoria, imediatamente antes de retornar
sucesso; expiração desfaz a reserva na transação. Prova preparada em
`supabase/tests/documentos_preautorizacao_concorrencia_local.sql` e runner local correspondente:
duas conexões, bloqueio posterior ao gate inicial e espera além do TTL fictício, sem autorização
nem reserva confirmada. O editor de metadados reutiliza o catálogo administrado; categoria histórica
retirada permanece opção explicitamente preservada. Prova UI ajustada para catálogo/histórico.


**Releitura cruzada de fonte em 19/11/2026:** base `cc10aad`, diff desta
continuação incluindo novos arquivos; revisor Sol de outra frente. Eixos padrões
e especificação conferidos sem aceitar a própria implementação. Correções e
limites no [relatório complementar](../../../docs/processo/entrega-complementar-19-11-2026.md).
Nenhum P1/P2 confirmado restante no recorte relido; não é aceite em runtime.
Nenhum teste manual/SQL/build/Deno/browser executado; hooks Git preservados.
Provas positivas e negativas permanecem obrigatórias antes da ativação.
