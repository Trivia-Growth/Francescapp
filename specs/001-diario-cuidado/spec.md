# Especificação de projeto: Francescapp - Diário integrado do cuidado

**Feature Branch**: `chore/install-spec-kit-and-frontend-design`

**Created**: 2026-10-06

**Status**: Proposta de negócio v0.2 validada para evoluir com Google Workspace

**Input**: Centralizar informações do acompanhamento de pacientes, registros da equipe e da família, anamneses, imagens e documentos, agenda e diário por texto ou áudio transcrito. Após a validação com Edilaine, adotar Google Drive institucional para anexos classificados por pessoa acompanhada, acesso individual por contas do Google Workspace e visão consolidada da agenda geral e dos calendários autorizados no Google Agenda. Acrescentar sugestões relevantes à gestão de casos, sem definir arquitetura ou implementar o produto.

## Visão do projeto e contexto de negócio

O Francescapp será o espaço de coordenação do cuidado da Francescato: cada pessoa acompanhada terá um histórico organizado, um plano com objetivos e responsáveis, uma agenda e um diário que conecta acontecimentos em casa às observações da equipe. Edilaine poderá compreender a situação atual e acompanhar os encaminhamentos sem reconstruir o caso a partir de conversas dispersas. Os anexos ficarão organizados no Google Drive institucional por pessoa acompanhada e a agenda apresentará, no mesmo lugar, a agenda geral da Francescato e os calendários que cada participante autorizar.

A proposta responde à dor relatada de registros, anamneses e informações fragmentadas. A frequência das perdas de informação, o esforço de cobrança e o volume de casos ainda serão medidos com Edilaine; são hipóteses de descoberta, não dados já levantados.

### O que o posicionamento da Francescato acrescenta

O [serviço de Case Management](https://www.francescatoassessoria.com/casemanagement) descreve um acompanhamento colaborativo, com planejamento, coordenação, monitoramento e atenção à funcionalidade e autonomia. Isso orienta a proposta para ações e evolução do cuidado, além do armazenamento de documentos.

A página [Quem Somos](https://www.francescatoassessoria.com/quemsomos) associa a atuação à saúde mental, às relações familiares e ao apoio fora do consultório, incluindo rotina, consultas, medicação e recursos familiares. A descrição pública da formação da Edilaine é de administração e especializações; o acesso no sistema será definido pela função e pela necessidade, sem presumir habilitação clínica.

Os [estudos de caso publicados](https://www.francescatoassessoria.com/estudosdecaso) apresentam situações com conflito familiar e acompanhamento prolongado. Como inferência para o produto, parentesco ou pagamento não devem gerar acesso automático às informações. Os resultados divulgados no site não constituem metas clínicas nem comprovação de eficácia deste sistema.

A [CMSA](https://cmsa.org/the-impact-of-case-management-on-the-healthcare-system-3/) descreve avaliação, plano centrado na pessoa, coordenação, monitoramento e encerramento como componentes da gestão de casos. A proposta adapta essa orientação ao contexto da Francescato; não estabelece protocolo clínico.

### Resultado esperado

- Para Edilaine: saber o que mudou, quais pendências existem, quem deve agir e quando o caso foi revisado.
- Para a equipe: registrar rapidamente, consultar a síntese relevante e acompanhar os combinados entre áreas.
- Para a família e cuidadores: relatar acontecimentos, anexar imagens e encontrar orientações e compromissos autorizados.
- Para o paciente: ter objetivos e preferências respeitados, conhecer os combinados e participar conforme o modelo de acompanhamento acordado.

### Limites da proposta

O produto coordena informações e responsabilidades. Diagnósticos, condutas, prescrições e avaliação de risco pertencem aos profissionais habilitados. O diário familiar é uma fonte de observações e relatos, não uma avaliação clínica. A primeira versão não substitui automaticamente os prontuários obrigatórios de cada profissão; esse enquadramento será validado antes do uso com dados reais.

O nome “Francescapp” é provisório. O termo apresentado ao paciente pode ser “Meu acompanhamento”, e o registro central pode ser chamado “Registro integrado do cuidado”. A nomenclatura final será escolhida com Edilaine.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entender o caso antes de agir (Priority: P1)

Como case manager, Edilaine abre um caso e encontra a situação atual, mudanças recentes, equipe, objetivos, pendências e próximos compromissos.

**Why this priority**: É o principal ganho da centralização e o ponto de partida para coordenar o cuidado.

**Independent Test**: Demonstrar um caso fictício com registros, objetivos e pendências previamente cadastrados; pedir à case manager que prepare uma reunião.

**Acceptance Scenarios**:

1. Dado um caso com registros de diferentes autores, quando Edilaine consultar a linha do tempo, então verá os registros autorizados ordenados pela data do acontecimento, com autor, origem, data de publicação e audiência.
2. Dado um resumo revisado há uma semana e novos registros posteriores, quando abrir o resumo, então verá a data e o responsável pela revisão e um aviso de mudanças ainda não incorporadas.
3. Dado conteúdo restrito sem autorização para a case manager, quando pesquisar, filtrar, exportar ou consultar o resumo, então o conteúdo e seus trechos não serão expostos.

### User Story 2 - Registrar um acontecimento em casa (Priority: P1)

Como familiar ou cuidador autorizado, registro um acontecimento, o contexto e o que foi feito, por texto ou áudio, podendo anexar uma imagem.

**Why this priority**: O cuidado acontece também fora das sessões; as informações da rotina precisam chegar com contexto e autoria.

**Independent Test**: Um participante registra um acontecimento fictício pelo celular, sem acessar conteúdo profissional.

**Acceptance Scenarios**:

1. Dado um familiar autorizado no caso, quando selecionar “Registrar acontecimento”, então poderá informar quando ocorreu, categoria, descrição, contexto, ação tomada e necessidade de retorno.
2. Dado um áudio com trecho incerto, quando for apresentada a transcrição, então o autor poderá ouvir, corrigir e revisar a audiência antes de publicar; o trecho incerto não será completado como fato.
3. Dado um registro enviado à coordenação, quando o familiar acompanhar o envio, então distinguirá “enviado”, “consultado” e “retorno registrado”; envio ou leitura não serão apresentados como atendimento concluído.
4. Dado um registro com indicação de atenção imediata, quando iniciar o preenchimento, então verá as instruções de crise acordadas e os limites de resposta do serviço antes de depender do diário.

### User Story 3 - Compartilhar uma evolução profissional curta (Priority: P1)

Como profissional da equipe, registro a síntese necessária à coordenação após o atendimento, usando um modelo da minha área.

**Why this priority**: Sem baixo esforço de preenchimento, a centralização não terá informação atualizada.

**Independent Test**: Um profissional registra uma síntese fictícia e gera um encaminhamento para outro participante autorizado.

**Acceptance Scenarios**:

1. Dado um atendimento realizado, quando o profissional registrar a evolução, então poderá preencher atividade, observações relevantes, relação com um objetivo, orientação e próximo passo.
2. Dada informação que deve permanecer no registro profissional restrito, quando preparar a síntese, então o profissional selecionará apenas o necessário ao cuidado compartilhado e verá os destinatários antes de confirmar.
3. Dada uma evolução publicada com erro, quando o autor corrigi-la, então a retificação terá data, motivo e autoria e preservará o histórico de versões para os responsáveis autorizados.

### User Story 4 - Conhecer a pessoa e organizar a entrada no acompanhamento (Priority: P1)

Como case manager, organizo a entrada do caso com informações da pessoa, contexto familiar, prioridades, documentos e avaliações da equipe.

**Why this priority**: Cria uma base reutilizável e reduz a repetição das mesmas perguntas a cada profissional.

**Independent Test**: Concluir a entrada de um caso fictício, inclusive com informações desconhecidas e documentos ainda pendentes.

**Acceptance Scenarios**:

1. Dado um caso novo, quando a anamnese for preenchida em etapas, então respostas desconhecidas ou ainda não obtidas poderão ser identificadas sem inventar informação e o progresso será preservado.
2. Dado um diagnóstico informado pela família, quando for registrado, então aparecerá como relato da família, com fonte e data, sem se tornar diagnóstico confirmado.
3. Dado um familiar que também é responsável financeiro, quando seus vínculos forem cadastrados, então o vínculo financeiro não concederá acesso ao diário ou a dados de saúde.

### User Story 5 - Transformar informações em plano e ações (Priority: P1)

Como case manager e equipe, defino objetivos relevantes para a pessoa acompanhada e converto observações em ações com responsáveis e prazos.

**Why this priority**: O histórico só entrega coordenação quando leva a decisões e acompanhamento dos combinados.

**Independent Test**: Criar um objetivo fictício, registrar uma ação e revisar seu andamento com evidências.

**Acceptance Scenarios**:

1. Dado um objetivo como retomar uma atividade de rotina, quando for incluído no plano, então terá descrição, responsável, situação inicial, evidência de progresso e data de revisão.
2. Dada uma recomendação na evolução, quando gerar uma tarefa, então a tarefa manterá referência ao registro e a audiência adequada.
3. Dado um objetivo alterado, quando a revisão for confirmada, então o plano anterior permanecerá consultável e a mudança terá motivo e responsável.

### User Story 6 - Acompanhar agenda e continuidade do cuidado (Priority: P1)

Como case manager ou participante autorizado, consulto no sistema a agenda do caso, incluindo a agenda geral da Francescato e os calendários Google autorizados, e registro realização, falta, cancelamento ou remarcação.

**Why this priority**: Ajuda a enxergar rotina, adesão e barreiras antes que compromissos se percam.

**Independent Test**: Organizar uma semana fictícia com atendimentos recorrentes e uma remarcação.

**Acceptance Scenarios**:

1. Dado um atendimento recorrente, quando houver remarcação de uma ocorrência, então as demais serão preservadas e o compromisso original ficará relacionado à nova data.
2. Dado um atendimento que passou do horário e não foi confirmado, quando for exibido no acompanhamento, então aparecerá como “realização não confirmada”, sem ser contado automaticamente como falta.
3. Dada uma falta, quando registrar o motivo, então será possível identificar barreiras de transporte, custo, disponibilidade ou outras; a ausência não produzirá um diagnóstico de risco.
4. Dada uma agenda Google autorizada ou a agenda geral da Francescato, quando houver compromissos no período consultado, então a pessoa autorizada verá no sistema a origem, data, horário e participantes permitidos, sem revelar detalhes de calendários não autorizados.

### User Story 7 - Priorizar a carteira de casos (Priority: P1)

Como case manager, vejo quais casos precisam de revisão, quais pendências estão vencidas e quais registros solicitam retorno.

**Why this priority**: Permite coordenar vários casos com menos cobrança e busca manual.

**Independent Test**: Comparar casos fictícios em dia, com dados insuficientes, com pendências e com atenção sinalizada pela equipe.

**Acceptance Scenarios**:

1. Dada uma pendência vencida, quando aparecer uma sinalização, então será exibido o motivo, prazo e responsável.
2. Dado um caso sem dados suficientes, quando aparecer na carteira, então terá situação explícita de “informação insuficiente”, sem parecer saudável por ausência de registros.
3. Dado um alerta operacional encerrado, quando o responsável concluir a ação, então registrará o encaminhamento e o alerta poderá ser reaberto se surgir nova pendência.

### User Story 8 - Guardar e encontrar documentos sob gestão da Francescato (Priority: P1)

Como case manager ou profissional autorizado, organizo laudos, exames, relatórios, imagens e termos por caso, classificados em um espaço do Google Drive sob administração da Francescato.

**Why this priority**: É parte da centralização solicitada e reduz dependência de contas pessoais dos participantes.

**Independent Test**: Localizar um documento fictício, conferir sua versão e observar o comportamento quando ele estiver indisponível.

**Acceptance Scenarios**:

1. Dado um anexo enviado, quando for classificado, então ficará vinculado à pessoa acompanhada e terá categoria, data do documento, origem, autor do envio e audiência.
2. Dado um arquivo indisponível no espaço conectado, quando alguém tentar abri-lo, então verá o problema e a orientação de regularização; o documento não será apresentado como disponível.
3. Dado um participante com acesso revogado, quando tentar abrir um documento pelo sistema ou pela forma de compartilhamento gerida pelo projeto, então o acesso será negado. Cópias já obtidas serão tratadas pela política de confidencialidade, sem promessa de recolhimento remoto.

### User Story 11 - Entrar com a conta institucional (Priority: P1)

Como integrante da Francescato, entro com minha conta individual do Google Workspace e acesso somente os casos, anexos e agendas para os quais fui autorizado.

**Why this priority**: Evita criação de senhas paralelas, vincula as ações a uma identidade institucional e torna a entrada e a saída de pessoas da equipe mais simples de administrar.

**Independent Test**: Demonstrar o acesso de duas contas fictícias do Workspace, uma vinculada ao caso e outra sem vínculo, além da consulta à agenda geral.

**Acceptance Scenarios**:

1. Dada uma conta ativa do Google Workspace da Francescato, quando entrar no sistema, então a pessoa será identificada individualmente e verá apenas o escopo de casos e ações que lhe foi atribuído.
2. Dada uma conta do Workspace sem vínculo com determinado caso, quando buscar a pessoa acompanhada ou tentar abrir um anexo e um compromisso desse caso, então não obterá dados nem metadados protegidos.
3. Dada a agenda geral institucional configurada para a equipe, quando um membro autorizado entrar, então verá seus compromissos permitidos na visão consolidada, sem que a conta geral conceda acesso a dados clínicos fora das regras do caso.

### User Story 9 - Preservar sigilo, direitos e responsabilidade (Priority: P1)

Como responsável pela operação, mantenho cada participante no escopo autorizado e consigo identificar consultas, alterações e compartilhamentos.

**Why this priority**: É condição de funcionamento desde o primeiro caso real.

**Independent Test**: Realizar exercícios de acesso com usuários fictícios de papéis distintos e uma solicitação de acesso aos próprios dados.

**Acceptance Scenarios**:

1. Dado um profissional vinculado somente ao caso A, quando tentar consultar o caso B por qualquer caminho, então não obterá dados do caso B.
2. Dada a saída de um membro da equipe, quando o vínculo for encerrado, então o acesso será revogado e a autoria histórica dos registros será mantida.
3. Dada uma solicitação de exclusão, quando analisada, então terá resposta registrada; eventual guarda necessária terá fundamento e acesso limitado, em vez de eliminação indiscriminada.
4. Dado um rascunho produzido por assistência automática, quando alguém tentar publicá-lo, então será exigida revisão humana identificada.

### User Story 10 - Reunir a equipe e transferir ou encerrar o acompanhamento (Priority: P2)

Como case manager, preparo reuniões com mudanças, decisões e pendências e deixo uma passagem organizada quando a equipe ou o acompanhamento mudar.

**Why this priority**: Aprofunda a continuidade após o diário, o plano e as pendências já estarem em uso.

**Independent Test**: Preparar uma revisão de caso fictício e gerar uma síntese autorizada para o próximo responsável.

**Acceptance Scenarios**:

1. Dada uma reunião, quando registrar as decisões, então cada encaminhamento terá responsável, prazo e vínculo com o objetivo ou pendência correspondente.
2. Dada uma transferência de acompanhamento, quando a síntese for aprovada, então incluirá situação atual, orientações autorizadas, próximos passos e responsável que recebeu a passagem.
3. Dado um caso encerrado, quando um novo participante for convidado, então o acesso não será reativado sem uma decisão explícita de reabertura e nova definição de vínculos.

### Edge Cases

- **Versões diferentes do mesmo acontecimento:** preservar autor e fonte de cada relato; a equipe pode registrar interpretação separada, sem apagar a divergência.
- **Família em conflito, separação, guarda ou representação em discussão:** suspender convites e alterações de audiência que dependam da questão até validar a autoridade correspondente; parentesco não resolve a autorização.
- **Mais de uma pessoa atendida da mesma família:** manter casos separados; vínculos familiares não dão acesso cruzado automático.
- **Pessoa adulta e capaz que limita o acesso familiar:** registrar a restrição acordada e revisar as audiências, inclusive de documentos e devolutivas.
- **Crianças e adolescentes:** identificar responsável legal e regras adequadas à idade, à participação e ao melhor interesse; não reutilizar automaticamente as regras de acesso de adultos.
- **Registro retroativo:** diferenciar data do acontecimento, da inclusão e da correção.
- **Áudio com nomes, números, negação ou medicação mal reconhecidos:** apresentar incerteza, permitir correção e impedir publicação automática. Um texto estruturado não pode preencher campos ausentes como se tivessem sido ditos.
- **Familiar anexa imagem de terceiros:** orientar sobre necessidade e privacidade; possibilitar revisão e retirada conforme a política aplicável, sem ampliar audiência pelo tipo do arquivo.
- **Falha de conexão ou de transcrição:** informar que o envio não foi concluído; oferecer retomada ou texto. Nova tentativa não deve publicar o mesmo registro duas vezes.
- **Gravação interrompida:** distinguir trecho preservado de áudio perdido; nunca indicar que o relato completo foi enviado.
- **Conflito de edição:** apresentar alterações concorrentes ao responsável antes de substituir conteúdo atualizado.
- **Profissional externo sem acesso regular:** na primeira versão, a case manager pode incorporar um documento, identificando origem e data; não atribuir a ele uma autoria que não confirmou.
- **Convite expirado ou encaminhado a outra pessoa:** não permitir acesso apenas por posse de uma mensagem ou link; exigir identificação do participante autorizado.
- **Conteúdo restrito citado em tarefa, alerta ou resumo:** a derivação mantém a restrição; o título ou a notificação também não pode revelar o conteúdo protegido.
- **Case manager ausente:** o caso informa um substituto previamente autorizado e o canal de contato; não conceder acesso automático a toda a carteira.
- **Desconexão do Google Drive ou Google Agenda:** manter a identificação do anexo ou compromisso, sinalizar indisponibilidade e listar as pendências de reconciliação; não fingir que o arquivo foi guardado ou a agenda foi atualizada com sucesso.
- **Documentos duplicados ou versões conflitantes:** identificar a versão em uso e conservar a procedência, sem decidir automaticamente qual conclusão clínica está correta.
- **Relato de risco e ninguém disponível:** apresentar o plano de crise e o canal apropriado definido pela equipe; a ausência de confirmação não pode ser interpretada como monitoramento em tempo real.

## Requirements *(mandatory)*

### Functional Requirements

Todos os itens abaixo são requisitos de negócio propostos. “Inicial” integra a primeira versão sugerida; “Evolução” representa extensão a validar após o piloto. Uma decisão de prioridade não implica orçamento, prazo ou aprovação da Edilaine.

#### Caso, anamnese e resumo

| ID | Fase | Requisito e condição de aceite |
| --- | --- | --- |
| FR-001 | Inicial | Cadastrar caso com identificação necessária, nome de preferência, contatos, case manager e situação: entrada, ativo, pausado, encerrado ou transferido. Mudanças de situação devem ter data e motivo. |
| FR-002 | Inicial | Manter mapa de pessoas com vínculos distintos: paciente, familiar, cuidador, responsável legal, contato de emergência, profissional e responsável financeiro. Deve permitir uma pessoa com mais de um vínculo sem somar permissões automaticamente. |
| FR-003 | Inicial | Oferecer anamnese de coordenação em seções, com preenchimento gradual e estados “informado”, “desconhecido”, “não se aplica” ou “pendente”, fonte e data. A case manager deve localizar as seções incompletas. |
| FR-004 | Inicial | Registrar histórico de saúde, avaliações e diagnósticos ou hipóteses com autor/origem, data e situação de confirmação. Um relato leigo deve manter sua origem visível. |
| FR-005 | Inicial | Registrar rotina, recursos, barreiras, preferências, pontos fortes e o que o paciente considera importante. Deve permitir vincular esses elementos a objetivos do plano. |
| FR-006 | Inicial | Apresentar resumo do caso com situação, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Deve mostrar responsável, data da revisão e informação ainda não incorporada. |
| FR-007 | Inicial | Manter linha do tempo pesquisável por período, tipo de registro, autor, área, objetivo e pendência. Deve distinguir acontecimento, registro e retificação e respeitar audiência em todos os resultados. |

#### Diário e registro profissional

| ID | Fase | Requisito e condição de aceite |
| --- | --- | --- |
| FR-008 | Inicial | Permitir relatos familiares por texto ou áudio com data do acontecimento, categoria, descrição, contexto, ação tomada e solicitação de retorno. Apenas data e descrição são obrigatórias no relato simples. |
| FR-009 | Inicial | Oferecer modelos curtos de síntese profissional por área, configurados com a equipe: atividade, observações compartilháveis, progresso, orientação e próximo passo. A publicação exige data, autor identificado e síntese. |
| FR-010 | Inicial | Transcrever áudio em português para rascunho editável, permitir ouvir o original e revisar texto e audiência antes de publicar. Não transcrever sessões completas por padrão. Deve haver alternativa por texto. |
| FR-011 | Inicial | Associar imagem ou documento ao registro e apresentar origem e audiência. Um anexo não pode ampliar o acesso ao registro ao qual está associado. |
| FR-012 | Inicial | Permitir rascunho, publicação e retificação justificada. Registros publicados não podem ser reescritos sem histórico identificado; restrição e atendimento de direitos devem seguir a política de dados. |
| FR-013 | Inicial | Mostrar ao remetente envio, consulta e retorno, quando aplicável, como situações distintas. A consulta não encerra automaticamente uma solicitação. |
| FR-014 | Inicial | Permitir indicar necessidade de atenção e converter relato ou evolução em ação com responsável. A sinalização humana deve manter motivo, data e encaminhamento. |

#### Plano, tarefas e continuidade

| ID | Fase | Requisito e condição de aceite |
| --- | --- | --- |
| FR-015 | Inicial | Manter plano de cuidado por caso com objetivos da pessoa e da equipe, área, responsável, situação inicial, forma de observar progresso e data de revisão. O nome PTS só será usado se corresponder à prática validada da equipe. |
| FR-016 | Inicial | Acompanhar objetivos como proposto, em andamento, atingido, pausado, revisar ou encerrado. Revisões devem manter motivo, data e versões anteriores. |
| FR-017 | Inicial | Criar tarefas com responsável, prazo, prioridade operacional e estados pendente, em andamento, concluída ou cancelada. A conclusão deve registrar a ação realizada ou a justificativa. |
| FR-018 | Inicial | Registrar encaminhamentos com destino, motivo, responsável e etapas: sugerido, agendado, realizado, retorno pendente ou concluído. Deve ser possível localizar encaminhamentos sem retorno. |
| FR-019 | Inicial | Manter orientações aprovadas com autor, data, destinatários e validade/revisão quando pertinente. Uma orientação superada deve permanecer identificada como anterior, sem parecer atual. |
| FR-020 | Inicial | Registrar plano de crise aprovado pelo profissional habilitado, com responsáveis, contatos, limites do serviço e data de revisão. O diário deve informar que não garante resposta imediata; a case manager não emite conduta clínica por assumir a coordenação. |
| FR-021 | Evolução | Registrar reuniões com pauta, participantes, decisões e ações; cada ação deve ficar vinculada ao responsável e ao prazo. |
| FR-022 | Evolução | Permitir passagem e encerramento de acompanhamento com síntese revisada, pendências, próximos responsáveis e destinatários autorizados; caso encerrado não reabre silenciosamente. |

#### Agenda e carteira

| ID | Fase | Requisito e condição de aceite |
| --- | --- | --- |
| FR-023 | Inicial | Consolidar compromissos do caso, da agenda geral da Francescato e dos calendários Google autorizados, com origem, profissional, data, duração, local ou modalidade e participantes autorizados. Deve permitir recorrência e sinalizar sobreposições, sem impedir exceções justificadas. |
| FR-024 | Inicial | Registrar realizado, faltou, cancelado, remarcado ou realização não confirmada, com motivo e vínculo entre datas. Deve distinguir falta de cancelamento e de ausência de confirmação. |
| FR-025 | Inicial | Exibir a origem de cada compromisso e a data da última atualização da agenda. Oferecer lembretes e avisos de mudança segundo preferência do destinatário. Mensagens externas devem usar conteúdo mínimo e não incluir diagnóstico, transcrição ou trecho de evolução. |
| FR-026 | Inicial | Mostrar carteira filtrável por responsável, situação do acompanhamento, revisão e pendências. Sinais operacionais devem ter motivo visível e estado “informação insuficiente”; não representar classificação clínica automática. |
| FR-027 | Inicial | Gerar pendências por atraso de tarefa, ausência de atualização esperada ou revisão próxima, usando periodicidades acordadas por caso. Deve permitir reconhecer, atribuir e resolver o alerta sem apagar sua origem. |
| FR-028 | Inicial | Diferenciar situações operacionais das sinalizações clínicas feitas por profissional. Verde ou “em dia” significa compromissos operacionais em dia, não ausência de risco clínico. |

#### Documentos e controle dos dados

| ID | Fase | Requisito e condição de aceite |
| --- | --- | --- |
| FR-029 | Inicial | Organizar anexos por pessoa acompanhada, categoria, origem, data, autor do envio e versão. A busca deve respeitar audiência e permitir identificar o documento atual e o indisponível. |
| FR-030 | Inicial | Guardar anexos no Google Drive institucional administrado pela Francescato, em organização vinculada ao caso. A pessoa que envia deve classificar o anexo e confirmar sua audiência antes de concluir. |
| FR-031 | Inicial | Manter controle do compartilhamento de anexos tanto no sistema quanto no Google Drive institucional. A gestão prevista deve impedir acesso público e sinalizar compartilhamentos incompatíveis com a audiência do caso. |
| FR-032 | Inicial | Oferecer exportação autorizada por caso ou período de registros, plano, pendências e relação de anexos, identificando conteúdo indisponível e preservando autoria e datas. O destinatário e o propósito devem ser registrados. |
| FR-033 | Inicial | Permitir à Francescato obter seus registros e anexos autorizados ao encerrar o uso do produto, em formato consultável, com entrega e conferência registradas. Exportação de um caso deve preservar dados de terceiros e conteúdo profissional que demande tratamento específico. |
| FR-034 | Evolução | Oferecer segundo provedor de arquivos ou mudança de provedor com conferência de documentos, acesso e versões; não perder vínculos ou declarar concluída uma transferência incompleta. |

#### Participação, sigilo e governança

| ID | Fase | Requisito e condição de aceite |
| --- | --- | --- |
| FR-035 | Inicial | Permitir entrada com conta individual ativa do Google Workspace da Francescato e conceder acesso por pessoa, caso, finalidade e tipo de informação, com vínculo válido e identidade individual. O papel genérico ou uma conta geral não devem liberar toda a carteira. |
| FR-036 | Inicial | Distinguir informação de coordenação compartilhável, conteúdo disponibilizado ao paciente/família e conteúdo profissional restrito. O autor deve ver a audiência antes de publicar; rascunhos permanecem privados. |
| FR-037 | Inicial | Permitir revogar vínculos, definir substituição temporária da case manager e revisar autorizações. Todas as alterações devem manter data, responsável e motivo. |
| FR-038 | Inicial | Manter evidências de autorização ou fundamento aplicável, finalidade, audiência e versão dos termos. Quando houver consentimento, registrar concessão e revogação; não usar uma única autorização genérica para toda utilização futura. |
| FR-039 | Inicial | Registrar consultas, alterações, downloads/exportações e mudanças de acesso com identidade, data e objeto. Apenas responsáveis autorizados podem consultar a auditoria, que deve evitar repetir conteúdo clínico desnecessariamente. |
| FR-040 | Inicial | Receber e acompanhar solicitações de acesso, correção, portabilidade ou exclusão. A resposta deve indicar medida adotada ou razão de guarda/restrição aplicável; revogar consentimento não significa apagar automaticamente todos os registros. |
| FR-041 | Inicial | Informar regras de funcionamento, períodos de acompanhamento, canais de retorno e uso do diário. Paciente e família devem encontrar essas regras sem precisar ler termos extensos para saber onde pedir ajuda. |
| FR-042 | Inicial | Proteger dados identificáveis e de saúde, incluindo textos livres, áudios, imagens, documentos e cópias de recuperação, contra consulta não autorizada. Antes do uso real, a operação deve demonstrar restauração autorizada e conferência de integridade após perda simulada. |
| FR-049 | Inicial | Integrar a visão da agenda geral institucional e dos calendários Google autorizados ao calendário do sistema. Cada compromisso deve exibir origem e respeitar o escopo de pessoa, caso e audiência. |
| FR-050 | Inicial | Permitir que responsáveis autorizados reconheçam falha de atualização de agenda ou arquivo e encontrem uma ação de regularização, sem apresentar dados possivelmente desatualizados como atuais. |

#### Extensões a validar

| ID | Fase | Requisito e condição de aceite |
| --- | --- | --- |
| FR-043 | Evolução | Convidar profissional externo para contribuição limitada, com identificação, prazo e caso definidos, sem abrir a carteira; manter procedência do registro recebido. |
| FR-044 | Evolução | Produzir rascunhos de resumo, pauta e devolutiva com referência às fontes autorizadas e revisão humana. Deve indicar informações ausentes, não gerar fatos, diagnóstico ou conduta, nem revelar material restrito. |
| FR-045 | Evolução | Registrar medidas de progresso e instrumentos escolhidos pelos profissionais, com data, instrumento/versão, aplicador, resultado e interpretação autorizada. Comparações só devem reunir medidas comparáveis; teste privativo exige tratamento próprio e não vira questionário familiar. |
| FR-046 | Evolução | Permitir comunicação via WhatsApp para avisos mínimos ou registros selecionados e revisados, com destinatário autorizado e histórico do envio. Importação automática de conversas e captura indiscriminada ficam fora da proposta inicial. |
| FR-047 | Evolução | Acompanhar despesas relacionadas ao cuidado, autorização e comprovantes, separando acesso financeiro de dados de saúde. Cobrança, contabilidade e gestão de investimentos não integram este requisito. |
| FR-048 | Evolução | Possibilitar participação direta do paciente com objetivos, registros próprios, agenda e orientações autorizadas. O modelo deve distinguir seu relato dos relatos de terceiros e ser validado por idade e situação do acompanhamento. |

### Regras de acesso propostas

Centralização significa visão coordenada das informações necessárias, com direitos de acesso avaliados no contexto. “Conteúdo profissional restrito” não exclui direitos do titular; indica que a liberação deve seguir o fluxo apropriado e as regras profissionais, em vez de acesso indiscriminado pelo portal.

| Participante | Pode realizar | Visibilidade padrão proposta | Limite principal |
| --- | --- | --- | --- |
| Case manager | Coordenar caso, revisar síntese, organizar plano, tarefas, agenda e compartilhamentos permitidos | Informações necessárias à coordenação nos casos atribuídos | Não recebe automaticamente material clínico restrito, nem autoridade para prescrever ou diagnosticar |
| Profissional da equipe | Registrar sua síntese e contribuir no plano | Conteúdo do caso necessário à sua atuação e autorizado | Não acessa outros casos ou registros privados de colegas só por pertencer à equipe |
| Familiar/cuidador | Registrar acontecimentos, enviar anexos e acompanhar retorno | Próprios registros e conteúdo expressamente disponibilizado | Não vê relatos de outros familiares, sínteses internas ou documentos de saúde por padrão |
| Paciente, quando habilitado | Registrar sua perspectiva e acompanhar combinados | Conteúdo disponibilizado no portal e fluxo de acesso aos próprios dados | Modelo depende da idade, representação e acompanhamento; não deve reduzir direitos legais |
| Administrativo | Organizar contatos, convites e logística conforme atribuição | Dados operacionais mínimos | Não consulta conteúdo clínico por ocupar função administrativa |
| Responsável financeiro | Acompanhar despesas/comprovantes, se o módulo for adotado | Conteúdo financeiro autorizado | Pagamento não confere acesso ao diário ou à saúde |
| Profissional externo | Contribuir em uma solicitação ou receber síntese aprovada | Escopo e período expressamente concedidos | Não recebe acesso contínuo por padrão |

Na primeira versão, o registro familiar será dirigido à coordenação do caso e ao próprio autor. Qualquer divulgação à equipe ou a outro familiar terá audiência definida e visível. A gestão de acesso não poderá usar esse padrão para bloquear informações que precisem de tratamento específico por proteção ou exercício de direitos.

No núcleo inicial, o sistema armazenará sínteses compartilháveis e documentos necessários à coordenação. A inclusão de notas clínicas privadas detalhadas no produto dependerá da validação dos profissionais e de suas obrigações. Quando não forem incluídas, o profissional mantém seu registro próprio e compartilha a síntese adequada.

### Modelos de preenchimento propostos

Os modelos são propostas de coordenação; a equipe definirá campos clínicos e instrumentos. Deve ser possível usar relato curto sem responder a um formulário extenso.

| Modelo | Seções sugeridas | Quem preenche e valida |
| --- | --- | --- |
| Entrada e anamnese de coordenação | Motivo do acompanhamento; necessidades/prioridades; rotina; contexto familiar e rede; saúde e tratamentos informados; recursos/barreiras; preferências e pontos fortes; documentos; próximos passos | Case manager coleta contexto; profissionais habilitados validam conteúdo clínico |
| Acontecimento familiar | Quando; o que aconteceu; contexto; o que foi feito; necessidade de retorno; anexo opcional | Familiar/cuidador autorizado, identificado como fonte |
| Síntese profissional | Atendimento; atividade; observações compartilháveis; progresso em objetivo; orientação; próximo passo | Profissional responsável, com modelo ajustado à área |
| Registro de coordenação | Contato/ação realizada; pessoas envolvidas; decisão ou combinado; pendência; responsável; prazo | Case manager ou substituto autorizado |
| Revisão do plano | Objetivos; progresso e fontes; barreiras; perspectiva do paciente; decisões; próximos responsáveis; próxima revisão | Case manager e equipe, com participação da pessoa conforme o acordo |
| Plano de crise | Orientações previamente acordadas; responsáveis; contatos; canal e horário do serviço; alternativas; revisão | Profissional habilitado aprova; case manager organiza a disponibilidade |

Categorias iniciais do diário: rotina/autocuidado, sono, alimentação, atividade, convivência, acontecimento importante, dificuldade, conquista e outro. São categorias de relato; nenhuma exige que a família classifique gravidade ou faça diagnóstico. Medicação pode ser registrada como informação observada, com fonte, sem recomendar dose ou mudança.

### Dados pessoais, proteção e controle institucional

Dados de saúde são sensíveis; suas bases legais precisam ser avaliadas especificamente. Consentimento é uma possibilidade, não a única. Uma base para dados comuns não autoriza automaticamente o tratamento de dados de saúde. A [ANPD esclarece essa distinção](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).

A operação deverá definir finalidades, agentes responsáveis, guarda, atendimento de direitos e regras de compartilhamento. A [LGPD, arts. 11, 16, 18 e 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), orienta a análise de dados sensíveis, conservação, direitos e segurança. A definição concreta de prazos de guarda e do enquadramento da Francescato será validada com apoio jurídico e responsáveis profissionais antes do piloto com dados reais.

Em trabalho multiprofissional, a Psicologia deve compartilhar as informações necessárias aos objetivos do trabalho e resguardar o material restrito, conforme a [orientação do CRP-16 sobre prontuários](https://transparencia.cfp.org.br/crp16/pergunta-frequente/registro-em-prontuario/). O produto precisa preservar essa distinção e o fluxo de acesso do usuário, sem prometer que uma permissão genérica resolve todas as regras profissionais.

Para crianças e adolescentes, as decisões de tratamento devem priorizar o melhor interesse, como destaca a [ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes). Idade, representação e participação serão consideradas no desenho das audiências e dos termos.

O pedido de controle institucional dos anexos é incorporado como resultado de negócio: a Francescato administra o espaço, os participantes recebem acesso limitado, mudanças de equipe não retiram a capacidade institucional de localizar documentos e a saída do produto não impede recuperar os dados autorizados. Isso é distinto da titularidade dos dados pessoais, que pertence às pessoas atendidas, e das responsabilidades de guarda profissional.

A expressão “criptografia simples de PII” será substituída por “proteção verificável de informações identificáveis e de saúde”. Identificação pessoal não se limita a nome ou documento: texto livre, voz, fotografia e contexto do tratamento também podem identificar. O objetivo é proteção em uso, guarda, envio e recuperação, sem selecionar mecanismo nesta especificação. Google Drive e criptografia, isoladamente, não resolvem permissões e governança.

Áudio para facilitar registro significa ditado do próprio relato, não gravação contínua da sessão ou da residência. Antes do uso, serão definidos finalidade, destinatários e prazo de guarda do áudio original. Uso de serviços automáticos deve respeitar as audiências e as condições acordadas; dados de casos reais não serão usados para treinamento ou finalidade secundária sem fundamento e autorização aplicáveis.

### Requisitos de experiência e identidade

- Uso prioritário no celular para registrar, consultar agenda e ler orientações; a carteira e o resumo devem também funcionar em uma tela maior.
- Linguagem em português, ações claras e campos curtos. Separar “publicar”, “enviar para revisão” e “guardar rascunho” quando houver esses efeitos distintos.
- Mostrar o caso e a audiência antes de publicar, reduzindo registro no paciente errado ou compartilhamento por engano.
- Oferecer leitura confortável, contraste suficiente, navegação por teclado, foco visível, alternativa ao áudio e possibilidade de ampliar texto. Estados devem usar palavras ou símbolos além da cor.
- Não depender de animação, ícone sem rótulo ou memória da pessoa para concluir o relato.
- Fotografias e a voz são recursos de registro, não elementos obrigatórios da participação.

A página inicial foi observada no Chrome. Os valores abaixo foram encontrados em elementos renderizados do site, e constituem referências de marca, não uma aprovação formal de identidade:

| Referência | Cor observada | Uso de marca identificado |
| --- | --- | --- |
| Verde oliva | `#879257` | Faixas e ações de destaque |
| Verde claro | `#AEBA7B` | Ação de contato |
| Areia | `#E3CCB0` | Fundo de destaque |
| Marrom | `#6F604B` | Texto de apoio |
| Branco | `#FFFFFF` | Áreas claras e texto em destaques |

A tipografia observada combina Raleway e uma fonte Bogart Trial Light Italic em destaques. A aplicação futura pode manter a personalidade de marca e escolher equivalentes licenciados; controles e texto de leitura não precisam reproduzir o itálico editorial. Cores de atenção terão significado próprio e contraste avaliado: o verde da marca não será usado como garantia de segurança clínica. Referência: [Francescato Family](https://www.francescatoassessoria.com/).

### Key Entities *(include if feature involves data)*

Os conceitos abaixo descrevem o negócio, não uma estrutura de armazenamento.

- **Pessoa acompanhada e caso:** a pessoa, o contexto e um período de coordenação do cuidado, com responsável e situação próprios.
- **Participante e vínculo:** relação com o caso, função, necessidade de acesso, período autorizado e eventual representação legal.
- **Anamnese de coordenação:** informações de entrada por seção, origem, confirmação e pendências.
- **Registro do diário:** acontecimento ou ação com autor, origem, datas, conteúdo, audiência e retificações.
- **Síntese do caso:** leitura atual revisada, com fontes, objetivos e informação ainda não incorporada.
- **Plano e objetivo:** resultado desejado, responsável, ponto de partida, evidência de progresso e revisões.
- **Tarefa e encaminhamento:** ação necessária, responsável, prazo, situação e resultado.
- **Compromisso:** atividade prevista e confirmação de realização, falta, cancelamento ou remarcação.
- **Documento e áudio:** material associado ao caso ou registro, com procedência, audiência, disponibilidade e guarda definida.
- **Conta Workspace e fonte de agenda:** identidade institucional individual, vínculo de acesso e calendário de origem, incluindo a agenda geral da Francescato quando autorizada.
- **Orientação e plano de crise:** conteúdo aprovado por responsável habilitado, destinatários e validade/revisão.
- **Autorização e evidência de governança:** finalidade, fundamento ou consentimento quando aplicável, limites e revisões.
- **Evento de auditoria:** consulta, alteração ou compartilhamento identificado, preservando a responsabilidade das ações.

## Success Criteria *(mandatory)*

### Measurable Outcomes

As metas são propostas para um piloto, não desempenho medido nem promessa clínica. A comparação usará a rotina atual como referência; os critérios de privacidade serão avaliados com casos fictícios antes de admitir dados reais.

| ID | Meta proposta | Como verificar |
| --- | --- | --- |
| SC-001 | Pelo menos 80% dos participantes de cada grupo avaliado concluem um registro simples pelo celular em até 2 minutos, incluindo revisão e publicação | Sessões observadas separadamente com profissionais e familiares; usar tarefas equivalentes e registrar tempo e necessidade de ajuda |
| SC-002 | Em pelo menos 90% das demonstrações, Edilaine identifica situação, mudança recente, pendência e próximo responsável em até 3 minutos | Avaliar dez casos fictícios com conteúdo previamente definido e comparar as respostas ao gabarito |
| SC-003 | Pelo menos 90% dos testes de ditado resultam em registro aprovado após revisão do autor, sem fatos acrescentados pela assistência | Revisar vinte relatos fictícios, incluindo nomes, negações, datas e termos das áreas envolvidas; medir falhas e correções necessárias |
| SC-004 | Durante quatro semanas do piloto, pelo menos 85% das sínteses combinadas para os atendimentos são publicadas no prazo acordado | Contar atendimentos realizados com síntese esperada e evoluções concluídas; o prazo é definido por caso, não presumido |
| SC-005 | 100% das tarefas ativas têm responsável e, quando aplicável, prazo ou data explícita de revisão | Revisão semanal de tarefas; ações sem prazo precisam de justificativa e revisão marcada |
| SC-006 | Reduzir em pelo menos 30% o tempo semanal gasto pela case manager buscando informações e cobrando registros | Medir duas semanas de rotina atual e quatro do piloto; interpretar junto ao volume e perfil dos casos |
| SC-007 | Nenhum dos exercícios definidos de acesso indevido expõe conteúdo protegido por pesquisa, resumo, notificação, anexo ou exportação | Avaliação de pelo menos quinze situações de permissão, incluindo vínculo revogado e familiar pagador; qualquer falha impede entrada de casos reais |
| SC-008 | Pelo menos 80% dos profissionais e familiares participantes avaliam clareza do registro e dos combinados com nota 4 ou 5 em escala de 1 a 5 | Pesquisa por grupo ao final do piloto, incluindo pergunta sobre dificuldade e receio de compartilhamento |
| SC-009 | Todos os casos do piloto têm responsáveis, audiências e regra de retorno definidos; nenhum áudio entra publicado sem revisão humana | Conferência do cadastro de todos os casos e amostra semanal das publicações |
| SC-010 | Em pelo menos 90% das tentativas, o participante autorizado encontra um documento ou identifica corretamente sua indisponibilidade em até 1 minuto | Dez exercícios de consulta com documentos de categorias e versões diferentes |
| SC-011 | 100% dos exercícios com contas fictícias do Workspace respeitam os vínculos de caso, inclusive para anexos e compromissos da agenda geral | Testar contas vinculadas e não vinculadas, acesso revogado e consulta à agenda geral antes do piloto com dados reais |

Redução de internações, prevenção de suicídio e melhora clínica não são critérios atribuíveis ao produto neste piloto. Podem ser temas de acompanhamento profissional, sem inferir causalidade a partir do uso da ferramenta.

## Assumptions

### Hipóteses usadas para elaborar a primeira proposta

- A operação inicial é a Francescato, com Edilaine como principal coordenadora, e não uma plataforma comercial para múltiplas empresas.
- Cada integrante interno usará sua própria conta ativa do Google Workspace. O e-mail geral será uma fonte institucional da agenda compartilhada, e não uma credencial coletiva para entrar no sistema ou contornar permissões por caso.
- O contexto principal é saúde mental e apoio à rotina familiar, conforme o site; a distribuição por idade, condição e complexidade será validada.
- Equipe e familiares/cuidadores autorizados entram no núcleo inicial. Acesso direto do paciente é uma extensão proposta, cuja prioridade pode mudar na validação; suas preferências e direitos já integram o núcleo.
- Cada paciente tem um caso separado, mesmo quando há membros de uma mesma família em acompanhamento.
- O núcleo inicial compartilha sínteses necessárias à coordenação. Não se presume a migração de notas privadas e prontuários completos de todos os profissionais.
- Agenda, diário, anexos e acesso individual fazem parte do núcleo inicial, com integração à agenda geral da Francescato e aos calendários Google autorizados. WhatsApp permanece como evolução a validar.
- Google Drive institucional será o repositório inicial de anexos por pessoa acompanhada. A Francescato definirá a conta institucional, responsáveis administrativos e convenção de classificação antes do piloto.
- Não há serviço de emergência ou cobertura 24 horas contratado como parte do produto; se a Francescato oferecer acompanhamento ampliado, seus períodos e responsáveis serão explicitamente definidos.
- O esforço, número de casos e disponibilidade dos participantes são desconhecidos. Metas e piloto serão calibrados após a conversa de validação.

### Escopo sugerido para a primeira versão

O núcleo completo reúne cadastro e anamnese de coordenação, vínculos e permissões, diário de família e equipe com texto/áudio/anexos, linha do tempo, resumo revisado por pessoa, plano simples, tarefas, encaminhamentos, agenda, carteira com pendências explicáveis, orientações/plano de crise e documentos institucionais. Proteção, auditoria e saída dos dados fazem parte desse núcleo.

Para controlar esforço de entrada, o piloto pode começar com poucos casos e modelos curtos, mantendo apenas informações essenciais de casos ativos. Histórico antigo será resumido com fonte e anexos relevantes; importação integral não é presumida. Fases descrevem prioridade de produto, não ordem técnica de implementação.

### Evoluções propostas

- Reuniões e passagem de acompanhamento mais completas.
- Participação direta do paciente, se não for antecipada para o núcleo.
- Contribuição limitada de profissionais externos.
- Rascunhos assistidos de resumo, pauta e devolutiva, sempre revisados e com fontes.
- Instrumentos e indicadores de progresso escolhidos pelos profissionais.
- Avisos via WhatsApp, após validar utilidade e privacidade.
- Segundo provedor de arquivos e mudança de provedor.
- Prestação de contas de despesas do cuidado, se for uma dor prioritária.
- Mapa visual da rede familiar, quando a equipe indicar uma finalidade concreta; genograma clínico dependerá de seu uso profissional e não é exigido no núcleo.

### Fora do escopo desta proposta inicial

- Diagnóstico, prescrição, alteração de medicamento ou decisão clínica automática.
- Predição de suicídio, leitura automática de gravidade clínica ou substituição de avaliação profissional.
- Garantia de monitoramento ou resposta de emergência em tempo real.
- Gravação contínua de sessões, casa ou conversas de WhatsApp.
- Teleconsulta, faturamento de convênio, contabilidade, folha de pagamento ou gestão de investimentos.
- Venda da solução para outras clínicas, comparação pública de pacientes ou ranking de profissionais.
- Escolha de arquitetura, tecnologias, fornecedores de transcrição, mecanismos de criptografia ou desenho de armazenamento.

### Sugestões adicionais para validar com Edilaine

| Sugestão | Dor de negócio que procura resolver | Tratamento proposto |
| --- | --- | --- |
| Preferências e pontos fortes do paciente | Plano focado apenas em problema pode omitir o que a pessoa deseja recuperar | Incorporar à entrada e aos objetivos desde o núcleo |
| Barreiras ao cuidado | Faltas podem decorrer de transporte, dinheiro, rotina ou relações familiares | Registrar motivo e ação de apoio, evitando rótulo automático de baixa adesão |
| Plano de crise acessível | Pessoas podem recorrer ao diário quando precisam de contato imediato | Orientação previamente aprovada, contatos, canais e limites claros |
| Substituição temporária da case manager | Ausência de uma pessoa pode interromper coordenação e retorno | Responsável temporário autorizado e passagem identificada |
| Fonte e divergências entre relatos | Família e profissionais podem observar o mesmo evento de formas diferentes | Preservar relatos e registrar interpretação separadamente |
| Retorno reconhecido | Família pode não saber se a informação chegou ou se foi tratada | Distinguir envio, consulta e encaminhamento |
| Prestação de contas do cuidado | O site descreve apoio com recursos familiares, mas sua prioridade é desconhecida | Validar despesas e comprovantes antes de propor financeiro completo |
| Continuidade e saída | Troca de profissional ou fim do contrato pode espalhar novamente as informações | Síntese de passagem, acesso revogado e entrega autorizada de histórico |

### Dependências de negócio para começar o piloto

1. Edilaine validar o público, as dores prioritárias e quem participará inicialmente.
2. Equipe validar modelos, conteúdo compartilhável, responsáveis habilitados e periodicidade de registros/revisões.
3. Definir regras de retorno e responsáveis substitutos, inclusive em situações de crise.
4. Francescato escolher espaço institucional de arquivos e responsáveis por acesso e continuidade.
5. Validar bases legais, representação, guarda, uso do áudio e regras profissionais; aprovar termos e procedimento de atendimento aos titulares.
6. Definir participantes e critérios do piloto. Sugestão a confirmar: três a cinco casos, profissionais de ao menos duas áreas e familiares voluntários, durante quatro semanas, após validação com casos fictícios.

### Pauta de validação com Edilaine

| Pergunta | Decisão que ajuda a tomar |
| --- | --- |
| Quais são hoje os casos mais comuns, as idades e os contextos de acompanhamento? | Adequação da entrada, dos modelos e da participação |
| Quais três situações da última semana deram mais trabalho por falta de informação? | Priorização com exemplos reais de dor, sem coletar dados identificáveis nesta descoberta |
| Quem acompanha a casa, quem decide e quem paga? Essas pessoas costumam divergir? | Vínculos, audiências e regras de convite |
| O próprio paciente deve usar o sistema desde o começo? | Antecipar ou manter participação direta na evolução |
| Quais registros cada profissional já mantém e o que pode compartilhar? | Evitar duplicação e delimitar o registro integrado |
| Há modelos de anamnese, evolução e revisão que já funcionam? | Adaptar o produto à prática existente |
| O que precisa de retorno no mesmo dia e em quais horários a equipe atende? | Regras de resposta e plano de crise |
| Acompanhamento medicamentoso significa lembrar, observar ou outra atividade? Quem valida as informações? | Delimitar responsabilidade sem permitir conduta fora da habilitação |
| Quantos casos e participantes estão ativos e quanto tempo se gasta com registros e cobranças? | Dimensão do piloto e linha de base para resultados |
| Qual conta institucional do Google Workspace administrará Drive, Agenda geral e acessos? Quem será responsável por documentos e permissões? | Controle institucional dos anexos, agenda e continuidade |
| Despesas e prestação de contas precisam entrar já ou podem esperar? | Repriorizar a extensão financeira |
| Ao encerrar um caso ou trocar a equipe, o que deve ser entregue e a quem? | Saída, guarda e passagem do acompanhamento |

O próximo passo é revisar esta proposta de negócio com Edilaine e registrar suas decisões. A especificação não aprova arquitetura, orçamento, cronograma nem desenvolvimento.
