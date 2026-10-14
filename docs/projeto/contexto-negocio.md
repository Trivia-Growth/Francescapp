# Contexto de negócio: Francescapp - Diário integrado do cuidado

**Feature Branch**: `codex/fundacao-desenvolvimento`

**Created**: 2026-10-06

**Status**: contexto preservado na migração para OpenSpec em 14/10/2026; decisões materiais ainda em esclarecimento

**Updated**: 2026-10-14

Os requisitos funcionais e as 12 jornadas passam a ser mantidos em [openspec/specs](../../openspec/specs). A versão literal anterior é histórica em [docs/legacy/spec-kit](../legacy/spec-kit/specs/001-diario-cuidado/spec.md). Este documento preserva contexto, esclarecimentos, regras transversais, metas e pendências; não é uma segunda especificação executável.

**Input**: Centralizar informações do acompanhamento de pacientes, registros da equipe e da família, anamneses, imagens e documentos, agenda e diário por texto ou áudio transcrito. Após a validação com Edilaine, adotar Google Drive institucional para anexos classificados por pessoa acompanhada, acesso individual por contas do Google Workspace e visão consolidada da agenda geral e dos calendários autorizados no Google Agenda. Em 2026-10-10, o solicitante informou a aprovação do projeto e autorizou iniciar a especificação para desenvolvimento, com infraestrutura e padrão de código explicitamente indicados. Decisões pendentes devem ser perguntadas, sem inferência.

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

## Clarifications

### Session 2026-10-10

- O solicitante informou que Edilaine aprovou o projeto e que a preparação para desenvolvimento deve começar pelas especificações.
- Decisões pendentes devem ser esclarecidas com o solicitante antes de virarem regras ou escolhas técnicas.
- A identidade visual do produto será fornecida pelo time de marketing da Edilaine e seguirá o padrão do site da Francescato. A identidade da Trívia utilizada na proposta comercial não define o design do produto.
- As restrições técnicas fornecidas nesta sessão estão registradas em [fundacao.md](fundacao.md). A aprovação do projeto não transforma hipóteses anteriores em decisões confirmadas.
- Q: Qual é o caminho local ou a URL do projeto de atendimento que devemos usar como referência de código? → A: O projeto está ao lado do Francescapp, na pasta `Atendimento`, localizado em `/home/lucas/projetos/Atendimento`. Os padrões encontrados estão documentados em [referencia-atendimento.md](referencia-atendimento.md).
- Q: Como familiares entram na plataforma, considerando que não têm conta institucional? → A: Edilaine faz o cadastro na plataforma e a família recebe um primeiro link de acesso do Supabase para criar o acesso e definir a senha. Depois utiliza e-mail e senha, com opção “Esqueci minha senha” para recuperação por e-mail. O link inicial é de convite/ativação, não o método recorrente de login. O acesso da equipe permanece pelo Google Workspace.
- Q: No calendário, o sistema apenas mostrará os compromissos do Google ou também permitirá atualizar pelo sistema? → A: Mostrará os compromissos existentes e permitirá atualizá-los pelo sistema. Cada usuário terá sua agenda; haverá uma agenda global em um e-mail compartilhado entre usuários, com acesso marcado individualmente na configuração de acesso. As permissões de consulta e edição foram esclarecidas na resposta abaixo.
- Q: As agendas individuais ficarão na conta Google de cada profissional ou todas ficarão organizadas no e-mail compartilhado? → A: Opção A: cada profissional terá sua agenda na própria conta Google; o e-mail compartilhado manterá a agenda global da Francescato.
- Q: Na agenda global, quem tiver acesso poderá também editar, ou teremos permissões separadas de consulta e edição? → A: Opção A: separar “Pode visualizar” e “Pode editar” na configuração individual de acesso à agenda global. Consulta não concede edição.

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
- **Falha no envio do convite familiar:** indicar falha ou pendência de envio, sem marcar ativação concluída; a nova tentativa não deve duplicar participante ou vínculo.
- **E-mail familiar já associado a uma conta:** não duplicar a identidade, sobrescrever a senha ou ampliar permissões silenciosamente. O fluxo de convite para conta existente será detalhado no planejamento.
- **Recuperação de senha com vínculo revogado:** recuperar a credencial não reativa acesso ao paciente, documentos ou agenda.
- **Conteúdo restrito citado em tarefa, alerta ou resumo:** a derivação mantém a restrição; o título ou a notificação também não pode revelar o conteúdo protegido.
- **Case manager ausente:** o caso informa um substituto previamente autorizado e o canal de contato; não conceder acesso automático a toda a carteira.
- **Desconexão do Google Drive ou Google Agenda:** manter a identificação do anexo ou compromisso, sinalizar indisponibilidade e listar as pendências de reconciliação; não fingir que o arquivo foi guardado ou a agenda foi atualizada com sucesso.
- **Acesso à agenda global removido:** negar consultas e alterações subsequentes, inclusive por acesso direto ao compromisso, sem depender apenas de ocultar a agenda na interface.
- **Somente edição global revogada:** preservar a consulta quando ainda autorizada e negar novas alterações; ocultar botões não substitui a conferência de permissão ao executar a ação.
- **Agenda Google consultável, mas sem autorização de edição:** não apresentar a consulta como permissão para atualizar. Uma recusa do Google deve ser informada sem indicar alteração concluída.
- **Documentos duplicados ou versões conflitantes:** identificar a versão em uso e conservar a procedência, sem decidir automaticamente qual conclusão clínica está correta.
- **Relato de risco e ninguém disponível:** apresentar o plano de crise e o canal apropriado definido pela equipe; a ausência de confirmação não pode ser interpretada como monitoramento em tempo real.

## Regras transversais

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

- A identidade final será fornecida pelo time de marketing da Edilaine, seguindo o site da Francescato. As referências observadas abaixo e o mockup são insumos de demonstração; não substituem a entrega e validação dos materiais de marca.
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
- **Conta familiar e convite:** identidade de acesso do familiar, e-mail de destino, responsável pelo convite e situação da ativação. A conta autentica a pessoa; o vínculo determina os casos e conteúdos autorizados.
- **Anamnese de coordenação:** informações de entrada por seção, origem, confirmação e pendências.
- **Registro do diário:** acontecimento ou ação com autor, origem, datas, conteúdo, audiência e retificações.
- **Síntese do caso:** leitura atual revisada, com fontes, objetivos e informação ainda não incorporada.
- **Plano e objetivo:** resultado desejado, responsável, ponto de partida, evidência de progresso e revisões.
- **Tarefa e encaminhamento:** ação necessária, responsável, prazo, situação e resultado.
- **Compromisso:** atividade prevista e confirmação de realização, falta, cancelamento ou remarcação.
- **Documento e áudio:** material associado ao caso ou registro, com procedência, audiência, disponibilidade e guarda definida.
- **Conta Workspace e fonte de agenda:** identidade institucional individual, vínculo de acesso e calendário de origem, incluindo a agenda geral da Francescato quando autorizada.
- **Agenda individual, agenda global e permissão:** agenda na própria conta Google do profissional e agenda institucional global em e-mail compartilhado. A configuração individual global separa “Pode visualizar” e “Pode editar”, distinguindo ausência de acesso, consulta e consulta com edição. Permissão de agenda é distinta do vínculo de acesso ao caso.
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
| SC-011 | 100% dos exercícios com contas fictícias do Workspace respeitam os vínculos de caso e as permissões separadas de visualização e edição da agenda global, inclusive para anexos e consulta/alteração de compromissos | Testar contas vinculadas e não vinculadas, agenda global sem acesso/com consulta/com consulta e edição, revogação apenas de edição e de todo o acesso, tentativas diretas de alteração, atualização autorizada na própria agenda e falha de integração, antes do piloto com dados reais |
| SC-012 | Todos os cenários definidos de ativação e recuperação familiar funcionam sem liberar acesso além dos vínculos autorizados | Executar a jornada 12 com contas fictícias, incluindo links inválidos/expirados/usados, e-mail não cadastrado e vínculo revogado, também no celular, antes do piloto com dados reais |

Redução de internações, prevenção de suicídio e melhora clínica não são critérios atribuíveis ao produto neste piloto. Podem ser temas de acompanhamento profissional, sem inferir causalidade a partir do uso da ferramenta.

## Assumptions

### Hipóteses usadas para elaborar a primeira proposta

- A operação inicial é a Francescato, com Edilaine como principal coordenadora, e não uma plataforma comercial para múltiplas empresas.
- Cada integrante interno usará sua própria conta ativa do Google Workspace. O e-mail geral será uma fonte institucional da agenda compartilhada, e não uma credencial coletiva para entrar no sistema ou contornar permissões por caso.
- O contexto principal é saúde mental e apoio à rotina familiar, conforme o site; a distribuição por idade, condição e complexidade será validada.
- Equipe e familiares/cuidadores autorizados entram no núcleo inicial. Acesso direto do paciente é uma extensão proposta, cuja prioridade pode mudar na validação; suas preferências e direitos já integram o núcleo.
- Cada paciente tem um caso separado, mesmo quando há membros de uma mesma família em acompanhamento.
- O núcleo inicial compartilha sínteses necessárias à coordenação. Não se presume a migração de notas privadas e prontuários completos de todos os profissionais.
- Agenda, diário, anexos e acesso individual fazem parte do núcleo inicial. Foram confirmados consulta e atualização pelo sistema, agenda individual na própria conta Google de cada profissional e agenda global em e-mail compartilhado com permissões separadas de visualização e edição por usuário; ações de escrita e regras de sincronização permanecem a esclarecer. WhatsApp permanece como evolução a validar.
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

As escolhas técnicas são tratadas na fundação e no futuro plano de implementação, mantendo este documento focado nos comportamentos e critérios de aceite do produto.

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

O projeto está aprovado para iniciar a preparação do desenvolvimento. A referência de código foi localizada e inspecionada. O próximo passo é esclarecer as decisões pendentes e preparar as mudanças OpenSpec com decisões técnicas e tarefas rastreáveis. As diretrizes de engenharia estão em AGENTS.md, na raiz do repositório. As hipóteses e evoluções acima permanecem identificadas até confirmação, sem presumir cronograma, desenho técnico ou funcionalidades adicionais.
