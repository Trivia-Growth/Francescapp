# Tasks

Cada tarefa indica requisito/cenário, dependência e evidência de aceite. A política de verificação é a de `AGENTS.md — Execução enxuta`: durante o desenvolvimento, somente `pnpm run verificar:rapido`; ao escrever um teste novo, executar uma vez apenas o arquivo afetado; `pnpm run verificar:ativacao` só na ativação da fatia.

**Implementação suspensa em 17/11/2026** por decisão do solicitante, até o encerramento de uma frente de ajuste de frontend em andamento. Este recorte toca `web/index.html`, `web/main.ts` e `web/styles.css`, os mesmos arquivos dessa frente; começar antes produz conflito.

Nenhuma tarefa autoriza deploy, migração remota, concessão de acesso, registro em loja de aplicativos ou uso de dados reais.

## 0. Pré-condições

- [x] 0.1 (17/11/2026) Nível de PWA: instalável com casca offline. Registro continua exigindo rede.
- [x] 0.2 (17/11/2026) Offline-first com fila descartado nesta entrega.
- [x] 0.3 (17/11/2026) Sem notificação externa; apenas o sino dentro do aplicativo, com indicador de não lido.
- [ ] 0.4 Confirmar a frente de ajuste de frontend encerrada e integrada. Evidência: revisão-base registrada aqui. **Bloqueia todos os grupos.**
- [ ] 0.5 Confirmar com o solicitante quais eventos geram aviso. A proposta é FR-027, FR-028, FR-057 e FR-014. **Bloqueia 3.1.** Evidência: lista confirmada registrada aqui.
- [ ] 0.6 Confirmar se o aviso é dirigido **à pessoa** ou **ao perfil no caso** — isto é, se um aviso do case manager alcança quem o substitui durante ausência. **Bloqueia 3.2.** Evidência: resposta registrada aqui.
- [ ] 0.7 Confirmar por quanto tempo um aviso lido permanece na lista e se há arquivamento. **Bloqueia 3.7.** Evidência: resposta registrada aqui.

## 1. Instalação e casca

Depende de 0.4.

- [ ] 1.1 Criar o manifesto com nome, nome curto, ícones nas resoluções necessárias, cor de tema e modo de exibição em janela de aplicativo, usando a identidade de `docs/projeto/identidade-visual.md` sem fixar tipografia ou componente final. Evidência: instalação real concluída em aparelho, com nome e ícone corretos na tela inicial (FR-071, cenário "Instalação na tela inicial").
- [ ] 1.2 Implementar o service worker com **lista fechada** de recursos estáticos — documento da casca, scripts, estilos, fontes e ícones. Rotas de API passam direto para a rede, sem interceptação e sem resposta de reserva. Evidência: teste comprovando que requisição a rota de API não é interceptada nem respondida pelo cache (FR-071, design D1).
- [ ] 1.3 Implementar o estado de indisponibilidade por falta de rede em cada área de conteúdo, sem conteúdo anterior e sem dado de exemplo. Evidência: teste de interface cobrindo "Casca disponível sem rede" e "Conteúdo de caso não é servido do aparelho" (FR-071, design D2).
- [ ] 1.4 Implementar ativação imediata da versão nova, assumindo o controle das páginas abertas. Evidência: teste cobrindo "Versão nova substitui a instalada" (FR-071, design D4).
- [ ] 1.5 Garantir que o produto continue utilizável pelo navegador quando a instalação não for possível, sem mensagem que condicione o uso à instalação. Evidência: teste de interface cobrindo "Falha ao instalar não bloqueia o uso" (FR-071).
- [ ] 1.6 Documentar e implementar a reversão: publicar versão que desregistre o service worker anterior, já que retirar o código não remove um worker instalado. Evidência: procedimento registrado aqui e testado localmente (design — Migration Plan).

## 2. Limpeza do aparelho e prova de que nada sensível fica

Depende de 1.2.

- [ ] 2.1 Implementar a limpeza dos armazenamentos e caches do aplicativo no encerramento de sessão. Evidência: teste cobrindo "Encerramento de sessão limpa o aparelho" (FR-071, design D3).
- [ ] 2.2 Provar, por inspeção do armazenamento do navegador após uma sessão com consulta de caso, que nenhuma resposta autenticada, identificador de sessão ou conteúdo de caso ficou guardado. Evidência: teste observável sobre o armazenamento, **não** leitura do código do worker (FR-071, cenário "Resposta autenticada não entra em cache", design D1).
- [ ] 2.3 Provar que revogação de acesso não é contornada pelo aparelho, com e sem rede. Evidência: teste cobrindo "Revogação não é contornada pelo aparelho" (FR-071, FR-037).
- [ ] 2.4 Provar o caso do aparelho compartilhado: outra pessoa entra depois de uma sessão anterior e não vê nada da anterior. Evidência: teste cobrindo "Segunda pessoa no mesmo aparelho" (FR-071, design D3).

## 3. Avisos no aplicativo

Depende de 0.5, 0.6 e 1.3.

- [ ] 3.1 Implementar a leitura de avisos como projeção dos eventos confirmados em 0.5, sem tabela de notificação com texto próprio gravado. Evidência: teste cobrindo avisos derivados de cada origem confirmada (FR-072, design D6).
- [ ] 3.2 Implementar o modelo de destinatário conforme 0.6. Evidência: teste cobrindo o caso confirmado; se 0.6 estiver aberta, registrar bloqueio em vez de escolher.
- [ ] 3.3 Implementar a situação de leitura por pessoa, separada de qualquer registro de ciência. Evidência: testes cobrindo "Lido é por pessoa", "Ler o aviso não registra ciência" e "Ler o aviso não encerra a pendência" (FR-072, FR-013, FR-057, design D7).
- [ ] 3.4 Aplicar o filtro de audiência na leitura, com a autorização vigente, e garantir que o texto do aviso não revele conteúdo fora da audiência. Evidência: testes cobrindo "Aviso não revela conteúdo fora da audiência" e "Aviso não é dirigido a quem não tem acesso" (FR-072, FR-036).
- [ ] 3.5 Provar que a revogação retira os avisos imediatamente e recalcula o indicador, inclusive por acesso direto. Evidência: teste cobrindo "Revogação retira os avisos" (FR-072, FR-037).
- [ ] 3.6 Implementar o indicador de não lido e a lista na navegação do celular, considerando a gaveta lateral existente. Evidência: teste de interface com os quatro estados, cobrindo "Sem avisos" e "Falha ao carregar avisos" sem apresentar lista vazia como ausência de avisos (FR-072).
- [ ] 3.7 Aplicar a permanência e o arquivamento confirmados em 0.7. Evidência: teste cobrindo a regra confirmada.
- [ ] 3.8 Auditar a consulta da lista conforme FR-039, sem gravar conteúdo clínico no registro de auditoria. Evidência: teste cobrindo o evento e a ausência de conteúdo clínico no registro (FR-072, FR-039).
- [ ] 3.9 Garantir que nenhuma notificação saia do aplicativo e que nenhum token de dispositivo seja registrado. Evidência: teste cobrindo "Nenhuma notificação sai do aplicativo"; revisão deve tratar qualquer chamada externa como achado (FR-072).

## 4. Verificação em aparelho real

Depende de 2.4 e 3.9.

- [ ] 4.1 Instalar e abrir no iPhone, verificando instalação, abertura da casca sem rede, atualização de versão e comportamento após período sem uso. Evidência: verificação registrada com o aparelho e a versão de sistema usados; nenhum comportamento de iOS presumido a partir de Android ou navegador de mesa (FR-071, design D5).
- [ ] 4.2 Instalar e abrir no Android, com as mesmas verificações. Evidência: verificação registrada com aparelho e versão.
- [ ] 4.3 Verificar uso confortável no celular — navegação, teclado, foco visível, áreas de toque e ausência de rolagem horizontal. Evidência: verificação registrada em viewport de celular, conforme `AGENTS.md — Qualidade e experiência` (FR-071).
- [ ] 4.4 Executar `pnpm run verificar:ativacao` uma única vez e o roteiro "Como testar" do PR na retirada do draft. Evidência: saída registrada; se algum gate não executar, registrar o bloqueio aqui em vez de presumir sucesso.
- [ ] 4.5 Solicitar revisão independente da fatia com `code-review`, informando a revisão-base, esta mudança OpenSpec e o diff exato, incluindo arquivos novos. Atenção específica ao service worker e ao que fica no aparelho. Evidência: achados registrados e tratados.

## Workflow follow-up

- Sincronizar os deltas com `openspec/specs/` e arquivar a mudança somente após a revisão independente e os critérios de aceite atendidos. As capacidades `aplicativo-instalavel` e `avisos-no-app` são novas: conferir que `Purpose` e requisitos chegaram às specs principais.
- Atualizar `docs/projeto/roteiro-especificacoes.md` com a posição destas capacidades entre as fatias.
- Registrar que o alcance do sino é limitado a quem abre o aplicativo. Se isso se mostrar insuficiente na operação, a decisão seguinte é push ou WhatsApp — mudança de escopo própria, não ajuste deste recorte.
