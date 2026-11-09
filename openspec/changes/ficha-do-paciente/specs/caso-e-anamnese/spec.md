## MODIFIED Requirements

### Requirement: FR-001 — Cadastrar caso com identificação necessária, nome de preferência, contatos, case

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Cadastrar caso com identificação necessária, nome de preferência, contatos, case manager e situação: entrada, ativo, pausado, encerrado ou transferido. Mudanças de situação devem ter data e motivo.

#### Scenario: Condição de aceite FR-001

- **WHEN** a funcionalidade FR-001 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Cadastrar caso com identificação necessária, nome de preferência, contatos, case manager e situação: entrada, ativo, pausado, encerrado ou transferido. Mudanças de situação devem ter data e motivo.

#### Scenario: Case manager e situação persistidos
- **WHEN** o Administrador registra a situação do caso e o case manager de um paciente fictício e consulta a ficha
- **THEN** a ficha apresenta a situação e o case manager persistidos, inclusive depois de recarregar a página

#### Scenario: Mudança de situação com data e motivo
- **WHEN** o Administrador confirma a mudança de situação informando o motivo
- **THEN** a nova situação é apresentada com motivo, data e autor definidos pelo servidor, e a situação anterior permanece consultável

#### Scenario: Mudança sem motivo
- **WHEN** pessoa tenta mudar a situação sem informar o motivo
- **THEN** a alteração é recusada e a situação vigente não muda

#### Scenario: Retomada preserva o histórico contínuo
- **WHEN** um caso pausado é retomado
- **THEN** registros e permissões anteriores permanecem e nenhum episódio independente é criado nem acesso revogado é restaurado

#### Scenario: Responsável não elegível
- **WHEN** o Administrador tenta indicar como case manager um usuário inexistente, sem acesso ativo ou com perfil Família
- **THEN** a indicação é recusada sem alterar o caso

#### Scenario: Case manager deixa de estar ativo
- **WHEN** o usuário indicado como case manager perde o acesso ativo
- **THEN** a ficha informa que o responsável está inativo e pede nova indicação, sem apagar o histórico de indicações

#### Scenario: Indicar responsável não concede acesso
- **WHEN** o Administrador indica como case manager um Profissional que não tem acesso ao paciente
- **THEN** nenhum acesso ao paciente é criado e o Profissional continua sem ler o caso

#### Scenario: Situação, responsável e motivo só para quem administra
- **WHEN** Profissional ou Família consulta o caso, inclusive por acesso direto, enquanto a leitura por esses perfis não estiver especificada e provada
- **THEN** a resposta não contém situação, responsável nem motivo da mudança

#### Scenario: Situação na lista de pessoas só para o Administrador
- **WHEN** o Administrador consulta a lista de pessoas
- **THEN** cada item traz a situação vigente do caso ou indica que falta completá-la, e a mesma lista consultada por Profissional ou Família não traz a situação

#### Scenario: Somente o Administrador altera
- **WHEN** um Profissional com acesso ao caso tenta alterar a situação ou o case manager
- **THEN** a alteração é recusada pelo servidor e pelo banco e o caso permanece inalterado

#### Scenario: Concorrência
- **WHEN** uma alteração usa versão desatualizada do caso
- **THEN** o sistema recusa a alteração e preserva o histórico existente

#### Scenario: Alteração sem autorização
- **WHEN** pessoa sem autorização aplicável ou com acesso revogado tenta alterar situação ou case manager, inclusive por acesso direto
- **THEN** a alteração é negada e nada muda

#### Scenario: Falha de persistência
- **WHEN** a gravação não é confirmada pela persistência
- **THEN** a interface informa falha ou resultado incerto e não apresenta sucesso nem dados fictícios como resposta real

### Requirement: FR-002 — Manter mapa de pessoas com vínculos distintos: paciente, familiar, cuidador

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Manter mapa de pessoas com vínculos distintos: paciente, familiar, cuidador, responsável legal, contato de emergência, profissional e responsável financeiro. Deve permitir uma pessoa com mais de um vínculo sem somar permissões automaticamente.

#### Scenario: Condição de aceite FR-002

- **WHEN** a funcionalidade FR-002 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter mapa de pessoas com vínculos distintos: paciente, familiar, cuidador, responsável legal, contato de emergência, profissional e responsável financeiro. Deve permitir uma pessoa com mais de um vínculo sem somar permissões automaticamente.

#### Scenario: Pessoa com mais de um vínculo
- **WHEN** pessoa autorizada registra uma mesma pessoa fictícia como familiar e responsável financeiro de um paciente
- **THEN** os dois vínculos aparecem separados na ficha e cada um mantém sua descrição

#### Scenario: Vínculo não concede acesso
- **WHEN** um vínculo é registrado, inclusive o de responsável financeiro
- **THEN** nenhuma conta é criada e a pessoa não ganha acesso ao diário nem a dados de saúde do paciente

#### Scenario: Alteração concorrente de vínculo
- **WHEN** a alteração de um vínculo usa versão desatualizada
- **THEN** o sistema recusa a alteração e preserva o vínculo existente

#### Scenario: Vínculo sem autorização
- **WHEN** pessoa sem autorização aplicável ou com acesso revogado tenta registrar ou alterar vínculo, inclusive por acesso direto
- **THEN** a operação é negada sem exposição das pessoas relacionadas

### Requirement: FR-006 — Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Deve mostrar responsável, data da revisão e informação ainda não incorporada.

#### Scenario: Condição de aceite FR-006

- **WHEN** a funcionalidade FR-006 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Deve mostrar responsável, data da revisão e informação ainda não incorporada.

#### Scenario: Resumo com dados disponíveis
- **WHEN** pessoa autorizada abre o resumo de um paciente fictício com situação, responsável, objetivos e tarefas persistidos
- **THEN** o resumo apresenta esses dados com a data da última atualização de cada um

#### Scenario: Campos sem fonte conectada
- **WHEN** o resumo inclui atenção sinalizada, agenda, próxima revisão ou informação ainda não incorporada e a respectiva fatia não está disponível
- **THEN** o campo é indicado como indisponível nesta versão, sem valor de exemplo nem ausência apresentada como inexistência

#### Scenario: Resumo sem autorização
- **WHEN** pessoa sem autorização aplicável ou com acesso revogado consulta o resumo, inclusive por acesso direto
- **THEN** o acesso é negado sem exposição de conteúdo, trechos ou contagens

## ADDED Requirements

### Requirement: Cadastro completo de caso novo

**Fase de origem**: Inicial (complementa FR-001/002). Decisão do solicitante em 08/11/2026; substitui o cadastro mínimo DF-019 de 16/10/2026 para casos novos.

O produto SHALL exigir, ao cadastrar um caso novo, nome, nome de preferência, data de nascimento, ao menos um contato, situação e case manager, sem valor padrão. O produto SHALL NOT exigir CPF, familiar nem anamnese para salvar.

#### Scenario: Cadastro completo persistido
- **WHEN** o Administrador cadastra paciente fictício com todos os campos exigidos e consulta a ficha
- **THEN** a ficha apresenta nome, preferência, nascimento, contato, situação e case manager persistidos, inclusive depois de recarregar a página

#### Scenario: Campo exigido ausente
- **WHEN** o cadastro de caso novo não informa algum dos campos exigidos, ou informa só espaços
- **THEN** a operação é rejeitada com indicação do campo e nenhum paciente, contato ou situação é criado

#### Scenario: Falha parcial na gravação
- **WHEN** a gravação de uma das partes do cadastro (paciente, contato ou situação) não é confirmada
- **THEN** nenhum paciente parcial permanece e a interface informa falha ou resultado incerto sem apresentar sucesso

#### Scenario: Sem exigência de CPF, familiar ou anamnese
- **WHEN** o Administrador cadastra um caso novo sem CPF, sem familiar vinculado e sem anamnese
- **THEN** o cadastro é aceito, pois esses itens não fazem parte do que é exigido

#### Scenario: Caso anterior sem os campos novos
- **WHEN** a ficha de um paciente cadastrado antes desta exigência não tem situação, case manager, contato, nascimento ou preferência
- **THEN** cada campo ausente é indicado como "a completar", sem valor inventado, e o Administrador pode completá-lo

#### Scenario: Cadastro sem autorização
- **WHEN** pessoa sem perfil Administrador tenta cadastrar caso novo, inclusive por acesso direto
- **THEN** a operação é negada e nada é criado
