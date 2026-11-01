# D-04: prova manual de bloqueios em PostgreSQL isolado

**Atenção:** os passos históricos abaixo precedem as guardas adicionadas ao
rascunho. Atualizações diretas de usuário/concessão com sessão ativa agora
devem ser rejeitadas; esses passos não são mais uma receita executável nem
provam concorrência da nova versão. A prova com duas conexões precisa ser
reescrita após existir a RPC autorizada de revogação, que deve bloquear
concessão e usuário antes de revogar sessões com ator, motivo e auditoria.
As guardas são defesa complementar: não comprovam, por si só, a serialização
de admissões concorrentes nem substituem testes contra Supabase.

Na revisão posterior, a inserção de sessão passou a bloquear concessão e
usuário nessa ordem e reler a autoridade. Em PostgreSQL isolado, com duas
conexões, observou-se espera em `pg_stat_activity` (`wait_event_type = Lock`):
revogação confirmada primeiro fez a admissão retornar `admissão sem autoridade
vigente`; admissão confirmada primeiro fez a revogação direta retornar `revogue
as sessões antes de revogar concessão`. São testes de SQL direto com fixtures,
não provam RPC, auditoria, nem integração real. O teste D-04 também rejeitou
reabertura e remoção de tombstone. Os testes usam Read Committed; outras
condições de isolamento e o owner/privilegiamento real seguem pendentes.
As funções de guarda usam `row_security = off`, para falhar se RLS filtraria
linhas; é necessário comprovar privilégios e owner no runtime real. Isso não
autoriza conceder `BYPASSRLS` nem prova acesso seguro.

Esta prova usa somente fixtures fictícias e SQL direto. Ela não implementa nem
comprova as futuras RPCs de revogação/desativação, auditoria, Auth, Vault, RLS
no runtime ou Supabase. Execute exclusivamente em instância descartável criada
para o teste, sem conexão com projetos existentes. Não aplique o rascunho remoto.

1. Crie uma instância nova com `mktemp -d`, `initdb` e `pg_ctl`, usando socket
   exclusivo e sem escuta TCP. Crie nela os papéis `anon` e `authenticated`,
   schema `auth`, tabela `auth.users(id uuid primary key)` e funções sintéticas
   `auth.uid()` e `auth.jwt()` que leiam os claims de teste. Aplique apenas
   `20261017113000_fundacao_identidade_cadastro.sql`, o rascunho D-04 e
   `fundacao_d04_renovacao.sql` com `psql -v ON_ERROR_STOP=1`; este último
   termina em rollback. Insira separadamente as cinco fixtures SQL entre
   `insert into auth.users` e `insert into identidade.credencial_sessao`
   inclusivamente nesse arquivo. Elas só podem existir na instância descartável.
2. Em A, rode `select * from identidade.iniciar_renovacao(S, U);` e anote a
   geração. Aqui e nos comandos seguintes, S é
   `'30000000-0000-4000-8000-000000000001'`, U é
   `'10000000-0000-4000-8000-000000000001'`, C é
   `'20000000-0000-4000-8000-000000000001'` e E é
   `' {"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb`.
   Esses nomes são
   abreviações nesta documentação; substitua-os nas consultas SQL.
3. Em A, execute `begin; update public.usuario set ativo=false where id=U;`.
   Em B, execute `select identidade.finalizar_renovacao(S,U,1,E);`. Em uma
   terceira conexão, confira `pg_stat_activity.wait_event_type = 'Lock'` para
   a consulta ativa de B. Não use apenas uma demora como evidência do lock.
   Faça `commit` em A: B deve retornar `false`.
4. Restaure apenas a fixture na instância descartável: `update public.usuario
   set ativo=true where id=U; update identidade.credencial_sessao set
   estado='em_troca',geracao=2 where session_id=S;`. Em A, rode `begin; select
   identidade.finalizar_renovacao(S,U,2,E);` e confira `true`. Em B, execute
   `begin; select id from identidade.concessao_equipe where id=C for update;
   update public.usuario set ativo=false where id=U; commit;`. Observe B
   esperando `Lock`; após `commit` de A, B conclui. Verifique que usuário está
   inativo e a sessão é negada com os claims fictícios.
5. Repita o passo 3 com a revogação da concessão em A no lugar da inativação:
   `update identidade.concessao_equipe set estado='revogada',
   revogada_em=clock_timestamp(), revogada_por_usuario_id=U,
   motivo_revogacao_cifrado=E where id=C;`. A finalização concorrente deve
   esperar e retornar `false` após o commit.
6. Restaure a fixture da concessão (`estado='vinculada'`, campos de revogação
   nulos) e credencial (`estado='em_troca'`, próxima geração). Repita o passo
   4, mas em B faça o update de revogação do passo 5. B deve esperar o commit
   de A; ao final, com claims fictícios, `identidade.sessao_atual_valida()`
   deve retornar `false`. A restauração é apenas preparação do teste isolado,
   não representa um fluxo de produção nem autoriza reabrir tombstones.
7. Pare **apenas** a instância criada: `pg_ctl -D <diretório-exclusivo>/data
   stop`. Não apague diretórios ou dados de terceiros.

Resultado observado nesta execução: os quatro casos exibiram `Lock` para a
transação que aguardava. Finalização após inativação/revogação retornou `false`;
finalização anterior retornou `true`, a alteração posterior aguardou, e a
sessão consultada após revogação retornou `false`. A evidência cobre somente
esse desenho SQL e suas transações simuladas, não as operações futuras reais.
