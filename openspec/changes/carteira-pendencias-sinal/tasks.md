# Tarefas — carteira filtrável, pendências e sinal operacional

## 1. Domínio e contrato

- [x] 1.1 Modelar pendência, tratativa, acordo e sinal operacional.
  **Evidência:** `packages/contracts/src/pendencia.ts`. `sinalCarteiraSchema.motivos` é
  `min(1)`: FR-026 exige motivo visível e o contrato não permite sinal sem motivo, nem
  para "em dia". `tratarPendenciaSchema` tem `refine` correlacionando `acao === 'atribuida'`
  com a presença de destinatário.
  **Prova:** `npx vitest run web/pendencias-caso.test.ts` exercita os schemas pela tela.
- [x] 1.2 Contrato HTTP isolado, sem tocar o `rotas.ts` compartilhado.
  **Evidência:** `packages/contracts/src/pendencia-http.ts`, no mesmo padrão de
  `saude-http.ts`. As três rotas devolvem o sinal recalculado, para que a tela não
  desenhe estado que ela mesma inferiu.
- [x] 1.3 Filtros e sinal no contrato da carteira.
  **Evidência:** `filtrosCarteiraSchema` e `pacienteListaSchema.sinal` em
  `packages/contracts/src/cadastro.ts`; `pacienteListaRpcSaidaSchema` e
  `filtrosCarteiraRpcSchema` em `packages/contracts/src/rpc.ts`.
  **Prova:** `npx tsc --noEmit -p packages/contracts` — saída 0.

## 2. Banco

- [x] 2.1 Tabelas da periodicidade acordada e da tratativa, imutáveis.
  **Evidência:** `supabase/migrations/20261118300000_sinal_operacional_caso.sql` —
  `cadastro.acordo_acompanhamento` e `cadastro.pendencia_tratativa`, RLS ligada,
  `revoke all` dos quatro papéis, triggers que recusam UPDATE, DELETE e TRUNCATE.
  **Prova:** `sh scripts/testar-pendencia-operacoes-local.sh` — saída 0. Os dois últimos
  blocos tentam `update` na tratativa e `delete` no acordo e exigem `REGISTRO_IMUTAVEL`.
- [x] 2.2 Derivador único do sinal, sob owner dedicado e sem acesso a conteúdo cifrado.
  **Evidência:** `cadastro.sinal_operacional_caso(uuid)` na mesma migration, owner
  `ffcmapp_sinal_operacional_owner` com `select` apenas de `paciente_id`/`criado_em` das
  nove tabelas de versão e `etapa` do encaminhamento.
  **Prova:** `pendencia_operacoes_local.sql` falha com `OWNER_NAO_ISOLADO` se o owner
  enxergar `conteudo_cifrado` de saúde ou de tarefa, e `carteira_filtros_local.sql` falha
  com `ALCANCE_INDEVIDO_DO_DERIVADOR` se `authenticated` alcançar o `execute` ou se a
  carteira alcançar as tabelas diretamente.
- [x] 2.3 Operação privada com atestado, trava, idempotência e auditoria obrigatória.
  **Evidência:** `supabase/migrations/20261118310000_pendencia_caso_operacoes_privadas.sql`
  — `api.pendencia_operacao_privada(jsonb)` sob `ffcmapp_pendencia_owner`, três ações,
  verificação de assinatura antes de qualquer leitura, `for share` em usuário, concessão,
  sessão e `acesso_paciente`, `operacao.requisicao` como registro de idempotência e
  `auditoria.evento` em todos os caminhos, inclusive nos negados.
  **Prova:** `sh scripts/testar-pendencia-operacoes-local.sh` — saída 0. Positivos:
  leitura sem acordo devolve `informacao_insuficiente`; gravar acordo gera duas pendências
  abertas; reenvio da mesma chave devolve `repeticao` sem criar segunda versão; tratativa
  aplica e a origem continua intacta; atribuição a colaborador ativo aparece na pendência;
  atualização nova muda a chave de origem e a pendência some; encaminhamento parado há 40
  dias com acordo de 21 vira pendência. Negativos: mesma chave com entrada diferente dá
  `conflito_idempotencia`; versão defasada dá `conflito`; atribuir a usuário desconhecido
  dá `ENTRADA_INVALIDA`; Profissional não grava acordo; sessão encerrada, perfil `familia`
  e `acesso_paciente` revogado dão `sem_permissao`; MAC falso é recusado com
  `insufficient_privilege`; identidade Auth sem perfil fica auditada sem criar usuário.
- [x] 2.4 Grant do wrapper pelo padrão `SET ROLE <owner>`.
  **Evidência:** `supabase/migrations/20261118320000_grant_pendencia_teste.sql`, com as
  guardas `WRAPPER_INESPERADO` e `ACL_INICIAL_INESPERADA`.
  **Prova:** o teste confirma `execute` só para `authenticated`, nunca para `anon` ou
  `service_role`, e que `cadastro.sinal_operacional_caso` continua fora do alcance de
  `authenticated` mesmo depois do grant.
- [x] 2.5 Carteira filtrável no banco, com sinal por item.
  **Evidência:** `supabase/migrations/20261118330000_carteira_filtros_sinal.sql` redefine
  `identidade.listar_carteira_privada`. Filtro fora da lista ou nome desconhecido é
  recusado; `responsavel`/`situacao` pedidos fora do ramo do Administrador levantam
  `ENTRADA_INVALIDA`.
  **Prova:** `sh scripts/testar-carteira-filtros-local.sh` — saída 0. Cobre os quatro
  filtros, a combinação que deve devolver lista vazia, filtro desconhecido, valor fora da
  lista, paginação com filtro sem repetir item, o ramo do Profissional sem `situacao` nem
  `responsavel_usuario_id` e com os dois filtros recusados, e sessão encerrada.

## 3. Rota e composição

- [x] 3.1 Rota atrás de flag desligada por padrão.
  **Evidência:** `netlify/functions/pendencias.ts` — `FFCM_PENDENCIAS_ATIVADAS`, mais a
  rota de disponibilidade no padrão de `saude.ts`.
- [x] 3.2 Composição com atestado assinado no servidor e idempotência.
  **Evidência:** `netlify/functions/_shared/pendencia-nativa.ts`,
  `compor-pendencia-nativa.ts`, `entrada-pendencia-nativa.ts`,
  `executor-pendencia-nativo.ts`. `autorizar()` roda antes e depois da RPC; origem
  divergente numa escrita devolve `entrada_invalida`, como em `concessoes-equipe.ts`;
  corpo limitado a 4 KiB antes de decodificar.
  **Nota:** esta fatia não cifra nada, de propósito — acordo, tipo, chave de origem e ação
  são estado operacional e precisam ser filtráveis no banco, como
  `acompanhamento_caso.situacao` e `encaminhamento_versao.etapa`.
- [x] 3.3 Leitura dos filtros da carteira em um lugar só.
  **Evidência:** `netlify/functions/_shared/consulta-carteira.ts`, usado tanto pela
  preparação do atestado (`carteira-nativa.ts`) quanto pelo handler
  (`carteira-handler-nativo.ts`), que antes tinham cópias separadas da regra.
  `preparar-carteira-experimental.ts` compara o filtro assinado com o pedido.
  **Prova:** `npx vitest run netlify/functions/_shared/consulta-carteira.test.ts` — 6
  testes. Cobre os quatro filtros, consulta sem filtro, filtro desconhecido, valor fora da
  lista, parâmetro repetido e o literal `nenhum`.

## 4. Interface

- [x] 4.1 Tela de pendências do caso.
  **Evidência:** `web/pendencias-caso.ts` — estado do sinal com o aviso de FR-028, lista
  em aberto e resolvidas separadas, ações reconhecer/atribuir/resolver/reabrir, editor da
  periodicidade só para quem o servidor autoriza. Estados de carregamento, vazio, erro e
  sucesso; `role="status"` no aviso e `role="alert"` no erro do formulário.
  **Prova:** `npx vitest run web/pendencias-caso.test.ts` — 7 testes. Cobre que resolver
  mantém a origem listada e oferece reabrir, que atribuir só lista pessoa ativa, que sem
  acordo o estado é "informação insuficiente" e nunca "em dia", que o formulário some para
  quem não pode gravá-lo, e que acordar envia a versão vigente com periodicidade em branco.
- [x] 4.2 Barra de filtros da carteira e selo do sinal.
  **Evidência:** `web/filtros-carteira.ts`. `responsavel` e `situacao` só aparecem para o
  Administrador; o selo carrega motivo visível, `title` e texto `sr-only` com o aviso de
  FR-028, para que o aviso não dependa de caber na linha da lista.
  **Prova:** coberto pelos dois últimos testes de `web/pendencias-caso.test.ts`.
- [x] 4.3 Serviço HTTP da fatia.
  **Evidência:** `web/servico-pendencias-http.ts`, derivado de `servico-saude-http.ts`:
  confere que a identidade não trocou antes e depois da chamada, limita o corpo lido e
  exige `x-fluxo` coerente com o modo de acesso.
- [x] 4.4 FR-006: pendências, próxima revisão e mudanças recentes com fonte real.
  **Evidência:** bloco `pendencias` em `web/visao-caso.ts`, alimentado pelo mesmo sinal.
  Mostra o estado com o aviso de FR-028, a próxima revisão acordada, as pendências abertas
  com motivo, e usa `ultima_atualizacao_em` como a data de "mudanças recentes".
  **Prova:** `npx vitest run web/visao-caso.test.ts` — 22 testes com os demais arquivos
  afetados, todos passando.
  **Nota:** a seção "Ainda sem fonte nesta versão" já havia sido removida por outra frente
  antes desta entrega; o que faltava era a fonte, não o texto.

## 5. Verificação

- [x] 5.1 `pnpm run verificar:rapido`.
  **Resultado:** `lint` passa. `typecheck` falha, mas **somente** em arquivos de outras
  frentes que estavam em andamento no mesmo worktree:
  `netlify/functions/_shared/compor-solicitacao-titular-nativa.ts`,
  `netlify/functions/_shared/solicitacao-titular-nativa.ts` e
  `netlify/functions/_shared/transcricao-nativa.test.ts`.
  **Prova de que os arquivos desta fatia estão limpos:** `npx tsc --noEmit -p
  packages/contracts`, `-p packages/cadastro` e `-p web` saem com 0; `npx tsc --noEmit -p
  netlify` não acusa nenhuma linha em `pendencias.ts`, `pendencia-nativa.ts`,
  `compor-pendencia-nativa.ts`, `entrada-pendencia-nativa.ts`,
  `executor-pendencia-nativo.ts`, `consulta-carteira.ts`, `carteira-nativa.ts` ou
  `carteira-handler-nativo.ts`.
- [x] 5.2 Suítes afetadas.
  **Resultado:** `netlify/functions/_shared` 376 passando; `packages/cadastro` 137
  passando; `web/visao-caso.test.ts`, `web/paginacao-pacientes.test.ts` e
  `web/lista-pacientes.test.ts` 22 passando; `web/pendencias-caso.test.ts` 7 passando.
  `packages/contracts` tem 1 falha pré-existente em `contratos-internos.test.ts`, causada
  por rotas de outras frentes (`consultarRegrasAtendimento`, `listarConfiguracaoSistema`,
  `consultarDiario` e outras) adicionadas a `contratosRotas` sem RPC correspondente. Esta
  fatia não acrescenta rota a `contratosRotas`.

## Limitações registradas

- **FR-007 (linha do tempo pesquisável) não foi entregue.** Continua existindo só como
  mock em `web/linha-tempo-local.ts`. Ver `design.md`, seção 7: é fatia inteira, e a
  distinção entre acontecimento, registro e retificação depende do diário (FR-012), que
  está sendo entregue em paralelo.
- **Atraso de tarefa não é derivado no banco.** O prazo está dentro do envelope cifrado. O
  tipo `tarefa_atrasada` existe no modelo e aceita tratativa; a detecção precisa acontecer
  no cliente da ficha, que já decifra a tarefa. Essa ligação **ainda não foi feita**.
- **As migrations não foram aplicadas remotamente** e `FFCM_PENDENCIAS_ATIVADAS` continua
  desligada. Nada desta fatia está exposto em produção.
- **`web/main.ts` e `web/index.html` não foram tocados**, por haver outras frentes neles
  no mesmo worktree. Sem a ligação, as telas novas existem mas não aparecem. Os trechos
  de ligação estão no relatório de entrega.
- **`supabase/tests/situacao_na_lista_local.sql` ficou desatualizado** em um ponto: ele
  afirma que `ffcmapp_carteira_owner` não lê `responsavel_usuario_id`, o que deixou de ser
  verdade (FR-026 exige filtrar por responsável). Esse teste não inclui a migration nova,
  então não quebra; `carteira_filtros_local.sql` registra a fronteira nova.
- O custo da carteira com filtro de revisão ou pendência é avaliar o sinal de todos os
  casos visíveis. Aceitável no volume atual, documentado na migration, não medido sob
  carga.
