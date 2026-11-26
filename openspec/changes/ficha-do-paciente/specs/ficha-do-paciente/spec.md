# Spec Delta

## Purpose

Define como a aplicação apresenta a lista de pessoas acompanhadas e a ficha de cada paciente, reunindo somente dados autorizados e consultados com sucesso, com estados honestos e uso confortável no celular. Apoia FR-006 sem criar requisito clínico, permissão ou prioridade nova.

## ADDED Requirements

### Requirement: Lista de pessoas acompanhadas

**Fase de origem**: Inicial (apoio a FR-006).

O produto SHALL apresentar as pessoas acompanhadas que o usuário está autorizado a consultar e abrir a ficha da pessoa escolhida. Cada linha SHALL mostrar nome e, quando existir, nome de preferência. A busca por nome SHALL informar que alcança apenas os pacientes já carregados.

#### Scenario: Lista consultada e ficha aberta
- **WHEN** pessoa autorizada abre a lista e escolhe um paciente fictício existente
- **THEN** a lista apresenta os pacientes persistidos e a ficha do paciente escolhido é aberta

#### Scenario: Lista realmente vazia
- **WHEN** a consulta é concluída com sucesso e não há paciente
- **THEN** a interface informa que não há pacientes cadastrados e oferece o cadastro

#### Scenario: Falha na consulta
- **WHEN** a consulta da lista falha ou o acesso é negado
- **THEN** a interface informa a falha e oferece nova tentativa, sem nomes, contagens ou dados de exemplo

#### Scenario: Lista maior que uma página
- **WHEN** há mais pacientes do que cabem em uma página
- **THEN** a lista carrega as páginas seguintes sem omitir nem repetir pacientes

#### Scenario: Busca limitada aos carregados
- **WHEN** pessoa digita um nome na busca e há pacientes ainda não carregados
- **THEN** a lista filtra os pacientes carregados e informa que os demais só aparecem ao carregar mais páginas, sem declarar que nenhum outro paciente existe

### Requirement: Ficha organizada por seções

**Fase de origem**: Inicial (apoio a FR-006).

A ficha SHALL ter cabeçalho com a identificação da pessoa e navegação por seções, e cada seção SHALL consultar apenas o serviço autorizado que lhe corresponde. A seção atual SHALL ser indicada por texto e a navegação SHALL funcionar por teclado.

#### Scenario: Seção com dados persistidos
- **WHEN** pessoa autorizada abre uma seção que tem dados persistidos para o paciente
- **THEN** a seção apresenta esses dados e nenhum dado de outro paciente

#### Scenario: Troca de paciente
- **WHEN** pessoa fecha a ficha e abre outro paciente
- **THEN** nenhum conteúdo do paciente anterior permanece visível ou disponível para ação

#### Scenario: Saída com alteração não salva
- **WHEN** pessoa tenta trocar de seção ou fechar a ficha com alteração ainda não salva
- **THEN** a interface pede confirmação antes de descartar a alteração

#### Scenario: Acesso perdido durante o uso
- **WHEN** sessão ou concessão deixa de valer enquanto a ficha está aberta
- **THEN** o conteúdo carregado é removido e a pessoa é orientada a entrar novamente

### Requirement: Seção sem fonte conectada

**Fase de origem**: Inicial (apoio a FR-006).

Seção prevista para a ficha sem serviço conectado SHALL ser indicada como indisponível nesta versão. A interface SHALL NOT apresentar conteúdo de exemplo nem sugerir que registro foi feito ou enviado.

#### Scenario: Seção ainda não implementada
- **WHEN** pessoa abre uma seção cujo serviço ainda não existe
- **THEN** a seção informa que não está disponível e não apresenta dados nem ações de gravação

#### Scenario: Ausência de dados diferente de indisponibilidade
- **WHEN** a consulta de uma seção conectada é concluída sem registros
- **THEN** a seção informa que ainda não há registros, distinguindo esse estado de indisponível ou de erro

### Requirement: Visão do caso com dados consultados

**Fase de origem**: Inicial (apoio a FR-006).

A visão do caso SHALL resumir, a partir de dados autorizados e consultados com sucesso, a identificação, os objetivos ativos, as tarefas pendentes e as seções da anamnese ainda incompletas. Cada bloco SHALL indicar a data da última atualização e SHALL distinguir informação não carregada de informação ausente.

#### Scenario: Visão com dados disponíveis
- **WHEN** pessoa autorizada abre a visão de um paciente fictício com objetivos, tarefas e anamnese persistidos
- **THEN** cada bloco apresenta os dados persistidos com a data da última atualização

#### Scenario: Falha parcial
- **WHEN** a consulta de um bloco falha e as demais são concluídas
- **THEN** o bloco com falha informa o erro e oferece nova tentativa, e os demais blocos continuam apresentados

#### Scenario: Conteúdo restrito
- **WHEN** parte do caso não é autorizada para a pessoa que consulta
- **THEN** o conteúdo e seus trechos não aparecem na visão, em títulos ou em contagens

#### Scenario: Persistência após recarregar
- **WHEN** pessoa autorizada recarrega a página depois de registrar dado fictício em uma seção
- **THEN** a visão do caso apresenta o dado registrado

### Requirement: Uso no celular e acessibilidade

**Fase de origem**: Inicial (PRODUCT.md, acessibilidade e inclusão).

A lista e a ficha SHALL ser utilizáveis em tela de celular sem rolagem horizontal da página, com campos de 16px, foco visível, uso por teclado e estados indicados também por texto. Texto normal SHALL ter contraste mínimo de 4,5:1.

#### Scenario: Tela estreita
- **WHEN** a lista e a ficha são abertas em tela de 390 por 844 pixels
- **THEN** todo o conteúdo e as ações ficam alcançáveis sem rolagem horizontal da página

#### Scenario: Texto longo
- **WHEN** um paciente fictício tem nome longo e conteúdo extenso em uma seção
- **THEN** o texto quebra linha sem sobrepor outros elementos nem estourar a largura

#### Scenario: Uso somente por teclado
- **WHEN** pessoa percorre lista, seções e ações apenas com o teclado
- **THEN** a ordem de foco é lógica e o elemento focado é sempre visível
