# Projeto de distribuição do FFCMApp

A distribuição aprovada organiza a área de trabalho por tarefa e mantém o histórico de cuidado por pessoa. Este desenho é para execução **depois da migração React**. Os endereços legados abaixo são contratos de compatibilidade com os links da auditoria. Antes da execução, complementar o mapa com links emitidos desde então em avisos, mensagens e fluxos públicos. Paleta e tipografia vigentes permanecem. [Diagnóstico aprovado](DISTRIBUICAO.md)

## Três suposições a confirmar

1. **Assumi Plantões antes de Agenda para quem trabalha em turnos. Se a consulta do calendário for a entrada mais frequente, Agenda passa antes de Plantões nesse recorte e ganha o primeiro atalho em Seu dia.** As duas ordens propostas são **Seu dia → Pessoas acompanhadas → Plantões → Agenda → Financeiro** e **Seu dia → Pessoas acompanhadas → Agenda → Plantões → Financeiro**. Para quem só tem um dos dois destinos, ele ocupa a terceira posição. Os endereços são iguais nas duas versões. Plantões começa pelo turno ativo quando ele puder ser identificado com segurança.
2. **Assumi uma navegação comum com folhas e ações filtradas pelo trabalho autorizado. Se o administrador de negócio tiver uma jornada de gestão predominante, Administração ganha destaque na primeira posição para esse recorte e oferece entrada própria para Financeiro se houver audiência.** As duas entradas são **Seu dia → trabalho autorizado → utilidades** para perfis operacionais e **Administração → trabalho/consulta autorizados → utilidades** para um perfil de gestão cuja landing page seja confirmada. Nas duas, o conjunto de permissões permanece o mesmo. A conta técnica mantém seu fluxo excepcional enquanto seu recorte não for confirmado.
3. **Assumi que uma fonte transversal de aprovações ainda precisa ser demonstrada. Se houver fonte confiável e estado verificável para uma categoria, Seu dia vira uma fila apenas para a categoria comprovada. Sem essa prova, Seu dia continua uma lista de casos.** A existência de aprovação ou versão consultável dentro de um caso não demonstra que há uma fila autorizada entre casos. A auditoria verificou sinais da carteira e contratos de aprovação por caso, que são evidências diferentes.

| Perfil de conta | Entrada assumida e recorte |
|---|---|
| Profissional | Seu dia e carteira autorizada. Plantões e Agenda aparecem conforme trabalho e conexão/capacidade aplicáveis. Na ficha, exibir os destinos do vínculo. |
| Case Manager | A mesma base operacional, com links para decisões dos casos sob sua responsabilidade, mediante vínculo, capacidade e habilitação específicas. A área de aprovação exige a prova descrita abaixo. |
| Administrador | Seu dia na variante comum e Administração como utilidade. Variante de gestão abre no índice administrativo. Carteira, ações clínicas e Financeiro obedecem verificações próprias. |
| Familiar | Carteira compartilhada como entrada única de trabalho, com Ajuda e Conta. Dados e ações da ficha respeitam a audiência publicada e o acesso familiar vigente. |
| Conta técnica excepcional | Fluxo e verificações preexistentes, sem promoção de destinos operacionais por inferência. |

Em qualquer perfil, Financeiro depende da audiência específica. Acessos de conta, concessão de caso, habilitação para aprovar, publicação para a família e permissão de calendário são verificações distintas. A visibilidade de navegação decorre delas. Links e comandos passam pelas mesmas verificações no servidor e no banco.

## Seu dia muda de função conforme a evidência

| | A. Lista de casos | B. Fila de trabalho |
|---|---|---|
| Lugar no primeiro nível | **Seu dia** é uma visão de orientação com “Casos que precisam de atenção” e acesso à carteira. Pessoa e motivo são a unidade da lista. | **Seu dia** é a entrada operacional principal, com “Revisões e aprovações” em primeiro lugar quando houver trabalho verificável, seguida pelos casos que precisam de atenção. A unidade da fila é a decisão sobre um item e uma versão. |
| O que aparece | Sinal confirmado da carteira, motivo e link para Pendências ou seção correspondente. Atalho de turno autorizado quando disponível. Revisões e aprovações ficam em Cuidado dentro da ficha. | Cada linha identifica pessoa, tipo de trabalho, versão ou item, estado, responsável quando disponível e próximo passo. O link abre essa versão ou item no plano. O comando fica no plano. |
| O que habilita | Sinais existentes autorizados, com carregamento, vazio confirmado e erro separados. A entrada sintetiza o trabalho por pessoa. | Fonte autorizada entre casos que entregue chave estável do caso/item, versão exata quando aplicável, estado acionável e identificação do aprovador/alçada aplicável. Exigir prova de consulta e atualização diante de aprovação, nova versão, perda de alçada e revogação. |
| Falha e ausência | Bloco que falhou tem ação de tentar novamente. Se a lista estiver vazia, conduzir à carteira. | Fonte indisponível aparece como indisponível, com recuperação. O restante de Seu dia continua utilizável. Zero só com leitura bem-sucedida. A versão superada informa a mudança e oferece a versão vigente para nova leitura, sem transportar aprovação. |

A classificação vale por tipo. Exemplo fictício: se a crise tiver fonte verificável e a revisão do plano de cuidado só tiver leitura por caso, a fila mostra crise e a revisão continua em Cuidado. Avisos, registros atrasados e ausência de carimbo de aprovação não servem como substitutos para uma solicitação identificada e acionável. O caminho da lista é entregável independente e permanece válido quando a fila não puder ser habilitada.

Na variante B, o endereço da decisão é a folha do plano com uma referência opaca para a versão e, quando necessário, para o item. Exemplos propostos: `#pessoas/{p}/cuidado/plano-de-crise/versoes/{versao}` e `#pessoas/{p}/cuidado/plano/versoes/{versao}/itens/{item}`. Só emitir os links que a fonte puder resolver com contrato estável. Se a tela atual só puder abrir a versão vigente, a mesma diferença de versão precisa aparecer explicitamente e impedir ação sobre o item antigo. A variante A usa as folhas do plano sem promessa de link versionado.

## Árvore e endereços

Os endereços propostos usam fragmentos para explicitar o contrato de navegação. A escolha futura do roteador pode canonizar outra forma, desde que continue aceitando os endereços abaixo e preserve histórico, autorização e resultado. Nas tabelas, `{p}` é o UUID opaco da pessoa. As linhas sem alias são índices novos ou controles que não tinham endereço próprio no inventário. Índices e atalhos remontam o contexto e nunca geram uma segunda cópia editável do mesmo registro.

```text
Área de trabalho
├── Seu dia → lista de casos [A] ou fila verificável + lista [B]
├── Pessoas acompanhadas → carteira, filtros e Novo paciente
│   └── Ficha da pessoa
│       ├── Visão do caso → situação, próxima ação, Linha do tempo
│       ├── Cuidado → Plano de cuidado, Plano de crise, Saúde, Anamnese, Rotina e recursos
│       ├── Pendências e tarefas → Pendências do caso, Tarefas do cuidado, Encaminhamentos
│       ├── Registros → Diário do cuidado, Fichas de plantão, Relatórios do cuidado
│       ├── Documentos → arquivo, Exportar dados do caso
│       └── Pessoas e acesso → Cadastro e contatos, Rede de cuidado, Orientações,
│                              Equipe com acesso ao caso, Acesso da família
├── Plantões → Meu turno, Escala de turnos
├── Agenda → Minha agenda, compromisso e conexão de calendário
└── Financeiro → Valores por turno, Despesas do caso

Utilidades
├── Avisos → sino e destino original do aviso
├── Administração → índice
│   ├── Contas e permissões → Contas do aplicativo, Concessões da equipe,
│   │                         Permissão para aprovar plano de crise, Acesso ao financeiro
│   ├── Modelos e vocabulário → Campos e aprovadores do plano de cuidado, Modelo da ficha de plantão,
│   │                           Papéis da rede de cuidado, Catálogo de observações emocionais
│   ├── Sistema e integrações → Parâmetros do sistema, Credenciais das integrações, Expurgo
│   └── Privacidade e auditoria → Histórico de auditoria, Solicitações de privacidade
├── Ajuda → Regras do acompanhamento, canais e orientação
└── Conta → sessão e saída

Família
└── Pessoas acompanhadas → carteira
    └── Ficha compartilhada
        ├── Dados do paciente
        ├── Diário da família
        ├── Plano de cuidado compartilhado
        └── Materiais compartilhados → Relatórios publicados, Documentos compartilhados, Orientações compartilhadas
```

### Casca e utilidades

| Legado ou origem | Endereço proposto | Conteúdo e comportamento |
|---|---|---|
| Raiz sem fragmento e `#home` | `#seu-dia` | Entrada interna em A ou B. A raiz usa a entrada autorizada do perfil. Um familiar com bookmark para Seu dia recebe a carteira como destino de entrada, sem dados internos. |
| `#carteira` | `#pessoas` | Carteira, filtros e paginação. Novo paciente permanece ação no contexto da carteira. |
| Meu turno e escala na ficha | `#plantoes` | Índice do turno e da escala. As rotas por pessoa abaixo preservam o contexto do link. |
| Minha agenda na casca | `#agenda` | Minha agenda, conexão e compromissos como ações locais. Preservar o retorno de calendário, inclusive o parâmetro `agenda`, até concluir o fluxo que o consome. |
| Financeiro da Administração | `#financeiro` | Índice para `#financeiro/valores-por-turno` e `#financeiro/despesas-do-caso`. Filtro por caso no contexto autorizado, com escolha explícita quando não fornecido. |
| `#regras` | `#ajuda/regras-do-acompanhamento` | Mesmo conteúdo de “Como funciona”. `#ajuda` é índice de Ajuda. Canais anunciados somente quando existentes. |
| Administração na lateral | `#administracao` | Novo índice. O link salvo para Configuração continua na folha de parâmetros. |
| Sino e saída | Controle da casca | Sem novo endereço obrigatório. Avisos preservam os destinos de seus próprios links. |
| `/convite-familiar/`, `/consulta-convite/` e retornos de login | Mesmo endpoint público | Manter contrato, códigos, expiração, indisponibilidade e regras de autenticação. Preservar a intenção de rota interna apenas depois da validação e autenticação. |

### Ficha interna

Cada sufixo na primeira coluna completa `#paciente/{p}/`. A raiz canônica da ficha é `#pessoas/{p}`. A visão do caso é a folha inicial. Os índices `/cuidado`, `/pendencias-e-tarefas`, `/registros`, `/documentos` e `/pessoas-e-acesso` vivem abaixo dessa raiz e listam somente folhas autorizadas.

| Sufixo legado | Novo endereço completo | Nome final e conteúdo |
|---|---|---|
| `visao` | `#pessoas/{p}` | Visão do caso, situação e próxima ação. |
| `linha-tempo` | `#pessoas/{p}/linha-do-tempo` | Linha do tempo, cronologia acessível também pela visão. |
| `anamnese` | `#pessoas/{p}/cuidado/anamnese` | Anamnese. |
| `saude` | `#pessoas/{p}/cuidado/saude` | Saúde. |
| `plano` | `#pessoas/{p}/cuidado/plano` | Plano de cuidado, objetivos, revisões e publicação. |
| `crise` | `#pessoas/{p}/cuidado/plano-de-crise` | Plano de crise e aprovação. A variante B acrescenta links a versões com referência opaca. |
| `tarefas` | `#pessoas/{p}/pendencias-e-tarefas/tarefas` | Tarefas do cuidado. |
| `pendencias` | `#pessoas/{p}/pendencias-e-tarefas/pendencias` | Pendências do caso, com origem preservada. |
| `encaminhamentos` | `#pessoas/{p}/pendencias-e-tarefas/encaminhamentos` | Encaminhamentos. |
| `meu-turno` | `#plantoes/pessoa/{p}/meu-turno` | Meu turno nesse caso. Atalho de Plantões pode usar `#plantoes/meu-turno` com escolha ou resolução autorizada. |
| `escala-turnos` | `#plantoes/pessoa/{p}/escala` | Escala de turnos desse caso. `#plantoes/escala` abre a seleção autorizada até existir uma visão transversal comprovada. |
| `execucao-cuidado` | `#pessoas/{p}/registros/plantao` | Fichas de plantão. O endereço legado é amplo. A chegada abre o índice de plantão da pessoa com links “Meu turno” se aplicável, “Fichas de plantão” e “Relatórios do cuidado” segundo autorização. Relatórios têm endereço próprio em `#pessoas/{p}/registros/relatorios`. Conversão fica disponível no Diário ou na ficha correspondente, com o resultado ligado ao registro criado. |
| `cadastro` | `#pessoas/{p}/pessoas-e-acesso/cadastro` | Cadastro e contatos, incluindo identificação, situação e responsável no recorte aplicável. |
| `equipe` | `#pessoas/{p}/pessoas-e-acesso/equipe` | Equipe com acesso ao caso. |
| `acesso-familia` | `#pessoas/{p}/pessoas-e-acesso/familia` | Acesso da família. |
| `orientacoes` | `#pessoas/{p}/pessoas-e-acesso/orientacoes` | Orientações, com público e histórico. |
| `contexto` | `#pessoas/{p}/cuidado/rotina-e-recursos` | Rotina e recursos. |
| `rede` | `#pessoas/{p}/pessoas-e-acesso/rede` | Rede de cuidado. |
| `documentos` | `#pessoas/{p}/documentos` | Documentos. |
| `exportacao` | `#pessoas/{p}/documentos/exportar` | Exportar dados do caso, com o próprio escopo e estado. |
| `diario` | `#pessoas/{p}/registros/diario` | Diário do cuidado. |

### Ficha compartilhada

Os mesmos fragmentos antigos da ficha são interpretados pela audiência da sessão autenticada. Um familiar abre a leitura compartilhada nos seis casos abaixo. Um usuário interno com `plano`, `diario`, `documentos` ou `orientacoes` abre a folha interna da tabela anterior. Nada na conversão do endereço delega acesso. A raiz da ficha compartilhada é `#familia/pessoas/{p}`.

| Sufixo após `#paciente/{p}/` | Destino abaixo de `#familia/pessoas/{p}` | Nome final |
|---|---|---|
| `dados` | Raiz da ficha | Dados do paciente |
| `diario` | `/diario` | Diário da família |
| `plano` | `/plano` | Plano de cuidado compartilhado |
| `relatorios-turno` | `/materiais/relatorios` | Relatórios publicados |
| `documentos` | `/materiais/documentos` | Documentos compartilhados |
| `orientacoes` | `/materiais/orientacoes` | Orientações compartilhadas |

Retirar “Novo objetivo” do cabeçalho familiar. Uma ação de contribuição já concedida deve permanecer encontrável na seção que a possui, após conferência da permissão efetiva.

### Administração

Cada sufixo legado completa `#administracao/`. O índice novo apresenta somente os grupos e as folhas disponíveis. Os quatro segmentos abaixo de `#administracao` também abrem índices de grupo.

| Sufixo legado | Novo endereço | Nome final |
|---|---|---|
| `acessos` | `#administracao/contas-e-permissoes/contas` | Contas do aplicativo |
| `equipe` | `#administracao/contas-e-permissoes/equipe` | Concessões da equipe |
| `plano-de-crise` | `#administracao/contas-e-permissoes/aprovacao-de-crise` | Permissão para aprovar plano de crise |
| `financeiro-concessao` | `#administracao/contas-e-permissoes/acesso-ao-financeiro` | Acesso ao financeiro |
| `plano-cuidado` | `#administracao/modelos-e-vocabulario/plano-de-cuidado` | Campos e aprovadores do plano de cuidado |
| `modelo-ficha-plantao` | `#administracao/modelos-e-vocabulario/ficha-de-plantao` | Modelo da ficha de plantão |
| `papel-declarado` | `#administracao/modelos-e-vocabulario/papeis-da-rede` | Papéis da rede de cuidado |
| `estado-emocional` | `#administracao/modelos-e-vocabulario/observacoes-emocionais` | Catálogo de observações emocionais |
| `configuracao` | `#administracao/sistema-e-integracoes/parametros` | Parâmetros do sistema |
| `integracoes` | `#administracao/sistema-e-integracoes/credenciais` | Credenciais das integrações, com atalho autorizado para `#administracao/sistema-e-integracoes/expurgo` |
| `auditoria` | `#administracao/privacidade-e-auditoria/historico` | Histórico de auditoria |
| `solicitacoes` | `#administracao/privacidade-e-auditoria/solicitacoes` | Solicitações de privacidade |
| `financeiro` | `#financeiro` | Financeiro, removido do menu administrativo |

### Regras de transição

- Resolver cada alias quando sua folha nova for entregue. Até lá, servir a tela anterior. Um alias conhecido e autorizado troca o endereço na mesma entrada do histórico, sem criar passo extra no botão Voltar. O autor de cada fatia atualiza os links internos que controla e conserva a leitura dos antigos.
- Restaurar filtros e foco ao voltar à lista quando ainda autorizados. Entradas diretas preservam intenção após autenticação e descartam as que falharem na validação. Parâmetros de retorno legítimos seguem o fluxo original. Metadados de saúde, nomes, motivos e segredos ficam fora dos endereços.
- Rota desconhecida ou retirada sem equivalente abre “Este endereço não está disponível”, com link para a entrada autorizada. Rota que visa um caso inacessível usa mensagem neutra sem confirmar sua existência. Um caso autorizado com folha retirada pode oferecer retornar à própria ficha após a checagem. Nenhuma rota antiga cai silenciosamente na carteira.
- Em perda de vínculo, audiência ou sessão, retirar dados e ações protegidos. Endereço, voltar/avançar, atalho e navegação direta têm a mesma regra. Se houver rascunho, a proteção da identidade prevalece. Em navegação comum, preservar a confirmação de descarte vigente.

## Celular a 390 px

A fita de 2.278 px em 346 px dá lugar a uma gaveta vertical de trabalho e a submenus verticais de contexto. A gaveta mostra apenas os destinos permitidos, agrupa utilidades no fim e tem rolagem própria quando necessário. O conteúdo ocupa a largura útil. Alvos de 46 px e rótulos quebráveis preservam leitura e ação.

```text
Menu        Avisos
Lia (caso fictício)
Pessoas acompanhadas / Cuidado
Plano de crise          Seções da ficha
Versão e estado na primeira dobra
Ação autorizada ou motivo de bloqueio

Seções da ficha ao abrir
Visão do caso
Cuidado                 [atual]
Pendências e tarefas
Registros
Documentos
Pessoas e acesso
```

“Seções da ficha” abre por pedido da pessoa e fecha depois da escolha. A seção ativa continua legível no cabeçalho, inclusive por link salvo. Administração abre com quatro grupos empilhados, com rótulo e resumo curto. Dentro do grupo aparecem suas folhas como links em coluna. Um link direto abre a folha e mostra o caminho até o grupo, sem abrir um painel por cima. Para a família, mostrar Dados, Diário, Plano e Materiais como lista contextual breve. A 390 × 844 sem bloqueio, primeiro conteúdo e ação principal ficam disponíveis na primeira dobra. Testar nomes longos, zoom, teclado, Escape, foco de retorno e navegação por histórico sem rolagem horizontal.

## Ordem de entrega após React

Cada fatia entrega um percurso completo com alias dos destinos atingidos, validação positiva e negativa e roteiro com dados fictícios. Antes da primeira, confirmar as três suposições com o solicitante quando houver evidência para decidir, atualizar o catálogo de URLs emitidas e levar o recorte aprovado para OpenSpec.

| Ordem | Fatia | Valor independente |
|---|---|---|
| 1 | Casca, Ajuda e índice de Administração em quatro grupos | Resolve a fita e a orientação móvel. Financeiro continua acessível nesse índice até sua própria fatia. |
| 2 | Plantões com Meu turno e escala | Retomada e passagem passam a ter entrada direta. O alias de execução abre o contexto do registro legado até a fatia de registros. |
| 3 | Ficha interna por grupos e ficha compartilhada, incluindo Registros | Retira Mais seções, organiza as folhas da pessoa e entrega relatório familiar encontrável. Finaliza a distribuição de fichas e relatórios de plantão. |
| 4 | Agenda como destino | Calendário fica encontrável e mantém o retorno de conexão e a autorização independente. Pode preceder Plantões se a primeira suposição mudar. |
| 5 | Financeiro como destino próprio | Separação completa entre trabalhar com despesas e conceder audiência. O índice de Administração conserva apenas a concessão. |
| 6 | Seu dia como lista orientada ao trabalho | Links diretos para itens existentes e retomada com fonte comprovada. Entrega completa na variante A. |
| 7, condicional | Seu dia com fila verificável por categoria | Só para categorias que demonstraram item acionável, estado e validade de autorização. A clareza de versão, estado e público nos planos é pré-requisito do percurso de aprovação. |

## Aceite dos percursos

| Percurso fictício | Sucesso observável | Negativa ou recuperação |
|---|---|---|
| Retomar e registrar passagem do turno de Lia | De Plantões, abrir o turno ativo autorizado, conferir pessoa e estado, registrar a passagem e ver confirmação vinculada ao turno. Reabrir e ver o estado confirmado. | Link de outro caso ou vínculo revogado não retorna dados. Falha de gravação mantém o estado anterior e oferece recuperação conforme o fluxo vigente. |
| Achar revisão e abrir a versão certa | **A:** na ficha de Lia, Cuidado → plano → revisão, identificar a versão vigente antes de agir. **B:** em Seu dia, abrir a tarefa atribuída e verificar que ela resolve para a versão exata da linha. | Versão substituída não autoriza ação sobre a nova automaticamente. Revogação ou ausência de habilitação impede comando e exposição fora da audiência. Falha da fonte aparece como indisponível. |
| Lançar despesa do caso de Lia | Abrir Financeiro → Despesas do caso, selecionar Lia, conferir o contexto, salvar e ver o lançamento confirmado nesse caso. A concessão fica em Administração. | Perfil sem audiência e caso fora do recorte recebem negativa por link direto e comando. Retentativa autorizada segue a proteção vigente contra duplicação. |
| Localizar relatório publicado | Em perfil familiar, abrir Lia → Materiais compartilhados → Relatórios publicados, identificar período e abrir o item publicado. Link familiar antigo resolve à mesma seção. | Rascunho, outro caso e item retirado de publicação não são expostos. Vazio confirmado é distinto de indisponibilidade. |

Verificar ainda todos os aliases positivos e negativos, atualizações de rota preservando contexto, Voltar/Avançar, foco e ausência de overflow em 390 px. Provar versão, registro e permissão com dados fictícios no serviço e nas fronteiras autorizadoras. As jornadas são critérios para a implementação futura.

## Os dez achados e seu alcance

A distribuição melhora a descoberta, o posicionamento e a distinção entre tarefas. O aceite do comportamento interno requer trabalho próprio quando indicado.

| Achado do diagnóstico | Efeito da distribuição | Trabalho que sobra |
|---|---|---|
| 1. Plano de crise sem hierarquia inequívoca de versão e aprovação | **Melhora.** Abre no contexto clínico e, na variante B, recebe link para versão exata. | Frente de versão, estado e aprovação: versão vigente/substituída, disponibilidade, confirmação e tratamento de concorrência. |
| 2. Meu turno esconde início, retomada, passagem e encerramento | **Melhora.** A entrada direta resolve a descoberta do turno. | Frente de estados do turno: comandos por etapa, ciência, confirmação e recuperação. |
| 3. Plano de cuidado mistura objetivos, revisão, estado e publicação | **Melhora.** A revisão ganha endereço no plano e pode ganhar ligação pela fila. | Frente do plano: hierarquia interna, autoria, audiência e confirmação de publicação. |
| 4. Diário divide a atenção entre texto, áudio, transcrição e conversão | **Melhora.** Separa Diário e Relatórios e coloca a conversão no contexto do relato. | Frente de composição e envio: texto em evidência, estado das etapas, falhas e recuperação. |
| 5. Equipe com acesso aproxima papel, vínculo e alcance | **Melhora.** Nome e localização distinguem concessões do app e equipe do caso. | Escopo, motivo e efeitos junto de substituição e revogação. |
| 6. Acesso da família confunde pré-autorização, convite e revogação | **Não toca.** A seção muda de grupo. | Clareza do ciclo de acesso e da ação que desbloqueia cada etapa. |
| 7. Minha agenda confunde vazio, desconexão e indisponibilidade | **Não toca.** O destino fica encontrável. | Estados independentes, próximos passos e tratamento da integração. |
| 8. Documentos mistura lista, envio e indisponibilidade | **Não toca.** Documentos ganha entrada direta. | Composição de lista e envio e feedback por operação. |
| 9. Exportação deixa escopo e recuperação em segundo plano | **Melhora.** Comando e folha têm nomes explícitos e contexto do caso. | Delimitar os arquivos, mostrar etapas e recuperar falhas. |
| 10. Solicitações do titular dão pouco relevo à etapa atual | **Não toca.** O índice melhora a descoberta por assunto. | Etapa visível e separação dos comandos de consulta e alteração. |

Nenhum desses dez achados fica integralmente resolvido só com a mudança de arquitetura. Os quatro primeiros precisam de recortes próprios de interação e estado. Questões de autorização, publicação, versão e integrações seguem o contrato de cada jornada.

**Base do mapa legado:** [casca](web/index.html), [rotas e montagem](web/main.ts), [formato da rota da ficha](web/ficha-paciente.ts), [Seu dia](web/home-profissional.tsx), [contrato de crise](packages/contracts/src/plano-crise.ts) e [contrato do plano de cuidado](packages/contracts/src/plano-cuidado.ts).
