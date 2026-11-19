# Frentes abertas retomadas — 19/11/2026

Continuação do trabalho descrito em `entrega-complementar-19-11-2026.md`, que
permanece válido para o estado anterior. Base desta retomada: `e07daaa`.
Branch `fatia7/turno-execucao-cuidado`, PR 18 em draft. **Nada foi publicado,
empurrado ou aplicado remotamente.**

## O que foi pedido

Retomar, na melhor sequência, as três frentes que estavam expressamente fora da
noite anterior — financeiro, PWA/avisos e migração para Edge Functions — mais as
lacunas de specs que já tinham código parcial: FR-037, FR-024 e FR-033.

## Decisões do solicitante tomadas em 19/11/2026

1. **FR-037** — durante o período, a substituta é a "case manager atual" **daquele
   caso**, inclusive para aprovar plano de crise (FR-020). Nunca alcança a carteira
   inteira nem outro caso. Fora do período o titular volta a ser o atual
   automaticamente.
2. **FR-024** — a situação de realização vive em **tabela local própria chaveada
   pelo evento**. O compromisso continua no Google Calendar; o produto não vira
   dono dele, e a prova local roda com a integração desligada.
3. **Edge Functions** — operação externa autorizada (criar funções no projeto
   Supabase, mover segredos, alterar a publicação).
4. **Financeiro e PWA** — liberada a implementação suspensa desde 17/11/2026.

## Modelo de implementação

`AGENTS.md` indica Sol para as frentes de implementação. **Sol não está disponível
nesta ferramenta de subagentes**, que oferece sonnet/opus/haiku/fable. Isso foi
informado antes de substituir, conforme a regra, e as frentes correram em Opus com
arquivos exclusivos por agente e revisão independente por fatia.

Concorrência limitada a duas frentes de implementação por vez, de propósito:
`verificar:rapido` roda lint e typecheck sobre o repositório inteiro, então mais
agentes simultâneos produzem falhas falsas uns dos outros. Isso de fato ocorreu e
está registrado nos relatórios das frentes.

## Entregue

| Commit | Fatia |
|---|---|
| `80085f4` | FR-033 — bytes dos anexos no pacote de encerramento |
| `f8ee061` | FR-037 — substituição temporária da case manager |
| `b21a151` | FR-024 — realização do compromisso, com motivo e vínculo entre datas |
| `c6c9b15` | FR-068/069/070 — audiência financeira, despesa e apuração no banco |
| `ec83a47` | Alívio das rotas `concessoes-equipe` e `acesso-paciente` |
| `5c40506` | Preparação local da migração para Edge Functions |
| `08ad3ab` | Financeiro pela interface, ramo de cifra e avisos no aplicativo |
| `1ccbbf7` | Aplicativo instalável com casca offline |

Duas mudanças OpenSpec novas foram criadas, ambas válidas em `--strict`:
`substituicao-temporaria-case-manager` e `registrar-realizacao-do-compromisso`.
Nenhuma delas existia: FR-037 e FR-024 estavam no texto das specs sem recorte
próprio e sem código.

## Evidências desta retomada

Dez runners SQL novos de autorização e RLS, executados em conjunto ao final,
todos com saída **0**:

```
substituicao-case-manager-local            substituicao-case-manager-concorrencia-local
realizacao-compromisso-local               realizacao-compromisso-concorrencia-local
financeiro-valor-acordado-local            financeiro-vigencia-concorrente-local
financeiro-despesa-local                   financeiro-apuracao-local
financeiro-grant-local                     avisos-local
```

Suítes de teste executadas uma vez ao final — justificado por esta entrega ter
tocado arquivos compartilhados por várias frentes (`rpc.ts`, `cifra-autenticada.ts`,
`index.ts`, `main.ts`): contratos 184, cadastro 137 (+9 pulados), funções 311 (+6),
proxy 696 (+15), web 649. **1977 passando, 30 pulados, nenhuma falha.**

`pnpm run verificar:rapido` saiu **0**, com `Checked 901 files`. `pnpm run build:web`
saiu 0 uma vez, para confirmar que o pacote da casca sai íntegro.

Três provas foram validadas por **controle negativo executado** — sabotar a
asserção faz o teste falhar, o que demonstra que o bloco realmente roda: vetores de
regressão da cifra, prova SQL dos avisos, e orçamento do pacote de exportação.

## Revisões independentes e achados tratados

- **FR-033**: um P1 real. O orçamento da reunião de anexos contava só os anexos,
  mas o teto de 64 MiB do montador soma também `resumo.html` e `dados.json` —
  anexos exatamente no teto seriam todos baixados e só então recusados. Corrigido
  com reserva explícita de 1 MiB, mais `nomeSeguro` aplicado quando o manifesto
  traz nome, e o teste de teto passou a provar que o pacote monta de fato.
- **FR-037, financeiro (banco), financeiro (HTTP/UI e cifra)**: sem achado, com
  verificação citada linha a linha.
- **FR-024**: ciclo entre dois eventos (A remarcado para B, B remarcado para A) não
  é impedido pelo banco. A correção sugerida na revisão não serve — `CHECK` no
  PostgreSQL não aceita subconsulta; o caminho seria gatilho. Registrado como
  lacuna 7.5 e **não implementado**: nenhum consumidor percorre a cadeia
  recursivamente, então não há laço nem estado inconsistente observável, e
  `AGENTS.md` pede ameaça concreta antes de acrescentar camada.
- **Avisos**: apontado um P2 no `grant execute` sobre `cadastro.case_manager_atual`,
  por não assumir papel dono como a linha vizinha faz para
  `sinal_operacional_caso`. **Falso positivo**, conferido: as duas funções têm donos
  diferentes, e a migração que criou `case_manager_atual` concede exatamente da
  mesma forma direta. Registrado em
  `openspec/changes/substituicao-temporaria-case-manager/tasks.md`.

## Regressão introduzida e corrigida nesta retomada

O commit `08ad3ab` derrubou 8 testes existentes: `web/servico-avisos-http.ts`
chamava `fetch` com string enquanto os dublês de `fluxo-caso-novo.test.ts` e
`ciclo-tela.test.ts` esperam `URL`. Encontrado pela frente seguinte, corrigido em
`1ccbbf7` com `new URL(caminho, window.location.origin)`, como `api.ts` já fazia.
As 28 telas que montam `main.js` voltaram a passar, 109/109.

## Bloqueador de publicação: a cadeia de migrations não aplicava sem superusuário

Achado mais importante desta entrega. Corrigido em 19/11/2026.

**O que falhava.** A cadeia completa de migrations não aplicava num banco novo sob um
papel com `CREATEROLE` e **sem** `SUPERUSER` — a condição do projeto remoto
(PostgreSQL 17.11, registrado em `revisao-s02-fundacao-ffcmapp.md:61`). Quatro
migrations abortavam:

| Migration | Linha | Erro |
|---|---|---|
| `20261111240000_owner_vinculo_familiar_privado.sql` | 7 | `permission denied for function consultar_sessao_nativa` |
| `20261119250000_convite_familiar.sql` | 336 | `permission denied for function consultar_sessao_nativa` |
| `20261120430000_cancelar_preautorizacao_wrapper.sql` | 19 | `permission denied for function consultar_sessao_nativa` |
| `20261125160000_contexto_acessos_gerenciados.sql` | 58 | `permission denied for function cadastro_gerenciado_proprio` |

A causa é a mesma nas quatro: o migrador executa `grant`/`revoke` sobre uma função que
**não é dele**. Em `20261125160000` a função acabara de mudar de dono na linha anterior
(`alter function ... owner to ffcmapp_acessos_owner`); nas outras três a função
`api.consultar_sessao_nativa(uuid)` pertence a `ffcmapp_auth_nativo_owner` desde
`20261105130000`. Como o migrador só tem membership com `inherit false`, ele não herda
os direitos do dono e o comando é recusado. Sob superusuário tudo passa, porque
superusuário ignora a checagem e o PostgreSQL registra o próprio dono como concedente.

Confirmado também que, com `CREATEROLE` sem superusuário, o PostgreSQL 17 concede
automaticamente ao criador a membership com `admin` ligado e `inherit`/`set`
desligados — exatamente o que `revisao-s02-fundacao-ffcmapp.md` observou no remoto — e
que essa `admin` basta para `set role`. É isso que torna a correção possível sem
conceder nada novo.

**Por que ninguém viu.** `supabase/tests/cadeia_migrations_local.sql` cria o papel
`postgres` como **SUPERUSER** e carrega apenas as ~20 primeiras migrations. O runner
`scripts/testar-cadeia-migrations-local.sh` saía 0 enquanto um banco real recusaria a
cadeia na metade. Todas as fixtures que encadeiam migrations descendem desse preâmbulo,
então nenhuma delas exercia a condição do remoto.

**O que foi corrigido.** Adotado o padrão já dominante no repositório — assumir o papel
dono com `set role <dono>; ...; reset role;` — sem inventar um terceiro padrão:

- `20261125160000`: cada `revoke`/`grant` que vem depois de um `alter function ... owner to
  ffcmapp_acessos_owner` passou para dentro de um bloco `set role ffcmapp_acessos_owner`
  (oito blocos). O `set role` que já existia para `identidade.concessao_interna_ativa` foi
  apenas ampliado para cobrir também o `revoke`.
- `20261111240000`, `20261119250000` e `20261120430000`: o `grant execute on function
  api.consultar_sessao_nativa(uuid)` foi separado dos demais e envolvido no mesmo bloco de
  delegação já usado por `20261112170000_listar_vinculos_profissionais_privado.sql`
  (membership temporária condicional ao `pg_has_role(...,'SET')`, `set role
  ffcmapp_auth_nativo_owner`, concessão, `reset role`, revogação da membership temporária).

**Prova de que os privilégios finais não mudaram.** A cadeia completa foi aplicada duas
vezes sob migrador **superusuário**, antes e depois das correções, com um dump ordenado de
`pg_roles`, `pg_auth_members`, `pg_namespace`, `pg_class`, `pg_attribute.attacl`, `pg_proc`
(dono, `security definer`, ACL, `proconfig`), `pg_policy` e `pg_default_acl`. Os dois dumps
são byte a byte idênticos (`md5 82d55dc26b964645fee702f611538490`, 2.974 linhas). Nenhum
dono, ACL, política ou grant mudou.

Comparando o dump do migrador superusuário com o do migrador sem superusuário (ambos já
corrigidos), divergem apenas: 79 memberships `admin` automáticas do `CREATEROLE` (inerentes
ao papel, não às migrations) e 190 funções do schema `extensions` (quem instalou `pgcrypto`
e `btree_gist` na fixture). **Zero** divergência em `api`, `identidade`, `cadastro`,
`operacao`, `auditoria` e `public`.

**Prova que passou a existir.** `scripts/testar-cadeia-migrations-sem-superusuario-local.sh`
aplica as 234 migrations do diretório, na ordem do nome do arquivo, num PostgreSQL
descartável, sob o papel `postgres` com `CREATEROLE login` e **sem** `SUPERUSER`; o
preâmbulo `supabase/tests/cadeia_migrations_sem_superusuario_bootstrap_local.sql` recusa
rodar se o migrador for superusuário, e o script reconfere isso no fim. Saída:
`CADEIA_COMPLETA_SEM_SUPERUSUARIO_OK: 234 migrations`, código 0. O escopo e os limites de
`cadeia_migrations_local.sql` ficaram registrados no próprio arquivo.

**Continua em aberto.** No remoto o `postgres` permanece membro `admin` de todos os papéis
`ffcmapp_*_owner` depois das migrations, mesmo com as revogações previstas, e `admin` basta
para `set role`. A revogação dessa cadeia de privilégios continua pendente, como
`revisao-s02-fundacao-ffcmapp.md` já registrava; esta correção não a resolve.

## Bloqueios preservados — não contornados

- **Operação remota.** `SUPABASE_ACCESS_TOKEN` e `NETLIFY_AUTH_TOKEN` continuam
  ausentes. A autorização do solicitante existe; a credencial, não. As duas coisas
  estão registradas separadamente. Nenhuma migração foi aplicada remotamente,
  nenhum segredo foi movido, nada foi publicado. Credencial não foi pedida por
  conversa.
- **Supabase local.** `supabase start` aborta: a porta 55322 já está tomada por
  `supabase_db_Sinergica-SO`, pilha local de outro projeto. Não paramos a pilha
  alheia nem alteramos `supabase/config.toml` — as duas saídas são decisão do
  solicitante. Sem isso não há Edge Runtime nem Supavisor para medir, e a
  pré-condição 0.2 da migração segue fechada.
- **Edge, grupos 3 em diante.** Dependem de 2.5, que é remota, e da pré-condição
  0.1, que exige as fatias de turno e financeiro demonstráveis.
- **Aparelho real.** O grupo 4 do PWA — instalação em iPhone e Android — não tem
  aparelho neste ambiente. A tarefa 1.1 ficou marcada **com o bloqueio escrito ao
  lado**, não como sucesso presumido.
- **Viewport de celular (financeiro 4.3).** Sem navegador automatizado, jsdom não
  faz layout; medir rolagem e alvo de toque ali seria evidência falsa. Ficou
  desmarcada.
- **Google Drive.** Com `ffcm.documentos.ativo` desligada, cada anexo do pacote de
  exportação cai em `anexo_nao_recuperado`. O caminho feliz com arquivo real
  continua sem evidência.
- **Ativação.** `verificar:ativacao` e o roteiro "Como testar" do PR não foram
  executados: pertencem à retirada do draft.
- **503 da configuração.** Não reproduzido nem corrigido. Continua dependendo de
  log autenticado do ambiente publicado.

## Decisões que precisam do solicitante

1. **FR-028 — divergência de vocabulário.** A decisão 0.5 do PWA chama FR-028 de
   "sinalização **clínica**", mas `20261118300000_sinal_operacional_caso.sql`
   declara em comentário normativo que o sinal é **operacional** e que nenhuma
   sinalização clínica entra no cálculo. A projeção dos avisos usa o que existe. Se
   FR-028 precisa mesmo de uma sinalização clínica humana, ela não existe no banco —
   a que existe é o booleano `atencao` do diário, que já é a quarta origem.
2. **AAD da despesa.** Hoje não distingue duas versões do mesmo campo. Não é
   alcançável — a tabela é imutável por gatilho, o papel dono só tem SELECT e
   INSERT, e todo INSERT passa por RPC atestada. Fortalecer exige projetar `d.id` em
   `api.consultar_despesas`, o que toca migração já commitada.
3. **Porta 55322.** Liberar a pilha do outro projeto, ou mudar a porta local deste,
   destravaria a pré-condição 0.2 da migração Edge.
4. **Ícones do PWA.** São recorte proporcional do logo existente, marcados como
   provisórios. `identidade-visual.md` pede o vetor antes dos derivados finais, e o
   material de marca virá do marketing da Edilaine.
5. **Estado de indisponibilidade offline.** Ficou um estado único no topo de
   `<main>` em vez de um por área. Como nenhuma resposta de API entra em cache, não
   existe conteúdo anterior a exibir; o estado é do aparelho. Repetir dentro de cada
   painel é outro recorte.

## Achados de ambiente

- **Biome aborta sob pressão de memória e sai com código 0.** A mensagem é
  `Linter process terminated abnormally (possibly out of memory)`, e nada é
  aplicado. O `pre-commit` do `lefthook.yml` usa exatamente a forma que falha
  (`biome check --write ... {staged_files}`), então sob essa condição ele vira
  no-op silencioso e deixa passar commit não formatado. **Nunca conclua que o lint
  passou pelo código de saída**: exija a linha `Checked N files`. Fora do sandbox de
  execução dos agentes o Biome funciona normalmente, o que indica limite de memória
  do sandbox e não defeito do projeto.
- **`LC_ALL=C` é necessário** para os runners de PostgreSQL local neste ambiente.
