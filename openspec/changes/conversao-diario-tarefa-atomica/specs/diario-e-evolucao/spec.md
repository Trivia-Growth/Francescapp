# Spec Delta

## MODIFIED Requirements

### Requirement: FR-014 — Permitir indicar necessidade de atenção e converter relato ou evolução

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Permitir indicar necessidade de atenção e converter relato ou evolução em ação com responsável. A sinalização humana deve manter motivo, data e encaminhamento.

#### Scenario: Condição de aceite FR-014

- **WHEN** a funcionalidade FR-014 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Permitir indicar necessidade de atenção e converter relato ou evolução em ação com responsável. A sinalização humana deve manter motivo, data e encaminhamento.

#### Scenario: Conversão humana completa e atômica

- **WHEN** Profissional Google com concessão, sessão e vínculo ativos escolher relato ou evolução publicada visível no caso, com funcionalidades habilitadas, e confirmar motivo, data da atenção, encaminhamento, responsável, prazo, prioridade e área configurada
- **THEN** o produto SHALL criar tarefa atribuída e evolução de atenção juntas, preservar os campos humanos e registrar autoria e horário no servidor, mantendo o original intacto
- **AND** uma falha em qualquer gravação SHALL impedir ambas, sem apresentar sucesso parcial

#### Scenario: Audiência preservada

- **WHEN** uma conversão for concluída
- **THEN** a evolução resultante SHALL ser interna à equipe, sem publicar automaticamente texto da origem, sem criar retorno à família e sem alterar audiência, estado ou histórico da origem

#### Scenario: Resposta perdida e tentativa concorrente

- **WHEN** ocorrer resposta perdida, recarga, repetição ou tentativa concorrente para a mesma origem
- **THEN** nova consulta autorizada SHALL recuperar a conversão confirmada ou informar estado incerto sem duplicar tarefa ou evolução
- **AND** o produto SHALL admitir no máximo uma conversão por registro de origem neste recorte, mantendo outras ações independentes disponíveis em Tarefas
- **AND** o produto SHALL impedir nova tentativa enquanto uma execução anterior ainda puder gravar, sem armazenar texto clínico no navegador

#### Scenario: Negativas e revogação em todas as fronteiras

- **WHEN** Família, Administrador sem perfil Profissional, sessão inválida, Profissional sem vínculo ativo, outro caso, origem privada/rascunho, versão desatualizada, flag desligada ou chamada direta tentar consultar ou converter sem os controles exigidos
- **THEN** servidor e banco SHALL negar sem revelar conteúdo ou recibo de outro caso e sem gravar tarefa ou evolução
- **AND** revogação entre leitura e escrita SHALL impedir a conversão, com negativa auditada sem texto clínico

#### Scenario: Falha e formulário incompleto

- **WHEN** faltar campo humano obrigatório, área não estiver configurada, ocorrer falha de infraestrutura ou resultado não puder ser confirmado
- **THEN** o produto SHALL informar bloqueio ou incerteza de forma distinta de sucesso e manter os demais recursos disponíveis
