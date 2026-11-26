# Spec Delta

## Purpose

Organizar a entrada e a navegação do FFCMApp em torno das ações de coordenação que cada pessoa pode realizar, usando informações reais e autorizadas.

## ADDED Requirements

### Requirement: Experiência mínima demonstrada no mock

O produto SHALL oferecer, aos perfis autorizados, jornadas e hierarquia visual equivalentes ao mock em Meu dia, carteira, ficha, diário, plano, próximos passos, agenda, equipe, documentos e orientações. Recursos adicionais úteis SHALL permanecer acessíveis. Participação direta do paciente permanece hipótese de Evolução.

#### Scenario: Jornada de coordenação

- **WHEN** a pessoa de coordenação autorizada abrir a entrada e um caso preenchido
- **THEN** poderá identificar mudanças, acessar relatos recentes, objetivos, pendências, compromissos, equipe, documentos e orientações e seguir às ações permitidas, respeitando a organização e hierarquia demonstradas no mock.

#### Scenario: Jornada profissional e familiar

- **WHEN** profissionais ou familiares autorizados acessarem as jornadas aplicáveis
- **THEN** poderão realizar os registros, consultas e retornos previstos nos requisitos existentes, com apresentação adequada ao perfil e sem ampliar a audiência.

#### Scenario: Simulação ou integração indisponível

- **WHEN** áudio, documento, agenda ou outra fonte ainda não estiver conectada ou falhar
- **THEN** a interface informará sua situação e não apresentará exemplo, armazenamento local ou simulação como operação concluída.

#### Scenario: Recurso adicional

- **WHEN** um recurso já existente oferecer capacidade útil além do mock
- **THEN** permanecerá encontrável aos perfis autorizados sem substituir ou ocultar as jornadas mínimas demonstradas.

#### Scenario: Paridade visual e responsiva

- **WHEN** a interface for comparada ao mock em desktop e celular
- **THEN** serão reconhecíveis sua organização, hierarquia, navegação e relação entre conteúdo e ações, com leitura, foco e estados de erro acessíveis.

### Requirement: Entrada contextual por perfil

Para Administrador ou Profissional com carteira autorizada, o produto SHALL oferecer uma entrada “Seu dia” que reúna sinais e acessos úteis da carteira, sem revelar casos ou conteúdos fora do escopo da sessão. Esta apresentação complementa FR-026/027/028, fase Inicial.

#### Scenario: Administrador com casos e pendências

- **WHEN** um Administrador autorizado abrir a aplicação com casos fictícios que possuem sinais operacionais e próximos passos consultáveis
- **THEN** verá os itens com motivo e ligação para o caso e a seção correspondente, além de acesso à carteira completa.

#### Scenario: Profissional com carteira parcial

- **WHEN** um Profissional abrir “Seu dia”
- **THEN** verá somente casos e dados devolvidos pelos serviços autorizados para seus vínculos, sem contagem ou trecho de outros casos.

#### Scenario: Sem itens ou fonte falha

- **WHEN** não houver itens autorizados ou uma fonte estiver indisponível
- **THEN** a entrada distinguirá vazio de falha, permitirá nova tentativa quando couber e não apresentará conteúdo demonstrativo como dado do caso.

#### Scenario: Revogação durante a consulta

- **WHEN** o acesso ao caso ou à carteira for revogado durante o uso
- **THEN** a entrada deixará de mostrar dados protegidos e qualquer acesso direto subsequente será negado pelo servidor.

### Requirement: Navegação da ficha orientada por tarefas

A ficha SHALL tornar encontráveis visão do caso, histórico, plano, ações e informações de apoio, com nomes compreensíveis e indicação da seção atual. O agrupamento visual MUST preservar o acesso às funções permitidas e não conceder novas capacidades. Apoia FR-006/007/015 a FR-020, fase Inicial.

#### Scenario: Encontrar informação e agir

- **WHEN** uma pessoa autorizada abrir a ficha de um caso fictício preenchido
- **THEN** conseguirá alcançar últimos registros, objetivos, próximos passos e demais seções disponíveis sem percorrer uma faixa horizontal de abas para descobrir funções ocultas.

#### Scenario: Celular, teclado e recarga

- **WHEN** a ficha for usada em tela de celular, por teclado ou recarregada numa seção
- **THEN** a seção atual, o foco e a orientação de navegação permanecerão compreensíveis, sem perda de acesso a uma seção permitida.

#### Scenario: Seção sem autorização ou serviço indisponível

- **WHEN** o perfil não puder ler uma seção ou o serviço da seção falhar
- **THEN** a interface ocultará a seção sem autorização e distinguirá falha de serviço de ausência de registros, sem expor título, contagem ou trecho restrito.

### Requirement: Demonstração com dados conectados

A aceitação da experiência SHALL usar dados fictícios criados e consultados pelas operações conectadas, em casos preenchido e vazio, nos perfis aplicáveis. O mock visual não constitui prova de persistência, integração nem autorização. Apoia SC-001/002/007/009 e fase Inicial.

#### Scenario: Jornada preenchida

- **WHEN** um caso fictício tiver identificação, objetivo, registro e próximo passo criados por operações conectadas autorizadas
- **THEN** a entrada e a ficha apresentarão os dados correspondentes com origem e ações coerentes, sem textos ou pessoas embutidos no frontend.

#### Scenario: Jornada vazia e falha parcial

- **WHEN** outro caso não tiver registros ou uma das fontes falhar
- **THEN** cada área mostrará seu estado verdadeiro e as demais continuarão utilizáveis, sem sucesso presumido.
