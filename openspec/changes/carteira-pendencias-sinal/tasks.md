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

## FR-007 — Linha do tempo do caso (12/11/2026)

Esta fatia tinha ficado de fora da passagem anterior por depender do diário para distinguir
acontecimento, registro e retificação. O diário fechou (`20261118200000`–`230000`) e a
dependência caiu.

**Entregue.** `20261120300000_linha_tempo_caso.sql` cria o papel dono
`ffcmapp_linha_tempo_owner` e `cadastro.linha_tempo_caso(...)`, que deriva a linha do tempo
das doze fontes a cada leitura — nenhuma tabela nova, nenhum gerador, no mesmo desenho de
`cadastro.sinal_operacional_caso`. Cada VERSÃO é um item, então "a versão anterior continua
existindo" (FR-012) aparece sem esforço adicional. `20261120310000` expõe
`api.linha_tempo_operacao_privada` com as duas trilhas de autorização já provadas
(colaborador por Google Workspace, familiar por `acesso_paciente` + sessão `familia` + amr
`password`), nenhuma relaxada, mais o recorte por `acesso_paciente` do Profissional travado
na transação. `20261120320000` libera só o wrapper; o derivador nunca é liberado.

`tipo_evento` distingue `registro`, `atualizacao`, `retificacao` e `rascunho`.

**Evidência.** `sh scripts/testar-linha-tempo-local.sh` → `NOTICE: LINHA_TEMPO_OK`
(PostgreSQL descartável, `supabase/tests/linha_tempo_caso_local.sql`). Positivos: nove itens
para o profissional com acesso, ordem decrescente por registro, versão anterior preservada
após retificação, filtros de fonte/autor/período, paginação por cursor sem repetir nem pular
item, administrador sem vínculo individual alcançando o caso. Negativos: rascunho alheio
invisível para outro profissional; família vê só diário `equipe_e_familia`
publicado/retificado, o que ela mesma escreveu e documento `equipe_e_familia`, e **nenhuma
outra fonte nem como metadado**; família de outro caso negada com auditoria de negativa;
documento removido fora da lista; revogação de acesso fechando na hora; sessão encerrada;
MAC falso; quem autentica sem perfil auditado por `ator_auth_id` sem criar usuário. O teste
também afirma que nenhum dos dois owners tem privilégio sobre coluna cifrada de fatia
alguma.

**Limitação material, registrada e não disfarçada.** FR-007 pede busca por "período, tipo de
registro, autor, área, objetivo e pendência". Entregues: período (de REGISTRO), tipo, autor
e pendência. **Área e data de acontecimento só existem em claro onde a fatia de origem os
pôs em claro** — hoje, `documento_caso_versao.categoria` e `data_documento`. No diário, a
data do acontecimento e a categoria viajam dentro do envelope cifrado por decisão registrada
em `20261118200000`, e o banco não as vê. Pôr essas duas em claro ampliaria o que o banco
sabe sobre o caso e **reverteria uma decisão de outra fatia**: é decisão do solicitante, não
deste derivador. Enquanto isso, `aconteceu_em` vem nulo e a tela diz que a data está no
conteúdo, em vez de apresentar a data de registro como se fosse a do acontecimento. Filtro
por objetivo só alcança a fonte `objetivo`; as demais fontes não têm vínculo com objetivo em
claro. Os filtros de área e objetivo **não são oferecidos na interface**, para não dar a
impressão de cobertura que não existe.

**Não entregue.** Migrations não aplicadas remotamente; `FFCM_LINHA_TEMPO_ATIVA` fixa em
`false` no código; sem revisão independente de dois eixos; sem prova em navegador;
`web/main.ts`, `web/index.html` e `web/styles.css` não tocados (outra frente neles), então a
tela existe e ainda não aparece — o trecho de ligação está no relatório de entrega. Faltam
estilos para `.secao-linha-tempo` e `.linha-tempo__*`.

## FR-032 / FR-033 — Exportação de caso (12/11/2026)

**Modelo de ameaça antes do desenho**, porque a exportação é fronteira de confiança. O
caminho de abuso central é concentrar a decifragem: se a exportação decifrasse conteúdo de
todas as fatias num só componente, esse componente passaria a poder ler o caso inteiro de
qualquer paciente — o poder que a arquitetura distribuiu de propósito. **Mitigação: esta
fatia não decifra nada.** O servidor autoriza, deriva o MANIFESTO (que itens entram, com
autoria e datas) e registra; o artefato é montado no navegador, onde o texto claro já existe
para aquele leitor e só do que ele pode ver. O teste afirma a ausência de privilégio do
owner sobre `conteudo_cifrado` das dez tabelas de versão e sobre o próprio destinatário e
propósito que ele grava.

Segundo caminho: exportação como canal lateral de audiência. "Identificar conteúdo
indisponível" (FR-032) **não** vira "existem N itens que você não pode ver": o que a
audiência exclui é descartado na derivação e não é contado; `indisponivel` é estado de
documento (FR-029) ou anexo não recuperado, e o vocabulário é fechado — o teste falha se
aparecer motivo fora da lista. Terceiro: elegibilidade divergir da leitura comum —
eliminado por construção, porque o manifesto sai da **mesma** `cadastro.linha_tempo_caso`.
Quarto: identificador do Drive no pacote — ele é capacidade, continua cifrado e fora daqui.
Quinto: exportação sem rastro — destinatário e propósito são gravados ANTES de o manifesto
ser devolvido.

**Entregue.** `20261120330000_exportacao_caso.sql` (três tabelas append-only com trigger que
recusa UPDATE/DELETE/TRUNCATE: a exportação, seus itens e os atos de entrega/conferência de
FR-033), `20261120340000` (`api.exportacao_operacao_privada` com `registrar`, `confirmar` e
`listar`, idempotência no ledger e auditoria nos dois caminhos) e `20261120350000` (grant).
Destinatário, propósito e observação são cifrados **no servidor** com AAD próprio, campo a
campo (`metadadosAadExportacaoSchema` em `rpc.ts`, ramo próprio em `cifra-autenticada.ts`),
para que o envelope do destinatário não seja aceito no lugar do do propósito.

**Evidência.** `sh scripts/testar-exportacao-local.sh` → `NOTICE: EXPORTACAO_OK`. Positivos:
manifesto com autoria e datas preservadas, data de acontecimento onde ela existe em claro,
conteúdo indisponível identificado com motivo, destinatário e propósito gravados cifrados,
idempotência (replay devolve a mesma exportação), entrega e conferência registradas.
Negativos: rascunho alheio fora do manifesto; documento removido fora; profissional
vinculado recusado com auditoria de negativa e sem criar exportação; família recusada;
listar outro caso não traz a exportação do primeiro; confirmar entrega de exportação de
outro caso é entrada inválida; mesmo ato duas vezes recusado; UPDATE e DELETE na trilha
recusados; chave de idempotência repetida com entrada diferente é conflito.

**Dúvidas materiais devolvidas ao solicitante — não decididas aqui.**
1. **Quem pode exportar.** FR-032 diz "exportação autorizada" sem fixar por quem.
   Implementado como **administrador apenas**, a leitura mais restritiva, alinhada ao
   precedente de FR-040. Abrir ao profissional vinculado é trocar o bloco marcado
   `ESCOPO_PERFIL` em `20261120340000` e acrescentar a trava de `acesso_paciente`.
2. **FR-033: "preservar dados de terceiros e conteúdo profissional que demande tratamento
   específico".** "Preservar" pode significar excluir do pacote ou manter com proteção —
   isso determina o que o artefato contém e não foi decidido.
3. **Formato "consultável"** de FR-033 não está fixado na spec.
4. **Quem confere a entrega** em FR-033 e o que conta como conferência.

**Não entregue.** Migrations não aplicadas remotamente; `FFCM_EXPORTACAO_ATIVA` fixa em
`false`; a montagem do arquivo no navegador (a tela registra e lista; gerar o artefato a
partir do manifesto depende da decisão 3 acima); sem revisão independente; sem prova em
navegador; sem ligação em `web/main.ts`. Faltam estilos para `.secao-exportacao` e
`.exportacao__*`.

## Decisões do solicitante de 12/11/2026 aplicadas (FR-007, FR-032, FR-033)

**1. Data do acontecimento e área do diário em claro.** Reversão parcial da decisão de
11/11/2026 registrada em `20261118200000`, cujo comentário foi atualizado no próprio arquivo
para ninguém reconstituir a decisão antiga por engano. `20261120360000` acrescenta as
colunas `aconteceu_em` e `area` e refaz `api.diario_operacao_privada` para recebê-las em
claro ao lado do envelope — o banco não consegue extraí-las de dentro do ciphertext, então
quem as informa é o servidor, antes de cifrar. **O limite é exatamente esse**: texto do
relato, justificativa da retificação, descrição, contexto, ação tomada e síntese continuam
cifrados. `20261120370000` refaz o derivador para lê-las e ganhar os filtros por área e
objetivo; `20261120380000` refaz o wrapper para aceitá-los. Com isso `aconteceu_em` deixa de
vir nulo e o filtro por área passa a ser real; a tela oferece as áreas que apareceram no
acervo carregado, porque o vocabulário é configurado pela equipe, e esconde o seletor
enquanto não houver nenhuma. O aviso que dizia que a data estava no conteúdo saiu.

A assinatura antiga do derivador é apagada em `20261120370000`: manter as duas conviveria
com um caminho que ignora silenciosamente os filtros novos.

**2. Exportação passa a ser do Administrador e da profissional do caso.** Bloco
`ESCOPO_PERFIL` trocado em `20261120390000`. A profissional precisa de `acesso_paciente`
vigente travado na mesma transação — exportar não pode ser mais frouxo que ler.

**3. FR-033, dados de terceiros.** Entram com o mínimo identificável: papel e primeiro nome.
Sem contato, anotação, documento ou campo livre. Como esses nomes vivem dentro do envelope e
**a fatia continua não decifrando nada no servidor** (controle central da exportação, não
afrouxado), a redução acontece no navegador junto da montagem do pacote. O banco guarda só
`cadastro.exportacao_caso.terceiros_reduzidos`: a declaração de QUE houve omissão, nunca de
O QUE foi omitido. A tela mostra a declaração.

**Evidência.** `sh scripts/testar-linha-tempo-local.sh` → `LINHA_TEMPO_OK`,
`testar-exportacao-local.sh` → `EXPORTACAO_OK`, `testar-diario-operacoes-local.sh` saída 0.
`pnpm run verificar:rapido` verde, `vitest run web packages/contracts` 75 arquivos / 496
testes, `build:web` com os módulos no bundle. Asserções novas, nenhuma enfraquecida: data e
área do diário aparecem na linha do tempo e versão sem data continua nula; filtro por área
recorta, área inexistente devolve lista vazia honestamente e área malformada é entrada
inválida; a assinatura antiga do derivador não sobrevive e a nova não é alcançável por
`anon`/`authenticated`/`service_role`; profissional do caso exporta, profissional com
vínculo revogado é recusada e auditada sem criar exportação; a declaração de terceiros é
`false` sem fonte de terceiros e `true` com uma, e o owner da exportação não tem privilégio
sobre `conteudo_cifrado` da rede. No teste do diário, um bloco novo fixa o limite da
reversão e **quebra de propósito** se alguém puser outro campo em claro.

Fixture dividida em `linha_tempo_fixture_local.sql` + `linha_tempo_area_local.sql`: a ordem
das migrations importa, porque `20261120370000` apaga a assinatura que `20261120340000`
ainda concede, e encadear o teste inteiro inverteria essa ordem.

**Continuam pendentes de decisão do solicitante, não escolhidas aqui:** o formato
"consultável" de FR-033 e quem confere a entrega. A estrutura aceita os dois atos
(`entregue`, `conferida`) sem fixar quem os pratica além do escopo de perfil acima.

**Não entregue.** Migrations não aplicadas remotamente; `FFCM_LINHA_TEMPO_ATIVA` e
`FFCM_EXPORTACAO_ATIVA` fixas em `false`; a montagem do arquivo no navegador depende do
formato, ainda não decidido; sem revisão independente de dois eixos; sem prova em navegador.
