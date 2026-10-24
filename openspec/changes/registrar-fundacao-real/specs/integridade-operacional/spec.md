# Spec Delta

## Purpose

Garantir que os testes pelo frontend e o uso real do Francescapp revelem o resultado das operações e suas falhas, sem confundir simulações, ausência de dados ou integrações incompletas com funcionamento efetivo.

## ADDED Requirements

### Requirement: Ambiente único antes e depois da liberação

O produto SHALL utilizar o mesmo ambiente remoto para testes anteriores à liberação e futura produção. Até a liberação, os testes SHALL usar somente dados fictícios, persistidos e processados pelas integrações reais configuradas. Essa escolha MUST NOT dispensar autorização, proteção de dados ou estados honestos. Referências: FR-042/050 e SC-007/011/012.

#### Scenario: Teste manual com dado fictício

- **WHEN** uma jornada for testada antes da liberação
- **THEN** utiliza contas autorizadas e conteúdo fictício pela operação real disponível; configuração ausente ou falha continua explícita, sem fallback de demonstração.

#### Scenario: Ambiente nomeado como produção mas ainda em testes

- **WHEN** o ambiente destinado à produção ainda não tiver passado pela transição conferida
- **THEN** sua denominação ou endereço não autoriza dados reais nem significa que o produto está liberado para operação.

### Requirement: Identificação do conteúdo de teste

Cadastros, registros, anexos e eventos criados para testes SHALL ser identificáveis e rastreáveis como itens de teste, sem se confundir com configurações, acessos administrativos válidos ou conteúdo institucional preexistente. A identificação SHALL permitir conferir o alcance da futura limpeza antes de executar remoções.

#### Scenario: Teste cria arquivo ou evento na integração

- **WHEN** uma jornada criar um anexo no Drive ou um evento no Google Calendar
- **THEN** sua origem de teste permanece identificável para conferência e limpeza, sem tornar toda a pasta, o Drive ou a agenda alvos de remoção.

#### Scenario: Origem de um item não comprovada

- **WHEN** não for possível confirmar se um item pertence ao conjunto de testes
- **THEN** ele não é removido por presunção; a dúvida e a pendência de conferência permanecem explícitas.

### Requirement: Limpeza seletiva anterior ao uso real

Antes da entrada de dados reais, os itens identificados de teste SHALL passar por limpeza seletiva e conferência. Configurações, acessos administrativos válidos e conteúdo institucional preexistente MUST ser preservados. A decisão de planejar a limpeza MUST NOT autorizar sua execução imediata ou reset indiscriminado. Referências: FR-039/042/050.

#### Scenario: Conferir o alcance antes da execução

- **WHEN** for preparada a limpeza de transição
- **THEN** seu alcance distingue cadastros, registros, anexos e eventos de teste dos recursos a preservar; a execução depende de procedimento definido e autorização específica.

#### Scenario: Mesmo local contém itens institucionais e de teste

- **WHEN** arquivos ou eventos de teste estiverem no mesmo Drive ou agenda de conteúdo institucional preexistente
- **THEN** somente os itens de teste identificados compõem o alcance da limpeza; não há remoção em bloco do conteúdo institucional.

### Requirement: Conferência da transição para produção

A liberação para uso real SHALL depender da conferência da limpeza e da preservação dos recursos válidos, com resultado e pendências registrados. Resultado parcial, falha ou incerteza MUST NOT ser declarado como limpeza concluída nem autorizar entrada de dados reais. A liberação não substitui os demais critérios de segurança e recuperação aplicáveis a FR-042.

#### Scenario: Limpeza parcial na integração

- **WHEN** uma etapa da limpeza falhar ou ficar sem confirmação no banco, Drive ou Calendar
- **THEN** o resultado informa o que concluiu e o que falta; a transição permanece pendente, sem sucesso simulado.

#### Scenario: Recursos válidos preservados

- **WHEN** a limpeza tiver resultado confirmado
- **THEN** a conferência verifica também configurações, acessos administrativos válidos e conteúdo institucional preexistente antes de registrar o resultado da transição.

### Requirement: Dados reais sem substituição silenciosa por exemplos

O sistema SHALL usar as fontes reais configuradas nos ambientes destinados a testes pelo frontend e ao uso operacional. Configuração ausente, erro ou permissão insuficiente MUST NOT produzir dados demonstrativos ou respostas simuladas de sucesso. Referências: FR-035, FR-042, FR-049, FR-050 e SC-007.

#### Scenario: Serviço sem configuração

- **WHEN** o usuário tentar uma ação dependente de uma integração ainda não configurada
- **THEN** a interface informa a configuração pendente e a ação não aparece concluída; não carrega exemplos para substituir o serviço ausente.

#### Scenario: Consulta sem registros

- **WHEN** a consulta real concluir com sucesso e não encontrar registros autorizados
- **THEN** a interface mostra ausência de registros, sem inventar pacientes, documentos ou compromissos.

#### Scenario: Consulta que falha

- **WHEN** a consulta falhar por conexão, autenticação, autorização ou erro do serviço
- **THEN** a interface mostra a falha e uma próxima ação aplicável, sem apresentá-la como lista vazia ou consulta bem-sucedida.

### Requirement: Confirmação e resultados parciais verdadeiros

O sistema SHALL confirmar uma ação somente quando seu resultado real estiver confirmado pela fonte responsável. Resultados pendentes ou parciais SHALL indicar o que concluiu e o que falhou; uma mudança local de interface não comprova gravação. Referências: FR-010, FR-012, FR-030, FR-049, FR-050 e FR-051.

#### Scenario: Cadastro não confirmado

- **WHEN** o usuário enviar um cadastro e a gravação falhar ou não tiver confirmação
- **THEN** o sistema não informa cadastro concluído nem o incorpora como registro persistido; explica a falha ou confirmação pendente e conserva a entrada quando seguro.

#### Scenario: Anexo com resultado parcial

- **WHEN** uma etapa do envio de anexo concluir e outra falhar
- **THEN** o sistema distingue registro ou envio parcial de arquivo realmente disponível, oferece regularização e não gera sucesso fictício ou duplicação na nova tentativa.

#### Scenario: Agenda não atualizada

- **WHEN** uma mudança de compromisso não for confirmada na agenda Google de origem
- **THEN** o frontend informa falha ou atualização pendente, sem declarar que a agenda foi atualizada apenas por mostrar o novo horário localmente.

### Requirement: Falhas diagnosticáveis pelo frontend

O sistema SHALL apresentar falhas de maneira útil para identificar a operação e a etapa afetada, com orientação ou identificação segura para investigação quando disponível. MUST NOT revelar segredos, tokens ou conteúdo protegido para tornar um erro diagnosticável. Referências: FR-039, FR-042 e FR-050.

#### Scenario: Falha durante teste manual

- **WHEN** uma operação falhar em um teste pelo frontend
- **THEN** o usuário consegue identificar qual ação falhou e distinguir configuração, permissão, indisponibilidade ou confirmação pendente conforme a informação realmente disponível; o sistema não inventa uma causa desconhecida.

#### Scenario: Erro com dados sensíveis

- **WHEN** a resposta técnica contiver credenciais ou conteúdo de caso fora da autorização do usuário
- **THEN** o frontend apresenta a informação segura de falha, sem reproduzir esses dados; ocultar informação sensível não transforma a operação em sucesso.

### Requirement: Jornadas reais completas antes de declarar entrega

A primeira entrega SHALL cobrir o núcleo aprovado e validar jornadas reais de configuração, cadastro, convite, autorização e uso por perfil. O mockup MUST NOT delimitar etapas ou servir como prova de conclusão. Lacunas materiais SHALL ser esclarecidas antes de tarefas executáveis, sem inventar papéis ou campos. Referências: FR-001 a FR-054, conforme fase, e SC-001 a SC-012.

#### Scenario: Configuração e cadastro na aplicação real

- **WHEN** uma fatia de configuração ou cadastro for apresentada como concluída
- **THEN** suas etapas aprovadas, validações, persistência, permissões, falhas e retomada são verificáveis pela aplicação real, e não apenas por uma tela demonstrativa.

#### Scenario: Funcionalidade existente apenas no mock

- **WHEN** uma função tiver somente implementação demonstrativa ou faltar uma etapa necessária ao uso real
- **THEN** ela permanece explicitamente incompleta; a aparência da tela não comprova cadastro, configuração, segurança ou integração.

### Requirement: Demonstração separada da base operacional

Antes do desenvolvimento da aplicação real, a demonstração SHALL ficar arquivada fora da base ativa e continuar identificada como referência. Simulações e fixtures de testes MUST NOT ser carregadas silenciosamente no runtime de testes manuais ou produção. Specs, proposta comercial, PDFs, fontes e licenças SHALL ser preservados.

#### Scenario: Arquivar a apresentação existente

- **WHEN** o pré-requisito de limpeza for executado
- **THEN** as fontes e distribuições do mock ficam recuperáveis no histórico, fora das entradas e dependências da aplicação real, e a proposta continua com seus recursos e PDFs disponíveis.

#### Scenario: Teste automatizado com simulação

- **WHEN** um teste automatizado usar doubles ou fixtures
- **THEN** o uso é explícito e isolado; não habilita respostas fictícias nos testes manuais pelo frontend nem é apresentado como validação da integração real.

### Requirement: Alternativas legítimas sem ocultar falha

O sistema SHALL permitir alternativas funcionais realmente disponíveis, mantendo explícita a falha da ação original. Uma alternativa MUST NOT simular seu sucesso, ampliar permissões ou apresentar conteúdo desatualizado como atual. Referências: FR-010, FR-025 e FR-050.

#### Scenario: Transcrição indisponível

- **WHEN** a transcrição falhar e o registro por texto estiver disponível
- **THEN** o usuário vê a falha e pode optar por escrever seu relato; nenhum texto de exemplo aparece como transcrição do áudio enviado.

#### Scenario: Dados anteriormente carregados

- **WHEN** uma atualização falhar e ainda houver dados reais anteriormente obtidos que possam ser exibidos com autorização válida
- **THEN** o sistema identifica a falta de atualização e a origem temporal desses dados, sem indicar que a nova consulta concluiu ou restaurar acesso revogado.
