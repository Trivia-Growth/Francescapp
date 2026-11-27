# Plano de evolução do FFCMApp

**Decisão vigente.** Toda a reforma visual e de performance começa depois que a migração terminar, inclusive os itens classificados como defeitos. Depois da migração, o dono escolhe a ordem de execução a partir da nova medição. A ordem em cada lista estima impacto por custo. Horas, dias e semanas indicam esforço de implementação e verificação focal, sem prazo de calendário. Preserve Cormorant Garamond, Raleway e os tokens aprovados. A identidade final fica com o marketing.

## Retomada após a migração

Repetir o roteiro de medição com dados fictícios na versão integrada da migração antes de iniciar a reforma. Registrar o commit medido, comparar telas equivalentes pela tarefa e atualizar o esforço de cada tópico. As medidas de novembro documentam a origem dos itens. Se a versão integrada já cumprir o critério de aceite de algum tópico, registrar a evidência e encerrar o item. Os custos abaixo estimam o esforço caso o problema ainda se manifeste.

| Tópicos | Como o esforço pode mudar |
|---|---|
| 1–4 | Conferir recortes, largura útil, destino atual e posição da primeira tarefa. Corrigir apenas os problemas que persistirem. |
| 5 | Deve encolher à medida que as últimas telas legadas deixarem de consumir cada regra. O trabalho restante passa a ser identificar e retirar regras sem consumidor e conferir a paridade dos controles. |
| 6 | Pode virar apenas reverificação se a migração separar a posse dos campos. Repetir as transições mesmo onde o observador tiver sido retirado. |
| 7 | Redimensionar pela cascata real da versão integrada. Rotas migradas podem antecipar as próprias leituras ou continuar passando pela mesma casca. |
| 8 | Fica mais fácil se as telas convergirem para os mesmos serviços, chaves e pontos de invalidação. Fica mais caro se a migração multiplicar clientes ou hooks que mantêm cópias independentes dos mesmos dados. Nesse caso, contar os consumidores e a política de cada recurso antes de estimar a conversão. A escolha do contrato e a reforma ficam para depois da migração. |
| 9 | Recalcular com o novo pacote de entrada e o grafo de módulos. O carregamento antecipado pode já ter sumido, ou outros módulos podem ocupar o caminho crítico. |
| 10 | O custo da variante da marca tende a ser semelhante. O trabalho sobre deslocamentos depende da transição que restar na versão integrada. |

## Visual

### 1. Ler o estado de cada pessoa em Equipe no celular

- **Tipo e proposta.** Defeito. Em celular, empilhar a identidade e os estados da conta e do acesso, com quebra para endereços longos.
- **Evidência.** Em 390 × 844, as três colunas visíveis têm 77 px cada. “Acesso ativo” ocupa 104 px, “Convite pendente” 137 px e “Acesso revogado” 133 px. Um e-mail fictício mediu 264 px. A 1440 px, os e-mails da fixture também excedem os 158 px disponíveis.
- **Para quem usa.** Dá para conferir quem tem acesso, quem aguarda convite e quem foi revogado antes de operar sobre o registro.
- **Custo.** Um dia.
- **Depende da migração?** Não. Equipe já usa a lista React.
- **Risco e aceite.** Baixo. Verificar leitura simultânea de pessoa, perfil, conta e estado a 360 e 390 px e com zoom de 200%, incluindo nomes longos e navegação por teclado.

### 2. Fazer as caixas de trabalho acompanharem a largura disponível

- **Tipo e proposta.** Frente própria. Alinhar listas, cartões e ações à grade que serve cada tarefa, com linhas de leitura curtas dentro dessas áreas.
- **Evidência.** Na Administração, a faixa mede 1.097 px em 1440 px e 1.446 px em 1920 px. As caixas de Equipe e Estado emocional param em 764 px por causa do limite de `78ch` em `.administracao-conteudo`, deixando respectivamente 333 e 682 px livres à direita dentro da mesma grade. O formulário de Equipe ocupa 529 dos 714 px internos da superfície, deixando 185 px livres à direita. Em 1440 px a lista começa em y=336 e tem 558 px de altura. O convite começa 32 px depois, em y=926. A caixa alta vem da composição em sequência, sem evidência de altura fixa. Em Seu dia, `.home` para em 760 px nos dois desktops, sobrando 337 e 686 px dentro da grade. Em 1920 px o limite global de 1.580 px deixa 46 px de cada lado antes do padding. Esse recuo simétrico é distinto da faixa unilateral. A Visão do caso já acompanha toda a grade, com cartões de 1.097/1.446 px.
- **Para quem usa.** Mais espaço para comparar registros de Equipe. A tela de Seu dia continua organizada pelo que pede ação, com leitura confortável dos motivos.
- **Custo.** Dois a três dias para Equipe, Estado emocional e Seu dia, com avaliação de outras telas a partir do piloto.
- **Depende da migração?** Não. O limite local pode ser corrigido nas telas já disponíveis. A remoção global das antigas regras fica no tópico 5.
- **Risco e aceite.** Médio. Manter campos de e-mail e texto em medida confortável. Medir bordas de cabeçalho, lista e formulário em 1440/1920 px e testar 360/390 px, sem ampliar indiscriminadamente os blocos de texto nem acrescentar conteúdo lateral para preencher espaço.

### 3. Mostrar onde a pessoa está e devolver a tela à tarefa

- **Tipo e proposta.** Frente própria com defeitos de orientação. Mostrar o destino atual no primeiro quadro, com acesso reconhecível às outras seções autorizadas.
- **Evidência.** Em desktop a 1920 px, a barra superior exibe “Pessoas acompanhadas” durante a visita à Administração → Equipe, enquanto a lateral marca “Administração”. A faixa de Equipe mede 346 px a 390 px e carrega 2.278 px de links. Na auditoria com todas as capacidades, havia 13 destinos, um link inteiro no celular e cinco a 1440 px, com a seleção originalmente fora da área visível em links profundos. Na ficha móvel, “Mais seções” aberto automaticamente ocupa 458 px. Em Equipe com acesso começa em y=433 e a tarefa começa em y=915, abaixo da dobra de 844 px. Cadastro e Documentos abriram com o mesmo painel de 458 px.
- **Para quem usa.** Reconhece onde chegou e começa a próxima ação sem atravessar uma lista extensa.
- **Custo.** Alguns dias para Administração e ficha, até uma semana com regressão de perfis e teclado.
- **Depende da migração?** Não. Cabeçalhos, URLs e seleção vivem na casca.
- **Risco e aceite.** Médio. Validar links profundos, voltar/avançar, foco e três perfis fictícios. Prototipar os grupos de Administração e o resumo de destinos da ficha pela frequência de uso própria do FFCMApp. Sincronizar o rótulo da barra superior com a seleção. Manter o conteúdo da seção atual visível na primeira dobra a 390 × 844 no cenário sem aviso bloqueante.

### 4. Colocar a lista antes dos formulários de manutenção

- **Tipo e proposta.** Frente própria. Em Equipe e nos catálogos, dar prioridade aos registros existentes e abrir a criação quando for a intenção da pessoa.
- **Evidência.** Em Equipe há dois painéis de 764 px com títulos de mesmo nível, duas operações de manutenção e estados em regiões diferentes. Em Estado emocional a 390 px, “Estado emocional observado” começa em y=376, “Novo termo” em y=750 e “Termos do catálogo” em y=1.016. A lista que a pessoa veio conferir começa 640 px depois do assunto da página.
- **Para quem usa.** Encontra termos e pessoas logo ao chegar. No convite, a etapa e eventuais bloqueios ficam junto da ação.
- **Custo.** Dois a quatro dias no piloto com Equipe e Estado emocional.
- **Depende da migração?** Não. Ambas as superfícies já são React.
- **Risco e aceite.** Médio. Preservar reserva, revalidação, recuperação e semântica de “Pré-conceder acesso”. Exercitar formulário vazio, rascunho, falha, sucesso e retorno de foco. A ação mais importante da tela deve ser identificável no primeiro quadro.

### 5. Unificar o acabamento dos controles depois que os últimos consumidores migrarem

- **Tipo e proposta.** Depende da migração. Quando a última tela de cada família trocar de controle, retirar as regras antigas dessa família e conferir o mesmo acabamento e comportamento nos estados equivalentes.
- **Evidência.** A auditoria contou 707 linhas em `web/ui/ui.css` e 3.444 em `web/styles.css`, ambos ainda na camada `legado`. Na base medida, Admin conserva limite de formulário de `54ch` além do limite de 560 px da Equipe. A integração de React por ilhas (#19) já entrou em `main` e a base ainda observa seis regiões mistas para seleção e data. [Auditoria por tela](AUDITORIA-VISUAL.md).
- **Para quem usa.** Seleção, data, foco, mensagens e diálogo se comportam de forma previsível nas jornadas.
- **Custo.** Alguns dias por família após a migração do último consumidor, distribuídos pelas entregas.
- **Depende da migração?** Sim para a retirada ampla. Exigir inventário dos consumidores HTML e React por regra antes de apagar CSS ou widgets compartilhados. A estabilidade dos campos tem seu próprio critério no tópico 6.
- **Risco e aceite.** Médio a alto. Conferir acesso por teclado, datas e fuso, rótulos, valor enviado, CSP e páginas públicas. Verificar que a regra removida perdeu o último consumidor de fato.

## Performance e estabilidade

### 6. Impedir que campos quebrem quando a tela muda

- **Tipo e proposta.** Defeito identificado durante a migração. Reproduzir no app integrado antes da reforma. Deixar o desenho e a remoção dos controles sob responsabilidade do React nas regiões React.
- **Evidência.** `web/main.ts:275–283` instala `aplicarControlesProprios` em seis regiões incluindo Administração, ficha e agenda. `web/ui/controles.ts:28–29` observa descendentes. `web/ui/selecao.ts:51–52` e `web/ui/data.ts:108–109` usam `replaceWith` e `append` para deslocar o próprio campo. Em uma reprodução isolada com Chromium, React e o observador do produto, o pai do seletor mudou de `#owner` para `.ui-selecao[data-aprimorada]`. A remoção condicional disparou `NotFoundError` em `removeChild`. No controle sem observador, o pai permaneceu `#owner` e o campo saiu sem erro. A reprodução cobre o mecanismo de seleção. A data tem o mesmo deslocamento confirmado em código. A regra explícita de posse vem da documentação oficial do React. [Manipulando o DOM com refs](https://react.dev/learn/manipulating-the-dom-with-refs#best-practices-for-dom-manipulation-with-refs).
- **Para quem usa.** Abrir, fechar ou trocar opções de um formulário deixa a tela navegável e mantém as próximas ações disponíveis.
- **Custo.** Um a dois dias para isolar a fronteira e provar o caso. Mais tempo se uma ilha precisar trocar seu controle inteiro.
- **Depende da migração?** Não para a contenção. Em cada frente, preferir seleção/data em JSX com a primitiva existente ou nativo com o estilo do produto. Widgets imperativos podem ficar em subárvore própria, explicitamente de propriedade legada. Incluir a checagem no aceite da reforma para cada região afetada.
- **Risco e aceite.** Alto se sair um bloqueio geral sem inventariar os controles legados. Exercitar remoção condicional, troca de rota, cancelamento e remontagem, perda de acesso, teclado, valor submetido e rótulo. Evitar detecção por propriedades privadas do React. Desconectar o observador é parte da limpeza de uma raiz legada e a fronteira deve impedir que o nó seja movido desde a montagem.

### 7. Abrir cada tela sem esperar buscas de outras tarefas

- **Tipo e proposta.** Frente própria. Buscar na entrada o necessário para a atividade aberta, mantendo a conferência de acesso na ordem exigida.
- **Evidência.** Com 450 ms de atraso por API e CPU 4×, Carteira disparou sessão em 1.221 ms, recebeu-a em 1.676 ms e recebeu a página de pacientes em 2.200 ms. O catálogo emocional disparou seu GET só em 2.262 ms, após sessão e a primeira onda da casca. A entrada direta em Equipe enviou o mesmo GET de concessões com `limite=25` duas vezes, em 1.706 e 2.325 ms. Também pediu carteira, disponibilidade da edição e da substituição de responsável. Foi uma rajada de 12 chamadas, incluindo o protocolo de Equipe.
- **Para quem usa.** A tarefa aparece mais cedo ao abrir um link direto, especialmente em rede lenta.
- **Custo.** Dois a quatro dias para rastrear dependências e testar a primeira rota.
- **Depende da migração?** Não. O encadeamento começa na casca atual.
- **Risco e aceite.** Alto. Distinguir leitura duplicada de leitura de reconciliação. Jamais tirar conferência de sessão, autorização, barreiras ou revogação do caminho necessário. Aceitar quando a primeira tarefa deixar de esperar leituras auxiliares independentes e cada leitura duplicada dispensável ocorrer uma vez. Medir antes e depois e verificar acesso direto, troca de perfil e falha da consulta auxiliar.

### 8. Decidir como o app busca e guarda dados entre telas

- **Tipo e proposta.** Frente própria, com repetição de espera comprovada. Adotar um único contrato de leitura, revalidação e descarte no cliente, começando por catálogos administrativos.
- **Evidência.** A auditoria contou seis GETs para seis entradas no Estado emocional. A volta com 450 ms adicionados levou ~472 ms no protocolo original. Nesta rodada, quatro voltas em desktop sem atraso adicionado levaram 35–41 ms e duas voltas com CPU 4× e 450 ms por resposta levaram 863–865 ms, todas com novo GET. O hook `web/telas/catalogo-administrado.tsx` guarda dados na instância e o HTTP usa `no-store`. Seis de seis destinos amostrados pediram dados novamente nas duas entradas durante a mesma sessão. A tabela abaixo lista as chamadas e distingue as leituras de catálogo das operações que exigem revisão de segurança.
- **Para quem usa.** Ao voltar a um catálogo ainda permitido, vê os registros que acabou de consultar. Atualizar continua consultando o servidor e mudanças de acesso retiram dados imediatamente.
- **Opções e custo.** **Fetch por tela.** Horas a um dia por rota, sem conversão inicial. Cada tratamento precisa repetir decisões de deduplicação e invalidação. **Biblioteca comum, como SWR.** Dois a quatro dias de piloto e uma a três semanas para converter leituras elegíveis e mudar seus testes. A fronteira de identidade, cancelamento, autorização e invalidação ainda precisa ser implementada pelo projeto. **Camada mínima comum sobre os serviços HTTP existentes.** Dois a quatro dias de piloto e uma a duas semanas para converter as famílias elegíveis, com nova estimativa após inventário. Suporta o necessário para os catálogos: deduplicar em voo, guardar o último resultado em memória por identidade e escopo, invalidar após escrita e limpar nas transições de acesso.
- **Recomendação.** Camada mínima comum, reaproveitando a infraestrutura de sessão e o hook compartilhado que já atendem o piloto. O projeto não tem SWR e já distingue serviços HTTP de estado de tela. A conversão por família preserva os contratos HTTP e evita introduzir dois modelos elegíveis à mesma leitura. Manter um inventário com um único responsável por cada recurso durante a transição. Levar a biblioteca para decisão de projeto se paginação, mutações e revalidação exigirem complexidade que o piloto demonstrar.
- **Depende da migração?** Não. A decisão vale para ilhas e próximas rotas. Na retomada, inventariar os consumidores da versão integrada antes de definir o contrato.
- **Risco e aceite.** Alto para dado, caso e autorização. Piloto com catálogo administrativo, memória apenas, escopo por sessão/usuário/capacidade e chave de recurso. Qualquer extensão a paciente ou audiência requer verificação própria. Provar deduplicação de consumidores simultâneos, revalidação manual, edição, descarte na revogação e na troca de conta, falha após sucesso e resposta atrasada de identidade anterior. Na espera do catálogo, desabilitar ou comunicar o estado de “Atualizar catálogo de termos”. Na auditoria, o botão aparecia acionável em uma espera de 650 ms, mas o clique era descartado.

### 9. Carregar menos código antes da primeira tela

- **Tipo e proposta.** Frente própria. Diminuir o trabalho que o navegador executa antes da primeira consulta da tela.
- **Evidência.** A visita fria à Carteira transferiu 389.495 bytes de corpos em 19 recursos registrados, incluindo documento e oito chamadas fictícias. JavaScript gzip respondeu por 223.369 bytes, 57% do total. O HTML antecipa 15.924 bytes gzip do módulo de Configuração do sistema até na Carteira. A primeira tarefa longa no perfil móvel 4× sem atraso foi de 929–1.038 ms. O teste isolando CPU e atraso está abaixo. A atribuição por função ainda exige trace.
- **Para quem usa.** A interface responde mais cedo no primeiro acesso em aparelhos lentos.
- **Custo.** Um a três dias para identificar a importação que puxa Configuração e provar a separação. Uma semana para uma segunda rodada caso o trace aponte outros módulos no caminho crítico.
- **Depende da migração?** Não. A divisão por rota já existe e a medição identifica carregamento antecipado em `main`.
- **Risco e aceite.** Médio. Validar abertura direta de Configuração e erro de carregamento de módulo, além da Carteira. Aceitar quando o caminho crítico carregar apenas módulos exigidos pela primeira tarefa e cair o custo medido de código retirado, sem regressão nas demais rotas. Comparar bytes, tempo de script e tarefas longas com a mesma fixture e compressão. Importar a partir do módulo efetivamente usado. Carregar por destino para módulos exclusivos e manter os compartilhados quando o trace justificar.

### 10. Entregar a marca em tamanho proporcional e estabilizar a primeira pintura

- **Tipo e proposta.** Frente própria. Entregar a mesma marca em resolução adequada ao espaço ocupado e estabilizar a transição da entrada para a área autenticada.
- **Evidência.** O JPEG tem 39.848 bytes e 773 × 771 px naturais para 64 × 64 na barra e 96 × 96 na entrada pelo HTML. O ícone de 192 px acrescentou 18.358 bytes. O logo visível já declara largura e altura. As duas fontes locais somam 80.896 bytes. A soma de deslocamentos sem entrada recente em Carteira foi 0,189 no primeiro desktop e 0,437 na primeira amostra móvel, em uma janela de observação curta. A origem por elemento ainda precisa de rastreamento e essa soma serve como triagem, sem equivalência com a métrica de campo.
- **Para quem usa.** O mesmo visual da marca chega com menos dados e a primeira ação permanece em posição previsível.
- **Custo.** Horas para comparar variantes da marca. Um a dois dias para atribuir e corrigir o deslocamento se o trace identificar a origem.
- **Depende da migração?** Não. Os recursos e a transição da entrada ficam na casca.
- **Risco e aceite.** Baixo para variante de imagem e médio para transição. Preservar arquivo original, recorte, cor, fontes e manifesto. Conferir imagem nítida em DPR 1/2/3. Comparar deslocamentos por nó e fase antes de modificar carregamento de fonte ou reserva de espaço. Nenhum caso de imagem visível sem dimensões foi observado nas rotas medidas.

## Medição e limites

Base de produto `80f7583`, worktree `92e8e09` com apenas a auditoria acima da base. Bundle de produção Vite em diretório temporário, Chromium local, HTTP loopback, cache frio por contexto, service worker bloqueado, gzip para HTML/CSS/JS. Respostas externas bloqueadas e APIs interceptadas com fixtures do repositório. Os bytes são `encodedBodySize`, sem cabeçalhos de rede. A coleta para o peso iniciou na navegação e terminou aproximadamente 750 ms depois do conteúdo procurado. Os tempos são da navegação até o navegador detectar conteúdo visível no DOM (botão de abrir ficha em Carteira, estado de acesso em Equipe, título da lista em Estado emocional), incluindo a granularidade do detector. Latência artificial aplicada às APIs, com arquivos estáticos em loopback. Downloads em rede móvel real podem elevar o tempo. A Visão do caso foi usada para geometria e observação de chamadas, com APIs parciais.

| Carteira em 390 × 844 | Mediana até primeiro botão da lista | Amostras em ms |
|---|---:|---|
| CPU 1×, atraso API 0 ms | 451 ms | 477 / 402 / 451 |
| CPU 4×, atraso API 0 ms | 1.663 ms | 1.553 / 1.681 / 1.663 |
| CPU 1×, atraso API 450 ms | 1.571 ms | 1.555 / 1.571 / 1.610 |
| CPU 4×, atraso API 450 ms | 2.613 ms | 2.613 / 2.619 / 2.524 |

A CPU isolada acrescentou 1.212 ms à mediana com API local. O atraso isolado acrescentou 1.120 ms com CPU 1×. São dois gargalos observáveis nesse cenário. Em uma amostra 4×/+450 ms, Equipe ficou em 3.101 ms e Estado emocional em 3.044 ms. A primeira pintura apareceu antes da lista em várias rotas. Abrir rápido a casca e conseguir trabalhar são marcos distintos. Validar a próxima entrega com conta fictícia autorizada em ambiente conectado, aparelho intermediário, amostra fria e quente, composição por rota, serviço real e revogação. A comparação com Atendimento nesta rodada é de decisões verificadas em código, sem benchmark comparável entre sistemas.

### Consultas repetidas na mesma sessão

Chromium desktop 1440 × 900, 450 ms adicionados por resposta. Depois da Carteira, abrir o destino, voltar à Carteira e abrir o mesmo destino novamente. Em cada par, as mesmas rotas abaixo foram solicitadas nas duas entradas. Quatro destinos de catálogo são candidatos ao primeiro recorte de padronização. Equipe e Auditoria comprovam o alcance da repetição, mas precisam de política própria para cada leitura.

| Destino | Leituras repetidas em cada abertura |
|---|---|
| Estado emocional observado | `/api/admin/estado-emocional` |
| Papéis declarados | `/api/admin/papel-declarado` |
| Plano de cuidado — Administração | `/api/admin/campo-extra-plano` e `/api/admin/aprovador-plano` |
| Ficha de plantão — modelo | `/api/admin/campo-extra-plano?escopo=ficha_plantao` |
| Equipe | `/api/admin/concessoes-equipe?limite=25`, além da sequência de barreira, encerramento e reconferência |
| Auditoria | `/api/admin/auditoria?limite=25` e `/api/pacientes?limite=25` |

## O que as skills confirmam e o que mudou no plano

- **Frontend Design.** A recomendação sobre comprimento de linha confirma manter o texto de instrução contido. A leitura inicial de “caixas que não ocupam a tela” vira duas decisões: linha curta para prosa e área ampla para comparação de pessoas, estados e registros. A preferência inicial por aplicar o mesmo arranjo vertical da Administração em toda navegação cede ao teste de tarefas específicas do FFCMApp. Para uma área de operação, o elemento que caracteriza a experiência é a tarefa real. Em Seu dia, os casos que pedem atenção. Na ficha, a situação, a próxima ação e quem responde por ela. A escala existente dá destaque editorial aos títulos com Cormorant Garamond e funções operacionais à Raleway. Os tokens aprovados já definem fundo `#fbfcf8`, superfície `#ffffff`, texto `#273123`, borda `#dfe5d4`, oliva de ação `#475436` e seleção `#edf2e6`. A skill dá liberdade para escolhas de identidade quando o briefing deixa margem. Aqui, a instrução sobre manter paleta e fontes tem precedência. Usar movimento curto ligado a uma ação e comunicar vazio/erro no contexto. [Fonte Anthropic](https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/frontend-design/SKILL.md).
- **Atendimento.** O `DESIGN.md` em `76a3ccda` documenta Krub para títulos, Inter Tight para leitura, uma ação dominante por região, navegação aberta ou recolhida com manutenção de foco, e feedback localizado. `packages/ui/tokens.css` materializa escala e tipografia e `apps/web/src/components/ui/{estado-vazio,skeleton}.tsx` materializa estados. A revisão `215c2084` atribui explicitamente um refino a Impeccable. A skill encontrada em `/home/lucas/Github/Atendimento/.agents/skills/frontend-design/SKILL.md` é byte a byte igual à da Anthropic baixada. O caminho `.claude/skills/frontend-design` estava ausente no checkout inspecionado. Hierarquia, densidade e estados são coerentes com a skill. A atribuição histórica às duas skills vem do dono, enquanto a inspeção demonstra coerência das escolhas implementadas. No FFCMApp, reaplicar decisão por tarefa, clareza de ação e estabilidade, com destinos, leiaute e identidade definidos pelo próprio produto.
- **Vercel React Best Practices.** `async-defer-await`, `async-dependencies` e `bundle-conditional` confirmam priorizar a cascata e arquivos carregados cedo. `client-swr-dedup` confirma o problema de busca repetida e recomenda SWR. A decisão proposta no tópico 8 mantém deduplicação, revalidação e invalidação e escolhe um piloto com serviços existentes, reduzindo custo de conversão e coexistência. `rendering-activity` sugere preservar DOM e estado durante alternância. Aqui o dado reutilizável merece ciclo de vida explícito e a UI protegida precisa ser retirada na perda de acesso. Preservar toda a árvore aumentaria o trabalho de garantir esse descarte em cada ilha. `js-batch-dom-css` trata custo de layout, e a skill não aborda `MutationObserver` nem a posse da árvore React. O tópico 6 decorre do código local e da orientação oficial do React. [Fonte Vercel](https://github.com/vercel-labs/agent-skills/tree/5a37a6329fbad3666c3207392a6a7c0110e92efb/skills/react-best-practices).
- **Proveniência.** Checkouts em `/home/lucas/skills`. O plugin Anthropic saiu do caminho antigo no `main` do Claude Code. A cópia histórica recuperada de `dbdd79c` é idêntica à versão da Anthropic Skills. [Versão histórica do plugin](https://github.com/anthropics/claude-code/blob/dbdd79cebfae5891f5b0fab6f7773ea520d289a7/plugins/frontend-design/skills/frontend-design/SKILL.md).
