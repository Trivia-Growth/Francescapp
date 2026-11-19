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
- [x] 1.3 Nenhum AAD novo.
  **Evidência:** a fatia não cifra campo algum; `cifra-autenticada.ts` e a união
  `MetadadosAad` ficam intocadas.

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

- [ ] 7.1 Campo de motivo da substituição, quando o AAD compartilhado puder receber a
  tabela nova (`supabase/functions/_shared/cifra-autenticada.ts` está fora desta onda).
- [ ] 7.2 Passar o serviço em `web/main.ts` quando a flag for ligada. A costura já existe:
  `ServicoEdicaoPaciente.substituicao` é opcional e `montarEdicaoPaciente` só desenha a
  seção quando ele é informado. Enquanto a rota responde 503 por flag desligada, informar
  o serviço só mostraria erro de carregamento ao Administrador. Falta também uma rota de
  disponibilidade como a de `plano-crise`, para a tela saber distinguir fatia desligada de
  serviço fora do ar.
- [ ] 7.3 Ativação remota: migrações não aplicadas, flag desligada, nada comitado.
