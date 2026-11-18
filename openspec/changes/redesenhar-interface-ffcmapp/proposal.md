# Proposal

## Why

O frontend publicado precisa de alinhamento, consistência, acabamento e fluidez, preservando o estilo que o solicitante já reconhece no mock. Em 17/11/2026, após rejeitar as novas composições, o solicitante aprovou seguir a captura anexada do mock e acrescentar somente refino visual, animações discretas e navegação recolhível.

## What Changes

- Refinar a linguagem do mock aprovado: **Cormorant Garamond e Raleway locais**, sidebar **branca**, oliva nas seleções e ações, proporções, leitura e superfícies claras da captura. Source Sans 3/Source Serif 4, sidebar oliva, glass novo e imagem de conceito própria estão superados; não há novo gate de escolha gráfica.
- Aplicar marca institucional recebida intacta e nome FFCMApp no acesso, área autenticada e páginas públicas existentes. Não reproduzir o símbolo desenhado do mock nem criar assinatura gráfica nova.
- Permitir recolher/expandir a sidebar desktop com ícones, nomes acessíveis, identificação dos destinos e foco; oferecer gaveta móvel acessível sem alterar autenticação, roteamento ou autorizações.
- Harmonizar carteira, ficha, abas, formulários, diálogos e feedback por classes e fundamentos compartilhados. Na carteira, a captura com cartões em duas colunas orienta a apresentação dos dados já disponíveis; filtros e ações mantêm seus contratos reais.
- Acrescentar transições curtas de orientação e estados de interação, com movimento reduzido e sem atrasar a retirada de dados protegidos. A apresentação de “Verificando seu acesso…” será refinada; o ciclo de validação da sessão permanece intacto.
- Padronizar carregamento em todas as superfícies existentes: skeleton animado discreto para regiões de conteúdo estruturado, indicador local para ações e progresso somente quando mensurável. Adaptar a apresentação ao tempo/contexto, evitando flashes, saltos de layout, percentuais fictícios e espera decorativa; preservar feedback acessível e alternativa estática com movimento reduzido.
- Verificar o diff com lint/typecheck, testes comportamentais afetados de navegação/loading quando pertinentes e revisão formal dos padrões e da spec. Validação visual conectada, provas de autorização/RLS e publicação permanecem gates explícitos antes de ativação, sem sucesso presumido.

**Decisão vigente:** refino do mock anexado aprovado pelo solicitante. A captura é a autoridade estética desta mudança; arquivos históricos ajudam a entender componentes e fontes, sem substituir o pedido atual. Dados, regras e contratos continuam definidos pelo produto conectado e suas specs. Não aplicar Impeccable nem gerar novo estudo visual nesta execução.

## Capabilities

### New Capabilities

- `interface-e-navegacao`: identidade visual consistente com o mock aprovado, navegação adaptável e acessível e estados fiéis aos fluxos autorizados.

### Modified Capabilities

Nenhuma regra funcional de domínio é alterada. Os IDs FR/SC e as fases das capabilities existentes são preservados. A composição funcional de `experiencia-minima-do-mock` foi recebida pelo commit publicado no PR #16; esta change acrescenta somente seu diff de apresentação e correções de visibilidade/foco e reenvio no frontend. Não certifica as alterações de domínio herdadas.

## Impact

Base de execução isolada: branch `codex/refino-visual-pr16`, criada do commit `804428e79334234a59b1cd415692a976b60246ef`, head do PR #16 confirmado em 17/11/2026. Worktree `ffcmapp-refino-visual-mock`, única cópia ativa desta proposta. A worktree da outra sessão não foi editada; nenhuma equivalência com a produção é presumida.

Arquivos alcançados: `web/styles.css`, `web/index.html`, estilos/HTML/JS das páginas públicas, recursos locais de marca/fontes com licenças, bloco de navegação em `main.ts`, helper de loading e renderizadores existentes. A gaveta do PR foi reutilizada sem extração ou segundo roteador. Abrir a ficha desmonta Seu dia, corrigindo sobreposição observada; gravações de Pendências são serializadas porque substituem o painel com snapshots completos. Não há alteração de autenticação, autorização, APIs ou rotas. CSP pública libera somente imagens/fontes locais. Sem framework, biblioteca de animação ou fonte externa nova.

**Gate de retomada atendido:** execução local solicitada em 17/11/2026 após o usuário informar o PR #16. Base e navegação foram reconciliadas a partir desse commit; evidências e limites da execução ficam em `estado.md`. Ativação e operações externas permanecem separadas.

A cobertura visual incluirá somente vistas e seções existentes na base reconciliada, com suas disponibilidades reais. Não habilitar Família, convite, áudio, tarefas ou agenda; não acrescentar rotas, agregações, busca global, dados de exemplo, audiência ou funções do mock. Logo vetorial/variantes pequenas continuam pendência do marketing; usar originais intactos e fallback textual.

Sem autorização para push, merge, deploy, migração, mudança remota, dados reais ou ativação de integração. `docs/processo/estado-do-projeto.md` permanece reservado ao merge; evidências e próximos passos desta frente ficam no `estado.md` da change.
