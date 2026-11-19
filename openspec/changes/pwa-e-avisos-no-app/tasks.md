# Tasks

Cada tarefa indica requisito/cenário, dependência e evidência de aceite. A política de verificação é a de `AGENTS.md — Execução enxuta`: durante o desenvolvimento, somente `pnpm run verificar:rapido`; ao escrever um teste novo, executar uma vez apenas o arquivo afetado; `pnpm run verificar:ativacao` só na ativação da fatia.

**Implementação suspensa em 17/11/2026** por decisão do solicitante, até o encerramento de uma frente de ajuste de frontend em andamento. Este recorte toca `web/index.html`, `web/main.ts` e `web/styles.css`, os mesmos arquivos dessa frente; começar antes produz conflito.

**Liberação registrada em 19/11/2026**: o solicitante liberou a execução. O grupo 3 foi implementado nesta data (branch `fatia7/turno-execucao-cuidado`). Os grupos 1, 2 e 4 continuam por fazer.

Nenhuma tarefa autoriza deploy, migração remota, concessão de acesso, registro em loja de aplicativos ou uso de dados reais.

## 0. Pré-condições

- [x] 0.1 (17/11/2026) Nível de PWA: instalável com casca offline. Registro continua exigindo rede.
- [x] 0.2 (17/11/2026) Offline-first com fila descartado nesta entrega.
- [x] 0.3 (17/11/2026) Sem notificação externa; apenas o sino dentro do aplicativo, com indicador de não lido.
- [x] 0.4 (19/11/2026) Frente de ajuste de frontend encerrada e integrada. Evidência: revisão-base `e07daaa`; as fatias de 19/11/2026 nesta branch seguem o mesmo sistema visual. Liberação de execução dada pelo solicitante em 19/11/2026.
- [x] 0.5 (17/11/2026) Eventos que geram aviso, todos confirmados: FR-057 passagem pendente de ciência, FR-027 pendência por atraso, FR-028 sinalização clínica, FR-014 relato marcado como atenção.
- [x] 0.6 (17/11/2026) Aviso é **da pessoa**, com repasse a quem substitui enquanto houver substituição registrada de case manager.
- [x] 0.7 (17/11/2026) Aviso lido permanece na lista **até a origem ser resolvida** ou a ciência registrada. Nada sai por decurso de prazo.

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

Depende de 1.3.

> **Dependência não atendida, registrada como bloqueio parcial:** o grupo 3 declara depender de 1.3 (estado de indisponibilidade por falta de rede), que pertence ao grupo 1 e **não foi feito**. A execução do grupo 3 foi liberada mesmo assim pelo solicitante em 19/11/2026. A parte de 1.3 pertinente aos avisos — falha de carga apresentada como falha, nunca como lista vazia — está coberta em 3.6; o estado geral de indisponibilidade das demais áreas continua pendente no grupo 1.
>
> **Pendência de ativação:** a chave `ffcm.avisos.ativos` ainda não existe em `identidade.configuracao_sistema`. A rota cai no padrão de ambiente `FFCM_AVISOS_ATIVOS`, que é `false`. Registrar a chave (migração de configuração) é parte da ativação da fatia, não deste recorte.

- [x] 3.1 (19/11/2026) Leitura de avisos como projeção dos quatro eventos de 0.5, sem tabela de notificação com texto próprio gravado. Projeção em `cadastro.avisos_pessoa(uuid)` (`supabase/migrations/20261126300000_avisos_no_app.sql`); a única tabela criada é `cadastro.aviso_leitura`, que guarda marca de leitura e nenhum texto. Evidência: `supabase/tests/avisos_no_app_local.sql`, bloco "3.1", exige que o conjunto de tipos projetados seja exatamente `passagem_sem_ciencia` (FR-057, `cadastro.diario_turno_destinatario` sem `cadastro.diario_ciencia_turno`), `pendencia_operacional` e `sinal_atencao_operacional` (FR-027/FR-028, `cadastro.sinal_operacional_caso`) e `relato_em_atencao` (FR-014, `cadastro.diario_registro_versao.atencao`). Executado com `LC_ALL=C sh scripts/testar-avisos-local.sh` (saída `avisos no aplicativo (FR-072): provas locais concluídas`, código 0).
- [x] 3.2 (19/11/2026) Destinatário por pessoa, com repasse enquanto a substituição vigorar, usando `cadastro.case_manager_atual(uuid)` (FR-037, entregue em `f8ee061`) como fonte única. Evidência: `supabase/tests/avisos_no_app_local.sql`, blocos "3.2": com substituição registrada e **sem** `cadastro.acesso_paciente` vigente a substituta vê zero avisos (`SUBSTITUICAO_CONCEDEU_ACESSO`); com acesso vigente passa a ver os quatro, todos com `destinatario_usuario_id` do titular e `por_substituicao = true` (`DESTINATARIO_ORIGINAL_PERDIDO`); encerrada a substituição, a substituta volta a zero e o titular continua com os seus, marcados `por_substituicao = false` (`FIM_DA_SUBSTITUICAO_NAO_RETIROU`, `TITULAR_PERDEU_OS_PROPRIOS_AVISOS`). Mesma execução do script da tarefa 3.1.
- [x] 3.3 (19/11/2026) Situação de leitura por pessoa em `cadastro.aviso_leitura` (chave `usuario_id, tipo, chave_origem`), separada de `cadastro.diario_ciencia_turno` e de `cadastro.pendencia_tratativa`. Evidência: `supabase/tests/avisos_no_app_local.sql`, bloco "3.3 e 3.7": depois de marcar lido, a contagem de `cadastro.diario_ciencia_turno` não muda (`LEITURA_REGISTROU_CIENCIA`), a de `cadastro.pendencia_tratativa` não muda e a pendência de origem continua aberta (`LEITURA_TRATOU_PENDENCIA`, `PENDENCIA_ENCERRADA_PELA_LEITURA`), e o aviso da substituta continua não lido (`LIDO_VAZOU_PARA_OUTRA_PESSOA`). Interface: `web/avisos.test.ts` ("mostra a origem do aviso e nunca o seu teor, e separa lido de ciência"), executado com `npx vitest run web/avisos.test.ts`.
- [x] 3.4 (19/11/2026) Filtro de audiência aplicado na leitura pelas policies do papel `ffcmapp_avisos_owner`, que só enxergam linhas de caso com `cadastro.acesso_paciente` vigente do autenticado; o payload do aviso não tem campo de conteúdo e o owner não recebe `grant` sobre `conteudo_cifrado`/`justificativa_cifrada`. Evidência: `supabase/tests/avisos_no_app_local.sql`, bloco "3.1": o caso em que a pessoa é titular mas **não** tem acesso vigente não produz aviso nenhum (`AVISO_DE_CASO_SEM_ACESSO`); o JSON dos itens não contém o conteúdo clínico fictício nem `ciphertext` (`AVISO_REVELOU_CONTEUDO`); só a pendência de FR-027 traz `motivo`, e ele é o texto que o próprio derivador gera de datas (`AVISO_COM_TEXTO_PROPRIO`); nenhum campo além dos oito do contrato (`AVISO_COM_CAMPO_DESCONHECIDO`).
- [x] 3.5 (19/11/2026) Revogação retira os avisos na própria leitura seguinte, porque a audiência é recalculada a cada chamada e não há aviso gravado a apagar. Evidência: `supabase/tests/avisos_no_app_local.sql`, bloco "3.5": após `revogada_em` em `cadastro.acesso_paciente`, a lista volta vazia e `nao_lidos` volta a zero (`REVOGACAO_NAO_RETIROU_AVISOS`), e marcar como lido passa a ser recusado com `sem_permissao` e negação auditada (`MARCACAO_APOS_REVOGACAO_ACEITA`, `NEGACAO_NAO_AUDITADA`). Acesso direto: como `authenticated`, `select` em `cadastro.aviso_leitura`, `cadastro.avisos_pessoa(uuid)` e `operacao.avisos_privada(jsonb)` falham com `insufficient_privilege` (`TABELA_EXPOSTA`, `PROJECAO_EXPOSTA`, `OPERACAO_EXPOSTA`), e `anon` não executa o wrapper (`ANON_EXECUTE_ACEITO`); a ACL exata é conferida no molde de `supabase/tests/turno_grant_local.sql` (`ACL_GRANT_INEXATA`, `GRANT_AVISOS_AMPLO`).
- [x] 3.6 (19/11/2026) Indicador e lista em `web/avisos.ts`, montados por `web/main.ts` na barra superior, ao lado do botão da gaveta. **Decisão registrada:** o painel fica FORA da gaveta lateral porque a gaveta tem armadilha de foco própria (ver `web/gaveta-lateral.test.ts`, que exige `nav-regras` como último foco) e um painel transitório dentro dela mudaria essa ordem; no celular o sino continua ao alcance do polegar. Evidência: `web/avisos.test.ts` ("percorre os quatro estados sem confundir vazio com falha") cobre inicial, carregando, lista, vazio e falha — vazio só depois de consulta bem-sucedida e sem indicador; falha esvazia a lista, apaga o indicador e não reaproveita a contagem anterior. Executado com `npx vitest run web/avisos.test.ts` (3 passaram). `npx vitest run web/gaveta-lateral.test.ts` continua passando depois da mudança em `web/main.ts`.
- [x] 3.7 (19/11/2026) Permanência garantida pela própria projeção: não há prazo em `cadastro.avisos_pessoa`, e o aviso deixa de existir quando a origem deixa de produzir a linha. Evidência: `supabase/tests/avisos_no_app_local.sql`, blocos "3.3 e 3.7" e "3.7": marcar lido reduz `nao_lidos` em um e o item continua na lista com `lido = true` (`AVISO_LIDO_SUMIU_DA_LISTA`, `INDICADOR_NAO_RECALCULADO`); registrada a ciência em `cadastro.diario_ciencia_turno`, o aviso some da lista enquanto a marca de leitura permanece gravada e não o ressuscita (`ORIGEM_RESOLVIDA_CONTINUOU_NA_LISTA`, `MARCA_APAGADA`).
- [x] 3.8 (19/11/2026) Auditoria obrigatória na mesma transação, para listagem e marcação, inclusive nas negações, com `tipo_objeto = 'aviso'` e `objeto_id` nulo na listagem. Evidência: `supabase/tests/avisos_no_app_local.sql`, bloco "3.8" (`CONSULTA_NAO_AUDITADA`, `MARCACAO_NAO_AUDITADA`, `AUDITORIA_LISTAGEM_COM_OBJETO`, `AUDITORIA_COM_CONTEUDO_CLINICO`). O papel só recebe `insert` nas oito colunas enumeradas de `auditoria.evento`; não há coluna de conteúdo a gravar.
- [x] 3.9 (19/11/2026) Nenhuma saída do produto e nenhum token de dispositivo. Evidência no banco: `supabase/tests/avisos_no_app_local.sql`, bloco "3.9" — nenhuma extensão `http`/`pg_net` instalada, o corpo das três funções da fatia não casa com `http|net.|smtp|webhook|push|whatsapp|sms|device_token`, e `cadastro.aviso_leitura` não tem coluna além das cinco declaradas (`EXTENSAO_DE_SAIDA_INSTALADA`, `CHAMADA_EXTERNA_NA_FATIA`, `COLUNA_INESPERADA_EM_AVISO_LEITURA`). No servidor e na interface: `netlify/functions/_shared/aviso-nativo.test.ts` ("lista avisos ... sem qualquer saída do aplicativo" com `fetch` espionado e nunca chamado; "não tem porta de envio externo ...") e `web/avisos.test.ts` ("não envia nada para fora do aplicativo nem registra token de dispositivo"). Executados com `npx vitest run netlify/functions/_shared/aviso-nativo.test.ts web/avisos.test.ts`.

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
