# Tasks

Prévia ampliada com agenda geral e painel de tarefas pendentes, alimentados por registros fictícios locais. Testes focados cobrem navegação e descarte de respostas antigas; revisão independente conferiu atualização do painel. Sem integração Google, autorização de produção ou dados reais.

Prévia de tarefas permite editar descrição, responsável, prazo e prioridade; testes locais conferem rascunho e retomada. Permanece restrita a dados fictícios e não comprova autorização de produção.

Atualização: a recuperação local de relatos usa identificador de operação sem conteúdo no navegador e decisão atômica no servidor para confirmar ou cancelar gravação incerta. Testes focados cobrem corrida, repetição e reinício; revisão estática não encontrou novo defeito concreto. A prova se limita a uma instância local e não substitui integração de produção.

## 1. Demonstração local

- [x] 1.1 Implementar acesso local protegido no servidor (Acesso local protegido; sem dependência): comprovar entrada válida, senha incorreta, acesso direto sem sessão e saída com testes positivos e negativos.
- [x] 1.2 Implementar cadastro e consulta persistentes (Cadastro fictício persistente; depende de 1.1): comprovar persistência após reinício, validação e falha de gravação sem falso sucesso.
- [x] 1.3 Integrar a interface e o aviso (Limite da demonstração; depende de 1.1 e 1.2): demonstrar entrada, cadastro, consulta e estados de erro com dados fictícios.
- [x] 1.4 Revisar o diff nos eixos padrões e especificação e registrar evidências e limitações (todos os cenários; depende de 1.1–1.3); verificar a fatia conforme a política de execução do projeto.

Teste de servidor passou para sessão, negativas, reinício e falha de gravação; teste de interface passou com 8 cenários. No navegador local, login, criação fictícia e persistência após recarga foram verificados. Revisão independente identificou falha na mensagem após sessão expirada, corrigida e testada. Lint e typecheck passaram. O serviço é limitado ao próprio computador, não substitui autenticação ou integração de produção, e não deve receber dados reais; anamnese e tarefas fictícias agora persistem localmente; o armazenamento não é cifrado e não aceita dados reais. O gate de ativação do PR continua pendente.

Atualização de 04/11/2026: prévia local persiste anamnese e tarefas por paciente, com revisão para conflito e sessão/CSRF existentes. Testes locais verificam reinício e conflito; não comprovam autorização clínica, histórico versionado ou integração de produção. Revisão independente apontou riscos de perda de rascunhos, corrigidos e novamente conferidos. Gate de ativação permanece pendente.

Atualização de 04/11/2026: prévia local também cadastra e consulta objetivos fictícios por paciente, preservados após reinício; validação de campos e conflito de revisão verificados em testes locais. Falha de gravação mantém o formulário para nova tentativa. Não implementa revisão ou histórico dos objetivos, autorização clínica nem integração de produção; FR-015/016 permanecem pendentes. Revisão independente e gate de ativação permanecem pendentes.

Atualização de 04/11/2026: demonstração local permite revisar e guardar relatos fictícios por paciente no arquivo da prévia, com revisão concorrente existente. Teste de interface cobre isolamento por paciente; teste do servidor cobre validação, conflito e leitura após reinício. Não representa envio à equipe, publicação, autorização clínica nem persistência de produção. A interface independente de preparação continua descartável. Revisão independente e gate de ativação permanecem pendentes.

Atualização de 04/11/2026: prévia local permite revisar objetivos fictícios e consultar versões anteriores com motivo. Objetivos previamente salvos continuam legíveis. Não substitui histórico clínico, identidade de autor, autorização ou integração de produção; FR-015/016 e gate de ativação permanecem pendentes.

Atualização de 04/11/2026: prévia local permite editar nomes fictícios, com validação, gravação atômica e revisão por cadastro para recusar conflitos entre abas; o rascunho permanece na falha. Teste local cobre sessão/CSRF, validação, concorrência e leitura após reinício; 15 testes existentes da interface passaram. Não representa cadastro nem autorização de produção. Revisão independente e gate de ativação permanecem pendentes.

Atualização de 04/11/2026: agenda fictícia por paciente permite cadastrar, editar e cancelar compromissos locais, sinalizando sobreposição; resumo local reúne dados já registrados por paciente. Teste do servidor cobre validação, conflito e persistência após reinício; 17 testes existentes da interface passaram. Não há calendário consolidado, recorrência, integração Google, confirmação externa, identidade de autoria ou autorização real. FR-023/025/049/050 continuam pendentes. Revisão independente, teste visual e gate de ativação permanecem pendentes.

Revisão do diff identificou troca incorreta de paciente em aberturas simultâneas; correção por geração e teste de respostas fora de ordem passaram. O arquivo da interface passou com 19 testes; o resumo não atribui diagnóstico nem trata informação ausente como avaliação clínica. Teste visual e gate de ativação permanecem pendentes.

Atualização de 04/11/2026: prévia de anamnese permite múltiplos campos em seções nomeadas pelo usuário e preserva leitura do formato anterior. Testes de interface cobrem legado e reabertura; persistência local não comprova integração ou autorização clínica. Gate de ativação continua pendente.

Atualização de 04/11/2026: metadados fictícios de documentos integrados à prévia local por paciente. Testes cobrem falha e preservação do rascunho, reabertura na interface e persistência após reinício. Não há anexos, Drive nem integração de produção; gate de ativação permanece pendente.

Atualização posterior: prévia permite anexar e baixar arquivos fictícios locais de até 2 MB, sem Drive. Teste do servidor cobre sessão, CSRF, validação e isolamento entre dois pacientes; revisão identificou escrita não atômica, corrigida e conferida. Armazenamento sem cifra continua inadequado para dados reais.
