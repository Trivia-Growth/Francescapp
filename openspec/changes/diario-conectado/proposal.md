# Diário e evolução conectados (FR-008, FR-009, FR-012, FR-013, FR-014)

## Por quê

A aba "Diário" da ficha era um `montar: null`. O que existia do requisito estava em duas
preparações isoladas: `cadastro.diario_rascunho_textual` (20261108120000), uma tabela fechada
sem função, grant ou policy, que nem modela os campos de FR-008; e `web/relato-textual.ts`,
um protótipo local usado só pelo mockup, sem persistência, autorização ou audiência.

O resultado é que não havia onde registrar o que acontece entre os atendimentos. A família não
tem canal para relatar um acontecimento; o profissional não tem modelo curto para registrar a
evolução depois da sessão; nada distingue rascunho de publicado; retificar significaria
reescrever; e o remetente não consegue saber se o que enviou foi lido ou respondido.

## O que muda

- Três tabelas imutáveis em `cadastro`: `diario_registro` (paciente, tipo, autor),
  `diario_registro_versao` (estado, audiência, atenção, solicitação de retorno, origem do
  texto, registro respondido, tarefa gerada, conteúdo e justificativa cifrados) e
  `diario_consulta` (primeira leitura de quem não é o autor).
- Nova operação `api.diario_operacao_privada(jsonb)` sob owner dedicado `ffcmapp_diario_owner`,
  com atestado HMAC, revalidação de autorização sob trava, idempotência por
  `operacao.requisicao` e auditoria obrigatória em todos os caminhos. É a primeira operação de
  conteúdo com **duas trilhas de autorização**: colaborador (Google Workspace) e familiar
  (`cadastro.acesso_paciente` + sessão `familia`), cada uma com a prova já exigida na fatia
  correspondente.
- Rota HTTP `GET`/`POST /api/pacientes/:paciente_id/diario` atrás da chave de configuração
  `ffcm.diario.ativo`, semeada **desligada**, com `FFCM_DIARIO_ATIVADO` como padrão de ambiente.
- Chave de configuração `ffcm.diario.areas_sintese`, editável pela tela de administração, para
  as áreas do modelo de síntese de FR-009 — a diretriz de 11/11/2026 aplicada ao requisito.
- Nova aba da ficha com relato, evolução, rascunho, publicação, retificação justificada,
  situação do remetente e sinalização de atenção.

## Fora de escopo

- **FR-010 (áudio e transcrição)**: outra fatia. Esta deixa o gancho honesto
  (`origem_conteudo = 'audio_transcrito'`), para que um texto vindo de transcrição não seja
  apresentado como digitado pelo autor, mas não transcreve nada.
- **FR-011 (anexos)**: um anexo não pode ampliar o acesso ao registro, e isso exige desenho e
  provas próprios.
- **Jornada de login familiar**: as constantes que a desligam continuam onde estão. Esta fatia
  implementa a autorização do familiar no banco; quem o autentica é outra fatia.
- **Criação da tarefa de FR-014**: a tarefa pertence à fatia de tarefas, com a barreira e o
  ciclo dela. Aqui entra o identificador que ela devolve, pela porta `converterEmTarefa`.
- Histórico paginado das versões anteriores (o modelo já é versionado; falta a consulta).

## Impacto

- Código: `supabase/migrations/20261118200000`–`20261118230000`,
  `packages/contracts/src/{diario,diario-http,rpc,rotas}.ts`,
  `supabase/functions/_shared/cifra-autenticada.ts`, `netlify/functions/diario.ts` e
  `_shared/{entrada,compor,executor}-diario-*.ts` e `diario-nativo.ts`,
  `netlify/functions/_shared/configuracao-servidor.ts`, `web/{diario,servico-diario-http}.ts`.
- Nenhuma migration foi aplicada remotamente; nenhuma flag foi ligada.
