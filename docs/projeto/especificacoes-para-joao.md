# Francescapp

## Especificações de features e regras de negócio

**Documento de trabalho para João | Versão 1.0 | 14/10/2026**

### O produto

Um espaço de coordenação do cuidado, exclusivo da Francescato, para reunir informações do paciente, registros da família e da equipe, documentos, plano de cuidado, pendências e agenda. Edilaine e os administradores devem conseguir entender o que mudou, o que falta e quem dará o próximo passo.

Não é apenas um diário, nem substitui o registro clínico próprio de cada profissão. A centralização é de informações necessárias à coordenação, com autoria e público autorizado. O produto não diagnostica, prescreve ou garante atendimento emergencial.

### Como ler este documento

- **Confirmado:** decisões expressamente fornecidas pelo solicitante.
- **Núcleo inicial:** requisitos funcionais existentes, incluídos na primeira entrega por decisão do solicitante. Campos, políticas e detalhes sinalizados como pendentes ainda exigem validação.
- **Proposta a validar:** sugestão, não decisão aprovada.
- **Evolução:** extensão fora do núcleo inicial; precisa de nova confirmação.

### Fundação confirmada

- Operação exclusiva Francescato; todo o núcleo inicial na primeira entrega, não uma versão reduzida.
- Supabase como servidor/backend e banco de dados; Netlify; OpenRouter para IA e transcrição; Google Drive e Google Calendar.
- Contas exclusivas da Francescato e Drive institucional. Identificadores e responsáveis ainda serão definidos.
- Padrões de código do Atendimento; OpenSpec como processo de especificação. Este documento não define arquitetura ou estrutura de código.
- Design oficial será trazido pelo João. Até lá, o mock aprovado é a referência visual provisória, não a jornada completa do produto real.
- Antes do desenvolvimento, arquivar a demonstração fora da base ativa, preservando história, proposta, fontes e licenças. Essa limpeza ainda não foi executada.

### Organização da leitura

Perfis; acesso e convites; caso e anamnese; diário e áudio; plano e coordenação; agenda e carteira; documentos; governança e falhas; jornadas de aceite; referência visual; pendências; evoluções e fontes.

<!-- page -->

## 1. Perfis e visibilidade

**Confirmado: três perfis fixos, sem uma matriz extensa de permissões por funcionalidade.** Referências: FR-035 a FR-037, FR-042 e delta de sigilo e governança.

| Perfil | Escopo e capacidades | Limites |
| --- | --- | --- |
| Administrador | Carteira completa, visão de coordenação dos casos, configurações, cadastros e gestão de acessos. Edilaine pode delegar esse perfil. | Concessão explícita e identidade individual; não decorre do login Google. Não amplia a privacidade de rascunhos nem introduz notas clínicas privadas detalhadas. |
| Profissional | Pacientes com vínculo válido e conteúdo disponibilizado à equipe; registra sua síntese e contribui no cuidado conforme seu perfil. | Não abre outros casos, nem assume autoria de colegas. |
| Família | Pacientes com vínculo válido, seus próprios relatos e conteúdo disponibilizado à família. | Somente app; sem acesso automático ao Drive, às evoluções internas ou aos relatos de outro familiar. |

### Regras de negócio

- Administradores não precisam ser vinculados individualmente a cada paciente para acessar a carteira. A delegação mantém quem concedeu, quando e o motivo.
- Ao remover o perfil Administrador, as próximas ações usam apenas o perfil e os vínculos ainda válidos. Não se mantém acesso residual à carteira completa.
- A mesma pessoa pode ter diferentes relações com o paciente: familiar, responsável legal, pagador ou contato de emergência. Essas relações não somam permissões automaticamente.
- Vincular dois familiares ao mesmo paciente não abre os relatos de um para o outro. O compartilhamento precisa ser explícito.
- A audiência deve aparecer antes da publicação: quem pode ver aquele conteúdo. Pertencer ao caso não significa ver tudo.
- Rascunhos permanecem privados conforme FR-036. A simplificação dos perfis não altera essa regra.
- Acesso à agenda global é uma configuração individual, separando **Pode visualizar** e **Pode editar**. Não concede acesso clínico ao caso.
- As autorizações valem também para buscas, resumos, anexos, downloads, exportações e identificadores diretos. Esconder um botão não basta.

### Exemplo de aceite

Um profissional sem vínculo não obtém dados do paciente nem ao abrir seu endereço diretamente. Um administrador ativo encontra o caso sem vínculo individual. Um familiar vinculado vê seu relato e uma orientação compartilhada, mas não uma evolução interna. Revogar o vínculo bloqueia as próximas consultas.

### Ainda a definir

Quem recebe a primeira concessão administrativa; tratamento de pessoas com mais de um perfil; fluxo de substituição temporária e regras de compartilhamento em situações familiares especiais. Não estão aprovados perfis adicionais de financeiro ou administrativo limitado.

<!-- page -->

## 2. Acesso, convite e recuperação

**Núcleo inicial | FR-035, FR-037, FR-051 a FR-054**

### Equipe Francescato

Entrar com identidade individual do Google Workspace da Francescato. A conta institucional identifica o usuário, mas a aplicação verifica perfil e vínculos concedidos. Não utilizar uma conta coletiva para atribuir autoria.

O e-mail compartilhado da agenda global não substitui a conta pessoal de quem consultou ou alterou um compromisso.

### Primeiro acesso da família

1. Edilaine ou administrador autorizado cadastra a pessoa, seu e-mail e o paciente com vínculo autorizado.
2. O sistema envia o convite inicial de ativação do Supabase.
3. A família abre um link válido e define a própria senha. Edilaine não precisa conhecê-la.
4. Depois da ativação, entra com e-mail e senha e recebe apenas os acessos efetivamente concedidos.

O primeiro link não significa login sem senha em todos os acessos. Não há decisão de cadastro público autônomo da família.

### Esqueci minha senha

O login familiar oferece recuperação por e-mail e definição de nova senha por link válido. A solicitação não revela publicamente se um endereço possui conta. A recuperação não cria cadastro, perfil ou vínculo com paciente.

### Estados que precisam ser distintos

- Cadastro persistido não significa convite enviado.
- Convite pendente, falha de envio e ativação concluída são estados diferentes.
- Link inválido, expirado ou já utilizado é rejeitado, com orientação para obter outro.
- Ativação ou recuperação de senha não restaura um vínculo revogado.
- Entrada bem-sucedida não significa acesso a todos os pacientes.

### Exemplo de aceite

Cadastrar um familiar, confirmar a gravação, enviar convite, ativar no celular, sair, entrar por senha e recuperar a senha. Repetir com link inválido e vínculo revogado: nenhuma dessas condições libera informação protegida.

### Ainda a definir

Domínio Workspace; entrada e desligamento da equipe; e-mail de envio; prazos de expiração e reenvio; políticas de senha e sessão; redirecionamentos; convite para endereço com conta já existente; como a primeira administração é concedida. Não escolher números ou provedores adicionais silenciosamente.

<!-- page -->

## 3. Paciente, caso e anamnese

**Núcleo inicial | FR-001 a FR-007**

### Cadastro e rede de pessoas

Cadastrar identificação necessária, nome de preferência, contatos, case manager e situação do acompanhamento. Manter as relações entre paciente, familiares, cuidadores, responsáveis legais, contatos de emergência, profissionais e pagadores sem confundi-las com acesso.

Situações do caso: **entrada, ativo, pausado, encerrado ou transferido**. Mudanças mantêm data e motivo. A existência desses estados no cadastro não antecipa a jornada avançada de passagem/encerramento da evolução FR-022.

**Pendente:** definição de paciente versus caso/período de acompanhamento, identificação mínima, duplicidade, reabertura e representação. Um caso encerrado não deve reabrir silenciosamente.

### Anamnese de coordenação

Preenchimento gradual, dividido em seções, com fonte e data. Cada informação ou seção pode estar **informada, desconhecida, não se aplica ou pendente**. Deixar em branco não deve parecer resposta negativa nem cadastro completo.

**Modelo proposto a validar com a equipe:** motivo do acompanhamento; prioridades; rotina; contexto familiar e rede; saúde e tratamentos informados; recursos/barreiras; preferências e pontos fortes; documentos; próximos passos.

Diagnósticos, hipóteses e avaliações mantêm autoria/origem, data e confirmação. Um relato leigo continua identificado como relato, sem se transformar em diagnóstico por aparecer no sistema. A coordenação organiza; profissionais habilitados validam conteúdo clínico.

### Resumo do caso

Uma visão de situação atual, mudanças recentes, objetivos ativos, atenção sinalizada por profissional, pendências, agenda e próxima revisão. Mostrar responsável pela revisão, data e informações novas ainda não incorporadas.

O resumo inicial não pressupõe geração automática por IA. Rascunhos assistidos de resumo são evolução FR-044, não parte automática da escolha do OpenRouter.

### Linha do tempo

Pesquisar por período, tipo, autor, área, objetivo e pendência. Diferenciar a data do acontecimento da data de registro e da retificação. Todos os resultados respeitam audiência, inclusive trechos e contagens que possam revelar conteúdo protegido.

### Exemplo de aceite

Criar caso, vincular pessoas e equipe, preencher parte da anamnese, retomar o restante, revisar resumo e localizar uma atualização. A tela indica seções pendentes e informações não revisadas sem fabricar dados para preencher lacunas.

<!-- page -->

## 4. Diário, evolução profissional e áudio

**Núcleo inicial | FR-008 a FR-014**

### Relato da família

Registrar por texto ou ditado de áudio: data do acontecimento, categoria, descrição, contexto, ação tomada e pedido de retorno. No relato simples, **somente data e descrição são obrigatórias**. Imagens ou documentos são opcionais, classificados e com audiência visível.

Categorias propostas: rotina/autocuidado, sono, alimentação, atividade, convivência, acontecimento importante, dificuldade, conquista e outro. Não exigir que a família classifique gravidade clínica ou faça diagnóstico.

### Síntese da equipe

Modelos curtos por área, definidos com a equipe: atividade realizada, observações compartilháveis, progresso, orientação e próximo passo. Para publicar: data, autor identificado e síntese.

O núcleo contempla sínteses adequadas à coordenação, não conteúdo integral de sessão ou notas clínicas privadas detalhadas. Cada profissional preserva suas obrigações de registro próprio.

### Ditado e transcrição

1. A pessoa grava seu próprio relato, não uma sessão completa por padrão.
2. O áudio segue para transcrição pelo OpenRouter.
3. O resultado é um rascunho editável; o autor pode ouvir o original e corrigir o texto.
4. O autor revisa conteúdo e audiência antes de publicar. Transcrição não é publicação automática.

Se a transcrição falhar, informar o erro e oferecer texto como alternativa real. Não apresentar uma transcrição de exemplo. Modelo, duração, tamanho, consumo, qualidade, retenção e destino do áudio ainda precisam de decisão.

### Publicação e retorno

- Rascunho, publicado e retificado são situações distintas. Retificação de publicação tem justificativa e histórico; não sobrescreve o passado sem identificação.
- Enviado, consultado e respondido são sinais diferentes. Uma consulta não encerra automaticamente pedido de retorno.
- Um relato ou evolução pode gerar ação com responsável. Sinalização humana mantém motivo, data e encaminhamento.
- O anexo não amplia a audiência do registro ao qual pertence.
- O diário não garante resposta imediata nem substitui o canal de emergência definido pela equipe.

### Exemplo de aceite

Família registra por áudio, corrige uma negação transcrita incorretamente, confirma audiência e publica. Edilaine consulta e cria uma pendência. O remetente distingue consulta de resposta; uma correção posterior mantém o histórico.

<!-- page -->

## 5. Plano de cuidado e coordenação

**Núcleo inicial | FR-015 a FR-020**

### Objetivos do cuidado

Plano por caso, com objetivos da pessoa e da equipe, área, responsável, situação inicial, forma de observar progresso e data de revisão. Usar o nome **PTS** apenas se corresponder à prática validada da Francescato.

Estados do objetivo: **proposto, em andamento, atingido, pausado, revisar ou encerrado**. Mudanças e revisões preservam motivo, data e versões anteriores. Uma atualização do plano não apaga o compromisso anterior.

Rotina, preferências, recursos, barreiras e o que importa ao paciente devem poder se relacionar aos objetivos, evitando um plano somente centrado em especialidades.

### Tarefas e pendências

Responsável, prazo, prioridade operacional e estados **pendente, em andamento, concluída ou cancelada**. Ao concluir, registrar a ação realizada ou justificativa. Alertas por tarefa atrasada mantêm a origem mesmo depois de reconhecidos ou resolvidos.

**Exemplos:** profissional enviar síntese; coordenação obter relatório escolar; revisar plano; confirmar retorno de encaminhamento. São exemplos fictícios, não tarefas criadas automaticamente para todos os casos.

### Encaminhamentos

Destino, motivo e responsável, com etapas **sugerido, agendado, realizado, retorno pendente ou concluído**. Deve ser fácil encontrar o que foi encaminhado mas ainda não trouxe retorno. “Realizado” não significa necessariamente “concluído”.

### Orientações e plano de crise

Orientações aprovadas mantêm autor, data, destinatários e validade/revisão quando pertinente. Orientação superada continua identificada como anterior, sem parecer atual.

Plano de crise aprovado por profissional habilitado, com responsáveis, contatos, limites do serviço e data de revisão. A coordenação torna os combinados disponíveis; não passa a prescrever ou definir conduta clínica por administrar o caso.

### Exemplo de aceite

Criar objetivo e tarefa, atribuir responsável, registrar progresso e revisar a data. Concluir uma tarefa registra o resultado. Substituir uma orientação distingue a atual da anterior; a família só recebe a versão e a audiência disponibilizadas.

### Limites desta entrega

Reunião estruturada com pauta/ata e passagem avançada do acompanhamento permanecem evoluções FR-021 e FR-022. Os campos dos modelos, quem aprova orientações e como a equipe registra revisões precisam de validação operacional.

<!-- page -->

## 6. Agenda e carteira da case manager

**Núcleo inicial | FR-023 a FR-028, FR-049 e FR-050**

### Google Calendar

Trazer compromissos existentes e permitir atualizá-los pelo sistema, refletindo a alteração na agenda Google de origem. Cada profissional usa a agenda de sua própria conta; a agenda global fica no e-mail institucional compartilhado, não concentra automaticamente todas as agendas individuais.

Exibir origem, profissional, data, duração, local/modalidade, participantes autorizados e última atualização. A visão consolidada do paciente respeita o vínculo e o conteúdo autorizado; não expõe agendas inteiras de terceiros por incluir um compromisso do caso.

### Permissões da agenda global

- Sem **Pode visualizar**: consulta negada.
- Com consulta, sem **Pode editar**: alterações negadas.
- Atualização exige consulta e edição autorizadas. Revogar apenas edição preserva a consulta ainda válida.
- A agenda compartilhada preserva a identidade de quem realizou a ação.
- Permissão de agenda não concede acesso ao conteúdo clínico dos pacientes.

### Compromissos e continuidade

Prever recorrência e sinalizar sobreposição, sem bloquear exceção justificada. **Pendente:** operações de criação/cancelamento, alteração de uma ocorrência ou da série, tratamento de conflito e vínculo de eventos existentes com pacientes. A referência funcional não escolhe esses detalhes.

Situação do atendimento: **realizado, faltou, cancelado, remarcado ou realização não confirmada**, com motivo e vínculo entre datas. Ausência de confirmação não conta como falta.

Levar lembretes e avisos de mudança conforme preferência. Mensagens externas usam conteúdo mínimo: não enviam diagnóstico, transcrição ou trechos de evolução. Canal e regras de envio ainda precisam de definição; WhatsApp integrado é evolução.

### Carteira e alertas

Filtrar por responsável, situação, revisão e pendências. Alertas de atraso, revisão próxima ou falta de atualização usam periodicidades acordadas por caso e permitem reconhecer, atribuir e resolver sem apagar origem.

Semáforo tem motivo visível e opção **informação insuficiente**. Verde significa operação em dia, não ausência de risco clínico. Sinalização clínica é distinta e feita por profissional.

### Exemplo de aceite

Usuário autorizado consulta a origem, atualiza horário e recebe sucesso somente após confirmação Google. Se a integração falhar, vê falha ou pendência, não o novo horário local como confirmação. Usuário somente de consulta não altera por acesso direto.

<!-- page -->

## 7. Anexos no Drive institucional

**Núcleo inicial | FR-011, FR-029 a FR-033 e FR-050; delta de documentos institucionais**

### O que o produto cobre

Enviar imagens, laudos, exames, relatórios e outros documentos, associando-os ao paciente e, quando aplicável, ao registro. Classificar por categoria, origem, data, autor do envio e versão. Encontrar o documento atual e distinguir o que ficou indisponível.

Os arquivos moram no **Google Drive institucional administrado pela Francescato**. O aplicativo centraliza a relação com o caso, a classificação e a audiência. Não transformar a conta pessoal do remetente no único local de guarda do arquivo do caso.

### Acesso confirmado

- Pessoas institucionais autorizadas podem trabalhar pelo app e pelo Drive, dentro do escopo autorizado.
- Família usa somente o app. Seu vínculo com paciente não compartilha pasta nem abre navegação direta no Drive.
- O envio exige classificar e confirmar audiência antes de concluir.
- Nenhum anexo amplia o acesso ao registro associado.
- Impedir compartilhamento público e sinalizar permissões no Drive incompatíveis com a audiência do caso.
- Revogações devem considerar acesso pelo app e acesso institucional direto. Não prometer recolher cópias que alguém já tenha baixado.

### Organização proposta, ainda não aprovada

Usar uma raiz institucional do Francescapp e uma área por paciente/caso, com subpastas por categoria validada. A proposta deve definir identificadores, nomenclatura, permissões e tratamento de documentos antigos antes de criar pastas reais.

**Pendente:** Drive compartilhado ou pasta institucional; raiz e responsável; categorias; quem cria/move/exclui; arquivo colocado direto no Drive; reconhecimento de versões, renomeações e indisponibilidade. Não assumir que qualquer arquivo no Drive já estará classificado e visível no app.

### Envio parcial e regularização

Arquivo enviado mas vínculo ou metadado não confirmado não equivale a documento completamente disponível. Informar qual etapa concluiu e o que precisa de regularização. Nova tentativa não deve gerar duplicatas nem sucesso fictício.

### Exportação e saída do produto

Exportação autorizada por caso ou período reúne registros, plano, pendências e relação de anexos, com autoria/datas, destinatário e propósito. Sinalizar conteúdo indisponível. Ao encerrar o uso do produto, a Francescato deve poder recuperar o material autorizado em formato consultável, com entrega e conferência, preservando dados de terceiros e regras profissionais.

### Exemplo de aceite

Enviar um laudo, classificar e conferir no Drive e no caso. Família vê somente o compartilhado no app. Simular falha de envio e arquivo removido no Drive: nenhum dos dois aparece como documento disponível.

<!-- page -->

## 8. Governança e funcionamento verdadeiro

**Núcleo inicial | FR-036 a FR-042, FR-050; delta de integridade operacional**

### Autoria, audiência e histórico

Identificar autor, data e origem. Conferir perfil, vínculo e audiência na operação real, no servidor e no banco, não somente por filtros da interface. Registrar consultas, alterações, downloads/exportações e mudanças de acesso; auditoria somente para responsáveis autorizados, sem copiar conteúdo clínico desnecessariamente.

Rascunhos são privados. Publicações retificadas mantêm histórico. Dados identificáveis incluem textos livres, voz, imagens e documentos, não apenas nome/CPF.

### Política de dados: requisito, não certificação pronta

Manter evidências de autorização ou fundamento aplicável, finalidade, audiência e versão dos termos. Quando usado consentimento, registrar concessão e revogação. Receber e acompanhar pedidos de acesso, correção, portabilidade ou exclusão, com resposta e medida adotada ou motivo de guarda/restrição.

Não implementar exclusão indiscriminada ao revogar consentimento. Finalidades, representação, retenção, responsabilidades e obrigações profissionais precisam de validação própria antes de dados reais. Este documento não substitui avaliação jurídica/profissional nem declara conformidade certificada.

### Sem fallback que esconda falhas

- **Carregando:** operação em andamento; ainda não há resultado confirmado.
- **Vazio:** consulta real bem-sucedida sem registros autorizados.
- **Erro:** consulta ou ação falhou; indicar etapa e próxima ação segura, sem inventar a causa.
- **Pendente/parcial:** parte do trabalho ou confirmação ainda falta.
- **Sucesso:** fonte responsável confirmou o resultado real.

Não preencher falhas com pacientes fictícios, arquivos demonstrativos, transcrição de exemplo ou salvamento simulado. Configuração ausente deve aparecer como configuração pendente. Diagnósticos técnicos não expõem credenciais, tokens ou conteúdo protegido.

É permitido oferecer alternativa real, como digitar após falha de transcrição, mantendo a falha original visível. Dados reais já carregados só permanecem exibidos com autorização válida e identificação de desatualização; não restauram acesso revogado.

### Continuidade e critérios mínimos

Informar canais e períodos de retorno e limites do diário. Antes de dados reais, demonstrar recuperação autorizada e integridade após perda simulada. Mocks de testes automatizados podem ser explícitos e isolados; não entram silenciosamente no ambiente de teste manual ou produção.

**Pendente:** políticas concretas de retenção, recuperação, disponibilidade, termos, responsáveis e ambientes. Não há prazo de resposta ou nível de serviço numérico aprovado.

<!-- page -->

## 9. Jornadas reais para validar com João

Estas são sínteses de aceite, não prova de implementação. Devem ser exercidas na aplicação conectada, inclusive no celular, com dados fictícios controlados e serviços reais do ambiente de teste. Não substituem as 12 jornadas originais das specs.

### J1. Preparar a operação

Definir responsável inicial, contas, ambientes, Workspace, Drive, agendas e envio de convites. A configuração informa o que está pronto e o que falta; nenhum serviço ausente vira demo. Conceder administração a outra identidade e revogá-la, conferindo o acesso restante.

### J2. Abrir um acompanhamento

Administrador cadastra paciente/caso, rede de pessoas, equipe e vínculos, preenche anamnese gradualmente e revisa resumo. Recarregar confirma persistência; paciente sem vínculo permanece invisível para não administradores.

### J3. Convidar a família

Cadastro, vínculo, convite, ativação, senha, novo login e recuperação. Conferir falha de envio, link inválido/expirado/usado, conta existente e vínculo revogado. Os detalhes pendentes precisam de decisão antes de fechar a jornada.

### J4. Registrar o cotidiano

Família escreve ou dita, anexa imagem, revisa texto/audiência e publica. Coordenação consulta e atribui ação; consulta e resposta permanecem distintas. Profissional registra síntese, relaciona progresso a objetivo e retifica sem apagar histórico.

### J5. Coordenar o cuidado

Criar objetivo, tarefa e encaminhamento; atualizar estados e revisão. Disponibilizar orientação aprovada à família. Carteira aponta motivo da pendência, sem classificar risco clínico automaticamente.

### J6. Usar a agenda

Consultar individual/global conforme permissão; atualizar compromisso autorizado; conferir no Google de origem. Testar consulta sem edição, revogação de edição, falha de integração e confirmação pendente. Criação/cancelamento e séries aguardam suas regras.

### J7. Gerir documentos

Enviar e classificar anexo no caso e Drive; verificar família somente app, acesso institucional autorizado e regularização de envio parcial. Buscar documento atual, indisponível e exportação permitida sem vazar outros casos.

### J8. Conferir segurança e recuperação

Tentar acesso direto sem vínculo, autopromoção de perfil, compartilhamento familiar indevido e acesso após revogação. Conferir auditoria e restauração. Qualquer exposição indevida impede usar dados reais.

As metas SC-001 a SC-012 continuam referências de piloto, com métricas ainda a validar. A avaliação de acesso deve incorporar a exceção explicitamente aprovada do Administrador com carteira completa.

<!-- page -->

## 10. Referência visual provisória

**Documentar o mock existente, não criar uma nova identidade.** A versão oficial virá pelo João. Valores extraídos de `mockup/styles.css`, considerando os refinamentos finais; detalhes completos e tokens em `DESIGN.md`. Não houve validação visual por navegador nesta revisão, pois não havia navegador disponível.

### Direção

Uma mesa de coordenação serena: fundo claro, oliva, leitura ampla, casos em linhas e agenda como apoio. Evitar aparência de painel genérico com muitos cartões de indicadores, excesso de ornamentos ou fontes miúdas. A aplicação mantém a referência Francescato; não herda a marca Trivia da proposta comercial ou a identidade HED.

### Paleta atual

| Uso | Cor do mock |
| --- | --- |
| Ação principal / oliva escuro | #475436 |
| Oliva de marca / foco | #879257 |
| Verde claro de apoio | #AEBA7B |
| Areia / marrom de apoio | #E3CCB0 / #6F604B |
| Fundo / superfície suave | #FBFCF8 / #F1F4E9 |
| Texto / texto secundário | #273123 / #65705F |
| Divisórias / branco | #DFE5D4 / #FFFFFF |

### Tipografia e componentes

- **Raleway** para texto e controles; corpo atual 16 px, entrelinha 1,62. Campos de formulário 16 px; botões 14 px; textos auxiliares normalmente 12-14 px.
- **Cormorant Garamond** para títulos editoriais. Título principal 50 px no desktop e 42 px no celular; títulos de seção variam conforme a superfície.
- Botões discretamente arredondados (8 px), campos (7 px), painéis auxiliares (14 px) e diálogo (16 px). Linhas de caso e de diário são predominantemente planas, sem sombra.
- Foco visível, alternativa ao áudio, navegação por teclado e respeito à preferência de movimento reduzido existem como referências a preservar. Isto não é uma certificação de acessibilidade.

### Layout e celular

Sidebar desktop de 248 px; conteúdo até 1.460 px; carteira principal e agenda auxiliar de 330 px. No ajuste até 1.200 px a sidebar passa a 220 px. Até 760 px o menu fica recolhido, colunas passam a uma e o conteúdo usa laterais de 22 px.

Esses valores descrevem a referência, não dispensam testes. Há regras antigas e novas sobrepostas no CSS: revisar larguras intermediárias, tabelas, diálogos, textos longos e ações ao implementar, sem copiar problemas da demonstração.

O design oficial deve definir logo, fontes/licenças, tokens, componentes e estados. A navegação do mock não cobre integralmente configuração, cadastro, acesso e erros da operação real.

<!-- page -->

## 11. Decisões pendentes antes de tarefas executáveis

Não impedem compartilhar o documento; impedem declarar prontas as partes da implementação que dependem delas. Perguntar ao solicitante em vez de escolher silenciosamente.

| Tema | O que precisa de decisão |
| --- | --- |
| Caso e cadastro | Um ou mais períodos/casos por paciente; campos mínimos; duplicidade; reabertura; representação e situações familiares especiais. |
| Administração e equipe | Primeiro administrador; quem concede/revoga; identidade com múltiplos perfis; substituição; entrada/desligamento e domínio Workspace. |
| Convite familiar | Conta já existente, expiração/reenvio, envio de e-mails, senha/sessão e redirecionamentos. |
| Formulários | Campos por área, categorias do diário, anamnese e responsáveis por aprovação de orientações/plano de crise. |
| Drive | Local institucional, raiz, responsável, organização de pastas, categorias, versões e alterações feitas diretamente no Drive. |
| Acesso direto ao Drive | Concessão/revogação coerente com paciente/audiência; compartilhamentos antigos; detecção e regularização de incompatibilidades. |
| Agenda | Criação/cancelamento, recorrências/séries, conflitos, vínculo paciente-evento, fuso e comportamento de atualização; lembretes e canais. |
| Áudio/OpenRouter | Modelo, limites, volume, qualidade, política de dados do endpoint de transcrição, revisão e guarda/exclusão do original. Não copiar controles de chat sem verificar. |
| Dados e operação | Ambientes, região, credenciais fora do repositório, responsáveis pelas contas, retenção, recuperação e critérios de disponibilidade. |
| Escala e piloto | Número de pacientes/usuários, volume de arquivos/áudios, periodicidades por caso e validação das metas SC. |
| Design oficial | Entrega pelo João de logo, fontes/licenças, paleta, componentes, estados e aprovação móvel. Até lá vale a referência provisória. |

### Ordem de preparação

1. Revisar este documento com João e confirmar as pendências materiais com o solicitante/Francescato.
2. Registrar as respostas no OpenSpec e manter a coerência das fontes de verdade.
3. Arquivar a demonstração fora da base ativa, conservando as dependências da proposta comercial.
4. Detalhar jornadas e critérios de aceite, depois o desenho técnico e as tarefas por entrega.
5. Implementar e testar com falhas visíveis, sem exemplos como fallback de operação real.

### Limite deste trabalho

É uma consolidação para revisão. Não implementa aplicação, configura serviços, arquiva mocks, envia material ao João ou garante prazo. Também não decide arquitetura técnica a partir das lacunas.

<!-- page -->

## 12. Evoluções e rastreabilidade

**54 requisitos funcionais de referência: 45 iniciais e 9 evoluções.** A confirmação de todo o núcleo não promove evoluções à primeira entrega. A escolha de infraestrutura não contrata automaticamente novas features.

### Extensões fora do núcleo inicial

| ID | Evolução proposta | Limite |
| --- | --- | --- |
| FR-021 | Reunião estruturada | Pauta, participantes, decisões e ações com responsável/prazo. |
| FR-022 | Passagem/encerramento avançado | Síntese revisada, pendências e próximos responsáveis autorizados. |
| FR-034 | Segundo provedor de arquivos | Migração com conferência de documentos, versões e acesso. |
| FR-043 | Profissional externo | Contribuição limitada a caso, prazo e escopo, sem carteira aberta. |
| FR-044 | Rascunhos assistidos por IA | Resumo, pauta e devolutiva com fontes autorizadas e revisão humana; sem diagnóstico/conduta ou fatos inventados. |
| FR-045 | Instrumentos e medidas | Escolha profissional, versão, aplicador, interpretação e comparação válida. |
| FR-046 | WhatsApp integrado | Avisos mínimos ou registros revisados; não importar conversas indiscriminadamente. |
| FR-047 | Despesas do cuidado | Financeiro separado de saúde; não é cobrança/contabilidade. |
| FR-048 | Participação direta do paciente | Relato próprio e visão validada por idade e situação. |

### Mapa do núcleo inicial

FR-001 a FR-007: caso/anamnese/resumo. FR-008 a FR-014: diário/evolução/áudio. FR-015 a FR-020: plano/coordenação. FR-023 a FR-028: agenda/carteira. FR-029 a FR-033: documentos/exportação. FR-035 a FR-042: identidade/governança. FR-049 e FR-050: integração e falhas. FR-051 a FR-054: convite/senha/recuperação familiar.

### Fontes e precedência

- [Especificações por capacidade](../../openspec/specs/): requisitos FR e fases.
- [Mudança de fundação real](../../openspec/changes/registrar-fundacao-real/proposal.md): decisões mais recentes e deltas; prevalecem sobre formulações antigas incompatíveis de administração, fornecedor ou escopo.
- [Contexto de negócio](contexto-negocio.md): jornadas, modelos, hipóteses e SC.
- [Fundação](fundacao.md) e [referência Atendimento](referencia-atendimento.md): contexto técnico; ler junto às decisões recentes.
- [Referência visual provisória](../../DESIGN.md): mock, não identidade final.

Este documento consolida a passagem para João, sem substituir o OpenSpec. Divergências exigem conferir a decisão mais recente; dúvidas materiais permanecem pendentes até resposta.
