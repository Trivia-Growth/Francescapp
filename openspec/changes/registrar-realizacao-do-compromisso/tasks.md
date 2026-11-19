# Tarefas — registrar a realização do compromisso (FR-024)

## 1. Domínio e contrato

- [x] 1.1 Modelar as situações registráveis e os dois estados derivados, sem permitir
  gravar "realização não confirmada".
  **Evidência:** `packages/contracts/src/realizacao-compromisso.ts`;
  `situacaoRegistravelSchema` tem quatro valores e `situacaoApresentadaSchema` acrescenta
  `realizacao_nao_confirmada` e `agendado` só na saída.
- [x] 1.2 Catálogo fechado de barreiras, sem diagnóstico de risco.
  **Evidência:** `motivoBarreiraSchema` (transporte, custo, disponibilidade, outras) e o
  CHECK homônimo em `supabase/migrations/20261126120000_realizacao_compromisso.sql`.
  **Limitação deliberada:** não há "outro motivo" estruturado nem subcategoria. Ampliar o
  catálogo é decisão de negócio, não de código.
- [x] 1.3 Contrato HTTP isolado, sem tocar o `rotas.ts` compartilhado.
  **Evidência:** `packages/contracts/src/realizacao-compromisso-http.ts`, no padrão de
  `plano-crise-http.ts`.
- [x] 1.4 Registrar o AAD da observação livre.
  **Evidência:** `metadadosAadRealizacaoCompromissoSchema` em
  `packages/contracts/src/rpc.ts` e o ramo novo em
  `supabase/functions/_shared/cifra-autenticada.ts`.
  **Nota de integração:** os dois arquivos são compartilhados; a alteração é aditiva (um
  membro novo na união, um `if` novo antes dos existentes, nenhum ramo alterado).

## 2. Banco

- [x] 2.1 Tabela append-only por evento, com situação, motivo, observação cifrada, autor,
  instante, versão e auditoria.
  **Evidência:** `cadastro.realizacao_compromisso` em
  `supabase/migrations/20261126120000_realizacao_compromisso.sql`; gatilho
  `realizacao_compromisso_imutavel` recusa UPDATE e DELETE.
- [x] 2.2 Vínculo entre datas com restrição de banco contra cadeia incoerente.
  **Evidência:** `realizacao_destino_apenas_remarcado_chk`,
  `realizacao_destino_distinto_chk` e `realizacao_destino_formato_chk`.
- [x] 2.3 Impedir dois registros vigentes contraditórios.
  **Evidência:** `unique (usuario_id, subject_google, evento_id, versao)` e a prova de duas
  conexões em `scripts/testar-realizacao-compromisso-concorrencia-local.sh`.
- [x] 2.4 Derivação de "realização não confirmada" por desenho.
  **Evidência:** `cadastro.realizacao_situacao_derivada(text, timestamptz, timestamptz)`,
  que nunca devolve `faltou` a partir de ausência de registro; prova no bloco
  `DERIVACAO_PRODUZIU_FALTA` de `supabase/tests/realizacao_compromisso_local.sql`.
- [x] 2.5 Migração separada de grants de teste.
  **Evidência:** `supabase/migrations/20261126120100_grant_realizacao_compromisso_teste.sql`,
  no molde de `20261125100000_grant_turno_execucao_teste.sql`.

## 3. Operação privada

- [x] 3.1 `operacao.realizacao_compromisso_privada(jsonb)` `security invoker` e wrapper
  `api.realizacao_compromisso_privado(jsonb)` `security definer`, sob owner dedicado
  `ffcmapp_realizacao_compromisso_owner` (`nologin nobypassrls noinherit`, sem membros).
  **Evidência:** mesma migração; policies `realizacao_*` e pares `_lock`.
- [x] 3.2 Auditoria obrigatória na mesma transação, inclusive na negação.
  **Evidência:** todo caminho de retorno insere em `auditoria.evento` e falha com
  `AUDITORIA_NAO_INSERIDA` se a inserção não ocorrer; provas `AUDITORIA_AUSENTE` e
  `AUDITORIA_NEGADA_AUSENTE`.
- [x] 3.3 `subject_google` nunca vem do cliente.
  **Evidência:** a operação lê a concessão vigente do dono da agenda; a chave não está na
  lista de campos aceitos da entrada.

## 4. Audiência

- [x] 4.1 **SUPOSIÇÃO CONSERVADORA (não decidida pelo solicitante):** registram e leem o
  dono daquela agenda individual e o Administrador; Família não registra e não lê; outro
  profissional não alcança agenda alheia.
  **Evidência:** `design.md`, seção "Audiência"; policies `realizacao_select` /
  `realizacao_insert`; provas `OUTRO_LEU`, `OUTRO_ESCREVEU`,
  `OUTRO_ENXERGOU_AGENDA_ALHEIA`, `FAMILIA_LEU`, `FAMILIA_ESCREVEU`, `ADMIN_NEGADO`.
- [x] 4.2 A situação não revela o paciente vinculado.
  **Evidência:** a tabela não tem `paciente_id`; o owner não recebe privilégio em
  `cadastro.paciente` nem em `cadastro.acesso_paciente` (prova `OWNER_ALCANCA_O_CASO`) e a
  resposta é conferida contra o identificador do paciente (prova
  `SITUACAO_REVELOU_PACIENTE`).

## 5. HTTP e interface

- [x] 5.1 Handler fino com flag própria, independente da integração Google.
  **Evidência:** `netlify/functions/realizacao-compromisso.ts`
  (`ffcm.realizacao_compromisso.ativo`, desligada por padrão) e o trio
  `entrada-` / `compor-` / `executor-realizacao-compromisso-nativo.ts`.
- [x] 5.2 Composição com cifra, atestado e idempotência; sem autorização própria.
  **Evidência:** `netlify/functions/_shared/realizacao-compromisso-nativo.ts`.
- [x] 5.3 Situação e ação de registrar na agenda individual, com "realização não
  confirmada" para compromisso passado sem registro.
  **Evidência:** `web/realizacao-compromisso.ts`,
  `web/servico-realizacao-compromisso-http.ts` e a integração em
  `web/agenda-individual.ts`; estados de carregamento, vazio, erro e sucesso cobertos em
  `web/realizacao-compromisso.test.ts`.

## 6. Provas executadas

- [x] 6.1 `LC_ALL=C sh scripts/testar-realizacao-compromisso-local.sh` — saída 0,
  "realizacao do compromisso (FR-024): provas locais concluidas".
- [x] 6.2 `LC_ALL=C sh scripts/testar-realizacao-compromisso-concorrencia-local.sh` —
  saída 0, "bloqueio observado…" e "versao vigente duplicada recusada pelo banco em duas
  conexoes".
- [x] 6.3 `pnpm exec vitest run web/realizacao-compromisso.test.ts` — 7 testes passam.
- [x] 6.4 `pnpm exec vitest run web/agenda-consentimento.test.ts` — 5 testes passam
  (cobre `web/agenda-individual.ts`, alterado aqui).
- [x] 6.5 `pnpm exec vitest run packages/contracts/test/contratos-internos.test.ts
  supabase/functions/_shared/cifra-autenticada.test.ts` — 77 testes passam (arquivos
  compartilhados alterados).
- [x] 6.6 `pnpm exec openspec validate registrar-realizacao-do-compromisso --strict` — válido.

## 7. Pendências declaradas

- [ ] 7.1 Confirmar a audiência com o solicitante. Se a case manager do caso também
  registrar, mudam as policies, a operação e as provas positivas/negativas.
- [ ] 7.2 Login por exceção técnica (`metodo = 'tecnica'`) não foi admitido nesta operação;
  só `google_workspace`. Se o Administrador precisar registrar por esse caminho, é mudança
  de escopo com prova própria.
- [ ] 7.3 Ativação remota: migrations não aplicadas, flag desligada, nada comitado.
- [ ] 7.4 O destino da remarcação não é verificado no Google: o produto não é dono do
  compromisso e não pode afirmar, no banco, o que existe na agenda alheia.
- [ ] 7.5 Ciclo entre dois eventos não é impedido pelo banco. Achado da revisão independente
  de 19/11/2026: os CHECKs cobrem destino fora de remarcação, remarcação sem destino e
  destino igual à origem, mas não a contradição A remarcado para B com B remarcado para A.
  A correção sugerida na revisão — um `CHECK` com subconsulta — **não é válida no
  PostgreSQL**, que proíbe subconsulta em `CHECK`; o caminho real seria gatilho de
  validação. Não implementado de propósito: nenhum consumidor percorre a cadeia
  recursivamente (`web/realizacao-compromisso.ts:41-44` lê um nível só, imprimindo destino e
  origens), então não há laço nem estado inconsistente observável hoje, e `AGENTS.md` pede
  ameaça concreta antes de acrescentar camada. Reabrir se algum consumidor passar a
  percorrer a cadeia ou se a operação relatar remarcação circular.
