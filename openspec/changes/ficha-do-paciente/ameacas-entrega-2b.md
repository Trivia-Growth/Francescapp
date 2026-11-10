# Modelagem de ameaças — recorte 2B (cadastro de caso novo atômico)

Rascunho de 09/11/2026 (tarefa 2.14), com a skill `security-threat-model`. Escopo: criar um caso novo com todos os campos exigidos numa única operação do Administrador. Fora: mapa de pessoas, leitura por Profissional e Família, substituição temporária (FR-037), duplicidade e representação (ainda sem regra). Todo controle marcado "existe" foi lido no código; "a construir" não existe e não pode ser tratado como existente. As hipóteses H4 a H8 e as perguntas Q1 a Q3 aguardam o solicitante; até lá, as mitigações que dependem delas são condicionais.

## Sistema e fronteiras

- Navegador (ficha, Administrador) → proxy Netlify (`netlify/functions/_shared/cadastro-handler-nativo.ts`, `packages/cadastro/src/preparar-paciente.ts`) → RPC do Postgres. O banco decide: `operacao.criar_paciente_privado` (versão mais recente em `supabase/migrations/20261110140000_cadastro_conta_tecnica.sql`, linhas 10 a 163; SECURITY INVOKER, `search_path=''`) executada pelo wrapper `api.criar_paciente` (SECURITY DEFINER) como o papel dono `ffcmapp_api_cadastro_owner`, que hoje só lê a própria linha de `public.usuario` (política `api_cadastro_usuario`, em `20261106190000_wrappers_privados.sql`).
- Hoje a criação aceita só `nome` (obrigatório), `nome_preferencia` e `data_nascimento` (opcionais), cifrados com AAD por campo. Não grava contato, situação nem responsável. Contato nasce em operação separada (`operacao.criar_contato_paciente_privado`, barreira própria, uma chamada por contato); situação e responsável nascem na edição (`20261113100000_acompanhamento_caso.sql`, tabela só de inserção, motivo cifrado preso ao evento de auditoria).
- Fronteira nova: uma gravação que cria paciente, contatos e a linha inicial de acompanhamento na mesma transação.

## Ativos

1. Completude do cadastro: nenhum caso novo existe sem os campos exigidos (decisão de 08/11/2026; `PRODUCT.md`).
2. Integridade do vínculo inicial: situação e case manager do primeiro retrato.
3. Confidencialidade de nome, nascimento, contatos (dados pessoais, possivelmente de menores) e do vínculo paciente–responsável.
4. Integridade e rastro: idempotência, auditoria de permitido e negado, histórico só de inserção.
5. Disponibilidade da leitura de edição e da lista para os casos criados pelo novo caminho.

## Atacantes e não-capacidades

- Profissional ou Família autenticado, ou anônimo, chamando a RPC ou o proxy direto.
- Administrador com sessão vencida ou revogada no meio da gravação, ou que repete a requisição com conteúdo diferente.
- Cliente que contorna a interface e envia o formato antigo (só o nome) ou campos fora do contrato.
- Não-capacidades assumidas: sem acesso ao cofre de chaves, ao `service_role` nem ao banco com papel dono; sem execução no servidor.

## Caminhos de abuso priorizados

| # | Caminho | Ativo | Prob. | Impacto | Prioridade |
| --- | --- | --- | --- | --- | --- |
| T15 | Contornar a exigência de todos os campos criando caso pelo formato antigo (só nome) na rota ou na RPC que continuam publicadas | 1 | alta | médio | alta |
| T16 | Falha no meio da gravação deixa paciente sem contato ou sem linha de acompanhamento (ou contato órfão) | 1, 4 | média | alto | alta |
| T17 | Repetição com a mesma chave e conteúdo diferente (outros contatos, outra situação, outro responsável) duplica ou altera o caso | 2, 4 | média | médio | média |
| T18 | Responsável inexistente, inativo ou de perfil Família na criação, ou desativado durante a gravação | 2 | média | alto | alta |
| T19 | Ampliação de privilégio do papel dono da criação (ler usuário elegível, inserir contato e acompanhamento) | 2, 3 | baixa | alto | alta |
| T20 | Vazamento de nome, nascimento ou contato em log, erro, auditoria ou resposta de falha | 3 | média | alto | alta |
| T21 | Troca de envelope cifrado entre campos, contatos ou pacientes (AAD errado aceito) | 3 | baixa | médio | média |
| T22 | Regressão ao redefinir a função inteira de criação (autenticação, barreira, ledger, auditoria) | 4 | média | alto | alta |
| T23 | Volume: mais contatos que o limite, ou corpo grande, esgota recursos ou foge do contrato | 5 | baixa | médio | baixa |
| T24 | A linha inicial de acompanhamento quebra a leitura de edição (motivo hoje obrigatório na leitura) | 5 | alta | médio | alta |

## Mitigações

Existentes (lidas no código): para T16 e T17, ledger `operacao.requisicao` com chave e digest, barreira por ator (`operacao.barreira_cadastro`, reserva e encerramento) e repetição que devolve o resultado anterior; para T18, o padrão da 2A de elegibilidade com `for share` dentro da transação (`operacao.editar_paciente_privado`, políticas `edicao_usuario_elegivel*` do papel da edição, não do papel da criação); para T20 e T21, AAD por campo verificado no banco para nome, preferência e nascimento, erro público sem campos (`criarErroPublicoSemCampos`) e auditoria sem payload; para T22, o histórico de migrations que redefine a mesma função, comparável por diff; para a interface, `web/ciclo-cadastro.ts` com estados de aguardando, resultado incerto e reconciliação.

A construir (cada uma com prova exigida):

- **Substituir o formato antigo (T15)**: a mesma operação passa a exigir nome, preferência, nascimento, ao menos um contato, situação e responsável; `criarPacienteSchema`, o contrato da rota e a função SQL recusam a falta de qualquer campo. Não manter modo mínimo como caminho paralelo. Prova: a RPC chamada direto com o formato antigo, e com cada campo ausente, é recusada sem criar linha (negativo por campo), e a interface não oferece envio incompleto.
- **Uma transação, um efeito (T16)**: paciente, contatos, linha inicial (versão 1) e auditoria numa chamada, com uma reserva de barreira e uma chave de idempotência. Prova: falha forçada em cada etapa (contato, acompanhamento, auditoria) não deixa nenhuma linha; contagem de linhas igual antes e depois.
- **Digest cobre o conteúdo (T17)**: o digest de idempotência inclui contatos, situação e responsável; mesma chave com conteúdo diferente devolve `conflito_idempotencia`; repetição idêntica não duplica contato nem acompanhamento. Prova: os dois casos.
- **Elegibilidade do responsável na criação (T18)**: mesma regra da 2A (usuário ativo, perfil Administrador ou Profissional, `for share` até o fim). Exige política de leitura e trava de `public.usuario` para o papel dono da criação, que hoje só lê a própria linha (`api_cadastro_usuario`) e atualiza `versao`. Prova: inexistente, Família, inativo e reindicação de desativado são recusados; ninguém altera o usuário.
- **Privilégios mínimos do papel da criação (T19)**: grants só do necessário (inserir contato e acompanhamento, ler usuário elegível), sem update nem delete; política de leitura restrita a elegíveis. O contato hoje é gravado por outro papel (`ffcmapp_contato_owner`) e cada operação do repositório tem seu dono; decidir na tarefa de banco entre ampliar `ffcmapp_api_cadastro_owner` ou criar um dono dedicado à criação atômica, escolhendo o de menor privilégio. Prova: negativos no papel dono, como os de T14 na 2A, e uma quebra de propósito de cada política.
- **Sem dado pessoal em rastro (T20, T21)**: contatos e nascimento só cifrados, com AAD que prende o registro (`contato_id` gerado no servidor) e o campo; falha pública genérica. Prova: AAD trocado entre contatos, entre campos e entre pacientes é recusado; resposta de falha e auditoria não contêm o valor.
- **Redefinição comparada (T22)**: a nova função parte da última definição e é comparada por diff; só as inclusões esperadas mudam. Prova: diff registrado e testes SQL existentes da criação continuam verdes.
- **Limites no banco (T23)**: máximo de contatos e tamanho do envelope conferidos na função, não só no contrato TypeScript (hoje o limite de 10 existe no contrato; não encontrei trigger nem restrição na tabela de contatos que o imponha). Prova: onze contatos e envelope acima do limite são recusados.
- **Linha inicial compatível com a leitura (T24)**: decisão pendente em Q1; qualquer que seja, a leitura de edição e a lista devem funcionar para o caso recém-criado. Prova: criar caso pelo novo caminho e ler pela consulta de edição e pela lista.

## Hipóteses que movem a prioridade

- H4 (confirmada em `PRODUCT.md`, decisão de 08/11/2026). Exigidos: nome, preferência, nascimento, ao menos um contato, situação e case manager, sem valor padrão. O máximo de contatos segue o contrato atual (10).
- H5. Criar caso continua exclusivo do Administrador com `administrar_cadastro` (já é assim no banco).
- H6. A criação atômica substitui a operação atual em vez de coexistir com ela (decorre de T15).
- H7. A situação inicial pode ser qualquer um dos cinco valores, sem valor padrão (a decisão disse apenas "sem valor padrão").
- H8. Nascimento não pode estar no futuro; contato e nome seguem as validações já existentes.
- H3 (premissa do projeto). Dados fictícios e nenhuma ativação real antes da S-02; nenhuma operação remota é feita aqui.

## Perguntas ao solicitante (materiais)

- **Q1.** A situação inicial precisa de motivo escrito? FR-001 pede data e motivo nas mudanças de situação. Recomendação: não pedir motivo na criação (a data é a da criação do caso) e permitir que a primeira linha do histórico não tenha motivo. Isso altera a leitura da 2A, hoje com motivo obrigatório (T24).
- **Q2.** Quem escolhe o responsável precisa listar a equipe, o que hoje exige a concessão `administrar_concessoes`. Um Administrador só com `administrar_cadastro` não conseguiria cadastrar caso novo, porque o responsável passa a ser obrigatório. Recomendação: abrir a lista de responsáveis elegíveis a quem tem `administrar_cadastro`, só com os campos necessários para escolher.
- **Q3.** Alguma situação inicial deve ser vedada na criação (por exemplo "encerrado" ou "transferido" para um caso novo)? Recomendação: permitir as cinco, como em H7, até haver regra de negócio.

## Provas exigidas e limitações

Positivas e negativas no banco (SQL local descartável), nos contratos e na interface, a detalhar nas tarefas 2.15 a 2.18 depois da confirmação. Limitações já conhecidas: duplicidade de pessoas (mesma pessoa criada duas vezes com chaves diferentes) não é tratada, pois não há regra de negócio; a prova de perfil Profissional e revogação reais depende da S-02; a concorrência de revogação externa de Auth segue como limitação D-14.
