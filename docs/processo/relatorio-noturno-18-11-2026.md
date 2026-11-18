# Relatório noturno — 18/11/2026

## Resultado observável

**O objetivo publicado não foi alcançado.** Código e provas locais foram entregues;
não ficou comprovado que o solicitante consegue autenticar, cadastrar uma chave e
ativar uma integração na aplicação publicada. O PR permanece draft.

Branch `fatia7/turno-execucao-cuidado`; revisão-base
`fa1af9330aafa543b3c6b8cb040ed2c11c9b1667`.
PR: https://github.com/Trivia-Growth/Francescapp/pull/18.
Planejamento existente preservado; nova mudança OpenSpec
`cadastro-segredos-integracoes` criada antes de sua implementação. Frentes de
implementação e revisão executadas em Sol. Nenhum segredo real foi cadastrado.

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
   e privilégios do usuário que agenda, sem superuser. **Pendência P2:** recibo de
   falhas do expurgo continua privado, sem aviso operacional novo na interface;
   tarefa 6.1 não foi declarada integralmente concluída.
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

`pnpm run verificar:ativacao` repetido após correções de saúde/migration:
**saída 0**, 1.365 testes passaram, 30 pulados pelo
gate genérico; lint, typechecks, Deno e build passaram. Pulos não são aprovação:
as matrizes SQL relevantes acima foram executadas separadamente. Auth e Vault dos
testes locais usam fixtures fictícias. `pnpm run verificar:rapido` final e pre-push:
saída 0. `git diff --check` da base ao estado final: saída 0.

Revisão independente nos dois eixos, padrões/segurança e aderência à spec, incluindo
arquivos novos. Achados de permissão do cron e confirmação de evento cancelado foram
corrigidos e tiveram provas afetadas reexecutadas. Revisões focais posteriores de
HKDF/composição/grants Agenda e preservação de privilégios da crise sem P1/P2.
Isso não certifica integração externa nem substitui roteiro publicado.

## Lista exata do que cadastrar e onde

**Após desbloqueio, migrations e publicação**, entrar como Administrador em
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

Em **Administração > Configuração** (`#administracao/configuracao`), editar:

- `ffcm.documentos.drive_pasta_raiz`: ID da pasta raiz do Drive;
- `ffcm.documentos.ativo`: ligar/desligar Drive;
- `ffcm.transcricao.ativa`: ligar/desligar transcrição OpenRouter; modelo e duração
  continuam editáveis no catálogo existente;
- `ffcm.agenda_google.dominio_workspace`: domínio Workspace permitido;
- `ffcm.agenda_google.ativa`: ligar/desligar Agenda;
- `ffcm.transcricao.expurgo_ativo`: permanece **false**. Só ativar após conferir
  elegibilidade e autorizar o descarte de áudios abandonados com mais de 30 dias.

Google exige configuração do cliente OAuth e consentimento individual de cada
profissional na própria agenda. Cadastrar segredo não comprova validade ou conexão.
Não cadastrar nenhum valor em SQL, terminal, PR ou relatório.

## Bloqueios reais

- `SUPABASE_ACCESS_TOKEN` ausente no processo, confirmado sem imprimir valores.
  Consulta CLI não terminou em 60 s. Nenhum token do chat foi copiado para comando,
  arquivo ou log.
- Sessão existente do navegador permitiu **consulta somente leitura** ao Supabase:
  última migration `20261124140000`, catálogo com 43 chaves, nenhuma divergência no
  contrato verificado, owner `ffcmapp_configuracao_sistema_owner`, EXECUTE para
  `authenticated` e não para `anon`/`service_role`, saída com `opcoes`. Consulta salva
  em `scripts/diagnosticar-configuracao-remota.sql`. Não prova toda execução da RPC.
- Log de função Netlify por CLI retornou `Unauthorized`. Sem linha de falha com
  etapa/causa/request_id, **6.7 permanece aberta**. Não foi aplicado retry de pool
  nem correção especulativa de catálogo/grants.
- Aplicação publicada respondeu à entrada; retorno do login Google chegou a
  **HTTP 400** na raiz com parâmetro `fluxo`. Causa não estabelecida. Não foi
  presumido problema de cookie, nem apagados cookies ou revogados acessos.
- Revalidação sem sessão: raiz HTTP 200; GET de configuração HTTP 401
  `nao_autenticado`, com `request_id` público. Isso prova somente a negativa anônima.
- Controle posterior do navegador foi recusado por foco e, por fim, `screen_locked`.
  Sem solicitante disponível, não houve desbloqueio/continuidade de SQL ou publicação.
- Netlify mostrava publicação automática bloqueada e main anterior publicada.
  Preview do PR foi construído, mas exige autenticação (HTTP 401 na verificação
  anônima). CI `verificar-ativacao` no PR draft foi SKIPPED; não conta como evidência.

**Não aplicadas remotamente:** migrations `20261125010000`, `20261125020000`,
`20261125030000`, `20261125030100`, `20261125040000`, `20261125050000` e
`20261125060000`, nem o grant
operacional da Agenda. Não habilitadas flags remotas nesta execução. Autorização
DF-022 já existe; impedimento é acesso operacional, não falta de consentimento.

Verificação adicional OpenSpec estrita de `historico-de-saude` e
`transcricao-audio-relato`: saída 1 por ausência de delta specs nesses pacotes
preexistentes. Planejamento não foi refeito para contornar o validador. Esse resultado
não é aprovação; requisitos de referência e revisão de aderência foram consultados
separadamente. A mudança nova de cadastro teve validação estrita aprovada antes da
implementação, conforme evidência do bloco 2.

## Gates das seis fatias

- Ficha: 1.8 e S-02/fechamento publicado ainda pendentes.
- Contexto/rede: fiação e SQL locais; navegação autenticada publicada pendente,
  mesmo sem checkbox aberta.
- Diário: 4.3 visual/teclado isolados conferidos; navegação integrada, autenticação
  familiar real e ativação pendentes.
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
  flag false preserva trava não destrutiva. Aviso fica no registro auditado/recibo
  privado nesta passagem; aviso de falha na interface permanece pendente.
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

Hipóteses anteriores preservadas, sem nova decisão silenciosa: diário considera
coordenação colaboradores vinculados; saúde não proíbe combinação `relato_leigo` +
`confirmado`; ficha mantém H5/H6/H8 existentes (Administrador com permissão,
operação atômica e nascimento não futuro em UTC). Isso não dispensa S-02.

## Como testar quando acesso operacional for restabelecido

1. Aplicar migrations e grant estreito revisados no projeto de teste. **Não executar
   scripts locais de bootstrap/fixtures contra o remoto**: usam banco descartável.
2. Publicar deploy específico, sem desbloquear globalmente publicação automática.
   Corrigir login/503 somente após colher etapa/causa/request_id e evidência.
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
7. Registrar evidências reais e só então retirar PR de draft/fechar gates.

## Explicitamente não feito

Não houve aplicação remota das migrations novas, publicação da nova versão como
aplicação principal, conserto comprovado do 503 ou do HTTP 400 de login, jornada
administrativa publicada, prova Auth/Vault/Google/OpenRouter reais, ativação remota
das seis fatias, habilitação operacional de case managers, S-02 nem teste visual
  integrado desktop/mobile desta entrega. Conferência visual isolada do componente
  de credenciais, diário e saúde foi feita, com as limitações acima. Não houve limpeza
  de áudio/dados, remoção de tabela,
revogação de acesso existente, alteração de permissões Drive, uso de dados reais,
cadastro/manuseio manual de segredo, merge ou reescrita de histórico.

Turno 0.6 e grupos 1/2/3 não iniciados: objetivo principal ainda bloqueado. Financeiro,
PWA, migração Edge, recorrência, agenda global e lembretes não iniciados. Arquivos
preexistentes não rastreados em `.impeccable/critique`, `mocks` e `questions`
preservados fora dos commits.
