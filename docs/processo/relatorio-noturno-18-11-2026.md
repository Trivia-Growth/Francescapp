# Relatório noturno — 18/11/2026

## Resultado observável

**O objetivo publicado não foi alcançado.** Código, provas locais e oito migrations remotas foram entregues;
não ficou comprovado que o solicitante consegue autenticar, cadastrar uma chave e
ativar uma integração na aplicação publicada. O PR permanece draft.

Branch `fatia7/turno-execucao-cuidado`; revisão-base
`fa1af9330aafa543b3c6b8cb040ed2c11c9b1667`.
PR: https://github.com/Trivia-Growth/Francescapp/pull/18.
Planejamento existente preservado; nova mudança OpenSpec
`cadastro-segredos-integracoes` criada antes de sua implementação. A continuação
FR-014 recebeu mudança focada `conversao-diario-tarefa-atomica`, também registrada
antes do código, sem refazer os cinco pacotes anteriores. Frentes de
implementação e revisão executadas em Sol. Nenhum segredo real foi cadastrado.

**Retomada por instrução do solicitante:** os impedimentos remotos não suspendem
as features locais. Foram acrescentados contratos de turno, preparação local de
abertura/consulta/barreira, download de documentos pelo app e orientação de
consentimento incompleto da Agenda; depois, objetivos no contexto, escrita de
Tarefas por capacidade autorizada e conversão atômica Diário/Tarefa.
**Validações desta retomada foram adiadas por pedido do solicitante.** Cinco
migrations novas estão somente no repositório: `20261125080000`,
`20261125090000`, `20261125100000`, `20261125110000` e `20261125120000`; não fazem parte das oito
versões remotas já aplicadas. Nenhuma dessas entregas é declarada ativada.

## Entregue, com evidência

1. **Configuração:** navegação administrativa já estava fiada na base; conferida e
   registrada na tarefa 3.2. Teste integrado ampliado para escrita Administrador e
   negativas Profissional/Família, passando pelo handler, executor e PostgreSQL.
   Runner corrigido para aplicar a migration de opções omitida na fixture. Isso
   corrige a prova local, **não demonstra causa nem conserto do 503 remoto**.
   `testar-configuracao-sistema-local.sh` e
   `testar-configuracao-sistema-integrada-local.sh`: saída 0.
2. **Segredos:** tela Administração > Credenciais das integrações, BFF, contrato e
   migration. Entrada somente de escrita; resposta/tela/auditoria expõem metadados,
   nunca o valor. Substituição preserva versão anterior e cria nova versão canônica
   no Vault. Autorização Administrador no servidor e banco; negativos para
   Profissional, Família, sessão revogada e acesso direto. Limite de corpo/prazo e
   limpeza imediata do campo testados. SQL local passou; testes do servidor 5/5,
   entrada 3/3 e tela 1/1. O Vault local é adapter fictício: extensão real não provada.
   Complemento: componente real e CSS real renderizados em Chrome headless isolado,
   1366×900 e 390×844, sem overflow horizontal. Tab mostrou foco de 3px; Enter enviou
   formulário fictício e limpou todos os campos. Estados carregar/erro/sucesso
   conferidos. [Desktop](evidencias-noturnas-18-11-2026/desktop-normal-foco.png),
   [celular](evidencias-noturnas-18-11-2026/mobile-normal-foco.png) e
   [medidas](evidencias-noturnas-18-11-2026/relatorio.json). Serviço fictício, sem
   navegação autenticada, HTTP ou Vault reais; nenhum perfil existente foi usado.
3. **Seis fatias:** fiações de configuração, contexto/rede, saúde e crise conferidas
   em `web/main.ts`; diário e ficha já conectados na base. SQL local de contexto/rede,
   diário, saúde e crise reexecutado com saída 0. Não equivale a ativação remota.
   Crise recebeu regra DF-021: responsável atual do caso + habilitação explícita +
   acesso ativo; perfil isolado não aprova. RLS, replay após troca de responsável e
   INSERT direto cobertos. Preservados carimbos e privilégios anteriores do migrador;
   revisor independente reexecutou a prova com migrador sem superuser. Tela 4/4.
   Revisão complementar completa de saúde achou dois P2, corrigidos e revisados por
   outro Sol: confirmação após resposta perdida agora repete a mesma chave de
   idempotência; migration histórica preserva memberships/CREATE/concedentes em
   instalações limpas. Teste tela+serviço HTTP com fetch fictício 1/1; revisor SQL
   reexecutou matriz de saúde e instalação NOSUPERUSER com/sem privilégios anteriores,
   saída 0. Migration histórica remota não será reaplicada nem acesso restaurado por
   suposição. Base dessa revisão: `df326cb96f67281e43cdffe868b6444ea26ddf45`, caminhos
   `*saude*`, `rpc.ts` e `cifra-autenticada.ts` apenas no impacto da fatia.
   Diário e saúde renderizados em 1366×900/390×844, sem overflow, com controles
   rotulados e foco de 3px; origem/natureza/hipótese permanecem visíveis em saúde.
   Estados carregar/vazio/erro conferidos. [Diário desktop](evidencias-noturnas-18-11-2026/diario-desktop-normal-foco.png),
   [diário celular](evidencias-noturnas-18-11-2026/diario-mobile-normal-foco.png),
   [saúde desktop](evidencias-noturnas-18-11-2026/saude-desktop-metadados.png),
   [saúde celular](evidencias-noturnas-18-11-2026/saude-mobile-metadados.png) e
   [medidas](evidencias-noturnas-18-11-2026/cuidado-visual.json). Serviços fictícios;
   sem VoiceOver, jornada integrada, autenticação familiar ou salvamento remoto.
4. **Anamnese:** leitura, escrita e histórico exigem vínculo ativo. **Matriz inteira
   nova**, posterior à migration, reexecutada: positivas/negativas, outro paciente,
   outro perfil, acesso direto, revogação de vínculo/sessão/concessão, replay e seis
   corridas reais com `dblink`, nas duas ordens de lock. Scripts
   `testar-anamnese-vinculo-caso-local.sh` e `testar-anamnese-integrada-local.sh`:
   saída 0. Evidência antiga não foi reutilizada como aprovação da regra nova.
5. **Drive:** rota passa a obedecer flag no banco; segredo canônico e pasta raiz
   configurável preservados. FR-031 consulta permissões por GET, inclusive paginação,
   e sinaliza divergência, falha ou necessidade de revisão. Não escreve permissões.
   Testes focais do adapter passaram; nenhuma chamada Google real.
6. **OpenRouter/áudio:** caminho existente lê chave canônica do Vault e flag no banco.
   Expurgo privado de áudio abandonado vencido após 30 dias preparado em `pg_cron`,
   com lote limitado, auditoria atômica e flag inicialmente desligada. Falha na
   auditoria preserva áudio. SQL provou elegibilidade, flag desligada/ligada, rollback
   e privilégios do usuário que agenda, sem superuser. Aviso agregado de falhas
   acrescentado à tela Credenciais das integrações, com RPC/BFF somente Administrador:
   flag, data e contagens, sem áudio, pessoa, causa bruta ou execução de limpeza.
   SQL local: Admin positivo; Profissional/Família, Admin revogado, acesso direto e
   ausência de atestado negados. UI 2/2 e BFF/entrada 11/11. Revisão independente
   corrigiu preservação de grants; prova NOSUPERUSER com/sem privilégios anteriores
   passou também em execução independente. Migration `25070000` aplicada no remoto;
   aviso ainda não comprovado na jornada publicada, mantendo 6.1 aberta.
   Compatibilidade documental do adapter confirmada na [documentação oficial STT](https://openrouter.ai/docs/guides/overview/multimodal/stt):
   multipart e resposta `text`. Consulta pública, sem chave/áudio, confirmou dois IDs
   Whisper no [catálogo STT](https://openrouter.ai/api/v1/models?output_modalities=transcription).
   Três aliases `groq/*` semeados não foram encontrados; não se presumiu validade.
   Migration `20261125060000` limita opções aos dois IDs publicados. Preflight aborta
   diante de escolha legada ou catálogo divergente; não troca modelo/flag/metadados.
   SQL focal e revisão independente passaram, incluindo preservação integral após erro.
7. **Agenda:** migration promovida de draft, executores isolados e script de grant
   operacional estreito preparados. Flag/domínio editáveis; client ID/secret vêm do
   Vault. Evento único em agenda individual; escrita só confirma após reconsulta,
   recusa recorrência e evento cancelado; resultado incerto mantém reserva. Matriz
   SQL de vínculo, perfis, outro paciente, acesso direto, revogação e seis corridas
   passou, assim como state e privilégios. Teste de escrita 7/7 e derivação de chaves
   1/1. OAuth, ACL e CRUD Google reais permanecem não comprovados.

`pnpm run verificar:ativacao` executado novamente após novo contrato/RPC do aviso:
**saída 0**, 1.369 testes passaram, 30 pulados pelo
gate genérico; lint, typechecks, Deno e build passaram. Pulos não são aprovação:
as matrizes SQL relevantes acima foram executadas separadamente. Auth e Vault dos
testes locais usam fixtures fictícias. `pnpm run verificar:rapido` final e pre-push:
saída 0. `git diff --check` da base ao estado final: saída 0.

Revisão independente nos dois eixos, padrões/segurança e aderência à spec, incluindo
arquivos novos. Achados de permissão do cron e confirmação de evento cancelado foram
corrigidos e tiveram provas afetadas reexecutadas. Revisões focais posteriores de
HKDF/composição/grants Agenda e preservação de privilégios da crise sem P1/P2.
Isso não certifica integração externa nem substitui roteiro publicado.

### Features locais acrescentadas após a retomada

- **Download Drive pelo app:** GET autenticado
  `/api/pacientes/:paciente_id/documentos/:documento_id/arquivo` e botão
  “Baixar arquivo”. O servidor resolve o arquivo após a consulta privada de
  caso/audiência e consulta novamente após buscar os bytes. Stream limitado ao
  teto existente de 8 MiB; entrega binária `attachment`, nome saneado, `no-store`
  e `nosniff`. Não emite URL Drive nem altera ACL. Migration `25090000` prepara
  leitura direcionada/auditoria sem ampliar a listagem antiga. Testes helper,
  HTTP, adapter, tela e SQL escritos; runner `testar-documento-entrega-local.sh`.
  **Nenhum executado nesta retomada; revisão e prova real pendentes.**
- **Agenda:** orientação persistente para `?agenda=autorizar-novamente`, sem
  confundir consentimento incompleto com estado atual da conexão. Link informativo
  explica impacto de alterar acesso sem recomendar revogação. Novo teste
  `web/agenda-consentimento.test.ts` escrito, não executado.
- **Configuração:** removido piso indevido de um caractere no campo de texto
  livre. Administrador pode limpar valor permitido pelo contrato, inclusive raiz
  do Drive; regra específica continua no banco. Teste novo escrito, não executado.
  Não é diagnóstico nem correção comprovada do 503 da sessão válida.
- **Contexto:** objetivos do plano agora chegam ao editor pelo serviço autorizado
  do mesmo caso, com paginação sob demanda, carregamento/erro/retry/vazio e
  preservação dos vínculos anteriores. Cinco provas escritas, não executadas.
- **Tarefas:** removido bloqueio fixo da escrita na interface. Capability por caso
  depende de autorização no banco e das três flags existentes; não confere
  permissão à gravação. A consulta interna de autorização retorna vazio sem ler
  ou decifrar tarefas. Migration `25110000` prepara essa modalidade na RPC
  existente, preservando assinatura/grants/listagem. Ciclo de reserva/idempotência
  permanece, com descarte por caso/sessão. Provas HTTP/cliente/UI/SQL/NOSUPER
  escritas, não executadas. Sem migration, falha fechada; nenhuma flag foi ligada.
- **Diário/Tarefa, FR-014:** substituído o gancho sequencial não ligado por
  composição única GET/POST
  `/api/pacientes/:paciente_id/diario/:origem_id/conversao-tarefa`, formulário e
  fiação em `web/main.ts`. Comando humano exige motivo, data da atenção,
  encaminhamento, responsável, prazo, prioridade e área configurada. Servidor
  prepara cifra/atestação das duas filhas e chama somente a RPC agregada.
  Migration `25120000` compõe tarefa e evolução interna na mesma transação,
  confere origem/versão após lock do paciente e mantém ledger operacional único
  por origem. Consulta/replay exigem autorização vigente antes de devolver recibo.
  Interface cerca ou reconhece barreira anterior antes de liberar repetição;
  resposta perdida/abort não são considerados rollback. Mudança da origem bloqueia
  envio antigo sem descartar silenciosamente campos. Nenhum texto clínico é
  persistido no navegador. Negativa de perfil tem auditador estreito sem cofre;
  não concede capacidade de operação. **Código preparado; provas novas escritas,
  não executadas.** Flag `ffcm.diario.conversao_tarefa_ativa=false`; migration,
  revisão independente, matriz de autorização/RLS e jornada real pendentes.
  Evidência de implementação: servidor/contratos `b56e90c`, interface `df01629`,
  cinco arquivos `conversao-diario-*` de testes do servidor/contrato e três de UI/
  cliente/elegibilidade. Modelo de ameaças focado na própria change distingue
  controles existentes, novos e provas ainda pendentes.
  SQL/migration em `346d94c`: cinco arquivos
  `supabase/tests/conversao_diario_tarefa_*_local.sql` e runner
  `scripts/testar-conversao-diario-tarefa-atomica-local.sh`, para banco descartável;
  não executar fixtures contra o remoto. Matrizes incluem rollback das filhas,
  negativas, executor/migrador NOSUPER, preservação de privilégios e concorrência.
  Sintaxe/runtime SQL, interleavings/locks, NOSUPER efetivo e integração Auth/Vault
  ainda não têm resultados; provas escritas não os demonstram.
- **Turno, grupo 1:** contratos estritos de turno, escala/substituição/cobertura,
  sinal vital, prescrição/administração e ocorrência; identidade/relógio não vêm
  do corpo. Exports, rotas e teste de contrato escritos, não executados.
- **Turno, grupo 2:** migrations `25080000`/`25100000`, abertura/consulta própria,
  reserva/idempotência, unicidade de turno aberto, RLS, auditoria e configuração
  administrada preparados. Flag `ffcm.turno.ativo=false`; parâmetros nascem vazios.
  O encerramento exige referência à síntese e permanece recusado até grupo 3.
  Recusa de perfil no servidor precede o cofre e usa caminho restrito de auditoria
  negativa, sem capacidade de operação. Matrizes SQL, concorrência `dblink`,
  instalação NOSUPER/ACL e testes HTTP/composição escritos, **não executados**.

Os resultados verdes registrados acima pertencem à versão anterior a essas
alterações. Não cobrem download, contratos/execução de turno, aviso da Agenda,
campo de configuração, objetivos do contexto, capacidade de escrita de Tarefas ou
conversão Diário/Tarefa. Testes positivos/negativos de autorização e RLS continuam obrigatórios
antes da ativação; adiamento não significa aprovação nem dispensa.

Nenhum gate foi disparado manualmente nesta retomada. O push preserva o hook
existente de lint/typecheck; ele identificou duas inconsistências de tipagem,
corrigidas na união metadados/arquivo e na fixture UUID de turno. Esse hook não
executa os testes de comportamento ou as matrizes SQL listadas acima.

Na continuação de fiação de objetivos/disponibilidade, o typecheck do hook passou;
ajustada a formatação de um teste novo apontada pelo lint. Nenhum teste de
comportamento ou script SQL foi disparado nessa correção.

Na continuação FR-014, o hook apontou dois tipos: literal `formato: 1` de fixture e
captura local das dependências inicializadas dentro do `map`. Corrigidos em
`e8da0f6`; novo push passou lint (734 arquivos) e todos os projetos de typecheck.
Não executou teste, build, SQL ou validação manual. Servidor/interface enviados
para a branch; isso não publica nem aprova a conversão.

## Lista exata do que cadastrar e onde

**Após resolver o acesso e conferir a publicação**, entrar como Administrador em
**Administração > Credenciais das integrações** (`#administracao/integracoes`):

| Nome exato | Conteúdo que o solicitante cadastrará |
| --- | --- |
| `ffcmapp.integracao.google_drive` | JSON da conta de serviço do Google Drive |
| `ffcmapp.integracao.openrouter` | Chave da API OpenRouter |
| `ffcmapp.integracao.google_calendar_client_id` | Client ID OAuth do Google Calendar |
| `ffcmapp.integracao.google_calendar_client_secret` | Client secret OAuth do Google Calendar |

As duas últimas substituem o cadastro operacional por variáveis
`FFCM_AGENDA_GOOGLE_CLIENT_ID` / `FFCM_AGENDA_GOOGLE_CLIENT_SECRET`.
Nenhuma chave técnica adicional de state é necessária.

Drive pressupõe pasta raiz em **Drive compartilhado institucional**, conforme
DF-005, acessível à conta de serviço já configurada na origem. O JSON precisa dos
campos `client_email` e `private_key`; cadastrar somente pela interface acima.
Nenhum acesso foi concedido ou alterado nesta execução. O app não configura ACL:
FR-031 somente sinaliza divergência ou revisão necessária.

Em **Administração > Configuração** (`#administracao/configuracao`), editar:

- `ffcm.documentos.drive_pasta_raiz`: ID da pasta raiz do Drive;
- `ffcm.documentos.ativo`: ligar/desligar Drive;
- `ffcm.transcricao.ativa`: ligar/desligar transcrição OpenRouter; modelo e duração
  continuam editáveis no catálogo existente;
- `ffcm.agenda_google.dominio_workspace`: domínio Workspace permitido;
- `ffcm.agenda_google.ativa`: ligar/desligar Agenda;
- `ffcm.transcricao.expurgo_ativo`: permanece **false**. Só ativar após conferir
  elegibilidade e autorizar o descarte de áudios abandonados com mais de 30 dias.

Turno é preparação opcional, sem ativação nesta entrega. Quando seus gates forem
cumpridos, a mesma Administração terá `ffcm.turno.ativo`,
`ffcm.turno.duracao_padrao_minutos`, `ffcm.turno.tolerancia_atraso_minutos` e
`ffcm.turno.tratamento_nao_encerrado`. Não há nova variável de ambiente: a flag
nasce `false`, os três parâmetros nascem em branco e abertura falha fechada até
configuração explícita. Não ligar antes de concluir os gates do turno.

Escrita de Tarefas usa as chaves existentes `ffcm.tarefas.ativas`,
`ffcm.tarefas.escrita_ativa` e `ffcm.tarefas.barreira_ativa`. Após seus gates, as
três devem permitir a operação para que a interface ofereça escrita ao profissional
com vínculo vigente. Nenhuma dessas flags foi alterada nesta retomada.

Conversão Diário/Tarefa acrescenta `ffcm.diario.conversao_tarefa_ativa`, desligada
na migration local `25120000`. Após seus gates e aplicação da migration, editar
essa flag em **Administração > Configuração**; depende também de
`ffcm.diario.ativo` e das três flags de Tarefas. Não exige nova credencial.

Contrato OAuth da Agenda implementado no código: callback HTTPS
`https://ffcmapp.netlify.app/api/agenda/google/callback` para essa origem publicada;
se a origem do ambiente mudar, usar a mesma origem seguida de
`/api/agenda/google/callback`. O cliente OAuth informado deve aceitar esse retorno.
Escopos solicitados: `openid`, `email` e
`https://www.googleapis.com/auth/calendar.events`, com consentimento individual e
acesso offline. O domínio Workspace configurado precisa coincidir com o claim
`hd` verificado pelo Google; a conta deve ser a mesma identidade Google da sessão.
Não há suporte a conta pessoal sem domínio Workspace nesse contrato. Conferência
do cliente no provedor e consentimento real continuam pendentes; nenhuma credencial
foi criada ou inspecionada nesta execução.

Cadastrar segredo não comprova validade ou conexão.
Não cadastrar nenhum valor em SQL, terminal, PR ou relatório.

## Bloqueios reais

- `SUPABASE_ACCESS_TOKEN` ausente no processo, confirmado sem imprimir valores.
  Consulta CLI não terminou em 60 s. Nenhum token do chat foi copiado para comando,
  arquivo ou log.
- Na primeira passagem, sessão existente do navegador permitiu **consulta somente leitura** ao Supabase:
  última migration `20261124140000`, catálogo com 43 chaves, nenhuma divergência no
  contrato verificado, owner `ffcmapp_configuracao_sistema_owner`, EXECUTE para
  `authenticated` e não para `anon`/`service_role`, saída com `opcoes`. Consulta salva
  em `scripts/diagnosticar-configuracao-remota.sql`. Não prova toda execução da RPC.
- Revalidação da CLI existente: `status --json` retornou `loggedIn: true` após
  `getCurrentUser()` aceito, com vínculo do site esperado. Isso prova autenticação
  básica; consulta finita ao histórico da função `configuracao-sistema` continuou
  retornando `Unauthorized`, sem eventos. Não estabelece token inválido nem a causa
  da negativa específica dos logs. Nenhum login ou token novo foi criado.
  Sem linha de falha com
  etapa/causa/request_id, **6.7 permanece aberta**. Não foi aplicado retry de pool
  nem correção especulativa de catálogo/grants.
  Na interface de logs, a opção histórica documentada é `Last day`. Na última
  retomada o Chrome voltou acessível, mas abrir esse menu foi recusado como
  `background_unavailable`; seleção semântica retornou `value_not_settable`.
  Nenhum resultado de histórico foi presumido, nem foi tomada a tela do solicitante.
  O guia versionado carregado pela skill `orca-computer-use`
  (`/Users/lucasazevedo/.agents/skills/orca-computer-use/SKILL.md`) determina:
  **“Never add --restore-window on your own.”** Abrir o menu exige primeiro plano;
  como o solicitante está indisponível, foi preservada essa fronteira e seguido
  o diagnóstico alternativo somente leitura.
- Aplicação publicada respondeu à entrada; retorno do login Google chegou a
  **HTTP 400** na raiz com parâmetro `fluxo`. Causa não estabelecida. Não foi
  presumido problema de cookie, nem apagados cookies ou revogados acessos.
- Revalidação sem sessão: raiz HTTP 200; GET de configuração HTTP 401
  `nao_autenticado`, com `request_id` público. Isso prova somente a negativa anônima.
- Na primeira passagem, controle do navegador foi recusado por foco e depois
  `screen_locked`. Chrome alternou disponibilidade nas retomadas; **a última
  permitiu leitura dos painéis e diagnóstico de metadados no SQL Editor**.
  Nenhuma ação de desbloqueio ou novo login foi executada.
- Netlify mostrava publicação automática bloqueada e main anterior publicada.
  Preview do PR foi construído, mas exige autenticação (HTTP 401 na verificação
  anônima). CI `verificar-ativacao` no PR draft foi SKIPPED; não conta como evidência.
- Na retomada, o painel Netlify informou esgotamento dos créditos disponíveis,
  uso de créditos operacionais e **production deploys pausados**. Não houve compra,
  upgrade nem alteração de limites. A configuração temporária de Production branch
  foi restaurada para `main` e conferida após recarregar o painel. O deploy anterior
  `76838b4` permanece publicado/LOCKED; previews não substituem o contexto necessário.
  [Evidência do painel](evidencias-noturnas-18-11-2026/netlify-creditos-pausados.png).
  Última leitura do painel confirmou novamente créditos esgotados, produção
  pausada e `76838b4` publicado/LOCKED; preview `20b1a2b` concluído não altera isso.

Diagnóstico complementar de 6.7, somente leitura, realizado após a retomada do
Chrome: nenhuma chave com carimbo nulo/infinito/ano fora de 1–9999 ou número acima
do limite finito JavaScript conferido. A wrapper tem owner esperado e restrito,
`SECURITY DEFINER`, `search_path` vazio e `row_security=on`; EXECUTE para
`authenticated`, não para `anon`/`service_role`. A operação interna é
`SECURITY INVOKER`, não concede EXECUTE a esses três papéis e tem `search_path`
vazio; seus atributos não devem ser comparados aos da wrapper como se fossem a
mesma fronteira. Consulta reproduzível no complemento de
`scripts/diagnosticar-configuracao-remota.sql`. A coluna adicional
`owner_configuracao_executa` foi preparada no script, mas ainda não consultada
remotamente; nenhum resultado foi presumido para esse grant interno.

Comparação local por Sol entre o publicado `76838b4` e `20b1a2b`: contrato,
entrada, composição e operação nativa de Configuração sem diferenças. O publicado
já aceita texto vazio e exige opções/autoria/data. **Não foi estabelecida causa
do 503**, nem foi provado envelope/projeção real, chamada com sessão válida ou
RLS funcional por essa consulta. Duas tentativas anteriores do diagnóstico
falharam por sintaxe na entrada do editor; nenhum dado foi modificado. Isso é
investigação operacional, não retomada das validações adiadas.

### Retomada remota da manhã

As oito migrations `20261125010000`, `20261125020000`, `20261125030000`,
`20261125030100`, `20261125040000`, `20261125050000`, `20261125060000` e `20261125070000` foram
aplicadas no projeto de teste. Cada uma executou o source exato dentro de `BEGIN`,
com registro da migration na mesma transação; cada confirmação JSON informou
`registrada: true`. Isso atualiza o bloqueio anterior de aplicação remota, sem
declarar integração ou ativação funcional comprovada.

- `25010000`: duas policies de vínculo da anamnese conferidas.
- `25020000`: cadastro administrativo de segredos instalado; nenhum valor cadastrado.
- `25030000`: flag de expurgo permanece `false`.
- `25030100`: job único de expurgo a cada 15 minutos; flag continua `false`.
- `25040000`: owner esperado e policy do responsável atual confirmados.
- `25050000`: wrapper privado, executor sem acesso direto ao Vault e flag Agenda
  `false` confirmados.
- `25060000`: catálogo publicado confirmado, sem troca do modelo escolhido.
- `25070000`: aviso administrativo instalado, owner esperado e EXECUTE para
  `authenticated`; `anon`/`service_role` negados. Exige autorização Admin na RPC.

Conferência final do registry: oito versões presentes. Job único e ativo;
execução de **18/11/2026 10:30 UTC** terminou `succeeded` com expurgo desligado.
Prova scheduler real/saída antecipada, sem descarte. Consulta estrutural
`scripts/diagnosticar-fronteiras-remotas.sql`: **16/16 wrappers e 26/26 tabelas**,
arrays de divergências vazios. Agenda usa ACL privada; não se afirmou RLS em todas
as tabelas. Esse diagnóstico não prova autorização funcional por identidade.

As oito flags de ficha/edição/contato, contexto, rede, diário, saúde e crise já
estavam `true`; não foram alteradas por SQL. O login técnico existente foi
conferido sem privilégios administrativos, sem herança e sem leitura direta do
Vault. Executores de configuração e segredos já estavam concedidos. O grant
restrito da Agenda foi aplicado: SET permitido, INHERIT negado, sem owner nem
leitura direta do Vault.

Uma promoção manual do preview `ddf2415` preservou o contexto de preview e trouxe
503 `configuracao_indisponivel` nas rotas administrativas, antes da autorização.
A publicação anterior `76838b4` foi restaurada, ainda LOCKED: raiz 200 e negativa
anônima de configuração novamente 401. Não confundir esse 503 de configuração
operacional com a falha 6.7 de sessão válida. Build com contexto correto bloqueado
pelos créditos da Netlify; nenhuma variável ou credencial foi copiada.

Login na raiz continua com
HTTP 400 reproduzido; causa não estabelecida. Sem linha de log do 503. Nenhum segredo
ou dado clínico foi lido, nenhum valor foi cadastrado. Autorização DF-022 permanece
vigente; aplicação das migrations não comprova as jornadas autenticadas.

Compatibilidade local adicional do SDK: 30 testes fictícios com SDK real passaram
nos modos padrão e `cookies.encode: 'tokens-only'`, cobrindo callback, admissão,
normalização sem tokens Google, nova requisição, renovação e isolamento/negativas.
Harness somente em `/tmp`, transporte mockado, sem rede externa. A opção é
**experimental e não foi ativada**; essa prova não estabelece causa nem correção do
HTTP 400.

Diagnóstico adicional sem credenciais: quatro GETs anônimos com Cookie inteiramente
fictício retornaram 200 com 0/8.192 bytes e 400 com corpo vazio com 16.384/32.768
bytes. Isso reproduz limite de cabeçalho no gateway, sem determinar o limiar exato.
Configurações do Chrome afetado informou oito cookies do site; nenhum nome, valor
ou tamanho agregado foi lido. **Não comprova a causa da sessão afetada**. Cookies
não foram apagados, sessões não foram revogadas e a opção experimental permanece
desativada.

Verificação OpenSpec estrita inicialmente encontrou ausência de delta specs em
`historico-de-saude` e `transcricao-audio-relato`. Os deltas foram derivados apenas
dos requisitos e planejamento já aprovados, preservando FR-004/FR-010 e fase
Inicial; ambas validações estritas passaram, saída 0. Isso valida os artefatos,
sem comprovar ativação. A mudança nova de cadastro também teve validação estrita
aprovada antes da implementação, conforme evidência do bloco 2.

## Gates das seis fatias

- Ficha: 1.8 e S-02/fechamento publicado ainda pendentes.
- Contexto/rede: fiação e SQL locais; navegação autenticada publicada pendente,
  mesmo sem checkbox aberta.
- Diário: 4.3 visual/teclado isolados conferidos; navegação integrada, autenticação
  familiar real e ativação pendentes. Conversão FR-014 agora preparada e fiada
  numa change própria, com transação única e recuperação por origem/barreira.
  Migration `25120000`, provas novas, revisão e ativação permanecem pendentes;
  flag desligada. Resultado antigo do Diário não aprova essa composição nova.
- Saúde: 5.2 revisão concluída após duas correções; 4.3 leitor de tela/jornada
  integrada e 5.1 ativação remota pendentes. Componente desktop/celular conferido.
- Crise: 6.2 revisão local concluída; 7.1 ativação e cadastro operacional das
  habilitações de case managers antes do primeiro plano pendentes.
- Configuração: 6.7 e provas autenticadas remotas da interface/rotas pendentes.
- Segredos: conferência visual do componente desktop/mobile concluída; 2.2 ainda
  requer navegação integrada e 2.4 ativação/Auth/Vault reais. Nenhuma dessas fatias
  declarada ativada apenas por CI ou checkbox.

## Suposições desta execução

- **SUPOSIÇÃO CONSERVADORA — anamnese:** Administrador também precisa de vínculo;
  não foi criada exceção administrativa sem regra explícita.
- **SUPOSIÇÃO CONSERVADORA — crise:** último retrato do acompanhamento define
  case manager atual; responsável ausente/nulo nega, sem recuperar titular anterior.
  Administrador pode ser habilitado quando acumula esse papel, conforme DF-021.
- **SUPOSIÇÃO CONSERVADORA — Drive:** ACL nominal sem identidade Google verificável
  não prova correspondência à audiência; exige revisão na origem. Não inventada
  sincronização de permissões.
- **SUPOSIÇÃO CONSERVADORA — cadastro:** usa sessão BFF/cookie existente e catálogo
  fechado; presença no Vault não valida segredo no provedor.
- **SUPOSIÇÃO CONSERVADORA — expurgo:** instalar job é separado de executar limpeza;
  flag false preserva trava não destrutiva. Aviso usa recibo auditado e contagens
  administrativas; entrega da interface publicada permanece pendente.
- **SUPOSIÇÃO CONSERVADORA — Agenda:** chaves de state, cookie e desconexão derivadas
  por HKDF SHA-256 do HMAC existente, com domínio/versionamento e finalidades
  separadas. Não gerar nem exigir credencial técnica adicional.
- **SUPOSIÇÃO CONSERVADORA — modelos STT:** oferecer somente os dois IDs Whisper
  publicados na consulta oficial desta data, sem assumir aliases `groq/*` não
  documentados. Groq pode atender ID `openai/*` como provedor; não foi criado pinning
  de provedor nem trocada escolha do usuário. Se houver valor legado, Administrador
  precisa escolher explicitamente ID publicado em Configuração antes de reaplicar
  a migration; catálogo divergente também exige conferência, sem sobrescrita.
- **SUPOSIÇÃO OPERACIONAL — PR:** um PR draft consolidado, com commits por bloco,
  preserva a branch compartilhada. Difere do pedido de draft por frente; evitou PRs
  sobrepostos da mesma branch. Sem merge nem reescrita de histórico.
- **SUPOSIÇÃO OPERACIONAL — publicação:** usar temporariamente a branch de trabalho
  como Production branch da Netlify para gerar artefato com contexto `production`,
  preservando o deploy anterior LOCKED e os escopos das variáveis existentes.
  A configuração de branch foi restaurada para `main` e conferida após recarga.
  Nenhuma mudança de plano, ambiente contratado ou credencial está incluída.
- **SUPOSIÇÃO OPERACIONAL — runtime:** o login técnico existente foi identificado
  pelo histórico operacional e suas memberships; não se leu o valor da variável de
  conexão. O grant Agenda ficou restrito a esse login já provisionado. Prova do
  caminho integrado continua pendente, sem presumir a configuração do deploy.
- **SUPOSIÇÃO CONSERVADORA — download:** somente entrega binária, sem preview ou
  exportação de documento Google Workspace nativo. Auditoria comprova autorização,
  não recebimento; revogação após a autorização final não recolhe bytes já emitidos.
- **SUPOSIÇÃO CONSERVADORA — turno:** parâmetros institucionais no catálogo
  existente, texto vazio para não inventar duração/tolerância. Tratamento admite
  somente `sinalizar_pendencia`, nunca encerramento automático. Recusa auditada
  sem HMAC não concede capacidade de execução: só registra `negado` para o próprio
  ator Auth, ação fechada e alvo UUID. Revisão/provas dessa fronteira pendentes.
- **SUPOSIÇÃO CONSERVADORA — escrita de tarefas:** disponibilidade é informativa,
  por caso e falsa por padrão; não abre exceção para Administrador. Autorização
  da gravação permanece no servidor/banco. Não carregar conteúdo clínico apenas
  para decidir se o formulário aparece.
- **SUPOSIÇÕES CONSERVADORAS — conversão Diário/Tarefa:** uma conversão por
  registro de origem; somente Profissional Google com vínculo ativo; evolução
  resultante interna à equipe, sem retorno familiar implícito nem alteração do
  original. Outras ações independentes continuam em Tarefas. Auditoria anterior
  ao cofre só registra tentativa negada do próprio ator Auth, em duas ações
  fechadas; não autoriza leitura/conversão. São escolhas conservadoras desta
  execução autônoma, não regras clínicas ratificadas.

Hipóteses anteriores preservadas, sem nova decisão silenciosa: diário considera
coordenação colaboradores vinculados; saúde não proíbe combinação `relato_leigo` +
`confirmado`; ficha mantém H5/H6/H8 existentes (Administrador com permissão,
operação atômica e nascimento não futuro em UTC). Isso não dispensa S-02.

## Como testar quando acesso operacional for restabelecido

1. Conferir as oito migrations e o grant Agenda já aplicados no projeto de teste.
   Não reaplicar migrations históricas. **Não executar scripts locais de
   bootstrap/fixtures contra o remoto**: usam banco descartável.
   Na etapa de validação retomada depois, executar as provas novas/afetadas de
   download e turno; só então aplicar as migrations novas pertinentes com suas
   guardas. `25090000` é entrega de documento, independente do turno;
   `25080000`/`25100000` são preparação/grant do turno; `25110000` é a consulta
   somente de autorização de tarefas; `25120000` é a conversão atômica, dependente
   de `25110000`. Um bloqueio do turno não
   impede a validação/entrega de documentos. Flags de turno e expurgo ficam falsas.
2. Após restabelecer a capacidade de deploy da Netlify, gerar artefato do commit
   revisado com contexto `production` e publicá-lo sem desbloquear globalmente
   publicação automática. Promover preview conserva o contexto e não resolve os
   escopos de configuração. Corrigir login/503 após colher etapa/causa/request_id.
3. Com dados fictícios, provar Administrador positivo e Profissional/Família
   negativos no servidor **e banco remoto**, incluindo acesso direto e revogação.
4. Entrar como Administrador, abrir Credenciais das integrações e cadastrar uma
   entrada. Conferir apenas presença/versão/autoria/data; substituir deve aumentar
   versão sem devolver valor anterior. Conferir visual/teclado desktop/mobile.
5. Abrir Configuração, editar parâmetro e recarregar para conferir persistência.
   Ligar/desligar flag e conferir indisponibilidade honesta quando desligada.
6. Após chaves do solicitante: testar documento/ACL Drive com arquivo fictício,
   áudio fictício no OpenRouter e evento único na agenda individual. Resultado
   incerto não pode aparecer como sucesso. Recorrência permanece fora do V1.
   No documento, conferir envio e “Baixar arquivo”, audiência familiar e negativas
   após revogação/mudança de audiência; a consulta de metadados sozinha não prova
   entrega dos bytes. Na Agenda, conferir também o estado de consentimento incompleto.
7. Separadamente, após as provas novas de FR-014, aplicar `25120000` e ligar sua
   flag pela Administração. Como Profissional Google vinculado a caso fictício,
   abrir Diário, escolher origem publicada e converter com todos os campos
   humanos. Conferir tarefa e evolução interna, original intacto e recuperação
   após resposta perdida/recarga, sem duplicação. Provar Família/Admin/outro caso,
   acesso direto e vínculo revogado negativos no servidor e banco antes de ativar.
8. Registrar evidências reais e só então retirar PR de draft/fechar gates.

## Explicitamente não feito

Não ficou publicada a nova versão como aplicação principal: a promoção do preview
foi revertida. Não houve conserto comprovado do 503 ou do HTTP 400 de login, jornada
administrativa publicada, prova Auth/Vault/Google/OpenRouter reais, ativação remota
das seis fatias, habilitação operacional de case managers, S-02 nem teste visual
  integrado desktop/mobile desta entrega. Conferência visual isolada do componente
  de credenciais, diário e saúde foi feita, com as limitações acima. Não houve limpeza
  de áudio/dados, remoção de tabela,
revogação de acesso existente, alteração de permissões Drive, uso de dados reais,
cadastro/manuseio manual de segredo, merge ou reescrita de histórico.

Turno 0.6 concluído como auditoria documental, com inventário em seu `design.md` e
lacunas explícitas 0.6.1/0.6.2; isso não aprova a base remota nem libera integração.
Grupos 1/2 receberam implementação local após nova autorização; não foram validados
nem ativados. Encerramento permanece indisponível; grupo 3 não iniciado. As cinco
migrations da retomada não foram aplicadas remotamente. Não houve nova execução de
testes, build ou prova remota dessas features nesta passagem. Conversão FR-014 não
foi declarada aprovada apenas por código, testes escritos ou flag presente. Financeiro,
PWA, migração Edge, recorrência, agenda global e lembretes não iniciados. Arquivos
preexistentes não rastreados em `.impeccable/critique`, `mocks` e `questions`
preservados fora dos commits.
