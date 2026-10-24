# Contratos da fundação FFCMApp

Este documento descreve as interfaces consumidas pelas frentes de banco (A),
identidade/sessão (B) e cadastro/administração (C). A implementação de cada
frente deve importar `@ffcmapp/contratos`; não deve recriar DTOs, códigos ou
estados em seu próprio módulo.

## HTTP

O catálogo tipado fica em `packages/contracts/src/rotas.ts`. Todo retorno usa
`{ dados, request_id }` ou `{ erro: { codigo, mensagem, campos? }, request_id }`.
Erros não carregam senha, token, e-mail ou conteúdo clínico. As mutações de
cadastro e administração exigem `x-chave-idempotencia`; os comandos de sessão
usam contrato próprio e não a reutilizam como substituta de CSRF.

Os comandos de sessão registram transporte obrigatório: origem permitida;
`x-csrf` em renovar/sair; refresh e CSRF apenas em cookies `HttpOnly`, `Secure`
em HTTPS, `SameSite=Lax`, sem `Domain` e limitados ao caminho de sessão. O
access token é entregue somente à memória do cliente e não integra o contrato
de cookie, URL ou log: login e refresh devolvem `dados.access_token` e
`dados.csrf` na resposta `no-store`. O cliente conserva ambos em memória.
O desafio inicial entrega CSRF e cookie selado antes de ambos os logins;
o login Google também exige o cookie de nonce. A emissão do desafio exige
origem exata permitida e não admite sessão. O logout apaga cookies com mesmo
nome/path e `Max-Age=0`, inclusive quando o signout externo falha.
`politicaCookiesSessao` fixa esses atributos; a ausência de HTTPS só é aceita
em configuração explícita de desenvolvimento local.
A configuração decide a origem permitida; um valor de
`Origin` presente não é autorização por si.

`PacienteBasico` contém apenas identificação necessária para a carteira.
`PacienteAdministrativo` acrescenta nascimento e contatos para Administração.
Profissional e Família nunca recebem contatos de terceiros por conversão do
DTO básico. Em PATCH, campo ausente preserva o valor; `null` só limpa campos
explicitamente anuláveis.

## Concessão e sessão

`usuario` é a autoridade atual de perfil e atividade. A concessão vinculada
espelha a decisão na mesma transação e preserva a trilha, mas não autoriza por
si. A revogação de pré-concessão está em
`POST /api/admin/concessoes-equipe/:concessao_id/revogar` e usa versão,
idempotência, motivo e auditoria.

| Elemento | Estados/transição permitida |
| --- | --- |
| Concessão | `pendente → vinculada`, `pendente → revogada`, `vinculada → revogada`; nova concessão após revogação cria registro pendente novo |
| Desafio Google | aberto → consumido ou expirado |
| Sessão local | ativa → revogada; o mesmo `session_id` não volta a ativo |

Admissão e revogação bloqueiam a mesma concessão. Isso decide a corrida sem
permitir que uma sessão continue utilizável depois da revogação.

## Cifra e RPC

O HTTP recebe texto claro somente no servidor; valida o contrato, gera o UUID
do registro e chama o módulo de cifra com AAD `(tabela, registro_id, campo,
formato)`. A persistência recebe `CampoCifrado` e um `AtestadoOperacao` de
curta duração. A RPC deriva ator e sessão do JWT verificado, valida atestado e
AAD, autoriza/audita e somente então devolve envelopes ao adapter de servidor.
Descriptografia e projeção HTTP acontecem após essa autorização.

As RPCs `identidade.admitir_sessao` e cofre são somente servidor. RPCs com JWT
de usuário não aceitam `ator_id` nem perfil; chamada direta não recebe atestado
nem pode escrever texto claro. A implementação da cifra, das chaves Vault e
das RPCs continua pendente nas tarefas 2.x.

`mapeamentoOperacoes` em `packages/contracts/src/rpc.ts` define a única RPC,
o executor, a transação e o perfil exigido por rota. Ele é o contrato de
passagem entre as frentes: A implementa a RPC indicada, B os itens de sessão e
C o handler que consulta esse mapeamento. A alteração de um nome, entrada,
saída ou erro exige análise dos três consumidores.

Cada função SQL terá um único argumento `p_entrada jsonb`, validado pelo
schema interno da assinatura correspondente. IDs vindos do caminho, versão,
chave idempotente e request integram essa entrada; não ficam implícitos no
corpo HTTP. O atestado liga usuário e sessão verificados, operação e digest
canônico da entrada completa, incluindo alvo e chave idempotente. O banco
compara essa identidade ao JWT, sem aceitá-la como autoridade autodeclarada.
Retornos RPC discriminam sucesso de negativa esperada para permitir commit
da auditoria; somente o adapter converte para códigos HTTP do catálogo.

Os digests têm finalidades distintas: `digest_entrada` do atestado protege
o payload interno exato, incluindo envelopes e IDs gerados. O obrigatório
`digest_idempotencia` da mutação representa via HMAC a entrada HTTP validada
e seus alvos estáveis, operação e ator. Ele exclui request, IDs novos,
timestamp e aleatoriedade da cifra; o atestado também o protege. Assim, duas
tentativas do mesmo pedido mantêm a comparação idempotente mesmo que seus
envelopes e requests sejam diferentes. Chave HMAC dedicada permanece somente
no servidor. O ledger futuro reautoriza a tentativa e compara esse digest,
sem persistir corpo HTTP ou resposta clínica.

Configuração local expõe somente `api` no Data API. O verificador interpreta
o TOML e verifica os valores críticos; executar esses checks não inicia o
banco nem comprova a configuração efetiva de um ambiente publicado.

## Verificação disponível

```bash
pnpm run typecheck
pnpm run test:contratos
pnpm run validar:configuracao
```

Esses comandos exercitam schemas, rotas, estados e a configuração local. Eles
não são prova de RLS, Vault, JWT, Google ou Supabase remoto; tais provas seguem
nas tarefas próprias.
