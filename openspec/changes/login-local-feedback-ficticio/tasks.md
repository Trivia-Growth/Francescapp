# Tasks

## 1. Demonstração local

- [x] 1.1 Implementar acesso local protegido no servidor (Acesso local protegido; sem dependência): comprovar entrada válida, senha incorreta, acesso direto sem sessão e saída com testes positivos e negativos.
- [x] 1.2 Implementar cadastro e consulta persistentes (Cadastro fictício persistente; depende de 1.1): comprovar persistência após reinício, validação e falha de gravação sem falso sucesso.
- [x] 1.3 Integrar a interface e o aviso (Limite da demonstração; depende de 1.1 e 1.2): demonstrar entrada, cadastro, consulta e estados de erro com dados fictícios.
- [x] 1.4 Revisar o diff nos eixos padrões e especificação e registrar evidências e limitações (todos os cenários; depende de 1.1–1.3); verificar a fatia conforme a política de execução do projeto.

Teste de servidor passou para sessão, negativas, reinício e falha de gravação; teste de interface passou com 8 cenários. No navegador local, login, criação fictícia e persistência após recarga foram verificados. Revisão independente identificou falha na mensagem após sessão expirada, corrigida e testada. Lint e typecheck passaram. O serviço é limitado ao próprio computador, não substitui autenticação ou integração de produção, e não deve receber dados reais; dados de anamnese e tarefas permanecem em memória. O gate de ativação do PR continua pendente.
