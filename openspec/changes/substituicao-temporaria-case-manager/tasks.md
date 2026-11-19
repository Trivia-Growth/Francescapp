# Tarefas — substituição temporária da case manager (FR-037)

## 1. Domínio e contrato

- [x] 1.1 Contrato de domínio do painel de substituição.
  **Evidência:** `packages/contracts/src/substituicao-case-manager.ts` —
  `painelSubstituicaoSchema` (titular, quem responde agora, vigência e histórico),
  `registrarSubstituicaoSchema` (recusa fim menor ou igual ao início) e
  `respostaSubstituicaoPrivadaSchema`.
  **Limitação deliberada:** nenhum campo de motivo (ver `design.md`).
- [x] 1.2 Contrato HTTP isolado, sem tocar o `rotas.ts` compartilhado.
  **Evidência:** `packages/contracts/src/substituicao-case-manager-http.ts`, no mesmo
  padrão de `plano-crise-http.ts`. Encerrar é rota separada de registrar.
- [x] 1.3 AAD próprio do motivo, na forma genérica do repositório (revisto em 19/11/2026).
  **Evidência:** `metadadosAadSubstituicaoCmSchema` em `packages/contracts/src/rpc.ts` e o
  ramo `cadastro.substituicao_case_manager` em `supabase/functions/_shared/cifra-autenticada.ts`,
  com a forma `{tabela, registro_id, campo, formato}` — a mesma de
  `financeiro.valor_acordado_turno` e `financeiro.despesa_lancamento`. Nenhum ramo existente
  mudou de forma: `cifra-autenticada.test.ts` e os sete vetores de regressão de
  `cifra-financeira.test.ts` continuam passando sem edição (42 testes).

## 2. Banco — registro da substituição

- [x] 2.1 Tabela append-only por caso, com titular do momento, substituta, período, autor,
  instante, versão e encerramento antecipado.
  **Evidência:** `supabase/migrations/20261126100000_substituicao_case_manager.sql` —
  `cadastro.substituicao_case_manager` e o gatilho `substituicao_cm_imutavel`, que recusa
  DELETE, reabertura e qualquer alteração fora da transição de encerramento.
- [x] 2.2 Períodos sobrepostos impedidos pelo banco.
  **Evidência:** `constraint substituicao_cm_sem_sobreposicao exclude using gist
  (paciente_id ... with =, tstzrange(inicio, coalesce(encerrada_em, fim), '[)') with &&)`,
  com `btree_gist`. Provado com duas conexões reais, não com verificação na aplicação.
- [x] 2.3 Fonte única da regra "case manager atual".
  **Evidência:** `cadastro.case_manager_atual(uuid)` `security definer`, consultada pela
  policy `crise_aprovacao_responsavel_atual` e por `api.plano_crise_operacao_privada`,
  ambas redefinidas de forma aditiva na mesma migração.

## 3. Banco — operação privada

- [x] 3.1 `operacao.substituicao_cm_privada(jsonb)` `security invoker` com as três ações
  (consultar, registrar, encerrar), auditoria obrigatória na mesma transação e negação
  gravando `auditoria.evento` com `resultado='negado'`.
- [x] 3.2 Wrapper `api.substituicao_case_manager_privado(jsonb)` `security definer
  set search_path='' set row_security=on`, sob owner dedicado
  `ffcmapp_substituicao_cm_owner` (`nologin nobypassrls noinherit`), com `grant select`
  por coluna e policies nomeadas, inclusive as `_lock` com `with check (false)`.
- [x] 3.3 Migração de grants de teste separada.
  **Evidência:** `supabase/migrations/20261126100100_grant_substituicao_cm_teste.sql`,
  que falha diante de ACL desconhecida e só libera EXECUTE do wrapper.

## 4. Servidor HTTP

- [x] 4.1 Handler fino atrás de flag desligada por padrão.
  **Evidência:** `netlify/functions/substituicao-case-manager.ts`
  (`ffcm.substituicao_cm.ativo` / `FFCM_SUBSTITUICAO_CM_ATIVO`).
- [x] 4.2 Trio entrada/composição/executor.
  **Evidência:** `netlify/functions/_shared/entrada-substituicao-cm-nativa.ts`,
  `compor-substituicao-cm-nativo.ts`, `executor-substituicao-cm-nativo.ts` e
  `substituicao-cm-nativa.ts`.
- [x] 4.3 Testes do servidor.
  **Evidência:** `netlify/functions/_shared/substituicao-cm-nativa.test.ts` — Profissional
  e Família negados antes do Vault, origem incorreta barrada antes da autorização, período
  invertido e caso não-UUID recusados na entrada.

## 5. Interface

- [x] 5.1 Seção que diz quem é o titular, quem substitui e até quando, com estados de
  carregamento, vazio, erro e sucesso e layout confortável no celular.
  **Evidência:** `web/substituicao-case-manager.ts`, `web/servico-substituicao-cm-http.ts`,
  bloco `.substituicao-cm` em `web/styles.css` e `web/substituicao-case-manager.test.ts`.
  O botão não é escondido de quem talvez não possa: a recusa do servidor é explicada.

## 6. Provas no banco

- [x] 6.1 `supabase/tests/substituicao_case_manager_local.sql`, executado por
  `scripts/testar-substituicao-case-manager-local.sh`, encadeando as migrações reais:
  substituta aprova dentro do período no caso substituído; é negada antes do início e
  depois do fim; é negada em outro caso, inclusive por INSERT direto sob o papel owner;
  titular continua podendo agir durante a substituição; encerramento antecipado nega o ato
  seguinte na hora; registro encerrado não reabre nem é apagado; só Administrador registra;
  substituir não concede `cadastro.acesso_paciente`; ACL exata para
  `authenticated`/`anon`/`service_role`.
- [x] 6.2 `supabase/tests/substituicao_case_manager_concorrencia_local.sql` com
  `scripts/testar-substituicao-case-manager-concorrencia-local.sh`: duas conexões reais, a
  segunda bloqueia no índice de exclusão e recebe `conflito`, sem deixar registro nem
  entrada de idempotência.

## 7. Pendências

- [x] 7.1 Motivo cifrado da substituição e do encerramento antecipado (19/11/2026).
  **Decisão:** motivo OBRIGATÓRIO nas duas ações. FR-037 pede motivo em toda alteração de
  acesso, e encerrar antes da hora também é alteração de acesso — é a que devolve a alçada ao
  titular. Deixá-lo opcional permitiria exatamente o registro que o requisito proíbe.
  **Migração:** editada a `20261126100000_substituicao_case_manager.sql`, não aditiva. Ela é
  desta entrega e nunca foi aplicada em ambiente algum; `motivo_cifrado` é `not null` e uma
  migração aditiva teria de aceitar coluna nula ou inventar um envelope de preenchimento,
  enfraquecendo o invariante. Tabela, gatilho, grants e a operação privada mudam juntos.
  **Evidência:** `cadastro.substituicao_case_manager.motivo_cifrado` (not null) e
  `motivo_encerramento_cifrado`, com checagem de forma do envelope; o
  `substituicao_cm_encerramento_completo_chk` passou a exigir as QUATRO colunas do
  encerramento; o gatilho `substituicao_cm_imutavel` recusa alterar `motivo_cifrado` e exige
  o motivo do encerramento na transição. Contrato, RPC, handler e tela:
  `packages/contracts/src/substituicao-case-manager.ts` (painel público já decifrado e painel
  privado com envelopes), `netlify/functions/_shared/substituicao-cm-nativa.ts` (cifra depois
  da autorização e antes do atestado; decifra a resposta), `web/substituicao-case-manager.ts`.
  **Testes:** `supabase/functions/_shared/cifra-substituicao-cm.test.ts` (7) — ida e volta dos
  dois campos, tabela/campo/registro/formato trocados recusados, envelope de uma substituição
  não decifra no contexto de outra, forma canônica campo a campo;
  `netlify/functions/_shared/substituicao-cm-motivo.test.ts` (4) — motivo gravado cifrado e
  devolvido decifrado, motivo do encerramento preservado ao lado do motivo do registro, recusa
  sem motivo antes do banco, envelope de outra linha derruba a resposta;
  `supabase/tests/substituicao_case_manager_local.sql` — registrar e encerrar sem motivo
  recusados, envelope de forma errada recusado, motivo de encerramento barrado no registro,
  motivo do registro imutável.
- [x] 7.2 Serviço montado em `web/main.ts`, com indisponibilidade honesta (19/11/2026).
  **Evidência:** rota de sondagem `/api/pacientes/substituicao-case-manager/disponibilidade`
  em `netlify/functions/substituicao-case-manager.ts`, no padrão de
  `netlify/functions/edicao-paciente.ts` (configuração ilegível fecha a disponibilidade em vez
  de estourar); contrato `substituicaoCaseManagerHttp.disponibilidade`; método
  `disponibilidade()` em `web/servico-substituicao-cm-http.ts`; `sondarSubstituicaoCm()` e
  `servicoSubstituicaoCm()` em `web/main.ts`, que passam `substituicao: null` quando a fatia
  está desligada. Com `null`, `montarSubstituicaoCaseManager` desenha a seção com título,
  explicação e o texto "ainda não está disponível neste ambiente" — sem formulário, sem botão
  e sem mensagem de erro. A sondagem falha fechada: qualquer erro vira indisponível.
  **Testes:** `web/substituicao-case-manager.test.ts` (9), incluindo o estado indisponível e os
  quatro estados (carregando, vazio, erro, sucesso); os 28 arquivos de interface que montam
  `main.js` passam inteiros (109 testes).
  **Achado:** `web/servico-substituicao-cm-http.ts` passava caminho relativo a `fetch`,
  diferente de `web/api.ts`, que usa `URL` absoluta. Corrigido para `new URL(..., location.origin)`.
- [ ] 7.3 Ativação remota: migrações não aplicadas, flag desligada, nada comitado.

## Achado de padrão — 19/11/2026

`cadastro.case_manager_atual(uuid)` é criada pelo papel migrador, não por um papel
`ffcmapp_*`, diferente de funções vizinhas como `cadastro.sinal_operacional_caso`, que nasce
sob `set role ffcmapp_sinal_operacional_owner`. Consequência: conceder `execute` sobre ela é
um `grant` direto do migrador — é o que esta migração faz na linha 110 para
`ffcmapp_plano_crise_owner`, e o que `20261126300000_avisos_no_app.sql` faz na linha 70 para
`ffcmapp_avisos_owner`.

Uma revisão independente apontou a segunda como divergência de padrão (P2). **Não procede**:
as duas formas de `grant` convivendo naquela migração refletem donos diferentes, e cada uma
está correta para o seu. O resíduo real é que esta fatia deixou a função sob o migrador em
vez de um papel próprio. Funciona porque o conjunto de migrações é aplicado por um único
papel, e mudar o dono agora exigiria refazer o `grant` do plano de crise e reprovar a policy
`crise_aprovacao_responsavel_atual`, que é trilha de cuidado já provada. Alinhar o dono fica
para quando essa trilha for tocada por outro motivo.
