---
target: FFCMApp publicado, carteira desktop
total_score: 12
max_score: 24
na_heuristics: 3,5,7,9
p0_count: 0
p1_count: 4
target_identity: "url:https://ffcmapp.netlify.app/"
timestamp: 2026-11-17T23-00-19Z
slug: ffcmapp-netlify-app
---
Método: duas avaliações independentes (A: /root/visual_design_review; B: /root/visual_evidence_review).

Revisão visual do FFCMApp — 17/11/2026

Alvo: carteira publicada em https://ffcmapp.netlify.app/#carteira, desktop, Administrador, dados fictícios. A sessão Orca claude_a5439cc9_6204_4609_9079_48ed9d9e999c foi localizada e seu contexto consultado. Ela trabalha em ffcmapp-experiencia-mock; o checkout blobfish é outra versão. Não houve edição do produto nem publicação.

Veredito: precisa de revisão substancial de hierarquia e componentes para o posicionamento de alto padrão. Branco/oliva e navegação textual oferecem boa base. A carteira tem aparência administrativa genérica: título dominante, controles pesados, marca repetida em texto e ferramentas ocupando a maior parte da primeira tela. A direção proposta é coordenação privada, discreta e precisa: identidade Francescato presente, escala contida, alinhamento rigoroso, leitura confortável e movimento funcional.

Avaliação heurística parcial, baseada somente no observado; não é certificação do produto:

| Heurística | Nota / 4 | Evidência ou limite |
| --- | --- | --- |
| Visibilidade do estado | 2 | Posição e contagem presentes; revalidação global observada na árvore de acessibilidade. |
| Linguagem do usuário | 3 | Ações principais claras; revisão/pendência pedem contexto. |
| Controle e liberdade | n/a | Cancelamento e retorno não exercitados. |
| Consistência | 2 | Marca aparece com tratamentos distintos; pesos excessivos. |
| Prevenção de erros | n/a | Cadastro e edição não exercitados. |
| Reconhecimento | 3 | Navegação e filtros rotulados. |
| Eficiência | n/a | Teclado e tempo de tarefa não medidos. |
| Estética e economia | 1 | Conteúdo principal chega quase ao fim da primeira tela. |
| Recuperação de erros | n/a | Falha com aba ativa não reproduzida. |
| Ajuda | 1 | Entrada visível; conteúdo não inspecionado. |
| Total observado | 12/24 | Avaliação parcial; melhorias significativas. |

Carga cognitiva moderada: ferramentas, filtros e avisos competem com pacientes. A primeira experiência transmite calma pelas cores, mas perde refinamento pela escala e identidade incompleta. Não foi observado o encerramento de uma tarefa.

1. P1 — Tipografia e hierarquia. O CSS publicado declara H1 de 3.125rem (50px). Na captura, título, apoio, menu e botões dominam; primeiro paciente aparece quase no limite inferior. Proposta: títulos operacionais de 32–36px no desktop e 28–30px no celular; seções 20–24px, corpo/campos 16px, rótulos 14–15px. Pesos 400/500, com 600 seletivo. Cormorant/Raleway são provisórias; considerar Source Sans 3 com Source Serif 4 restrita a títulos. Comandos pertinentes: typeset, layout.

2. P1 — Marca institucional. Na carteira, FFCMApp aparece na lateral e no topo com fontes diferentes; logo recebido não aparece nessa área. O HTML publicado contém logo somente no acesso. Proposta: uma assinatura institucional principal, proporções e fundo originais preservados; topo dedicado à localização e sessão. JPEG existente permite primeira aplicação; vetor/PNG transparente oficial é pendência para derivados pequenos. Não redesenhar a marca. Comandos: shape, polish.

3. P1 — Alinhamento e densidade. Filtros em bloco largo, busca isolada abaixo, atualizar lista em nível elevado e limpar filtros visualmente deslocado. Aviso de revisão ocupa cápsula extensa em cada linha. Proposta: busca, contagem e filtros numa barra coesa; filtros adicionais expansíveis com resumo aplicado; grade comum para campos e ações, alturas consistentes, margens alinhadas. Nome do paciente domina, metadados ficam secundários, pendências detalhadas aparecem junto à ação pertinente. Manter claro o limite atual da busca à página. Comandos: layout, distill, clarify.

4. P1 — Experiência de acesso e mensagens. A árvore de acessibilidade mostrou Verificando seu acesso… com área de pacientes oculta entre consultas. A captura nativa continuou mostrando a última pintura da carteira. O código local relaciona essa mensagem à revalidação e visibilitychange; não foi comprovado travamento com aba ativa nem a causa em produção. Proposta: diagnosticar entrada, retorno à aba e reconexão; estrutura neutra estável, estado de carregamento discreto e falha com ação de recuperação. Conteúdo protegido continua oculto quando a validação exigir. Comandos: harden, clarify, com diagnóstico antes de alterar comportamento.

5. P2 — Fluidez. O CSS publicado não declara transições/animações ativas; contém regra de movimento reduzido. Isso não exclui animação por JavaScript ou em outros recursos. Proposta: microinterações de aproximadamente 120–180ms para seleção, abertura de filtros, abas, gavetas e confirmação, sem atrasar tarefas. Respeitar prefers-reduced-motion. Comando: animate.

Acertos: navegação textual com posição evidente; paleta contida e linhas planas em vez de excesso de cartões. Preservar esses fundamentos.

Personas: profissional frequente precisa alcançar pacientes com menos varredura; familiar no primeiro acesso precisa entender pendências sem interpretar incompletude como falha do serviço; pessoas com necessidades de leitura precisam de corpo legível, contraste e foco preservados.

Pontos complementares: uniformizar login, convites, home, ficha, diário e administração após inspeção de cada tela; revisar textos operacionais, estados vazio/erro/sucesso e hierarquia de ações. Convites têm estilos diferentes no código local, mas não foram vistos em runtime. Celular, zoom, teclado, Família e demais telas não foram validados visualmente nesta rodada.

Detector: 44 ocorrências no checkout blobfish, sendo 43 advisory e 1 warning; 28 font-size, 12 color, 3 radius, 1 border-accent-on-rounded. São comparações com DESIGN.md provisório, com duplicidades. O warning da borda é falso positivo confirmado: aba tem border-radius:0. Não são 44 defeitos da publicação, nem resultado de acessibilidade. Arquivos de evidência: /tmp/ffcm-visual-detector.json e /tmp/ffcm-visual-evidence.md.

Referências consultadas: https://github.com/adobe-fonts/source-sans ; https://github.com/adobe-fonts/source-serif ; https://lucide.dev/guide/lucide ; https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions . Fonte e ícones são candidatos para avaliação; nenhuma dependência nova foi instalada. Componentes podem ser padronizados na stack atual.

Aceite proposto para implementação: conferir desktop 1280/1440 e celular 360/390; ausência de rolagem horizontal; nomes longos e zoom; teclado e foco; carregamento, erro recuperável e sucesso; revalidação com aba ativa; proteção de dados durante sessão inválida; comparação visual das mesmas telas antes/depois.

Questões para decisão: direção com serifada discreta nos títulos ou interface totalmente sem serifa? Primeira composição para avaliar: carteira e login ou ficha e diário? O objetivo segue revisão integral; a escolha apenas ordena a primeira fatia visual.
