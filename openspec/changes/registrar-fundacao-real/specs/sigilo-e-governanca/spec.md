# Spec Delta

## ADDED Requirements

### Requirement: Perfis fixos no núcleo inicial

O núcleo SHALL adotar Administrador, Profissional e Família como perfis fixos, com um único perfil por usuário com acesso concedido, sem acúmulo de perfis ou matriz extensa por funcionalidade. O perfil SHALL distinguir administração, visão da equipe e visão familiar; vínculos por paciente limitam os não administradores. Fase Inicial; complementa FR-035 a FR-037 e SC-007/SC-011.

#### Scenario: Atribuir um perfil

- **WHEN** um usuário autorizado definir o acesso de um participante
- **THEN** seleciona o perfil fixo aplicável e os vínculos de pacientes necessários, sem configurar dezenas de permissões por funcionalidade.

#### Scenario: Entrar com conta institucional

- **WHEN** uma pessoa entrar pelo Google Workspace
- **THEN** o sistema usa o perfil efetivamente concedido; o login institucional não a torna Administrador automaticamente.

#### Scenario: Tentar acumular perfis

- **WHEN** uma operação tentar atribuir mais de um perfil ao mesmo usuário
- **THEN** a operação é rejeitada e não soma privilégios de Administrador, Profissional ou Família.

#### Scenario: Substituição autorizada do perfil

- **WHEN** uma alteração autorizada substituir o perfil de um usuário
- **THEN** o novo perfil é o único aplicável às ações seguintes, com auditoria; o perfil anterior não continua concedendo privilégios residuais.

### Requirement: Cadastro prévio da equipe por administrador

A entrada autorizada de profissionais da equipe SHALL depender de cadastro prévio por Administrador, com perfil e vínculos aplicáveis. Autenticar pelo Google Workspace MUST NOT criar por si só a concessão de acesso ao produto ou à carteira. A concessão administrativa inicial é tratada separadamente, sem autopromoção pelo navegador. Fase Inicial; complementa FR-035/037.

#### Scenario: Profissional previamente cadastrado

- **WHEN** um profissional com concessão válida previamente cadastrada entrar pelo Google Workspace
- **THEN** utiliza seu perfil único e os vínculos vigentes; não recebe acesso a pacientes fora desse escopo.

#### Scenario: Conta Google sem concessão prévia

- **WHEN** uma pessoa autenticar pelo Google sem cadastro e concessão de acesso prévios
- **THEN** não recebe dados protegidos ou perfil automático; encontra orientação para solicitar acesso a um administrador.

### Requirement: Administração delegável com acesso à carteira completa

Edilaine SHALL poder delegar a administração a outras pessoas por concessão explícita do perfil Administrador. Administradores SHALL acessar a carteira completa da Francescato, configurações, cadastros e gestão de acessos, sem vínculo individual com cada paciente. Concessões e revogações SHALL manter autoria e data conforme FR-037/FR-039. Fase Inicial.

#### Scenario: Delegar a administração

- **WHEN** Edilaine conceder o perfil Administrador a uma pessoa
- **THEN** essa pessoa pode administrar o sistema e acessar toda a carteira usando sua própria identidade; a concessão fica identificada na auditoria.

#### Scenario: Administrador sem vínculo individual com um paciente

- **WHEN** um Administrador ativo abrir um paciente da carteira da Francescato
- **THEN** recebe a visão de coordenação do caso e as funções administrativas sem exigir vínculo individual com esse paciente; não usa credencial coletiva para exercer esse acesso.

#### Scenario: Remover o perfil Administrador

- **WHEN** o perfil Administrador de uma pessoa for revogado
- **THEN** novas ações não usam mais essa autorização e o acesso restante depende do perfil e dos vínculos ainda válidos; não recebe automaticamente acesso a todos os casos como Profissional ou Família.

### Requirement: Visão da equipe ou da família nos pacientes vinculados

Profissionais SHALL acessar somente pacientes vinculados com a visão autorizada da equipe. Familiares SHALL acessar somente pacientes vinculados, seus próprios relatos e conteúdo disponibilizado à família. O vínculo MUST NOT expor automaticamente evoluções internas ou relatos de outros familiares. Fase Inicial; preserva FR-036, FR-042 e as audiências dos registros/anexos.

#### Scenario: Profissional vinculado

- **WHEN** um Profissional consultar um paciente com vínculo válido
- **THEN** encontra o conteúdo disponibilizado à equipe nesse caso e as ações do seu perfil, preservando autoria e audiências dos registros.

#### Scenario: Profissional sem vínculo

- **WHEN** um Profissional tentar consultar um paciente ao qual não esteja vinculado
- **THEN** não obtém informações protegidas desse caso, inclusive em busca, resumo, anexos e acesso direto.

#### Scenario: Família no paciente autorizado

- **WHEN** um Familiar consultar um paciente com vínculo válido
- **THEN** vê seus próprios relatos e o conteúdo disponibilizado à família, sem receber a visão interna da equipe por compartilhar o mesmo paciente.

#### Scenario: Mais de um familiar no mesmo paciente

- **WHEN** dois familiares estiverem vinculados ao mesmo paciente
- **THEN** o vínculo comum não torna automaticamente visíveis os relatos de um ao outro; compartilhamentos seguem a audiência explicitamente disponibilizada.

#### Scenario: Rascunhos e material não compartilhado

- **WHEN** um participante consultar um caso com rascunhos ou conteúdo ainda não disponibilizado à sua audiência
- **THEN** o sistema mantém a privacidade de rascunhos prevista em FR-036 e não amplia compartilhamento pela simplificação dos perfis. O núcleo não passa a incluir notas clínicas privadas detalhadas por essa decisão.

### Requirement: Autorizações efetivas fora da interface

O sistema SHALL conferir perfil, vínculo e audiência aplicáveis ao executar consultas e ações, sem depender apenas de filtros ou controles ocultos no frontend. Tentativas sem autorização MUST NOT retornar dados protegidos nem sucesso simulado. Fase Inicial; complementa FR-035, FR-037, FR-042 e SC-007/SC-011.

#### Scenario: Acesso por identificador direto

- **WHEN** um não administrador tentar abrir diretamente o identificador de um paciente sem vínculo
- **THEN** a operação é negada e nenhum conteúdo protegido é retornado, mesmo que a interface seja contornada.

#### Scenario: Usuário tenta ampliar o próprio perfil

- **WHEN** um Profissional ou Familiar tentar modificar o perfil ou os vínculos para obter acesso administrativo ou a outro paciente
- **THEN** a operação é negada; valores enviados pelo navegador não constituem concessão de acesso.

#### Scenario: Vínculo de paciente removido

- **WHEN** o vínculo de um não administrador com um paciente for removido
- **THEN** consultas e ações subsequentes deixam de conceder acesso a esse caso; dados antigos ou simulações não restauram a autorização.

### Requirement: Agenda global mantém visualização e edição separadas

A agenda global SHALL preservar as permissões individuais “Pode visualizar” e “Pode editar” já definidas em FR-037. Simplificar os perfis administrativos MUST NOT eliminar esses controles nem conceder acesso a pacientes por uma permissão de agenda. Fase Inicial; preserva FR-049 e SC-011.

#### Scenario: Somente consulta à agenda global

- **WHEN** uma pessoa tiver “Pode visualizar” sem “Pode editar” na agenda global
- **THEN** consulta compromissos permitidos, mas novas alterações são negadas, independentemente de controles apresentados pela interface.

#### Scenario: Perfil sem permissão de agenda global

- **WHEN** um participante tentar acessar a agenda global sem as permissões aplicáveis
- **THEN** o perfil ou vínculo de paciente não substitui essas permissões; a configuração global continua explícita.
