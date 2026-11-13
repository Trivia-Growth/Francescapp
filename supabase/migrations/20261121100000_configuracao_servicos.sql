-- Diretriz do solicitante (11/11/2026): o que é variável se preenche na tela e se guarda no
-- banco. Até aqui isso valia para quatro rotas (contato, campo extra do plano, diário e
-- transcrição); as demais obedeciam apenas à variável de ambiente do Netlify. Metade dos
-- interruptores num lugar e metade no outro é o que faz alguém desligar no lugar errado e
-- concluir que o sistema quebrou.
--
-- Cada linha abaixo é o interruptor de um serviço. O valor semeado é EXATAMENTE o estado de
-- produção em 13/11/2026, para que aplicar esta migration não ligue nem desligue nada.
--
-- Três limites que não mudam por causa desta migration:
--
-- 1. Isto NÃO é autorização. Desligar um serviço o torna indisponível para todo mundo; ligá-lo
--    não dá acesso a ninguém. Sessão, concessão, atestado e RLS continuam decidindo quem pode
--    o quê, no servidor e no banco.
-- 2. A variável de ambiente continua existindo como padrão de emergência, usada quando o banco
--    não responde ou não tem a chave. Ela nunca deve ser mais permissiva que o valor daqui:
--    enquanto o ambiente disser `true` e o banco disser `false`, uma falha de leitura reabre o
--    serviço. O passo recomendado depois de aplicar esta migration é zerar essas variáveis no
--    Netlify, nesta ordem, para que a falha de leitura passe a fechar em vez de abrir.
-- 3. `auth` e a própria tela de configuração continuam fora, de propósito. O motivo está
--    comentado em `netlify/functions/auth.ts` e `netlify/functions/configuracao-sistema.ts`.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (
    gen_random_uuid(),
    'ffcm.pacientes.ativo',
    'true'::jsonb,
    'booleano',
    'Lista de pessoas acompanhadas',
    'Disponibiliza a carteira de pessoas acompanhadas e a abertura da ficha. Desligar esconde a lista de todo mundo, inclusive de quem tem acesso; não altera quem pode ver quem.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.cadastro.edicao_ativa',
    'true'::jsonb,
    'booleano',
    'Edição do cadastro',
    'Permite alterar nome, data de nascimento, situação e responsável de uma pessoa acompanhada. Desligar deixa o cadastro somente em leitura para todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.acesso_paciente.ativo',
    'true'::jsonb,
    'booleano',
    'Conceder e revogar acesso a um caso',
    'Permite vincular e desvincular profissionais de uma pessoa acompanhada. Desligar impede novas concessões e revogações; os acessos que já existem continuam valendo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.acesso_paciente.barreira_ativa',
    'true'::jsonb,
    'booleano',
    'Conferência antes de alterar acesso',
    'Antes de conceder ou revogar acesso, o sistema confere se existe uma tentativa anterior sem resposta e pede confirmação. Desligar remove essa conferência e volta a permitir alteração direta.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.anamnese.ativa',
    'true'::jsonb,
    'booleano',
    'Anamnese',
    'Disponibiliza a aba de anamnese para leitura e preenchimento. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.anamnese.historico_ativo',
    'true'::jsonb,
    'booleano',
    'Histórico da anamnese',
    'Mostra as versões anteriores da anamnese, com quem alterou e quando. Desligar deixa visível apenas a versão atual; nada é apagado.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.saude.ativa',
    'true'::jsonb,
    'booleano',
    'Histórico de saúde',
    'Disponibiliza avaliações, diagnósticos e histórico de saúde da pessoa acompanhada. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.plano.ativo',
    'true'::jsonb,
    'booleano',
    'Plano de cuidado',
    'Disponibiliza os objetivos do plano de cuidado. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.plano.aprovador_ativo',
    'true'::jsonb,
    'booleano',
    'Quem aprova objetivo do plano',
    'Disponibiliza a tela onde a administração escolhe quem pode aprovar objetivo do plano de cuidado. Desligar não remove quem já está marcado.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.plano.aprovacao_objetivo_ativa',
    'true'::jsonb,
    'booleano',
    'Aprovação de objetivo do plano',
    'Permite registrar a aprovação de um objetivo do plano de cuidado. Desligar impede novas aprovações; as que já foram registradas continuam valendo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.plano_crise.ativo',
    'true'::jsonb,
    'booleano',
    'Plano de crise',
    'Disponibiliza o plano de crise e a tela que marca quem pode aprová-lo. Enquanto ninguém estiver marcado, nenhum plano de crise pode ser aprovado — isso é por desenho, não falha.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.tarefas.ativas',
    'true'::jsonb,
    'booleano',
    'Tarefas do cuidado',
    'Disponibiliza a aba de tarefas para leitura. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.tarefas.escrita_ativa',
    'true'::jsonb,
    'booleano',
    'Criar e alterar tarefas',
    'Permite criar, alterar e concluir tarefas. Desligar deixa a aba de tarefas somente em leitura.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.tarefas.barreira_ativa',
    'true'::jsonb,
    'booleano',
    'Conferência antes de alterar tarefa',
    'Antes de gravar uma tarefa, o sistema confere se existe uma tentativa anterior sem resposta e pede confirmação. Desligar remove essa conferência.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.pendencias.ativas',
    'true'::jsonb,
    'booleano',
    'Pendências do caso',
    'Disponibiliza as pendências derivadas do caso e o selo de situação na lista de pessoas acompanhadas. Desligar esconde as duas coisas.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.encaminhamentos.ativo',
    'true'::jsonb,
    'booleano',
    'Encaminhamentos',
    'Disponibiliza a aba de encaminhamentos. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.orientacoes.ativo',
    'true'::jsonb,
    'booleano',
    'Orientações',
    'Disponibiliza a aba de orientações. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.contexto_cuidado.ativo',
    'true'::jsonb,
    'booleano',
    'Rotina e recursos',
    'Disponibiliza a aba de rotina, recursos e barreiras do dia a dia. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.rede_cuidado.ativa',
    'true'::jsonb,
    'booleano',
    'Rede de cuidado',
    'Disponibiliza a aba com as pessoas da rede de cuidado. Desligar esconde a aba de todo mundo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.equipe.consulta_ativa',
    'true'::jsonb,
    'booleano',
    'Consultar equipe com acesso',
    'Disponibiliza a lista de quem tem acesso a cada caso. Desligar esconde a lista; não altera quem tem acesso.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.equipe.criacao_ativa',
    'true'::jsonb,
    'booleano',
    'Convidar para a equipe',
    'Permite convidar uma pessoa para a equipe, criando uma concessão. Desligar impede novos convites; as concessões que já existem continuam valendo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.equipe.barreira_ativa',
    'true'::jsonb,
    'booleano',
    'Conferência antes de convidar',
    'Antes de criar uma concessão, o sistema confere se existe uma tentativa anterior sem resposta e pede confirmação. Desligar remove essa conferência e impede o convite, porque a conferência faz parte do fluxo.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.equipe.vinculos_ativa',
    'true'::jsonb,
    'booleano',
    'Consultar vínculos de um profissional',
    'Mostra a quais casos uma pessoa da equipe está vinculada. Desligar esconde essa consulta.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.auditoria.consulta_ativa',
    'true'::jsonb,
    'booleano',
    'Consulta da trilha de auditoria',
    'Disponibiliza a tela onde a administração consulta o que foi feito no sistema. Desligar esconde a consulta; a trilha continua sendo gravada do mesmo jeito.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.lgpd.ativa',
    'true'::jsonb,
    'booleano',
    'Solicitações do titular (LGPD)',
    'Disponibiliza o registro e a resposta a pedidos do titular dos dados. Desligar esconde a tela; os pedidos já registrados continuam guardados.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.regras.ativa',
    'true'::jsonb,
    'booleano',
    'Como funciona',
    'Disponibiliza a página que explica as regras de atendimento a quem usa o sistema. Desligar esconde a página.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.linha_tempo.ativa',
    'false'::jsonb,
    'booleano',
    'Linha do tempo',
    'Reúne em ordem o que aconteceu no caso, juntando diário, tarefas, plano, encaminhamentos, saúde e documentos. Começa desligada: depende de uma prova conectada com dados fictícios que ainda não foi feita.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.exportacao.ativa',
    'false'::jsonb,
    'booleano',
    'Exportação de dados do caso',
    'Permite gerar um pacote com os dados de um caso para entregar ao titular. Começa desligada: ainda falta decidir o formato e quem confere a entrega.',
    'servidor'
  );
