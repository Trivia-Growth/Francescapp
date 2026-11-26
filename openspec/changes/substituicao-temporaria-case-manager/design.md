# Decisões técnicas — substituição temporária da case manager (FR-037)

## Decisão do solicitante (19/11/2026) — DF-024

Durante o período, a substituta é a case manager atual daquele caso, inclusive para agir.
Nunca alcança a carteira nem outro caso. Fora do período, o titular volta sozinho.
Esta decisão não foi reaberta; o que segue são as escolhas técnicas que ela exige.

## Uma função é a fonte da regra

`cadastro.case_manager_atual(p_paciente uuid)` é `security definer`, `stable`,
`set search_path = ''`, e devolve `table(usuario_id uuid, papel text)`. Ela é o único
lugar que sabe o que "case manager atual" significa. A policy
`crise_aprovacao_responsavel_atual` e o corpo de `api.plano_crise_operacao_privada`
passam a consultá-la, em vez de repetir a subconsulta do último retrato.

Devolve **conjunto**, não um `uuid` só, porque a autorização precisa responder "esta
pessoa pode agir neste caso agora?" e a tela precisa responder "quem lidera e em que
papel?". Duas funções diriam a mesma regra duas vezes, e a divergência entre elas seria
exatamente a falha que a fatia precisa evitar. Linhas possíveis: `titular` (o último
retrato com responsável não nulo) e `substituto` (quando há substituição vigente).

A função é `security definer` porque precisa ler `cadastro.acompanhamento_caso` e
`cadastro.substituicao_case_manager` sem que cada owner de fatia receba grant nas duas
tabelas. O `execute` é concedido nominalmente aos owners que precisam, nunca a
`authenticated`, `anon` ou `service_role`.

## O titular continua podendo agir — SUPOSIÇÃO CONSERVADORA

O solicitante decidiu que a substituta **passa a ser** a atual; não decidiu que o titular
**deixa** de poder agir. Escolha desta fatia: o titular continua autorizado durante a
substituição, e a função devolve as duas linhas.

Razão: FR-037 trata de cobrir ausência, não de retirar alçada. Bloquear o titular criaria
um buraco real — titular volta antes do previsto, ninguém encerra o registro, e o caso
fica sem quem decida até a data marcada. O caminho oposto (dois atores autorizados por um
período curto e auditado) tem custo menor e é reversível: basta encerrar o registro.

Isso é provado nos dois sentidos em `supabase/tests/substituicao_case_manager_local.sql`:
titular aprova durante o período, substituta aprova durante o período, substituta é
negada fora dele.

## A substituição é colada no titular que ela substitui

`responsavel_usuario_id` guarda o titular **no momento do registro**, e
`case_manager_atual` só reconhece a substituição quando esse titular ainda é o
responsável vigente do caso.

SUPOSIÇÃO CONSERVADORA: se o Administrador trocar o responsável do caso durante uma
substituição em curso, a substituição deixa de valer. Substituir é substituir **alguém**;
herdar automaticamente a ausência de um titular novo que nunca foi declarado ausente
ampliaria a alçada da substituta sem ato de ninguém. Na dúvida, nega.

## Períodos sobrepostos são impedidos pelo banco

```sql
exclude using gist (
  paciente_id with =,
  tstzrange(inicio, least(fim, coalesce(encerrada_em, fim)), '[)') with &&
)
```

`btree_gist` fornece o operador `=` para `uuid` no índice GiST; é extensão padrão do
PostgreSQL e está disponível no Supabase. A alternativa (índice único parcial) não
consegue expressar sobreposição de intervalos; verificar na aplicação deixaria a janela
entre o `select` e o `insert` aberta para duas transações concorrentes.

O encerramento antecipado **encolhe** o intervalo, então nunca cria conflito novo, e
libera o restante do período para outro registro. Encerrar com `encerrada_em = inicio`
produz intervalo vazio, que por definição não sobrepõe nada.

A prova usa duas conexões reais (`scripts/testar-substituicao-case-manager-concorrencia-local.sh`):
a segunda transação **bloqueia** no índice enquanto a primeira segura, e falha com
`exclusion_violation` quando a primeira confirma.

## Append-only com uma transição de encerramento — SUPOSIÇÃO CONSERVADORA

A tabela é insert-only para tudo, com uma exceção nomeada: a transição
`encerrada_em is null` → `encerrada_em not null`, acompanhada de
`encerrada_por_usuario_id` e `encerramento_auditoria_id`. Um gatilho recusa qualquer
outra alteração e recusa reabrir um registro já encerrado.

Foi preferida a um segundo retrato append-only porque o retrato brigaria com a restrição
de sobreposição: a linha encerrada e a linha original cobririam o mesmo intervalo, e
excluir a encerrada do índice deixaria a original ocupando um período que já foi
liberado. É o mesmo arranjo que `identidade.concessao_equipe` já usa para revogação
(`estado`, `revogada_em`, `revogada_por_usuario_id`, `motivo_revogacao_cifrado`).

O histórico não se perde: `inicio`, `fim`, autor, motivo e os dois eventos de auditoria
(registro e encerramento) permanecem.

## Sem campo de motivo nesta fatia — limitação registrada

As fatias vizinhas cifram motivo com o envelope `{formato, key_id, nonce, ciphertext,
tag}` e um AAD declarado em `supabase/functions/_shared/cifra-autenticada.ts`. Esse
arquivo é compartilhado e está fora dos arquivos liberados para esta onda, então um campo
`motivo_cifrado` ficaria sem cifra do lado do servidor — meia integração, pior do que
nenhuma.

Decisão: a substituição não guarda motivo nesta fatia. Quem registrou, quando, em que
período e para quem continua gravado, e os dois eventos de `auditoria.evento` (registro e
encerramento) carregam ator, ação, objeto e request. A obrigação de "data, responsável e
motivo" em FR-037 é das **alterações de acesso**, e substituir explicitamente não altera
acesso. Acrescentar motivo depois é aditivo: coluna nova, ramo novo no AAD compartilhado.

## Substituir não concede acesso

Nenhuma regra de acesso lê a tabela nova, exatamente como o comentário de
`20261113100000_acompanhamento_caso.sql` já dizia do responsável. O owner da fatia não
recebe grant em `cadastro.acesso_paciente` para concedê-lo, e a prova confirma que uma
substituta sem `cadastro.acesso_paciente` continua negada na leitura do caso.

Consequência deliberada: registrar substituição e conceder acesso são dois atos
administrativos distintos. Juntá-los seria conveniente e seria exatamente o que a regra
de negócio de origem proíbe.

## Só Administrador registra e encerra

Mesmo bloco de autorização de `operacao.habilitacao_plano_crise_privada`: Google
Workspace com domínio confirmado ou exceção técnica, concessão `vinculada` com perfil
`administrador`, sessão viva no banco e no Auth, tudo sob `for share`. `consultar` também é Administrador-only:
a seção vive na tela de edição do caso, que já é administrativa, e consultar quem lidera
um caso é informação de governança. Abrir a consulta a outros perfis seria superfície nova
sem pedido de ninguém.

## Recorte de ameaças e evidências

Escopo: integridade de quem pode agir como case manager. Navegador e HTTP não confiáveis;
servidor assina atestado; RPC PostgreSQL com owner dedicado e RLS. O ator autenticado
pode chamar a RPC direto ou reenviar pedido antigo, mas não recebe o papel owner nem a
chave de assinatura. Fora do recorte: migração remota e validação do provedor Auth real.

- **Alta:** substituta agir em caso que não é o substituído. Mitigação: a função é
  parametrizada por `paciente_id`, a policy restritiva compara por caso, e a prova
  exercita acesso direto ao banco sob o papel owner.
- **Alta:** substituta agir fora do período. Mitigação: `inicio <= clock_timestamp() <
  fim` dentro da função, revalidado depois da trava `for update` do paciente; provas
  antes do início e depois do fim.
- **Alta:** dois registros concorrentes cobrindo o mesmo período. Mitigação: restrição de
  exclusão no banco, provada com duas conexões.
- **Média:** encerramento antecipado não ter efeito imediato. Mitigação: a função lê
  `encerrada_em` na hora; prova encerra e repete o mesmo ato, que passa a ser negado.
- **Média:** substituição virar acesso. Mitigação: nenhum grant e nenhuma leitura de
  acesso; prova negativa com substituta sem `cadastro.acesso_paciente`.

Limitação registrada: o ambiente local simula Auth, Vault e assinatura; nada aqui
comprova o provedor real nem autoriza aplicar migração remota.
