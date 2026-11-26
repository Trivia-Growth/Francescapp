# Estado — redesenhar-interface-ffcmapp

**Atualizado:** 17/11/2026 · **Branch:** `codex/refino-visual-pr16` · **Base:** `804428e79334234a59b1cd415692a976b60246ef` (PR #16) · **Por:** Codex

## Onde está

Código e revisões integrados à main pelo PR #17, merge `d5de49b9f479865e758794875f85e04d548977d9`, após PR #16 e CI do head exato `cb94578` passarem. Aceite conectado completo fica posterior à próxima onda de ajustes, por decisão do solicitante. Worktree exclusiva `ffcmapp-refino-visual-mock`; nenhuma outra worktree editada. Cinco migrations do #16 aplicadas com autorização específica; sem flags alteradas ou deploy manual.

A estética aprovada é a captura do mock: Cormorant Garamond/Raleway, sidebar branca, oliva nas ações/seleções, superfícies claras e bordas finas. Source, glass, sidebar oliva e imagem de conceito foram rejeitados. Nenhuma escolha estética pendente.

## Última entrega e evidências

- **1.1–1.2:** marca original intacta, proporções/fundo preservados, nome FFCMApp, fundamentos compartilhados de texto/campos/feedback. Fontes e logo locais nas páginas públicas com licenças OFL. SHA-256 conferido pelo executor: JPEG e ambos WOFF2 idênticos aos originais. CSP pública acrescenta somente `img-src 'self'` e `font-src 'self'`; demais diretivas/gates preservados.
- **2.1–2.2:** sidebar desktop 248/80px, ícones e identificação no foco/ponteiro. Gaveta móvel reutilizada, Escape, foco contido/retorno, fundo inerte, scroll interno e cleanup em resize/ocultação. Mesmos nós/IDs/hrefs/hidden; sem storage, cópias ou segundo roteador. Descarte cancelado mantém rascunho e gaveta.
- **3.1–3.4:** carteira duas colunas/uma no celular; filtros nativos recolhidos com contagem real; busca/filtro/paginação mantidos. Ficha móvel separa identidade e ações; abrir ficha desmonta Seu dia e seleciona a carteira no menu. Formulários/abas/diálogos recebem classes comuns, sem ampliar capacidades.
- **4.2–4.3:** skeletons neutros por região e indicadores por ação/revalidação/saída. Decoração após 300ms sem atrasar chamadas/conteúdo. Indicador absoluto preserva largura; reduced-motion mantém alternativa estática. Status/erros/recuperação e retirada imediata de dados protegidos mantidos; sem percentual ou timeout novo. Pendências serializa mutações do painel porque respostas substituem snapshots completos; controles recuperam após resultado/falha.
- **5.1:** `rtk proxy pnpm run verificar:rapido` final terminou **0**: Biome 664 arquivos e typechecks contracts/cadastro/functions/web/proxy passaram, 21,66s. Rodadas anteriores detectaram formatação/guardas e cinco assertions não nulas no teste novo, corrigidas antes desse resultado final.
- **Testes focais:** `rtk proxy pnpm exec vitest run web/gaveta-lateral.test.ts web/pendencias-caso.test.ts --reporter=minimal`: **0, 2 arquivos/10 testes**, após correções de foco/concorrência/Home. Última alteração de `aria-current`: só `web/gaveta-lateral.test.ts` repetido, **0, 2 testes**. Configuração mantém `silent: 'passed-only'`. Ajuste posterior no teste de pendências apenas substituiu assertions por guardas, sem mudar cenário.
- **Demais testes informados pelos executores:** oito arquivos de revogação, seleção profissional, edição, tarefas, orientações, encaminhamentos, exportação e campos do cadastro: **59 casos passaram**. Novo `web/esqueleto.test.ts`: **1 caso passou**, protege cleanup antigo contra indicador de operação nova. Sem suíte completa/build/Deno/e2e.
- `rtk proxy pnpm exec openspec validate redesenhar-interface-ffcmapp --strict`: **0**, change válida. `rtk git diff --check`: **0**. Esses resultados não provam integração/RLS.

## Conferência renderizada local

Chrome nativo por CUA; host do navegador integrado indisponível. Prévia loopback Vite com `main.ts`/DOM/CSS reais e respostas fictícias isoladas, nomes/UUIDs de teste e identificação visível de prévia. Nenhuma conta/dado real. Fixture removida e servidor encerrado após conferência; não entram no produto. Capturas observadas na conversa, sem PNG persistido.

| Superfície | Evidência exercitada | Limite |
|---|---|---|
| Shell/carteira | Desktop aproximadamente 1470 CSS px: marca, grade e primeira linha completa; compacto com tooltip/foco. Celular 390×844 e 360×844: coluna única, filtros recolhidos/expandidos, campos alinhados. | Não substitui inspeção conectada 1280/1440, zoom 200% e todos os nomes/recortes remotos. |
| Gaveta | 390px: abrir, Tab/Shift+Tab, Escape e retorno a Menu. 360×375: scroll alcança Como funciona com fundo inerte. Teste cobre resize/ocultação/descarte. | Fixture não exerce permissões do servidor/banco. |
| Seu dia/ficha | Seu dia com lista fictícia em 390px; Visão do caso em 360px, nome/ações legíveis e Home retirada. Destinos primários/Mais seções preservados. | Outros painéis/edição/vazio/falha parcial têm revisão de fonte/classes e testes focais, sem aprovação visual integral. |
| Loading | Carteira sem latência artificial; esperas fictícias 4500/6000ms: acesso neutro, skeletons e resultado. Chrome emulando `prefers-reduced-motion: reduce` mostrou regra ativa e alternativa estática. | Simulação de apresentação não mede latência real. Retorno/falha/perda de acesso conectados permanecem 4.1/6.1. |
| Acesso/públicas | Login local com serviço indisponível; convite sem código informa link indisponível; consulta sem paciente conserva aviso/campos. Logo/fontes locais renderizados no desktop. | Nenhum convite/senha/consulta enviado; gates não habilitados. Jornadas públicas móveis/completas dependem de 6.1. |
| Demais seções/agenda/admin | Classes e loading revisados nos renderizadores; testes focais acima. | Fonte não comprova aparência de todas as seções/perfis nem integração. |

Achados renderizados corrigidos: filtros dominando a dobra; ferramentas desalinhadas; selects móveis com larguras diferentes; nome apertado por ações; perfil/Sair sem respiro; Home acima da ficha; seleção incorreta de Seu dia na ficha.

## Revisão independente — 5.2

Skill `code-review`, eixos padrões e spec, revisão-base `804428e`. Alvo: diff local `DESIGN.md`/`web`, teste novo, assets públicos e artefatos da change; fixture excluída. Não é revisão do SQL/backend herdado do PR #16.

- **Padrões:** P2 gaveta sem rolagem em tela baixa; corrigido com overflow interno móvel. Revisão focal confirmou resolução, sem novo achado material.
- **Spec VIS/SC-VIS:** P2 foco perdido no resize, indicador aumentando largura e reenvio em Pendências; corrigidos com retorno ao Menu, decoração absoluta e guarda por painel. Revisão focal incluiu Home/ficha/CSS móvel, sem novo achado material.
- Revisores não reexecutaram testes/GUI; coordenação conferiu comandos/estados acima. Último ajuste de `aria-current` recebeu teste focal e leitura da coordenação; contrato de navegação preservado.

## Passagem e decisões

- Terra 6.1 em frentes exclusivas de visual (CSS/HTML/assets), navegação (`main.ts`/teste) e loading (helper/renderizadores/JS público). Pendências transferido explicitamente à navegação na correção final. Coordenação integrou; revisores somente leitura.
- DOM: `patients-sidebar`, `toggle-sidebar`, `sidebar-backdrop`, `collapse-sidebar`, `close-sidebar`, `sidebar-icon`, `sidebar-link-label`, `sidebar-tooltip`, `sidebar-collapsed`/`sidebar-open`; breakpoint 760px. Rotas, APIs, autenticação, permissões e RLS não alterados.
- Família na base possui Dados, Diário, Plano, Documentos, Orientações; sem Home/admin. Gates existentes mantidos. Não habilitar integrações para cumprir cobertura visual.
- Não aplicar Impeccable, gerar identidade, trocar fontes ou reconstruir logo. Vetores/variantes finais continuam com marketing.

## Envio remoto e passagem ao Claude

- Push autorizado pelo usuário em 17/11/2026 para continuar outra frente com Claude. `rtk git push -u origin codex/refino-visual-pr16` terminou **0**; pre-push passou lint/typecheck, 11,14s.
- `rtk proxy git ls-remote --heads origin refs/heads/codex/refino-visual-pr16` confirmou **6563d1db636cc5d1fb9624a8cf521dac491f6db8**, commit do produto revisado. Registro de passagem acrescentado depois, sem mudança de código.
- Branch remota: `origin/codex/refino-visual-pr16`. PR #17 aberto em draft, inicialmente com base na branch do PR #16 para isolar o delta visual. Main ainda não alterada. A integração das correções do #16 está registrada abaixo.

## Próximo passo e bloqueadores

1. **4.1 parcial:** acesso inicial fictício conferido; retorno de aba, falha e perda de acesso conectados não reproduzidos. Nenhuma alegação de travamento resolvido ou mudança do algoritmo de sessão.
2. **6.1:** aceite visual conectado por perfis, larguras previstas, zoom 200%, teclado, estados e seções não renderizados. Usar caso fictício autorizado e registrar resultado real.
3. **6.2 parcial:** comando de ativação local passou; provas SQL positivas/negativas e verificação estrutural remota do PR #16 estão registradas abaixo. Jornadas conectadas por perfil continuam pendentes; este delta não as certifica.
4. **6.3/externo:** pushes e merges autorizados concluídos, sem ativar flags. Cinco migrations do PR #16 aplicadas e conferidas. Frontend integrado à main, registro global atualizado nesta passagem; aceite conectado permanece pendente e deploy manual continua separado.

## Integração com revisão do PR #16 — 17/11/2026

- PR #16 recebeu commit `6f1849f` na própria branch, com revisão independente de padrões/spec e correções de paginação, rascunho/audiência/revalidação, teclado e ordem de migrations. Estado específico em `experiencia-minima-do-mock/estado.md`.
- Merge local desse commit no refino visual resolveu conflitos em `web/main.ts`, `web/gaveta-lateral.test.ts` e `web/diario.ts`, por Terra 6.1 em arquivos exclusivos. Preservados sidebar compacta/modal/foco/resize, seleção da carteira e loading visual, junto dos controles novos de sessão/audiência, editor único, rascunho e consulta/escrita.
- Testes afetados após integração: gaveta, home familiar, duas revalidações e ficha, **5 arquivos/24 testes**, exit 0; Diário e esqueleto, **2 arquivos/12 testes**, exit 0. Biome dos alvos e `git diff --cached --check` exit 0. `pnpm run verificar:rapido`: exit 0, lint 666 arquivos e typecheck, 9,11s.
- Revisão independente focal da resolução contra `6f1849f` e `7a20411`: padrões e spec sem achado material; revisores somente leitura. Não reaberta auditoria SQL nem reutilizada GUI fictícia como prova remota.
- Credencial Supabase local anterior retornou 403; CLI sem resposta. Solicitante forneceu acesso para operação autorizada. Consulta do histórico remoto pelo Management API conferiu 186 versões, sem ausências/divergências contra a base local, última `20261123100000`; as cinco versões novas ainda ausentes nesse momento. Nenhum segredo registrado neste estado.
- `rtk proxy pnpm run verificar:ativacao` do delta visual integrado: **exit 0**, uma execução em `4b88e85`. Lint/typecheck/Deno, contratos 133, cadastro 137, funções 257, proxy 397 e web **418 testes/75 arquivos** passaram; build e configuração local passaram. Cadastro 9, funções 6 e proxy 15 testes skipped não contam como autorização comprovada. Runners PostgreSQL positivos/negativos do PR #16 continuam com seus resultados delimitados no estado daquela change. Não repetir suíte por atualização documental.
- Migrations do PR #16 aplicadas no projeto aprovado com autorização específica: **191 versões**, histórico anterior intacto e SQL/funções correspondendo exatamente aos arquivos revisados. Colunas de visibilidade, owners, grants privados e RLS conferidos por consulta remota independente. Detalhes em `experiencia-minima-do-mock/estado.md`, commit `350715e`, integrado sem mudança de produto.
- Conferência de leitura do Chrome encontrou `ffcmapp.netlify.app` na tela de acesso, pedindo nova validação. Host do navegador conectado indisponível e nenhuma sessão autenticada de teste disponível. Em seguida, o solicitante determinou executar o caderno completo somente após sua próxima onda de ajustes. Integração dos PRs já autorizada prossegue com verificações locais e banco conferidos; tarefas conectadas 4.1/6.1 e parte de 6.2/6.3 ficam pendentes. Não declarar aceite visual integral, ativação de integrações ou jornada remota comprovada.

## Histórico essencial

Planejamento inicial em `76838b4` preservou VIS/SC-VIS e incorporou SC-VIS-006-D/E/F/G para loading, com validação estrita. Instalação offline/baseline passaram antes do código. Em 17/11 o pedido de execução substituiu a espera e a branch nova recebeu o head do PR #16, mantendo isolado o trabalho anterior. Resultados antigos não foram usados como prova do diff final.
