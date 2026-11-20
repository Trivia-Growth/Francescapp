# Substituição temporária da case manager (FR-037)

## Por quê

FR-037 exige "definir substituição temporária da case manager" e isso não existia no
código. O responsável do caso é um retrato append-only em `cadastro.acompanhamento_caso`,
escrito apenas por Administrador pela edição do paciente, e o conceito de **case manager
atual** foi introduzido em 25/11 por `20261125040000_plano_crise_case_manager_atual.sql`
para servir de portão à aprovação do plano de crise (FR-020): o último retrato por versão.

Sem esta fatia, a ausência da titular só podia ser coberta trocando o responsável do caso
— uma mudança permanente, que apaga da leitura corrente quem de fato lidera o caso e
depende de alguém lembrar de desfazê-la depois. A regra de negócio de origem
(`docs/projeto/contexto-negocio.md:77`) pede o contrário: "o caso informa um substituto
previamente autorizado e o canal de contato; não conceder acesso automático a toda a
carteira".

## Decisão do solicitante (19/11/2026) — DF-024

Durante o período de substituição, a substituta é a **case manager atual daquele caso**,
inclusive para efeito de ação, como aprovar plano de crise (FR-020). A substituição
**nunca** alcança a carteira inteira nem outros casos. Fora do período, o responsável
anterior volta a ser o atual automaticamente, sem ação manual.

## O que muda

- Nova tabela `cadastro.substituicao_case_manager`, um registro por período, com
  titular no momento do registro, substituta, `inicio`, `fim`, motivo cifrado, autor,
  instante, versão do caso e encerramento antecipado. Períodos sobrepostos no mesmo caso
  são recusados pelo **banco**, por `exclude using gist` sobre `tstzrange`, não pela
  aplicação.
- Nova função `cadastro.case_manager_atual(uuid)` `security definer`, fonte única da
  regra: devolve quem lidera o caso agora e com que papel (titular ou substituta). A
  policy `crise_aprovacao_responsavel_atual` e a revalidação de
  `api.plano_crise_operacao_privada` passam a consultá-la, em migração aditiva.
- Nova operação `api.substituicao_case_manager_privado(jsonb)` sob owner dedicado
  `ffcmapp_substituicao_cm_owner`, com três ações: `consultar`, `registrar` e `encerrar`.
  Só Administrador registra ou encerra. Auditoria obrigatória na mesma transação,
  inclusive na negação (`resultado='negado'`).
- Contrato HTTP isolado `substituicao-case-manager-http.ts` (sem tocar `rotas.ts`),
  handler Netlify fino atrás da flag `FFCM_SUBSTITUICAO_CM_ATIVO`, desligada por padrão.
- Nova seção na tela de edição do caso dizendo quem é o titular, quem substitui e até
  quando, com estados de carregamento, vazio, erro e sucesso.

## Fora de escopo

- Conceder acesso ao conteúdo do caso. Substituir **não** concede acesso: quem não tem
  `cadastro.acesso_paciente` continua negado, como antes. Alterar isso seria mudar
  FR-036/FR-037 sem autorização.
- Substituição de carteira inteira, substituição recorrente, aviso/notificação na véspera
  e canal de contato do substituto como campo estruturado. O requisito de origem menciona
  o canal de contato; o plano de crise (FR-020) já guarda contatos, e duplicar o campo
  criaria duas fontes de verdade.
- Transferência do papel de titular. Isso já existe em `operacao.editar_paciente_privado`.
- Ativação remota: migrations não aplicadas, flag desligada, nada comitado.
