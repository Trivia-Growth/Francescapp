# Inventário — o que hoje é fixo em código e poderia ser customizado pelo cliente (20/11/2026)

## Por que este documento existe

O solicitante quer **reduzir dependência de deploy**: identificar o que a operação
provavelmente vai querer mudar — vocabulário, rótulos, limites, textos, periodicidades —
e que hoje só muda com alteração de código ou migration.

Este inventário **não é uma lista de coisas a tornar configuráveis**. A parte mais
importante dele é a categoria C: o que é fixo **e deve continuar fixo**, com o risco
concreto de afrouxar cada item.

## Convenções

Cada achado recebe uma categoria:

- **(A) Deve virar configuração** — vocabulário de negócio, rótulo, limite operacional,
  periodicidade. Mudar não altera garantia de segurança nem contrato de API.
- **(B) Pode virar, com cuidado** — exige regra de validação, preservação de histórico,
  ou tem efeito em relatório e exportação já emitidos. O cuidado está dito em cada linha.
- **(C) Não deve virar configuração** — autorização, audiência, fronteira de confiança,
  cifra e AAD, esquema, códigos de erro fechados, e tudo cuja alteração pela tela permita
  a alguém ampliar o próprio acesso.
- **(D) Já é configurável** — com a ressalva, quando houver, de que **existe no banco mas
  não tem tela**.

Mecanismos recomendados, os três que já existem no repositório (nenhum quarto é proposto):

- **M1 — `identidade.configuracao_sistema`**
  (`supabase/migrations/20261117400000_configuracao_sistema.sql:21-41`). O Administrador
  edita **o valor**; nunca cria chave, nem muda tipo ou rótulo. Tipos
  `booleano|texto|numero|lista`, `exposicao` em `administracao|servidor|publica`, versão
  otimista. Tela genérica em `web/configuracao-sistema.ts`. **Não guarda o valor anterior.**
- **M2 — catálogo de campos extras generalizado**
  (`supabase/migrations/20261127100000_campo_extra_catalogo_generalizado.sql`). Tem escopo,
  ordem, obrigatoriedade, campo de fábrica, visibilidade e seis tipos. Sem `DELETE`:
  "remover" é `ativo=false`. Valor vive em envelope cifrado append-only, e escrita sob
  catálogo mudado é recusada com `conflito`
  (`supabase/tests/plano_campos_extras_local.sql:64-76`;
  `web/plano-cuidado.test.ts:498-595`).
- **M3 — `cadastro.turno_catalogo_medida`**
  (`supabase/migrations/20261125200000_turno_execucao_clinica.sql:29-37`). Conjunto fechado
  por CHECK; o Administrador só altera `ativo` e `referencia_informativa`. É o padrão para
  catálogo cujo significado clínico o cliente não pode inventar.

## O que esta varredura cobriu, e o que não cobriu

**Coberto e conferido linha a linha:** todos os conjuntos fechados de
`packages/contracts/src/` (82 arquivos), com grep do valor literal em `web/`, `netlify/` e
`supabase/migrations/` antes de classificar qualquer um como vocabulário; as 57 chaves
`ffcm.*` semeadas em migrations, cruzadas uma a uma com seus leitores em TypeScript **e**
em SQL; os textos institucionais de `web/` e dos geradores de PDF/manifesto em
`netlify/functions/_shared/`; as constantes numéricas de limite em
`netlify/functions/_shared/`, `netlify/functions/` e `packages/contracts/src/`.

**Não coberto — declarado, não inferido:**

- Não varri exaustivamente os **CHECK numéricos** das ~230 migrations. Os limites abaixo
  vieram das constantes de contrato e dos pontos que elas alcançam; pode haver teto
  operacional escrito só em SQL que não entrou aqui.
- Não varri `web/demonstracao.ts` (80 KB) nem `web/demonstracao.html`: são superfície de
  demonstração com dados fictícios, não política da casa.
- Não conferi os **templates de e-mail do Supabase Auth**. Eles são texto institucional
  enviado em nome da casa e **estão fora do repositório** —
  `netlify/functions/_shared/auth-nativo/enviar-convite-familiar.ts` só passa `redirectTo`.
  Isso é uma lacuna real de customização, mas não se resolve neste repositório.
- Não executei nenhuma verificação (`verificar:rapido`, suíte, Deno) porque outros agentes
  editavam o repositório no mesmo período; as evidências aqui são de leitura, não de
  execução.

---

## 1. Vocabulário de registro do turno e da ficha de plantão

| o que é | onde está | cat. | mecanismo | esforço | risco se mudar |
|---|---|---|---|---|---|
| `momento` da refeição (cafe, almoco, lanche, jantar, ceia) | `packages/contracts/src/turno-execucao.ts:15`, duplicado em `turno-execucao-http.ts:75` | **A** | M3 | médio | Baixo. Só vira rótulo em `netlify/functions/_shared/turno-execucao-apresentacao.ts:10-14`; nenhum `if` por valor. Hoje acrescentar "ceia" exige migration do CHECK em `20261125200000_turno_execucao_clinica.sql` |
| `aceitacao` da refeição (total, parcial, minima, recusou) | `turno-execucao.ts:16`, dup. `turno-execucao-http.ts:76` | **A** | M3 | médio | Baixo. Rótulos em `turno-execucao-apresentacao.ts:15-18`; nenhum `if` |
| `qualidade` do sono (tranquilo, agitado, nao_dormiu) | `turno-execucao.ts:36`, dup. `:96` | **A** | M3 | médio | Baixo. Rótulos em `turno-execucao-apresentacao.ts:19-21` |
| `eliminacao` (urina, fezes) | `turno-execucao.ts:46`, dup. `:106` | **A** | M3 | médio | Baixo, mas o CHECK de `turno_medida_versao` casa `eliminacao` com `contagem`; valor novo herda essa forma |
| `momento` da localização (abertura, encerramento) | `turno-execucao.ts:204`, dup. `:440` | **A** | M3 | pequeno | Baixo. Rótulo em `web/turno-execucao-localizacao-coordenacao.ts:191` |
| `motivo_ausencia` da localização | `turno-execucao.ts` (bloco `localizacaoTurnoSchema`) | **A** | M3 | pequeno | Baixo. Rotula por que não houve coordenada; nenhum `if` por valor |
| `tipo` da versão de escala (previsto, substituicao, cobertura) | `packages/contracts/src/turno-escala.ts:34,44`; `turno-passagem.ts:15,62` | **A** | M3 | médio | Baixo. Só rótulo em `web/escala-turno.ts:196,240`; não muda autorização nem payload |
| `periodoPlantaoSchema` (diurno, noturno) | `packages/contracts/src/ficha-plantao.ts:19` | **A** | M3 | pequeno | Baixo. FR-075 já exige "conjunto administrado"; hoje é CHECK em `20261127200000_ficha_plantao.sql` |
| `fonteInformacaoSchema` (observacao_direta, relato_paciente, relato_familiar, documento) | `ficha-plantao.ts:23` | **B** | M3 | médio | Média. Nenhum `if` hoje, mas a fonte é apresentada junto do conteúdo em toda superfície (FR-081); renomear muda o que um relatório antigo afirma. Exige o carimbo histórico da seção 7 |
| `cadastro.turno_catalogo_medida` — 12 tipos de medida | `supabase/migrations/20261125200000_turno_execucao_clinica.sql:29-37` | **D sem tela** | M3 | médio | **Existe no banco e é inalcançável.** `api.configurar_catalogo_turno` e `api.consultar_catalogo_turno` estão em `packages/contracts/src/turno-execucao.ts:148-149`, mas **não há rota** em `rotas.ts` nem tela em `web/`. O Administrador não consegue nem desativar uma medida |
| `tipo` de sinal vital e `unidadesSinalVital` | `packages/contracts/src/sinal-vital.ts:6,19` | **C** | — | — | `sinal-vital.ts:34` casa a unidade com o tipo e `:36` aplica a escala 0–10 só para `'dor'`. Deixar a tela trocar a unidade de `glicemia_capilar` de mg/dL para mmol/L faria o mesmo número significar outra coisa, sem conversão, num conteúdo clínico já gravado. A `referencia_informativa` de M3 é o canal certo para ajuste, e já é administrável |
| `situacao` de administração de medicação | `packages/contracts/src/medicacao.ts:36`, dup. `turno-execucao-http.ts:54` | **C** | — | — | `medicacao.ts:40` tem `.refine(v => v.situacao === 'administrado' \|\| v.motivo !== undefined)`: o valor **muda a validação**. Um valor novo administrado pela tela entraria sem exigir motivo, criando registro de não-administração sem justificativa |
| `classe`/`tipoRegistroExecucaoSchema` (afericao, prescricao, administracao, ocorrencia, rotina) | `turno-execucao.ts:52,58`; `turno-execucao-barreira.ts:10` | **C** | — | — | É o discriminante da união — decide **a forma do payload** e qual CHECK do banco se aplica. Ramifica em `web/turno-execucao-editor.ts:70,118,278`, `turno-execucao-projecao.ts:75,111`, `turno-execucao-nativo.ts:355`. Classe nova pela tela chega sem tabela, sem CHECK e sem AAD |
| `situacao` do turno (aberto, encerrado) | `packages/contracts/src/turno.ts:26,49` | **C** | — | — | É gate de ação: `web/turno-proprio.ts:95`, `web/turno-execucao.ts:152,325`, `web/passagem-turno.ts:191,231`. Um terceiro estado administrado pela tela criaria turno que não é nem aberto nem encerrado, e o gate `situacao === 'aberto'` passaria a negar silenciosamente — ou, pior, um estado "aberto_estendido" permitiria escrita clínica fora da janela da escala |
| `tabela` e `campo` do AAD de execução | `turno-execucao.ts:113,126` | **C** | — | — | Entram no AAD da cifra autenticada. Valor editável pela tela quebra a decifragem de conteúdo já gravado — perda de dado clínico, não falha de tela |

## 2. Vocabulário do caso, contexto e rede

| o que é | onde está | cat. | mecanismo | esforço | risco se mudar |
|---|---|---|---|---|---|
| `CATEGORIAS_CONTEXTO` (rotina, recursos, barreiras, preferencias, pontos_fortes, importante_para_paciente) | `packages/contracts/src/contexto-cuidado.ts:8` | **A** | M2 (escopo novo) ou M1 lista | médio | Baixo. Só dois `Record<CategoriaContexto,string>` em `web/contexto-cuidado.ts:11,20`. `validarContextoCuidado` (`contexto-cuidado.ts:60`) usa `.includes` genérico, não `if` por valor |
| `VINCULOS_REDE` (paciente, familiar, cuidador, responsavel_legal, contato_emergencia, profissional, responsavel_financeiro) | `packages/contracts/src/rede-cuidado.ts:9` | **A** | M2 ou M1 lista | médio | Baixo **e já declarado inócuo**: `web/rede-cuidado.ts:112` diz ao usuário que "marcar aqui não dá acesso à ficha". Conferido: nenhum `if` sobre vínculo em `netlify/` nem em RLS |
| `situacaoCasoSchema` (entrada, ativo, pausado, encerrado, transferido) | `packages/contracts/src/cadastro.ts:12` | **B** | M3 | médio | Média. Só rótulo em `web/indicadores-carteira-local.ts:22-24` e CHECK em `20261113100000_acompanhamento_caso.sql:12` — mas é o eixo dos filtros de carteira e dos indicadores. Valor novo precisa de decisão sobre em qual balde ele cai |
| `motivoBarreiraSchema` (transporte, custo, disponibilidade, outras) | `packages/contracts/src/realizacao-compromisso.ts:29` | **A** | M3 | pequeno | Baixo. Grep achou só o CHECK em `20261126120000_realizacao_compromisso.sql:26,309`. Nenhum `if` |
| `filtroSituacaoSchema`, `filtroRevisaoSchema`, `filtroPendenciaSchema` | `cadastro.ts:54,55,56` | **C** | — | — | Cada valor é um predicado de consulta, e `filtroSituacaoSchema` inclui `'a_completar'`, que o próprio contrato documenta como **recusado fora do perfil Administrador**. Valor de filtro administrado pela tela é superfície de consulta nova sem autorização correspondente |
| `tipoPendenciaSchema` (4 valores) | `packages/contracts/src/pendencia.ts:19` | **C** | — | — | Cada valor é um ramo do derivador em `20261118300000_sinal_operacional_caso.sql`, com CHECK em `20261118310000:242`. Tipo novo pela tela nasce sem derivador: a pendência nunca é calculada, e a carteira passa a prometer um acompanhamento que não existe |
| `estadoPendenciaSchema` / `acaoPendenciaSchema` | `pendencia.ts:25,26` | **C** | — | — | Máquina de estados com transições no banco. Estado novo sem transição trava a pendência aberta para sempre, ou a fecha sem o ato explícito que FR-077 exige |
| `estadoSinalSchema` (em_dia, atencao_operacional, informacao_insuficiente) | `pendencia.ts:27` | **C** | — | — | `if` explícito em `web/visao-caso.ts:189`, `web/pendencias-caso.ts:346`, `web/home-profissional.ts:207`. Valor desconhecido cai fora de todos os ramos e some da home — o caso que precisa de atenção fica invisível |
| `etapaEncaminhamentoSchema` | `packages/contracts/src/encaminhamento.ts:8` | **C** | — | — | **Parece vocabulário e não é.** `20261118300000_sinal_operacional_caso.sql:222` faz `where e.etapa = 'retorno_pendente'`, e `20261117110000:192` filtra `somente_sem_retorno`. Renomear a etapa pela tela desliga a pendência de retorno sem aviso nenhum |
| `situacaoOrientacaoSchema` (vigente, superada) | `packages/contracts/src/orientacao.ts:14` | **C** | — | — | `web/orientacoes.ts:44` usa `situacao === 'superada'` para marcar "anterior". Terceiro valor administrado faria uma orientação superada continuar apresentada como vigente à família |

## 3. Vocabulário de diário, linha do tempo e avisos

| o que é | onde está | cat. | mecanismo | esforço | risco se mudar |
|---|---|---|---|---|---|
| `area` do diário | `packages/contracts/src/diario.ts:46,152` — texto(120) conferido contra `ffcm.diario.areas_sintese` | **D com tela** | M1 | — | Já configurável. Lido em `netlify/functions/diario.ts:34`, `_shared/conversao-diario-compor-nativa.ts:128`, `_shared/turno-execucao-compor-nativo.ts:108`. Editável na tela genérica |
| `tipoRegistroDiarioSchema` (relato_familiar, evolucao_profissional) | `diario.ts:16` | **C** | — | — | **Decide autorização no banco.** `20261118210000_diario_operacoes_privadas.sql:314`: `if papel='colaborador' and tipo<>'evolucao_profissional' then` — também em `20261120360000:219` e `20261125250000:1927`. Um tipo novo criado pela tela não casaria com a condição e abriria ao colaborador um caminho de escrita que a regra pretende negar |
| `audienciaDiarioSchema` (equipe, equipe_e_familia) | `diario.ts:25` | **C** | — | — | Audiência pura. Qualquer valor administrado aqui é decisão sobre quem lê conteúdo clínico, tomada por tela em vez de por regra |
| `estadoRegistroDiarioSchema` (rascunho, publicado, retificado) | `diario.ts:20` | **C** | — | — | `20261120300000_linha_tempo_caso.sql:159` mapeia `estado='retificado'` para `tipo_evento='retificacao'`; `web/diario.ts:61,248,249,267,383,601` ramifica. Estado novo pela tela pode fazer um **rascunho** cair fora do filtro que o esconde e aparecer para a família |
| `fonteLinhaTempoSchema` (12 valores) | `packages/contracts/src/linha-tempo.ts:6` | **C** | — | — | `netlify/functions/_shared/turno-execucao-fontes-caso.ts:66,115` escolhe **qual RPC chamar** pelo valor. CHECK espelhado em `20261120330000_exportacao_caso.sql:79`. Fonte administrada pela tela não tem RPC e quebra a linha do tempo e a exportação |
| `papel` da linha do tempo (colaborador, familia) | `linha-tempo.ts:61` | **C** | — | — | É o mesmo `papel` do `if` de autorização do diário citado acima |
| `tipoAvisoSchema` (4 valores) | `packages/contracts/src/aviso.ts:19` | **C** | — | — | **Parece catálogo e não é.** Cada valor é um SELECT literal distinto em `20261126300000_avisos_no_app.sql:183,217…`, e o contrato só preenche `motivo` para `pendencia_operacional`. Tipo novo pela tela nunca é emitido por ninguém |
| `visibilidadeObjetivoSchema` (interna, publica) e `visibilidadeCampoExtraSchema` / `visibilidadeRespostaSchema` | `plano-cuidado.ts:112`; `campo-extra-catalogo.ts:14`; `ficha-plantao.ts:33` | **C** | — | — | Decidem o que a família alcança (`web/plano-cuidado.ts:421,494`, `web/orientacoes-local.ts:96,141`). Um terceiro valor de visibilidade administrado pela tela cairia fora do filtro de audiência, e o comportamento padrão de um `!== 'interna'` é **mostrar** |

## 4. Limites, prazos e tolerâncias

| o que é | onde está | cat. | mecanismo | esforço | risco se mudar |
|---|---|---|---|---|---|
| `ffcm.turno.tolerancia_atraso_minutos` | semeada em `supabase/migrations/20261125080000_turno_execucao_privada.sql:23`; lida em `20261125130000_turno_consulta_atual.sql:128-134` | **D, com faixa frouxa demais** | M1 | pequeno | **Atenção.** É `tipo='texto'` guardando inteiro, e a validação aceita `^(0\|[1-9][0-9]{0,8})$` — ou seja, **até 999.999.999 minutos**, cerca de 1.900 anos de tolerância de atraso. Isso transfere para a tela a capacidade de anular a janela da escala. Precisa de faixa (ver seção 7) |
| `ffcm.turno.duracao_padrao_minutos` | `20261125080000:22`; lida em `20261125130000:129` | **D, com faixa frouxa demais** | M1 | pequeno | Mesmo problema: `^[1-9][0-9]{0,8}$`, sem teto operacional. Turno de duração arbitrária distorce apuração de repasse e a janela de escrita clínica |
| `ffcm.transcricao.duracao_maxima_segundos` | `20261119140000_configuracao_transcricao.sql:45`; lida em `_shared/compor-transcricao-nativa.ts:139-144` | **D — e é o bom exemplo** | M1 | — | **Este é o padrão a generalizar.** `numeroConfigurado(..., 90, 1, AUDIO_SEGUNDOS_MAXIMO)` prende a configuração entre 1 e o teto absoluto do código, e `packages/contracts/src/transcricao.ts:31` diz literalmente: "Teto absoluto de duração. A configuração do sistema pode baixar, nunca subir" |
| `TAMANHO_MAXIMO_DOCUMENTO = 4 MiB` | `packages/contracts/src/documento-caso.ts:6` | **B** | M1 numérico com faixa | médio | Limite de segurança e de custo: é o tamanho que uma função bufferizada aceita no corpo (`:7` soma 64 KiB de margem multipart). Pode baixar livremente; **subir** aumenta superfície de abuso e risco de estouro da função. Faixa proposta na seção 7 |
| `TAMANHO_MAXIMO_ANEXO_TURNO = 3 MiB`, `TAMANHO_MAXIMO_PDF_TURNO = 4 MiB` | `packages/contracts/src/turno-execucao-http.ts:279,280` | **B** | M1 numérico com faixa | médio | Idem. Só para baixo sem cerimônia |
| `TAMANHO_MAXIMO_COMPROVANTE_BYTES = 5 MiB` | `packages/contracts/src/financeiro.ts:102` | **B** | M1 numérico com faixa | pequeno | O comentário em `:94` registra que "formato e limite **não foram decididos pelo solicitante**" — é exatamente o tipo de número que a operação deveria poder ajustar sem deploy |
| `AUDIO_BYTES_MAXIMO = 300_000`, `AUDIO_BYTES_POR_PARTE = 18_432`, `AUDIO_PARTES_MAXIMO = 64` | `packages/contracts/src/transcricao.ts:25,28,29` | **C** | — | — | Não é preferência: o comentário em `:20-24` demonstra que 300 KB cifrados em partes de 18 KiB ocupam ~535 KB no transporte atestado, que tem teto de 1 MiB no `snapshotCanonicoSchema`. "Subir este número **estoura o atestado**, não só o banco" — ou seja, a tela derrubaria a assinatura que sustenta a autorização |
| `AUDIO_SEGUNDOS_MAXIMO = 300` | `transcricao.ts:31` | **C** | — | — | É o **limite do limite** da chave `ffcm.transcricao.duracao_maxima_segundos`. Torná-lo configurável remove justamente o teto que impede a configuração de subir |
| `retencao_dias` da localização de turno, fixo em 90 | `supabase/migrations/20261125220000_turno_localizacao.sql:12` (`check(retencao_dias=90)`), aplicado em `:112` e `:124` | **C** | — | — | **O caso mais perigoso desta lista.** Os 90 dias não são só um parâmetro: são a **promessa feita no texto de consentimento** que a pessoa leu e aceitou (`web/turno-execucao-localizacao.ts:121`, e impresso no PDF em `_shared/turno-execucao-nativo.ts:624-625`). Uma tela que suba esse número retém dado de geolocalização além do que foi consentido, retroativamente, para consentimentos já colhidos. Baixar é defensável; subir é quebra de consentimento |
| `VALOR_MAXIMO_CENTAVOS = 1_000_000_000` | `packages/contracts/src/financeiro.ts:23` | **B** | M1 numérico com faixa | pequeno | Teto sanitário de valor acordado. Risco de subir é baixo, mas é o número que impede erro de digitação virar apuração absurda |
| `LIMITE_CORPO_PADRAO = 32_768` | `netlify/functions/_shared/entrada-financeiro-nativa.ts:72` | **C** | — | — | Teto de corpo de requisição — primeira linha de defesa contra corpo gigante antes de qualquer parsing. Configurável pela tela, vira botão de amplificação de custo e de memória da função |
| `JANELA_MS = 30_000` e `ESPERA_RETENTATIVA_MS = 150` do cache de configuração | `netlify/functions/_shared/configuracao-servidor.ts:23,30` | **C** | — | — | É a janela de cache **da própria configuração**. Se virar chave de configuração, um valor errado gravado pela tela se auto-perpetua por esse mesmo tempo e trava a correção. É o mesmo raciocínio já registrado na decisão 4 de `openspec/changes/configuracao-no-banco/proposal.md` ("a rota de configuração não lê a si mesma") |
| `MIMES_COMPROVANTE` e `mimeAudioSchema` | `financeiro.ts:96`; `transcricao.ts:34` | **C** | — | — | Lista de tipos aceitos em upload. Acrescentar um MIME pela tela admite formato que o provedor não processa e, no caso do comprovante, amplia o que entra no bucket sem revisão da política do bucket |

## 5. Textos institucionais visíveis

Levantados em `web/` e nos geradores de PDF/manifesto. O conjunto completo de trechos está
na seção 9; aqui ficam os agrupamentos com a decisão.

| o que é | onde está (amostra) | cat. | mecanismo | esforço | risco se mudar |
|---|---|---|---|---|---|
| Regras de atendimento: funcionamento, períodos, canais, uso do diário | `ffcm.regras.funcionamento`, `.periodos`, `.canais`, `.diario`, semeadas em `supabase/migrations/20261119320000_regras_atendimento_publicas.sql`; lidas em `web/regras-atendimento.ts` | **D com tela** | M1 `exposicao='publica'` | — | Já configurável e já editável. **Ressalva real de usabilidade:** as quatro são `tipo='texto'` e `web/configuracao-sistema.ts:135-139` renderiza texto como `<input type="text">` de **uma linha**, sem quebra de parágrafo; `web/regras-atendimento.ts:65` também imprime em um único `<p>`. O `<textarea>` existe na tela, mas está reservado a `tipo='lista'` |
| Cabeçalho da tela de regras — "Como funciona o acompanhamento" / "Regras combinadas, periodicidade, canais…" | `web/index.html:206` | **A** | M1 `publica` | pequeno | Baixo, e é uma incoerência: o **corpo** da tela de regras é configurável e o **cabeçalho dela** é literal em HTML |
| Avisos obrigatórios do Plano de crise — "O diário não garante resposta imediata…" e "A case manager coordena o cuidado e não emite conduta clínica…" | `web/plano-crise.ts:22,24` | **C** | — | — | São as duas frases **exigidas por FR-020**, e `openspec/changes/plano-de-crise/design.md:92-97` registra a decisão: são constantes da tela, "não dependem do que alguém digitou e não podem ser apagadas por engano", com `web/plano-crise.test.ts` falhando se alguma sumir. Torná-las editáveis permite ao cliente apagar a ressalva que limita a responsabilidade clínica da casa |
| Ressalvas de "sem interpretação clínica automática" | `web/turno-execucao-editor.ts:105,123,389`; `web/turno-execucao-leitura.ts:148`; `web/turno-execucao-gestao.ts:354`; rodapé do PDF em `netlify/functions/_shared/turno-execucao-pdf.ts:53` | **C** | — | — | Mesma natureza: é a declaração de que o sistema **não** produz diagnóstico, gravidade ou conduta, exigida por FR-076 e FR-081. Editável pela tela, vira um PDF da casa que não carrega mais essa ressalva |
| Avisos de audiência e de sigilo — "O retorno a um relato da família é sempre visto por quem o escreveu…", "Parentesco não concede esse acesso", "Vínculo é descritivo: marcar aqui não dá acesso à ficha" | `web/diario.ts:338,345`; `web/turno-execucao-relatorios.ts:146`; `web/rede-cuidado.ts:112`; `web/turno-execucao-gestao.ts:176,215` | **C** | — | — | Descrevem o comportamento real do controle de acesso. Se o texto for editável e o controle não, a tela passa a poder **mentir sobre quem lê o quê** — e o usuário decide o que escrever com base nessa frase |
| Texto de consentimento da localização: finalidade, audiência, retenção de 90 dias | `web/turno-execucao-localizacao.ts:4-6,121,178-179`; impresso no PDF em `_shared/turno-execucao-nativo.ts:624-625,631-633` | **C** | — | — | É o texto sobre o qual a pessoa consentiu. Editável pela tela, muda retroativamente o que foi consentido, sem novo consentimento e sem histórico do que estava escrito à época |
| Capa e ressalvas do PDF de exportação e do manifesto — "Dados estruturados de terceiros reduzidos a papel e primeiro nome", "Ele não comprova recebimento" | `netlify/functions/_shared/turno-execucao-caso-pdf.ts:62-64,121-123`; `web/pacote-exportacao.ts:158,170,211,234`; `web/exportacao.ts:70,79,161` | **B** | M1 `publica` + carimbo histórico | grande | Média-alta. São textos que a operação legitimamente quer ajustar (linguagem para destinatário externo), **mas vão dentro de um pacote entregue a terceiros**. Só com a regra da seção 7: o documento emitido guarda o texto vigente à época, e reemissão não reescreve o pacote já entregue |
| Assinatura institucional — "FFCMApp Francescato · Family Case Management" | `web/index.html:221`; título do PDF `"FFCMApp - ${h.tipo}"` em `_shared/turno-execucao-nativo.ts:569`; "Drive da Francescato" em `web/documentos-caso.ts:488` | **A** | M1 `publica` | pequeno | Baixo. Nome da casa escrito em três lugares diferentes do código. É exatamente o tipo de coisa que não deveria exigir deploy |
| Textos de entrada — "Acesso restrito a pessoas previamente autorizadas", "Entrar não concede acesso automaticamente…" | `web/index.html:48,49,53,58,73,91,104,192` | **B** | M1 `publica` | médio | São política, mas alguns descrevem o controle (como os de audiência acima). Separar: os descritivos de marca podem ir; "Entrar não concede acesso automaticamente" descreve o controle e fica |
| Orientações com regra da casa — "Só é permitida uma conversão por registro", "Tira do indicador. Não registra ciência…" | `web/conversao-diario.ts:70`; `web/turno-execucao-conversao.ts:83`; `web/avisos.ts:116` | **C** | — | — | Descrevem a regra que o código aplica. Texto e regra precisam mudar juntos; separá-los é criar divergência silenciosa |
| Corpo do e-mail de convite familiar | **não está no repositório** — `netlify/functions/_shared/auth-nativo/enviar-convite-familiar.ts` só passa `redirectTo`; o corpo vem do template do Supabase Auth | — | — | — | Lacuna de customização real, fora do alcance deste repositório. Entra como pergunta material |

## 6. Configuração: o que já existe, e os defeitos encontrados

Há **57 chaves `ffcm.*`** semeadas em migrations. Cruzei cada uma com seus leitores em
TypeScript **e** em SQL. Resultado:

| o que é | onde está | cat. | mecanismo | esforço | risco se mudar |
|---|---|---|---|---|---|
| ~40 interruptores `ffcm.<fatia>.ativo` | p.ex. `20261121100000_configuracao_servicos.sql`; lidos via `servicoAtivo` em `netlify/functions/*.ts` | **D com tela** | M1 | — | Funcionando. `_shared/configuracao-servidor.ts:188-199` garante que falha de leitura cai no padrão do ambiente, nunca em "ligado" |
| `ffcm.equipe.vinculos_ativa` | semeada em `20261121100000_configuracao_servicos.sql:224`; **nenhum leitor** — a rota correspondente usa variável de ambiente: `netlify/functions/vinculos-profissionais.ts:35` faz `if (process.env.FFCM_CONSULTA_VINCULOS_ATIVA !== 'true')` | **defeito** | M1 | pequeno | **Configuração morta.** A tela de Administração oferece um interruptor que não liga nem desliga nada. O Administrador acredita ter desativado os vínculos de equipe e não desativou. A rota ficou sem migrar quando as outras ~40 migraram |
| **`ffcm.financeiro.ativo` e `ffcm.avisos.ativos` semeadas com `exposicao` errada** | semeadas como `'administracao'` em `20261127300000_configuracao_financeiro_avisos.sql:16-23`; lidas por `servicoAtivo` em `netlify/functions/financeiro.ts:43-47` e `netlify/functions/avisos.ts:32` | **defeito** | M1 | pequeno | **Interruptor que não liga.** `servicoAtivo` lê pelo leitor do servidor, e `20261117420000_configuracao_sistema_leitor_servidor.sql:19,25` expõe **somente** `exposicao='servidor'`. Como as duas nasceram `'administracao'`, elas aparecem na tela, aceitam a gravação, e o servidor **nunca as enxerga** — continua usando `process.env.FFCM_FINANCEIRO_ATIVO`. O Administrador liga o Financeiro na tela e nada acontece, sem erro nenhum. Corrigir a `exposicao` é uma linha de migration |
| `ffcm.papel_declarado.ativo` e `ffcm.substituicao_cm.ativo` — **lidas pelo código, nunca semeadas** | lidas em `netlify/functions/papel-declarado.ts:25` e `netlify/functions/substituicao-case-manager.ts:38`; nenhuma semente em `supabase/migrations/` | **defeito** | M1 | pequeno | O inverso do anterior: o leitor existe, a linha não. Chave ausente cai no padrão de ambiente (`configuracao-servidor.ts:188-202`), e `FFCM_PAPEL_DECLARADO_ATIVO`/`FFCM_SUBSTITUICAO_CM_ATIVO` não estão no `.env.example` — logo o padrão é desligado e **não há nada na tela para ligar**. Só por deploy |
| `ffcm.turno.area_passagem`, `ffcm.turno.duracao_padrao_minutos`, `ffcm.turno.tolerancia_atraso_minutos`, `ffcm.turno.tratamento_nao_encerrado`, `ffcm.transcricao.expurgo_ativo`, `ffcm.turno.expurgo_localizacao_ativo`, `ffcm.acessos.ativo` | lidas **no banco**, não em TypeScript: `20261125140000:197-198`, `20261125130000:128-131`, `20261125030000:48`, `20261125220000:164`, `20261125160000:152` | **D com tela** | M1 | — | Conferido: têm leitor real. A busca só em `netlify/`+`web/` as faria parecer mortas — registro aqui para evitar que uma varredura futura as remova por engano |
| `ffcm.turno.tratamento_nao_encerrado` aceita apenas `'sinalizar_pendencia'` | `20261125130000_turno_consulta_atual.sql:132` | **B** | M1 com `opcoes` | pequeno | A chave é `texto` livre com um único valor aceito, e qualquer outro derruba a abertura de turno com `conflito`. Deveria usar `opcoes` (`20261119110000_configuracao_sistema_opcoes.sql`), que já existe e já é validada por CHECK no banco |
| Tela genérica de configuração lista todas as chaves | `supabase/migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql:102-106` — `select … from identidade.configuracao_sistema` sem filtro de `exposicao` | **D** | M1 | — | Positivo: chave nova semeada por migration aparece sozinha na tela, sem mexer no front |
| Tela renderiza `tipo='texto'` como input de uma linha | `web/configuracao-sistema.ts:135-139` | **A** | M1 | pequeno | Impede escrever as regras de atendimento com parágrafos. Ver seção 5 |
| `identidade.configuracao_sistema` não guarda o valor anterior | `20261117400000_configuracao_sistema.sql:21-41` — só `atualizado_por_usuario_id`/`atualizado_em` | **B** | M1 | médio | Para interruptor, tudo bem. Para **texto institucional e vocabulário**, é o buraco que impede responder "o que estava escrito quando este PDF foi emitido?". Ver seção 7 |
| `api.configurar_catalogo_turno` sem rota e sem tela | `packages/contracts/src/turno-execucao.ts:148-149`; nenhuma ocorrência em `rotas.ts` nem em `web/` | **A** | M3 | médio | Capacidade administrativa pronta no banco e inalcançável pelo cliente |

## 6b. Periodicidades e regras "acordadas por caso"

As specs prometem configurabilidade em alguns pontos. Conferi se a promessa foi cumprida.

| o que é | onde está | cat. | mecanismo | esforço | risco se mudar |
|---|---|---|---|---|---|
| **FR-027** — "pendências … usando periodicidades acordadas por caso" | spec em `openspec/specs/agenda-e-carteira/spec.md:63,69,74`; implementado em `cadastro.acordo_acompanhamento`, `supabase/migrations/20261118300000_sinal_operacional_caso.sql:32-44` | **D com tela** | próprio | — | **Promessa cumprida, e é o melhor exemplo do repositório.** Periodicidade é **por caso**, não global; versionada e imutável (trigger `:49-61`); editável em `web/pendencias-caso.ts:204-206,254`. E os CHECKs já trazem faixa: `dias_entre_atualizacoes between 1 and 365`, `dias_antecedencia_revisao between 1 and 180`. Ou seja, **a faixa que falta na configuração global já existe aqui** |
| **FR-009** — "modelos curtos de síntese profissional **por área, configurados com a equipe**" | spec em `openspec/specs/diario-e-evolucao/spec.md:26,32` | **B** | M2 (escopo novo) | grande | **Promessa cumprida pela metade.** As **áreas** são configuráveis (`ffcm.diario.areas_sintese`, lida em `netlify/functions/diario.ts:34`), mas **o modelo é um só para todas as áreas**: os campos estão criados literalmente em `web/modelo-sintese.ts:31-39` (`data`, `atividade`, `observacoes`, `progresso`, `orientacao`, `proximo`, `objetivo`) e validados em `packages/contracts/src/diario.ts:47-50`. Não existe "modelo por área" — existe um modelo único com um campo "Área". M2 já tem `escopo` e serve, mas o conteúdo do diário é clínico e cifrado: exige o mesmo cuidado de conflito e preservação que FR-078 |
| `ffcm.regras.periodos` (texto público) **não é lido por nenhuma regra** | semeada em `20261119320000_regras_atendimento_publicas.sql:43-48`; lida só em `web/regras-atendimento.ts` | **B** | M1 | pequeno | Risco de divergência: a família lê ali uma periodicidade escrita à mão, enquanto o que o sistema **aplica** vem de `cadastro.acordo_acompanhamento`, por caso. Dois lugares dizendo a mesma coisa, sem ligação |
| Parâmetros de turno são **globais**, não por caso | `ffcm.turno.duracao_padrao_minutos`, `.tolerancia_atraso_minutos`, `.tratamento_nao_encerrado` (`20261125080000:22-24`), `.area_passagem` (`20261125140000:63`) | **B** | M1 | médio | Nenhuma spec em `openspec/specs/` descreve essas chaves — são decisão de implementação sem requisito. Se a operação acordar tolerância diferente por caso, como já faz com periodicidade, o desenho global não atende. **Não presumi que deva mudar**: entra como pergunta material |
| Aviso de crise no momento do registro do diário | spec em `openspec/specs/diario-e-evolucao/spec.md:121` — "verá as instruções de crise acordadas … antes de depender do diário" | **lacuna** | M1 `publica` | médio | O texto mais próximo é `ffcm.regras.diario`, que vive **na tela de regras**, não no formulário do diário. O requisito pede o aviso no momento do preenchimento. Não achei chave nem campo que injete esse texto ali |

## 7. A regra que falta: o limite do limite, e o histórico do significado

Três lacunas atravessam as seções acima. Elas são o conteúdo central da proposta OpenSpec
que acompanha este inventário.

**7.1 — Faixa não é verificada no banco.** `numeroConfigurado`
(`netlify/functions/_shared/configuracao-servidor.ts:149-166`) recebe `minimo` e `maximo`
**como argumentos em código** e, fora da faixa, devolve silenciosamente o padrão. Isso
significa que um valor absurdo **é aceito e gravado** pela tela; o Administrador vê o
número que digitou, acredita que ele vale, e o servidor está usando outro. A tabela
`identidade.configuracao_sistema` não tem coluna de mínimo nem de máximo, então nenhum
CHECK recusa. A correção é a mesma que `20261119110000_configuracao_sistema_opcoes.sql` já
fez para listas: colunas `minimo`/`maximo` definidas por **migration** (nunca pela tela,
como `opcoes`, sem `UPDATE` para o owner administrativo) e CHECK que recusa a gravação.
Enquanto isso não existir, nenhum teto de arquivo deve virar chave.

Vale registrar que **o repositório já faz isso corretamente em outro lugar**:
`cadastro.acordo_acompanhamento` (`20261118300000_sinal_operacional_caso.sql:35-37`)
prende cada periodicidade com `check (… between 1 and 365)` e `between 1 and 180`. A faixa
não é invenção nova — é o padrão da casa para valor operacional, que a configuração global
deixou de seguir.

**7.2 — Quem pode mudar um limite de segurança.** Hoje a única distinção é `exposicao`,
que diz **quem lê**, não **quem escreve**: toda escrita é Administrador. Para limite de
segurança, a proposta conservadora é não criar papel novo (não há requisito para isso) e
sim **tornar a faixa estreita o bastante para que qualquer valor dentro dela seja aceitável**
— o padrão que `AUDIO_SEGUNDOS_MAXIMO` já estabelece: a configuração **pode baixar, nunca
subir** acima do teto do código.

**7.3 — Registro antigo quando o significado muda.** Três comportamentos distintos, que
não devem ser confundidos:

- **Limite** (tamanho, tolerância, duração): já resolvido pelo melhor padrão do
  repositório — `cadastro.turno.parametros`
  (`20261125130000_turno_consulta_atual.sql:134`) **congela no turno** os parâmetros
  vigentes na abertura. Registro antigo continua julgado pela regra da sua época. Esse
  carimbo deve ser a regra para todo limite que vire configuração.
- **Vocabulário** (rótulo de categoria, momento, vínculo): M2 já resolve — sem `DELETE`,
  `ativo=false`, valor em envelope append-only, conflito na escrita sob catálogo mudado
  (`plano_campos_extras_local.sql:64-76`), e a interface mantendo visível o valor de campo
  inativo (`web/plano-cuidado.test.ts:498-595`). FR-079 já exige que a ficha antiga
  continue exibindo o papel declarado à época.
- **Texto institucional em documento emitido**: **não tem solução no repositório hoje**, e
  é o risco da linha "capa e ressalvas do PDF" da seção 5. M1 não guarda versão anterior,
  então reemitir um relatório de período passado imprimiria a ressalva de hoje sobre
  conteúdo de ontem. Nenhum texto que vá dentro de pacote entregue a terceiro deve virar
  configuração antes disso estar resolvido.

## 8. Prioridade por valor para a operação dividido por risco

1. **Corrigir a `exposicao` de `ffcm.financeiro.ativo` e `ffcm.avisos.ativos`**
   (`20261127300000:16-23`). Uma linha de migration, e hoje são dois interruptores que a
   tela aceita e o servidor nunca lê. É o maior valor por menor risco da lista inteira.
2. **Semear `ffcm.papel_declarado.ativo` e `ffcm.substituicao_cm.ativo`**
   (lidas em `papel-declarado.ts:25` e `substituicao-case-manager.ts:38`). Duas fatias
   prontas que só podem ser ligadas por deploy, porque a linha não existe no banco.
3. **Tela para o catálogo de medidas do turno** (`turno-execucao.ts:148-149`). Valor alto,
   risco quase nulo: a capacidade já existe no banco, com escrita restrita a `ativo` e
   `referencia_informativa`, e o CHECK continua fechando o conjunto. Falta só rota e tela.
4. **Corrigir `ffcm.equipe.vinculos_ativa`** (`20261121100000:224` contra
   `vinculos-profissionais.ts:35`). Esforço mínimo, e hoje é um interruptor que mente para
   quem administra.
5. **Faixa (`minimo`/`maximo`) no catálogo de configuração.** Não entrega função nova, mas
   **destrava com segurança** todos os limites das seções 4 e 6 — e fecha o buraco de hoje,
   em que um valor fora de faixa é aceito e ignorado.
6. **Apertar a faixa de `tolerancia_atraso_minutos` e `duracao_padrao_minutos`.** Hoje
   aceitam até 999.999.999 minutos. Baixo esforço, e remove a capacidade de anular a janela
   da escala pela tela.
7. **Vocabulário de rotina do turno** (refeição, aceitação, sono, eliminação) via M3. Valor
   alto para o AT, risco baixo: nenhum `if` por valor, conferido.
8. **`CATEGORIAS_CONTEXTO` e `VINCULOS_REDE`** via M2/M3. Vocabulário puro, verificado sem
   `if`, e `VINCULOS_REDE` já é declarado inócuo na própria tela.
9. **Nome e assinatura da casa** (`index.html:221`, `turno-execucao-nativo.ts:569`,
   `documentos-caso.ts:488`). Pequeno, visível, e hoje exige deploy.
10. **Cabeçalho da tela de regras** (`index.html:206`) e **`<textarea>` para `tipo='texto'`**
    (`configuracao-sistema.ts:135-139`). Juntos, tornam utilizável o mecanismo de texto
    institucional que **já existe** e hoje é desconfortável.
11. **`tratamento_nao_encerrado` com `opcoes`** em vez de texto livre
    (`20261125130000:132`). Pequeno, e usa mecanismo já construído.
12. **Tipos de escala, período do plantão, motivo de barreira, momento/motivo de
    localização.** Vocabulário puro, verificado; valor médio, risco baixo.

Fora desta lista por esforço desproporcional nesta rodada, mas registrado: o **modelo de
síntese por área** de FR-009 (`web/modelo-sintese.ts:31-39`), que é promessa de spec ainda
não cumprida e mexe em conteúdo clínico cifrado.

Ficam **fora** da prioridade, por risco desproporcional ao ganho: textos de consentimento e
de audiência, retenção de 90 dias, avisos obrigatórios de FR-020, ressalvas de "sem
interpretação clínica", e todos os conjuntos da categoria C.

## 9. Perguntas materiais para o solicitante

Nenhuma destas pode ser respondida pelo código, e as quatro primeiras **bloqueiam** tarefas
da proposta que acompanha este inventário.

1. **Quem pode mexer em limite de segurança?** A proposta supõe, conservadoramente, que
   continua sendo só o Administrador, e que a proteção vem da **faixa estreita**, não de um
   papel novo. Se o solicitante quiser um segundo nível de aprovação para teto de arquivo e
   tolerância, isso muda o recorte.
2. **A retenção de 90 dias da localização pode baixar pela tela?** Subir é quebra do
   consentimento já colhido (`web/turno-execucao-localizacao.ts:121`). Baixar é defensável,
   mas afeta o texto impresso no PDF (`_shared/turno-execucao-nativo.ts:624-625`) e
   consentimentos vigentes. A suposição conservadora é **não mexer**.
3. **Texto institucional dentro de pacote entregue a terceiro pode mudar?** Se sim, é
   obrigatório o histórico de 7.3 — o documento emitido carrega o texto da sua época. Sem
   isso, a suposição conservadora é manter fixos os textos de
   `web/pacote-exportacao.ts` e `_shared/turno-execucao-caso-pdf.ts`.
4. **Acrescentar momento de refeição, tipo de escala ou vínculo de rede é necessidade real
   da operação, ou só possibilidade teórica?** Mecanismo de catálogo tem custo. Se a Edilaine
   nunca vai acrescentar um sexto momento de refeição, M3 para esse conjunto é trabalho sem
   destino.
5. **Quem escreve o corpo do e-mail de convite familiar?** Ele **não está no repositório**:
   vem do template do Supabase Auth. É texto enviado em nome da casa e hoje não tem dono
   declarado nem caminho de edição pela plataforma.
6. **O nome "Francescato"/"FFCMApp" deve ser configurável, ou é definitivo?** Está em três
   lugares do código. Se for definitivo, vale consolidar em uma constante; se não, vai para
   M1.
7. **`ffcm.equipe.vinculos_ativa` deveria ligar alguma coisa, ou é resto de uma fatia que
   mudou de desenho?** Depende disso remover a chave ou migrar
   `netlify/functions/vinculos-profissionais.ts:35` para lê-la.
8. **Tolerância de atraso e duração de turno devem ser globais ou por caso?** Hoje são
   globais (`20261125080000:22-23`) e nenhuma spec as descreve, enquanto a periodicidade de
   acompanhamento, que é o parâmetro operacional vizinho, é **por caso**
   (`cadastro.acordo_acompanhamento`). A suposição conservadora desta proposta é **manter
   globais** — mudar isso muda o recorte.
9. **O modelo de síntese do diário deve ser por área, como FR-009 promete?** Hoje é um
   modelo único (`web/modelo-sintese.ts:31-39`). Mexer nisso é trabalho grande sobre
   conteúdo clínico cifrado, e não entra nesta proposta sem confirmação.
