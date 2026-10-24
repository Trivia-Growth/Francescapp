# Módulo de cadastro — autoria pura da tarefa 4.2

## Escopo e limite

Este módulo prepara a autoria TypeScript local da tarefa 4.2. Ele não cria
rota HTTP, SQL, migração, cifra, atestado, sessão ou policy RLS. Portanto, não
comprova persistência, autorização no banco, auditoria, paginação filtrada no
banco ou integração com sessão. Esses pontos continuam dependentes das tarefas
2.x, 3.x e da integração posterior de 4.2.

## Interface e seam

O seam público é `ModuloCadastro.executar(solicitacao)`. A solicitação é uma
união discriminada das seis intenções desta fatia: listar, consultar, criar e
atualizar paciente; criar e atualizar contato. Ela usa apenas os DTOs HTTP de
`@ffcmapp/contratos` e parâmetros de rota/cabeçalhos definidos ali.

O chamador não fornece `perfil`, `usuario_id`, `session_id`, concessão ou
vínculo de paciente. O módulo monta a chamada interna com a rota e RPC
predefinidas e a delega a `AdaptadorRpcCadastro`. O adapter é exclusivamente
server-side: deve obter a autoridade vigente da sessão, cifrar/atestar campos,
chamar a RPC tipada e só projetar a resposta depois da autorização/auditoria.
O banco continua sendo a decisão final de perfil e vínculo.

Há dois DTOs externos preservados pelo módulo: `PacienteBasico`, para carteira
e leitura autorizada de Profissional/Família; e `PacienteAdministrativo`, que
contém nascimento e contatos apenas quando a autoridade de Administração for
confirmada pelo adapter/RPC. O módulo não aceita uma preferência de projeção
do chamador nem acrescenta contatos a um DTO básico.

## Seams exercitados nos testes puros

1. `ModuloCadastro.executar`: valida a intenção, encaminha-a com o par
   rota/RPC fixado pelos contratos e devolve o DTO correspondente. Não prova
   sessão ou banco.
2. `AdaptadorRpcCadastro`: é substituído apenas por fake de fronteira nos
   testes. Isso permite verificar que perfil/vínculo não entram no comando
   público e que uma negativa não é convertida em lista vazia. Não é adapter de
   produção nem prova da RPC.
3. Projeção da resposta: confirma que a leitura básica não expõe contatos; a
   decisão de qual projeção é permitida ainda pertence ao adapter/RPC real.

Dados de teste são inteiramente sintéticos. A integração deve adicionar as
provas positivas e negativas de RLS, vínculo revogado, acesso direto e
auditoria antes de a tarefa 4.2 poder ser marcada como concluída.
