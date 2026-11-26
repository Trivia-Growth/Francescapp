## MODIFIED Requirements

### Requirement: FR-015 — Manter plano de cuidado por caso com objetivos da pessoa

**Fase de origem**: Inicial.

O produto SHALL manter plano por caso com objetivos da pessoa e da equipe, área, responsável, situação inicial, forma de observar progresso e data de revisão. O nome PTS só será usado se corresponder à prática validada da equipe. Campos adicionais seguem catálogo global administrado pela plataforma; autor do objetivo/revisão mantém responsabilidade pela validação clínica, sem segunda aprovação obrigatória.

#### Scenario: Condição de aceite FR-015

- **WHEN** a funcionalidade FR-015 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Manter plano de cuidado por caso com objetivos da pessoa e da equipe, área, responsável, situação inicial, forma de observar progresso e data de revisão. O nome PTS só será usado se corresponder à prática validada da equipe.

#### Scenario: Objetivo registrado e consultado
- **WHEN** pessoa autorizada registra objetivo fictício com os dados previstos e consulta o caso
- **THEN** o objetivo persistido e seus dados são apresentados no caso correspondente

#### Scenario: Acesso negado
- **WHEN** pessoa sem autorização, sem vínculo aplicável ou com acesso revogado tenta consultar ou alterar o objetivo, inclusive por acesso direto
- **THEN** o acesso é negado sem exposição do conteúdo

#### Scenario: Falha de persistência
- **WHEN** o registro não é confirmado pela persistência
- **THEN** a interface informa falha e não apresenta sucesso nem dados fictícios como resposta real

### Requirement: FR-016 — Acompanhar objetivos como proposto, em andamento, atingido, pausado, revisar ou

**Fase de origem**: Inicial.

O produto SHALL acompanhar objetivos como proposto, em andamento, atingido, pausado, revisar ou encerrado. Mudanças e revisões SHALL preservar motivo, data, responsável e versões anteriores consultáveis. Periodicidade e validação clínica serão definidas pela equipe, sem regras automáticas presumidas.

#### Scenario: Condição de aceite FR-016

- **WHEN** a funcionalidade FR-016 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Acompanhar objetivos como proposto, em andamento, atingido, pausado, revisar ou encerrado. Revisões devem manter motivo, data e versões anteriores.

#### Scenario: Revisão preserva histórico
- **WHEN** pessoa autorizada confirma revisão de objetivo com motivo
- **THEN** a versão anterior permanece consultável e a revisão apresenta motivo, data e responsável

#### Scenario: Concorrência
- **WHEN** uma revisão usa versão desatualizada
- **THEN** o sistema recusa a alteração e preserva o histórico existente

#### Scenario: Revisão sem autorização
- **WHEN** pessoa sem autorização aplicável ou com acesso revogado tenta revisar objetivo
- **THEN** a alteração é negada e o histórico não muda

#### Scenario: Catálogo global e valores adicionais (decisões confirmadas 10/11/2026)
- **WHEN** Administrador mantém um campo global do tipo texto, número, data ou lista de 1 a 20 opções
- **THEN** o sistema SHALL criar, editar ou desativar a definição com versão esperada; somente colaborador admitido SHALL consultar o catálogo para preencher valores opcionais por objetivo
- **AND** valores SHALL permanecer no envelope cifrado, com tipo/opção e atividade validados no servidor e versão do catálogo reconferida pelo banco

#### Scenario: Revisão conserva campos adicionais
- **WHEN** um objetivo com valores adicionais é revisado pela interface
- **THEN** o sistema SHALL apresentar e preservar os valores, sem omissão silenciosa na versão vigente
- **AND** valor desconhecido/desativado SHALL permanecer visível e bloquear revisão até regularização; valor incompatível com tipo/opção corrente SHALL exigir correção explícita

#### Scenario: Aprovação é carimbo por versão
- **WHEN** Administrador ou colaborador indicado com permissão vigente aprova uma versão autorizada
- **THEN** o sistema SHALL preservar quem aprovou e quando, vinculados ao registro específico retornado pelo banco
- **AND** ausência ou negativa de aprovação SHALL NOT impedir registro/revisão por pessoa que mantém autorização clínica vigente
