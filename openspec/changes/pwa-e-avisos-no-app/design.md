# Design

## Context

Motivação em `proposal.md — Why`. Requisitos em `specs/aplicativo-instalavel/spec.md` e `specs/avisos-no-app/spec.md`.

A aplicação web atual é servida a partir de `web/index.html` com módulos em `web/`, publicada pela Netlify, e consome funções em `netlify/functions/`. Não há manifesto, não há service worker e não há camada de cache no navegador. Este recorte introduz a primeira.

É uma mudança pequena em superfície e grande em consequência. Um service worker é código que roda fora do fluxo normal da página, sobrevive ao fechamento da aba e decide o que responder a cada requisição. Mal delimitado, ele serve conteúdo de caso depois da revogação e guarda dado clínico no aparelho de quem já não deveria vê-lo. Todas as decisões abaixo existem para manter esse componente com o menor poder possível.

## Goals / Non-Goals

**Goals**
- Instalar na tela inicial e abrir a casca sem rede, no celular, incluindo iPhone.
- Manter o aparelho sem conteúdo de caso, sem identidade e sem resposta autenticada.
- Reaproveitar pendências e sinalizações existentes como origem dos avisos, sem criar uma fila de mensagens paralela.

**Non-Goals**
- Não escrever offline, não enfileirar envio, não sincronizar.
- Não registrar dispositivo, token ou permissão de notificação do sistema operacional.
- Não criar conteúdo de aviso próprio, com texto editorial, além do que o evento de origem já descreve.
- Não empacotar aplicativo nativo.

## Decisions

### D1 — O service worker só conhece recursos estáticos; nunca chega nas rotas de API

A lista do que pode ser guardado é **explícita e fechada**: documento da casca, scripts, estilos, fontes e ícones. Tudo sob a rota de API passa direto para a rede, sem interceptação, sem cache, sem resposta de reserva.

*Alternativa descartada:* interceptar tudo e excluir o que não deve ser guardado. É o padrão da maioria dos exemplos e inverte a responsabilidade: qualquer rota nova nasce cacheada até alguém lembrar de excluí-la. Com lista fechada, uma rota nova nasce fora.

*Consequência de verificação:* o teste correspondente é observável — nenhuma resposta autenticada no armazenamento do navegador após uma sessão com consulta de caso. Isso é prova, e não a leitura do código do worker.

### D2 — Sem rede, o conteúdo falha; não há resposta de reserva

A casca abre e cada área de conteúdo mostra indisponibilidade por falta de rede. Nenhuma tela servida do aparelho com dado anterior, nenhum "último valor conhecido".

Isso é continuidade do princípio já adotado no repositório: vazio exige consulta real bem-sucedida, e erro não recebe dado de exemplo como reserva. Num produto de saúde, uma tela que mostra a medicação de ontem como se fosse a de agora é pior que uma tela que diz que não há conexão.

### D3 — Encerramento de sessão e revogação limpam o aparelho

Encerrar sessão apaga os armazenamentos do aplicativo e descarta os caches. Como D1 já impede que conteúdo autenticado entre em cache, essa limpeza é defesa em profundidade — e cobre o caso do mesmo aparelho usado por duas pessoas, que é a realidade de um plantão.

*Risco residual aceito:* o navegador pode manter cópias fora do alcance do aplicativo, como histórico ou restauração de aba. O produto não controla isso; a mitigação é não colocar conteúdo de caso onde ele seja recuperável pelo aplicativo.

### D4 — Atualização assume o controle sem esperar o fechamento

Uma versão nova ativa imediatamente e assume as páginas abertas. O padrão conservador — esperar que todas as abas fechem — deixaria um aparelho de plantão numa versão antiga por dias, inclusive depois de uma correção de autorização.

*Trade-off aceito:* uma aba aberta pode trocar de versão durante o uso. Como não há estado offline a preservar (D2), o custo é recarregar uma tela, não perder um registro.

### D5 — iPhone é alvo de verificação, não suposição

O levantamento do cliente registrou que a versão iPhone de um concorrente não estava disponível. Safari no iOS trata instalação, armazenamento e ciclo de vida do service worker de forma própria, inclusive descartando armazenamento após período sem uso.

Portanto: a verificação da fatia inclui instalar e abrir no iPhone. Nenhum comportamento de iOS é presumido a partir do funcionamento no Android ou no navegador de mesa, e o descarte de armazenamento pelo sistema não pode quebrar o aplicativo — ele reinstala a casca na primeira abertura com rede.

### D6 — Aviso é projeção de evento existente, não entidade com conteúdo próprio

O aviso deriva de pendência (FR-027), sinalização operacional (FR-028), passagem pendente de ciência (FR-057) e marcação de atenção (FR-014). FR-028 é o requisito que separa situação operacional de sinalização clínica; o sinal que alimenta o aviso é o operacional, e nenhuma sinalização clínica entra nele. Guarda referência à origem, destinatário e situação de leitura. O texto exibido vem da origem.

*Alternativa descartada:* tabela de notificação com título e corpo gravados na criação. Seria mais simples de listar, mas congela no aviso um texto que pode conter conteúdo cuja audiência muda depois — e aí a revogação não alcança o que já está escrito no aviso.

*Consequência:* o filtro de audiência é aplicado na leitura, com a prova de autorização vigente, e a revogação retira o aviso sem precisar apagar registro.

### D7 — Lido é marca do destinatário; ciência é outro ato

São duas colunas em dois lugares, propositalmente. "Lido" é conveniência de interface, por pessoa, sem valor de confirmação. "Ciência" é FR-013 e FR-057: ato explícito, persistido com identidade e instante, com consequência no fluxo.

Colapsar os dois faria abrir o sino encerrar a pendência da passagem de turno — exatamente o que FR-057 proíbe ao dizer que ciência não se infere de consulta.

## Risks / Trade-offs

- **Service worker servindo dado após revogação** → risco central do recorte. Mitigação: lista fechada de recursos estáticos (D1), nenhuma interceptação de API, limpeza no encerramento (D3) e teste observável de armazenamento, não inspeção de código.
- **Aparelho compartilhado no plantão** → duas pessoas, um celular. Mitigação: D3 e o cenário explícito "Segunda pessoa no mesmo aparelho".
- **Versão antiga presa no aparelho** → mitigada por D4; o custo é recarga de tela.
- **iOS com comportamento próprio (D5)** → verificação real exigida; sem isso, o PWA é afirmação, não entrega.
- **Sino virar canal de conteúdo** → um aviso que descreve o acontecimento em vez de apontá-lo vaza audiência. D6 mantém o texto na origem; a revisão deve tratar texto gravado no aviso como achado.
- **Expectativa de notificação externa** → o sino não alcança quem não abre o aplicativo. É limite conhecido e aceito nesta entrega; a decisão de push ou WhatsApp é posterior e não deve ser contrabandeada como "aviso melhorado".

## Migration Plan

Acréscimos na aplicação web: manifesto, ícones, registro do service worker e a área de avisos. Leitura de avisos como consulta autorizada, sem tabela de notificação com conteúdo próprio (D6); a situação de leitura por pessoa é persistida.

Este recorte toca `web/index.html`, `web/main.ts` e `web/styles.css`, os mesmos arquivos de uma frente de ajuste de frontend em andamento. Não iniciar antes do encerramento dela.

Reversão é remover o registro do service worker e publicar uma versão que desregistre o anterior — um worker já instalado não some sozinho ao ser retirado do código. Essa etapa precisa estar na tarefa de reversão, não descoberta depois.

Nenhuma operação remota é autorizada por este planejamento.

## Open Questions

Resolvíveis na implementação:

- Biblioteca de service worker ou arquivo próprio. Dada a lista fechada de D1, um arquivo próprio pequeno tende a ser mais auditável que uma dependência com geração automática — decidir medindo o que cada caminho exige manter.
- Onde o indicador de não lido aparece na navegação do celular, considerando a gaveta lateral já existente.
- Se a lista de avisos pagina ou limita por período.

As decisões que **mudariam** o recorte — nível de PWA, ausência de notificação externa e o sino como superfície — estão em `proposal.md — Decisões aplicadas`. O que resta em aberto está em `proposal.md — Pendências` e bloqueia as tarefas correspondentes.
