# Estado — redesenhar-interface-ffcmapp

**Atualizado:** 17/11/2026 · **Branch:** `codex/refino-visual-pr16` · **Base:** `804428e79334234a59b1cd415692a976b60246ef` (PR #16) · **Por:** Codex

## Onde está

Implementação local e revisão do delta visual concluídas; ativação pendente. O usuário autorizou executar após informar o PR #16. Worktree exclusiva `ffcmapp-refino-visual-mock`, criada desse SHA confirmado por `gh pr view 16` e fetch de `pull/16/head`. A worktree da outra sessão não foi editada. Após autorização explícita do usuário para empurrar ao Git, a branch foi enviada ao origin. Sem merge, deploy ou migração.

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
- Branch remota: `origin/codex/refino-visual-pr16`. Base do delta visual continua `804428e` do PR #16; a branch daquele PR e main não foram alteradas. Para integrar em outra frente, considerar também o estado e os gates pendentes abaixo. Nenhum PR, merge ou deploy adicional criado.

## Próximo passo e bloqueadores

1. **4.1 parcial:** acesso inicial fictício conferido; retorno de aba, falha e perda de acesso conectados não reproduzidos. Nenhuma alegação de travamento resolvido ou mudança do algoritmo de sessão.
2. **6.1:** aceite visual conectado por perfis, larguras previstas, zoom 200%, teclado, estados e seções não renderizados. Usar caso fictício autorizado e registrar resultado real.
3. **6.2:** `verificar:ativacao` e provas positivas/negativas de servidor/RLS não executados; fatia não ativada. Revisão sensível de Família do PR #16 continua própria e pendente; este delta não a certifica.
4. **6.3/externo:** push da branch autorizado e realizado. Merge, deploy e migração continuam sem autorização específica; frontend não ativado em produção por esta frente. Registro global somente no merge, sem tracker paralelo.

## Histórico essencial

Planejamento inicial em `76838b4` preservou VIS/SC-VIS e incorporou SC-VIS-006-D/E/F/G para loading, com validação estrita. Instalação offline/baseline passaram antes do código. Em 17/11 o pedido de execução substituiu a espera e a branch nova recebeu o head do PR #16, mantendo isolado o trabalho anterior. Resultados antigos não foram usados como prova do diff final.
