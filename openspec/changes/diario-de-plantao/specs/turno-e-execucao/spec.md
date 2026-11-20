# Spec Delta

## Purpose

Dar ao Acompanhante Terapêutico e à enfermagem a ficha de plantão que já usam em papel
como superfície única de registro, gravando em cada tabela canônica existente, e
apresentar o consolidado diário nesse mesmo formato. O sistema registra o que pessoas
identificadas observaram e executaram; não produz diagnóstico, gravidade, risco nem
decisão clínica.

## ADDED Requirements

### Requirement: FR-073 — Registrar o plantão por uma ficha única que grava nas tabelas canônicas existentes

**Fase de origem**: Evolução.

O produto SHALL oferecer ao profissional do turno aberto uma ficha de plantão única que
reúne os campos do Diário de acompanhamento. Cada campo SHALL ser persistido na tabela
canônica já existente para o seu conteúdo, sem criar armazenamento paralelo para
alimentação, medicação ou intercorrência. A submissão SHALL ser atômica: ou todos os
registros da ficha são gravados, ou nenhum é.

#### Scenario: Ficha preenchida grava em cada tabela canônica
- **WHEN** profissional com vínculo ativo e turno aberto envia ficha fictícia com rotina, alimentação, medicação administrada e intercorrência
- **THEN** cada conteúdo é persistido na sua tabela canônica, vinculado ao turno, ao caso e ao autor identificado, sem criar cópia em outra tabela

#### Scenario: Falha parcial não deixa meia-ficha
- **WHEN** a gravação de um dos registros da ficha falha
- **THEN** nenhum registro da ficha é persistido, a interface informa a falha sem sucesso falso e o rascunho permanece recuperável

#### Scenario: Ficha não duplica conteúdo já registrado isoladamente
- **WHEN** o mesmo turno recebeu antes um registro avulso de refeição e a ficha é enviada em seguida
- **THEN** a ficha apresenta o registro existente e o retifica por versão quando alterado, sem criar segunda linha para o mesmo evento

#### Scenario: Ficha sem vínculo ativo é negada
- **WHEN** pessoa sem vínculo ativo no caso, com acesso revogado ou de perfil familiar envia a ficha, inclusive por acesso direto ao servidor ou ao banco
- **THEN** a operação é negada no servidor e no banco, nada é persistido e a tentativa é auditada

### Requirement: FR-074 — Guardar e recuperar rascunho da ficha e preservar o histórico de edição

**Fase de origem**: Evolução.

O produto SHALL permitir salvar a ficha como rascunho e recuperá-la depois, pelo mesmo
autor e no mesmo turno, sob a autorização do caso. O rascunho NÃO SHALL ser apresentado
como registro publicado nem alcançar a audiência familiar. Toda alteração após a
publicação SHALL gerar versão nova com motivo e autor, preservando a versão anterior,
sem sobrescrever nem apagar.

#### Scenario: Rascunho recuperado pelo autor
- **WHEN** o profissional salva a ficha incompleta e volta à tela depois
- **THEN** o conteúdo salvo é recuperado, identificado como rascunho não publicado, e nenhum registro publicado foi criado nesse intervalo

#### Scenario: Rascunho não é visível a terceiros
- **WHEN** outro profissional do caso, familiar autorizado ou consulta de relatório alcança o período do rascunho
- **THEN** o rascunho não é apresentado em nenhuma superfície nem exportação, e sua existência não é revelada

#### Scenario: Edição após publicação cria versão com motivo
- **WHEN** o autor corrige um campo já publicado da ficha informando motivo
- **THEN** uma versão nova é persistida com motivo, autor e instante, e a versão anterior permanece consultável e íntegra

#### Scenario: Edição sem motivo é recusada
- **WHEN** a correção de um campo já publicado é enviada sem motivo
- **THEN** a operação é recusada, nada é alterado e a versão vigente permanece a anterior

### Requirement: FR-075 — Registrar o período do plantão como diurno ou noturno

**Fase de origem**: Evolução.

O produto SHALL registrar o período do plantão no turno, em conjunto administrado que
contém ao menos diurno e noturno. O período SHALL ser declarado pelo profissional, NÃO
SHALL ser inferido do relógio e NÃO SHALL ser confundido com o tipo de escala de FR-056
(previsto, substituição, cobertura), que permanece inalterado.

#### Scenario: Período declarado no plantão
- **WHEN** o profissional abre ou identifica o turno informando o período
- **THEN** o período é persistido no turno e aparece na ficha e no consolidado

#### Scenario: Período não é inferido do horário
- **WHEN** o turno é aberto sem o período informado
- **THEN** o sistema não escolhe um período por conta própria, apresenta o campo como não informado e não impede o restante do registro

#### Scenario: Valor fora do conjunto administrado é recusado
- **WHEN** o período enviado está fora do conjunto administrado
- **THEN** o registro é recusado e nada é persistido

#### Scenario: Período não altera o tipo de escala
- **WHEN** o turno é uma substituição ou cobertura de FR-056
- **THEN** o tipo de escala permanece como registrado e o período do plantão é informação distinta, sem sobrescrevê-lo

### Requirement: FR-076 — Registrar estado emocional observado, atividades e observações do plantão como declaração identificada

**Fase de origem**: Evolução.

O produto SHALL permitir registrar, por plantão, o estado emocional observado, as
atividades realizadas e as observações do período, cada um com quem observou e quando. O
estado emocional SHALL ser tratado como observação declarada, NÃO como medida clínica,
escala validada ou pontuação. O sistema NÃO SHALL derivar desses campos diagnóstico,
gravidade, risco, tendência ou alerta.

#### Scenario: Estado emocional registrado como observação declarada
- **WHEN** o profissional registra o estado emocional observado no plantão fictício
- **THEN** o registro é persistido com o observador identificado, o instante e o rótulo de observação declarada, sem pontuação, escala ou classificação

#### Scenario: Atividades e observações do plantão são do plantão
- **WHEN** o profissional preenche atividades e observações na ficha
- **THEN** o conteúdo é vinculado ao plantão e ao caso, distinto da observação por registro de rotina de FR-064 e distinto da evolução profissional de FR-009

#### Scenario: Nenhuma leitura clínica é derivada
- **WHEN** uma sequência de estados emocionais é consultada por período
- **THEN** os registros são apresentados em ordem cronológica com autor, sem rótulo de gravidade, risco, tendência, alerta ou sugestão de conduta

#### Scenario: Campos vazios não impedem o plantão
- **WHEN** a ficha é enviada sem estado emocional, atividades ou observações, e esses campos não estão marcados como obrigatórios no modelo vigente
- **THEN** a ficha é aceita e os demais registros do plantão permanecem válidos e consultáveis

### Requirement: FR-077 — Registrar pendência escrita do plantão, distinta das pendências derivadas

**Fase de origem**: Evolução.

O produto SHALL permitir que o profissional escreva pendências do plantão, com autor,
instante e situação explícita de aberta ou resolvida. A pendência escrita SHALL ser
distinguível das pendências derivadas de FR-027/FR-028 em toda superfície. O sistema NÃO
SHALL fechar pendência escrita por tempo decorrido, consulta ou inferência.

#### Scenario: Pendência escrita registrada
- **WHEN** o profissional escreve uma pendência fictícia na ficha do plantão
- **THEN** a pendência é persistida vinculada ao plantão e ao caso, com autor, instante e situação aberta

#### Scenario: Pendência escrita não se confunde com derivada
- **WHEN** a lista de pendências do caso é consultada
- **THEN** as pendências escritas são apresentadas com origem declarada e as derivadas com a sua, sem mistura de origem

#### Scenario: Resolução é ato explícito
- **WHEN** ninguém registra a resolução da pendência escrita
- **THEN** ela permanece aberta, sem fechamento automático por tempo, consulta ou troca de turno

#### Scenario: Resolução por pessoa autorizada preserva o histórico
- **WHEN** pessoa autorizada registra a resolução da pendência escrita
- **THEN** a resolução é persistida com autor e instante, e o texto e a autoria originais permanecem íntegros

### Requirement: FR-078 — Administrar o modelo da ficha com acréscimo, ordem, obrigatoriedade e desativação, sem apagar resposta antiga

**Fase de origem**: Evolução.

O produto SHALL permitir que o Administrador autorizado acrescente campos ao modelo da
ficha, defina a ordem de apresentação, marque obrigatoriedade e desative campos,
inclusive os de fábrica. Nenhuma operação do modelo SHALL apagar, reescrever ou
reinterpretar resposta já gravada. Escrita nova sob modelo alterado entre a leitura e o
envio SHALL ser recusada com conflito, nunca ajustada em silêncio.

#### Scenario: Campo acrescentado e ordenado pelo Administrador
- **WHEN** o Administrador autorizado acrescenta um campo e define sua posição
- **THEN** o campo passa a aparecer na ficha na posição definida e as fichas já gravadas permanecem inalteradas

#### Scenario: Campo desativado preserva a resposta antiga
- **WHEN** um campo com respostas gravadas é desativado, inclusive um campo de fábrica
- **THEN** ele deixa de ser oferecido em fichas novas, nenhuma resposta é apagada, e as respostas antigas continuam legíveis e identificadas como de campo desativado

#### Scenario: Obrigatoriedade vale para a frente
- **WHEN** um campo passa a ser obrigatório
- **THEN** fichas novas sem ele são recusadas e fichas antigas sem resposta permanecem válidas, sem serem marcadas como incompletas ou corrigidas

#### Scenario: Modelo alterado durante o preenchimento gera conflito
- **WHEN** a ficha é enviada sob um retrato do modelo que deixou de ser o vigente
- **THEN** a gravação é recusada com conflito, nada é persistido e a interface apresenta o modelo vigente para nova confirmação

#### Scenario: Administração do modelo por quem não é Administrador é negada
- **WHEN** profissional ou familiar tenta acrescentar, reordenar, marcar obrigatório ou desativar campo, inclusive por acesso direto
- **THEN** a operação é negada no servidor e no banco, o modelo permanece inalterado e a tentativa é auditada

### Requirement: FR-079 — Registrar o papel declarado do profissional por catálogo administrado, sem efeito de autorização

**Fase de origem**: Evolução.

O produto SHALL registrar, em cada ficha de plantão, o papel declarado do profissional a
partir de catálogo administrado pelo Administrador, e SHALL apresentá-lo na ficha e no
consolidado. O papel declarado NÃO SHALL conceder, ampliar, restringir ou substituir
qualquer autorização: perfil e vínculo com o caso continuam sendo os únicos controles. O
enum de perfil NÃO SHALL ser alterado.

#### Scenario: Papel declarado gravado e impresso na ficha
- **WHEN** o profissional seleciona o seu papel do catálogo e envia a ficha
- **THEN** o papel é persistido no registro e aparece na ficha e no consolidado junto do nome do autor

#### Scenario: Papel não concede acesso
- **WHEN** alguém envia um papel de maior alcance aparente, como enfermeira, sem o vínculo ou o perfil exigidos pela ação
- **THEN** a ação é negada pelos mesmos controles de FR-063, o papel informado não altera o resultado e a tentativa é auditada

#### Scenario: Papel não restringe quem já está autorizado
- **WHEN** profissional autorizado registra conteúdo cujo papel declarado é outro ou está ausente
- **THEN** a autorização é decidida por perfil e vínculo, e o registro não é recusado por causa do papel

#### Scenario: Catálogo de papéis administrado preserva registros antigos
- **WHEN** o Administrador desativa ou renomeia um papel do catálogo
- **THEN** as fichas já gravadas continuam exibindo o papel que foi declarado à época, sem reescrita

### Requirement: FR-080 — Apresentar o consolidado diário no formato da ficha de plantão, respeitando a audiência de FR-062

**Fase de origem**: Evolução.

O produto SHALL apresentar o consolidado diário do caso no formato da ficha de plantão,
reunindo por plantão os registros canônicos do período, e SHALL oferecê-lo em PDF gerado
no servidor conforme FR-066. A audiência SHALL ser exatamente a de FR-062, sem regra
nova: equipe com vínculo ativo, e família somente com fundamento de autorização vigente
registrado no caso.

#### Scenario: Consolidado diário no formato da ficha
- **WHEN** pessoa autorizada consulta o consolidado de um dia do caso
- **THEN** o conteúdo é apresentado por plantão, nos campos da ficha, com período, papel declarado e autores identificados, em ordem cronológica e indicando lacunas de cobertura

#### Scenario: PDF com a mesma audiência da consulta
- **WHEN** pessoa autorizada exporta o consolidado em PDF
- **THEN** o PDF é gerado no servidor, contém somente o conteúdo da audiência aplicável e a exportação é registrada conforme FR-039

#### Scenario: Familiar sem fundamento de autorização é negado
- **WHEN** familiar vinculado ao caso, sem fundamento de autorização vigente, consulta ou exporta o consolidado no formato da ficha
- **THEN** o acesso é negado, o parentesco por si só não concede acesso e nada do conteúdo de saúde é revelado

#### Scenario: Dia sem plantão registrado
- **WHEN** o consolidado é consultado para um dia sem plantão
- **THEN** o estado vazio é apresentado após consulta real bem-sucedida, sem dados de exemplo e sem confundir vazio com falha

### Requirement: FR-081 — Registrar a fonte da informação e separar nota interna de conteúdo compartilhável, sem derivação clínica

**Fase de origem**: Evolução.

Cada resposta da ficha SHALL registrar a fonte da informação — observação direta do
profissional, relato do paciente, relato de familiar ou documento — junto de quem a
registrou. Cada campo SHALL ter visibilidade explícita de nota interna ou conteúdo
compartilhável. O sistema NÃO SHALL derivar diagnóstico, gravidade, risco, alerta ou
conduta a partir de qualquer campo da ficha.

#### Scenario: Fonte registrada em cada resposta
- **WHEN** o profissional registra um conteúdo informado pela família na ficha
- **THEN** a resposta é persistida com a fonte declarada e o registrador identificado, e a fonte é apresentada junto do conteúdo em toda superfície

#### Scenario: Nota interna não alcança a audiência familiar
- **WHEN** familiar com fundamento de autorização vigente consulta a ficha ou o consolidado que contém campos marcados como nota interna
- **THEN** somente o conteúdo compartilhável é apresentado, sem indicar o teor do conteúdo omitido

#### Scenario: Mudança de visibilidade é ato registrado
- **WHEN** pessoa autorizada muda um campo de nota interna para compartilhável, ou o contrário
- **THEN** a mudança é persistida com autor, instante e motivo, e a visibilidade anterior permanece no histórico

#### Scenario: Nenhuma conduta é sugerida pelo sistema
- **WHEN** a ficha reúne estado emocional, rotina, alimentação, medicação e intercorrência do plantão
- **THEN** nenhuma pontuação, classificação de gravidade, alerta clínico, predição ou sugestão de conduta é produzida pelo sistema em nenhuma superfície ou exportação
