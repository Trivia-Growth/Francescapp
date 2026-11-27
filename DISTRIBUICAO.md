# Distribuição do FFCMApp

Quem abre o FFCMApp para retomar um plantão precisa achar a pessoa, abrir a ficha e procurar “Meu turno” em “Mais seções”. Quem quer lançar uma despesa precisa procurar em Administração. Corrigir a fita de abas melhora a leitura e deixa intactas essas duas escolhas de arquitetura. Um produto maduro dá endereço próprio ao trabalho recorrente e mantém o histórico e as decisões junto da pessoa acompanhada.

## Como está hoje

A lateral tem **até quatro destinos**, conforme a sessão. A agenda e o sino vivem fora dessa lista.

| Destino | Conteúdo e lógica atual |
|---|---|
| **Seu dia** | Fila de atenção para a equipe, com sinais de prioridade e links para fichas e Pendências. Já se aproxima da pergunta “o que precisa de mim?”. |
| **Pessoas acompanhadas** | Carteira, filtros, paginação e Novo paciente quando autorizado. A ficha reúne 21 destinos internos. A família começa pela própria carteira e tem seis destinos na ficha compartilhada. A pessoa é o eixo correto para um histórico de cuidado. |
| **Administração** | Até 13 destinos: **Plano de cuidado** (campos e aprovadores), **Ficha de plantão — modelo**, **Papéis declarados**, **Estado emocional observado**, **Acessos**, **Credenciais das integrações** (com expurgo na superfície auditada), **Configuração**, **Equipe**, **Quem aprova plano de crise**, **Quem vê o financeiro**, **Financeiro** (Valor por turno e Despesas do caso), **Auditoria** e **Solicitações do titular**. O agrupamento acompanha controles administrativos, audiências e capacidades. |
| **Como funciona** | Regras do acompanhamento, periodicidade, canais de retorno e uso do diário. É referência institucional com o mesmo peso de navegação da carteira. |
| **Fora da lateral** | **Minha agenda** é montada em uma região da casca para profissional com entrada Google, no recorte atual. **Avisos** fica no sino da equipe. A casca também oferece saída. Acesso e convites têm páginas próprias. |

Na ficha interna, Visão do caso, Linha do tempo, Plano de cuidado e Pendências têm destaque, conforme disponibilidade. Os demais destinos caem em “Mais seções”. Na ficha familiar, a faixa tem Dados, Diário, Relatórios, Plano, Documentos e Orientações e também corta rótulos no celular. [Casca](web/index.html) · [Destinos e capacidades](web/main.ts) · [Inventário visual](docs/auditoria-visual-2026-11/AUDITORIA-VISUAL.md)

## Onde a estrutura atrapalha o trabalho

- **Plantão enterrado.** “Meu turno”, “Execução e relatórios” e “Escala de turnos” têm endereços separados na ficha. As duas primeiras entradas reaproveitam a mesma base de execução em recortes diferentes. O nome “Execução e relatórios” ainda junta registrar, converter um relato e consolidar um relatório.
- **Aprovação perto da configuração errada.** “Plano de cuidado” nomeia tanto o plano da pessoa quanto a parametrização de campos e aprovadores. “Quem aprova plano de crise” configura uma permissão. O ato de aprovar pertence à versão do plano, com atalho da fila quando o sistema puder sinalizá-lo.
- **Pendências e Tarefas parecem sinônimos.** Os registros têm origens e ciclos próprios, mas quem abre o app para resolver algo precisa de um ponto comum de triagem. Mostrar a origem e levar ao registro responsável preserva a diferença.
- **Há quatro respostas para “quem participa?”.** “Equipe” administrativa, “Acessos”, “Equipe com acesso” e “Rede de cuidado” confundem admissão, vínculo e participação no cuidado. “Papéis declarados” sugere permissão ao lado desses rótulos, embora seja vocabulário de registro.
- **Financeiro está onde se governa o acesso.** Lançar e consultar custos é trabalho operacional. Conceder audiência é governança. Colocá-los na mesma faixa exige que a pessoa saiba de antemão como o sistema classifica a função.
- **Agenda discreta e ajuda em primeiro nível.** Calendário atravessa casos e atende a uma necessidade de trabalho. “Como funciona” é uma consulta de referência e ainda sugere três coisas sem nomeá-las: instrução, suporte e regras combinadas.
- **A localização se contradiz.** No passe a 1.920 px, a barra disse “Pessoas acompanhadas” em Administração → Equipe. No celular, a abertura automática de “Mais seções” deixou o início da tarefa de Equipe com acesso em y=915, abaixo da janela de 844 px.

O app tem **uma boa entrada por pessoa e urgência, seguida por uma navegação que reflete módulos e permissões**. A cronologia, a carteira e a fila de Seu dia correspondem ao trabalho. Na ficha e em Administração, telas de operação, tipos de registro e controles de acesso ganham o mesmo peso. A estrutura expõe a organização dos recursos e da implementação.

### O que as 13 abas denunciam

**Administração funciona em parte como depósito.** Configurar um modelo, investigar um evento, trocar uma credencial, tratar um pedido de privacidade e lançar uma despesa dividem a mesma escala de navegação. O código comprova a mistura, e a ideia de que virou o endereço padrão para funções novas é uma inferência, sem comprovação da intenção histórica. Na auditoria, os links ocupavam 2.278 px em uma faixa de 346 px no celular. Cabia um inteiro a 390 px e cinco a 1.440 px. Colocar os mesmos 13 vizinhos em uma coluna resolveria a rolagem e conservaria a dúvida de onde procurar.

## O princípio do Atendimento

Na revisão local `76a3ccda`, a casca do Atendimento oferece, conforme o papel, Visão geral, Conversas, Clientes, Prospecção, Funil de vendas, Soluções, Minha agenda, Campanhas, Agentes, Relatórios, Configurações e Ajuda. Conversas e Agenda são destinos reconhecíveis de trabalho. Funil descreve uma sequência reconhecível. O indicador de conversas liga o sinal ao lugar de agir. A configuração de campos e papéis das empresas mora em Configurações → Empresas, com acesso por perfil, enquanto Clientes permanece como destino operacional. A casca encurta os rótulos no celular.

A distribuição parece mais natural porque a pessoa pode reconhecer o próximo passo pelo rótulo, mesmo com mais itens globais. O FFCMApp pode adotar essa correspondência entre tarefa e destino. Aqui o eixo de continuidade é a pessoa acompanhada e a família precisa de sua própria leitura. [Referência registrada](docs/projeto/referencia-atendimento.md). Evidência adicional no checkout do Atendimento em `apps/web/src/core/CascaDaAplicacao.tsx`, `apps/web/src/core/papel.test.ts` e `apps/web/src/modules/lead/interfaces/ConfiguracaoDeEmpresas.tsx`.

## Proposta de distribuição

**Três destinos operacionais de base para a equipe, com até cinco conforme o trabalho autorizado.** Plantões é apresentado a quem tiver trabalho de plantão ou escala. Agenda e Financeiro dependem do acesso correspondente. A família começa em Pessoas acompanhadas. Administração, Ajuda e conta formam a área de utilidades no mesmo menu.

```text
Área de trabalho
├── Seu dia
│   ├── O que precisa de atenção → registro na ficha
│   ├── Revisões e aprovações → versão do plano, quando houver sinal verificável
│   └── Retomar turno → mesmo destino de Plantões
├── Pessoas acompanhadas
│   ├── Carteira, filtros e Novo paciente
│   └── Ficha da pessoa
│       ├── Visão do caso → situação, próxima ação, Linha do tempo
│       ├── Cuidado → Plano de cuidado, Plano de crise, Saúde, Anamnese, Rotina e recursos
│       ├── Pendências e tarefas → Pendências, Tarefas, Encaminhamentos
│       ├── Registros → Diário, fichas de plantão, Relatórios do cuidado
│       ├── Documentos → arquivo e ação Exportar dados do caso
│       └── Pessoas e acesso → Rede de cuidado, Orientações, Equipe com acesso,
│                              Acesso da família, Cadastro e contatos
├── Plantões → Meu turno, Escala de turnos
├── Agenda → Minha agenda, compromissos, conexão do calendário
└── Financeiro → Valores por turno, Despesas do caso

Utilidades
├── Avisos → sino com motivo, destino e estado de leitura
├── Administração
│   ├── Contas e permissões → Acessos, Equipe, permissão de crise, audiência financeira
│   ├── Modelos e vocabulário → campos e aprovadores do plano, modelo de plantão,
│   │                           papéis da rede, catálogo de observações emocionais
│   ├── Sistema e integrações → parâmetros, credenciais e expurgo
│   └── Privacidade e auditoria → solicitações do titular, registros de auditoria
├── Ajuda → Como funciona o acompanhamento, canais e orientação
└── Conta → sessão e saída

Família
└── Pessoas acompanhadas → ficha compartilhada
    ├── Dados do paciente
    ├── Diário da família
    ├── Plano compartilhado
    └── Materiais compartilhados → Relatórios, Documentos, Orientações
```

| Movimento | Por que e como |
|---|---|
| **Manter Seu dia como fila** | Mostrar pessoa, motivo e próximo passo. Começar pelos sinais existentes. Uma fila de aprovações depende de fonte confiável e estado verificável. Aprovar continua no plano da pessoa, com autoria, versão e audiência visíveis. |
| **Promover Plantões** | Quem tem um turno em curso pode querer retomar antes de consultar a ficha. Se houver ambiguidade, escolher entre os turnos autorizados com a pessoa identificada. A ficha mantém um atalho sobre o mesmo turno. A escala fica junto do trabalho de plantão e identificada como diferente de um compromisso de calendário. |
| **Promover Agenda** | Consulta e vínculo do calendário acompanham o trabalho entre casos. Uma agenda global só ganha entrada interna quando sua disponibilidade e suas permissões estiverem confirmadas. |
| **Promover Financeiro para sua audiência** | Valores e despesas têm endereço operacional. Um atalho no caso abre a mesma despesa naquele contexto. A concessão fica em Contas e permissões, com o rótulo “Acesso ao financeiro”. |
| **Reagrupar a ficha** | A visão inicial preserva pessoa, situação e cronologia. Pendências, Tarefas e Encaminhamentos ficam próximos, com origem e responsável visíveis. Documentos mantém entrada direta pela frequência presumida e abriga a exportação com escopo explícito. Edição de cadastro, contatos e vínculos fica no contexto da pessoa. |
| **Retirar “Execução e relatórios”** | Atividade de turno abre em Plantões. Fichas concluídas e relatórios abrem em Registros. Converter um relato começa no Diário ou na ficha de plantão correspondente e leva ao registro resultante. |
| **Substituir a fita e “Mais seções” por grupos nomeados** | Administração vira uma página índice com quatro grupos legíveis em coluna no celular. Na ficha, os grupos de segundo nível abrem com a seção e o caso identificados na primeira dobra. “Plano de cuidado” administrativo vira “Campos e aprovadores do plano de cuidado”. “Papéis declarados” vira “Papéis da rede de cuidado”. “Quem aprova plano de crise” vira “Permissão para aprovar plano de crise”. |
| **Mover Como funciona para Ajuda** | A ajuda fica disponível quando surgir a dúvida. Links contextuais podem abrir a regra pertinente. A ficha familiar retira o atalho genérico “Novo objetivo” do cabeçalho e apresenta as ações concedidas nos respectivos contextos. |
| **Dar um endereço ao registro** | Seu dia, Avisos e atalhos da ficha levam ao mesmo destino. Links profundos antigos devem continuar resolvendo para o contexto correto. Voltar pela navegação deve recuperar a origem. |

### Critério para decidir

Testar primeiro clique e conclusão com dados fictícios, em desktop e a 390 px, com as tarefas descritas pelo resultado. Pedir que um profissional retome um turno e registre a passagem, que o case manager encontre uma revisão e abra a versão correta, que uma pessoa com acesso financeiro lance uma despesa e que um familiar localize um relatório publicado. Pedir também que encontrem quem pode atuar em um caso e onde se convida um familiar. Observar retornos, rótulos confundidos e alcance da primeira ação, inclusive com teclado e histórico.

Antes de implementar, confirmar com o solicitante a prioridade de Plantões e Agenda, o recorte de cada perfil e os sinais disponíveis para aprovações. A prova conectada futura deve incluir abertura direta de outro caso, capacidade ausente, revogação e audiências distintas. Os controles continuam aplicados no servidor e no banco. Esta proposta preserva paleta e fontes e usa hipóteses de frequência, sem telemetria de uso.

## Inventário completo

**53 superfícies de produto e 59 vereditos no inventário completo.** A unidade verificável é a linha com veredito. As 53 incluem telas, conjuntos de estados e elementos da casca. O relatório agrupa vários estados e ações na mesma linha, portanto o total de telas únicas e o de microdefeitos individuais não são determináveis a partir dele. As seis linhas restantes cobrem referências locais.

| Bloco | Linhas |
|---|---:|
| Casca e entrada | 10 |
| Administração | 13 |
| Ficha interna | 21 |
| Família e páginas públicas | 9 |
| **Produto** | **53** |
| Demonstrações e bancadas | 6 |
| **Total** | **59** |

**50 de 53 vereditos do produto ficaram sem encaminhamento direto para o problema específico da linha. Considerando também os itens locais, são 56 de 59.** A regra de cruzamento conta a linha quando um dos dez tópicos encaminha seu problema específico. Três correspondências: **Menu lateral, trilho e gaveta** (recuperar espaço e orientação, tópico 3), **Equipe** (truncamento e composição, tópicos 1–4) e **Estado emocional observado** (lista, retorno e recarga, tópicos 4 e 8). A largura de Seu dia aparece no tópico 2, enquanto seu veredito da linha trata de urgência e ações. Cadastro e Documentos exemplificam o painel Mais seções, enquanto suas decisões de formulário e arquivo seguem em aberto. Citar consultas de Papéis declarados, Plano administrativo, Ficha de plantão e Auditoria como evidência de desempenho também deixa em aberto os vereditos de vocabulário, edição e leitura. O resultado mede encaminhamento direto por linha. As causas transversais continuam relevantes para várias telas.

### Dez achados que merecem ser chamados pelo nome

A ordem considera possíveis consequências para continuidade, autoria, audiência e recuperação do trabalho.

1. **Plano de crise sem hierarquia inequívoca de versão e aprovação.** A decisão precisa mostrar a versão vigente, sua disponibilidade e a consequência da ação.
2. **Meu turno esconde início, retomada, passagem e encerramento.** O próximo gesto deveria seguir o estado real do turno, com a ciência no contexto.
3. **Plano de cuidado mistura objetivos, revisão, estado e publicação.** Autoria e audiência precisam acompanhar a publicação.
4. **Diário divide a atenção entre texto, áudio, transcrição e conversão.** O texto e o estado de envio precisam aparecer claramente.
5. **Equipe com acesso aproxima papel, vínculo e alcance.** Troca de responsável e revogação pedem escopo e motivo perto da ação.
6. **Acesso da família confunde pré-autorização, convite e revogação.** A etapa bloqueada deve indicar o próximo passo permitido.
7. **Minha agenda confunde vazio, desconexão e indisponibilidade.** Cada estado pede uma ação diferente.
8. **Documentos mistura lista, envio e indisponibilidade da integração.** Busca, abertura, edição e envio precisam de retorno por operação.
9. **Exportação deixa escopo e recuperação em segundo plano.** É preciso identificar quais dados podem sair e em que etapa ocorreu a falha.
10. **Solicitações do titular dão pouco relevo à etapa atual.** A consulta da solicitação e a alteração de dados pedem comandos distintos.

A contagem foi feita nas tabelas do inventário. Os achados preservam as limitações do passe original, com fixtures fictícias, leitura de fonte e conteúdo parcial em várias rotas internas e familiares. [Inventário original](docs/auditoria-visual-2026-11/AUDITORIA-VISUAL.md#inventário) · [Dez tópicos anteriores](docs/auditoria-visual-2026-11/PLANO-EVOLUCAO.md#visual)
