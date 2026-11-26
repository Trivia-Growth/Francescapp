# Publicação no Supabase — 20/11/2026

Primeira publicação real do backend do FFCM App. Registro operacional do que foi
feito, com que credencial, e o que ficou de fora.

## Projeto alvo

`drdpuxcllpymtoskmuqv` — "FFCM App", região `us-west-2`, PostgreSQL 17.11,
`ACTIVE_HEALTHY`.

**Como o acesso foi obtido.** O token que existia na máquina (`~/.supabase/access-token`)
pertence a outra conta e enxerga apenas o projeto "Sinergica SO"; para o FFCM App ele
devolve `403`. O solicitante forneceu um token pessoal da conta correta em 20/11/2026.
O token **não está no repositório**: fica em arquivo com permissão `600` no diretório
temporário da sessão. **Deve ser revogado no painel quando o trabalho terminar**, porque
trafegou pelo chat.

A CLI `supabase` trava sem produzir saída neste ambiente, então todas as operações foram
feitas pela Management API (`POST /v1/projects/{ref}/database/query`), que responde `200`
ou `201` em sucesso.

## Cópia de segurança antes de escrever

O projeto **não tem backup configurado** — continua valendo o que
`continuidade-13-11-2026.md:88` registrou. Por isso foi tirado um instantâneo lógico antes
de qualquer escrita: 36 tabelas com dados, **1767 linhas**, mais a lista das 199 migrations
então aplicadas, em `instantaneo-ffcm-remoto-20261120.json` (731 KB), guardado **fora do
repositório**, no diretório temporário da sessão.

Isso **não** é substituto de backup: é uma rede de segurança de uma vez só, do conteúdo
daquele instante, e não inclui material de chave do Vault. Configurar backup de verdade
continua pendente e é o item cuja falha não tem conserto.

## Migrations aplicadas

Antes: **199**, a última `20261125070000`. Depois: **234**, a última `20261126300100`.
Trinta e cinco aplicadas numa passada, na ordem do nome, cada uma enviada como consulta
única — o PostgreSQL envolve o lote em transação implícita quando não há controle
explícito, e respeita o explícito nas que trazem o próprio `begin;`/`commit;`.

Nenhuma falhou. Entre elas a `20261125160000_contexto_acessos_gerenciados`, que era a de
maior risco por trocar o dono de função logo antes do `revoke`.

**Correção de uma afirmação anterior.** Em 19/11/2026 foi registrado que a cadeia "não
aplicaria sem superusuário" e que a publicação "teria falhado na metade". O papel
`postgres` do projeto remoto tem `rolsuper = false`, `rolcreaterole = true` e
**`rolinherit = true`**. Com herança no nível do papel, as três migrations antigas que
abortavam na reprodução local provavelmente passariam de todo modo. A correção feita
continua válida e é comprovadamente neutra em privilégios — o dump ordenado tem `md5`
idêntico antes e depois —, mas a afirmação original era mais forte do que a evidência
sustenta.

Verificação após a aplicação: schemas `api, auditoria, cadastro, financeiro, identidade,
operacao` presentes; `cadastro.turno`, `cadastro.turno_ocorrencia_versao`,
`financeiro.despesa_lancamento`, `cadastro.substituicao_case_manager`,
`cadastro.realizacao_compromisso` e `cadastro.aviso_leitura` existem; dados preservados sem
alteração — 4 pacientes, 3 usuários, 1607 eventos.

## Interruptores ligados

Por decisão do solicitante em 20/11/2026, seis passaram de `false` para `true`:

```
ffcm.turno.ativo                  ffcm.documentos.ativo
ffcm.acessos.ativo                ffcm.realizacao_compromisso.ativo
ffcm.agenda_google.ativa          ffcm.transcricao.ativa
```

**Forma honesta do que foi feito:** a alteração foi por `UPDATE` direto, incrementando
`versao` de 1 para 2. Isso **não** passou pela RPC administrada e portanto **não gerou
evento em `auditoria.evento`**, ao contrário do que aconteceria se a mudança fosse feita
pela tela de Administração. É uma intervenção operacional de preparação de ambiente, e
está registrada aqui porque não está registrada lá.

Os quatro segredos de integração já estavam cadastrados no banco: Google Drive, Google
Calendar (client id e secret) e OpenRouter. Por isso agenda e transcrição podem de fato
funcionar — mas **OAuth, renovação de token e ACL do Calendar nunca foram comprovados
contra o serviço real**, e isso continua sendo bloqueio registrado, não cobertura.

## Duas chaves que faltam no banco

`ffcm.financeiro.ativo` e `ffcm.avisos.ativos` **não existem** em
`identidade.configuracao_sistema` — as migrations dessas fatias não as semearam. Com a
chave ausente, a rota cai no padrão desligado, que é o comportamento seguro, mas a tela de
Administração não tem o que alternar. Semear as duas é migration pendente.

## O que impede o teste funcional completo

**Não existe conta com perfil `profissional` no projeto publicado** — há dois
administradores e um familiar. A execução de turno exige `perfil = 'profissional'` no
banco, então nenhum fluxo de Acompanhante Terapêutico ou de enfermeira roda até que essa
conta exista.

Por decisão do solicitante, ela será criada **pela tela de Administração**, agora que
`ffcm.acessos.ativo` está ligado, vinculando uma conta Google Workspace real do domínio.
Não foi provisionada por SQL de propósito: o caminho pela tela deixa a trilha de auditoria
correta e exercita o próprio fluxo de concessão, que é o que se quer testar.

## Fechamento do dia — 20/11/2026

### Estado publicado

**Backend:** 250 migrations aplicadas, última `20261128230000`. Dados preservados em todas
as passagens.

**Frontend:** branch `fatia7/turno-execucao-cuidado` empurrada (`e07daaa..ce9130e`), em
sincronia com `origin`. **A produção ainda serve um build de 17/11** — o Netlify publica a
branch de produção, e o PR 18 segue em draft. Tirar de draft e integrar à `main` é decisão
e ato do solicitante.

### Interruptores no publicado

Ligados: `ffcm.turno.ativo`, `ffcm.documentos.ativo`, `ffcm.acessos.ativo`,
`ffcm.realizacao_compromisso.ativo`, `ffcm.agenda_google.ativa`, `ffcm.transcricao.ativa`.

Desligados, nascidos assim de propósito: `ffcm.financeiro.ativo`, `ffcm.avisos.ativos`,
`ffcm.ficha_plantao.ativo`, `ffcm.papel_declarado.ativo`, `ffcm.substituicao_cm.ativo`,
`ffcm.estado_emocional.ativo`. Ligar é ato do Administrador, pela tela, com auditoria.

### Variáveis que dependem do solicitante

Cinco precisam existir no painel do Netlify da conta `agenda-francescato`, à qual esta
máquina não tem acesso: `FFCM_AUTH_INTERNO_ATIVADO`, `FFCM_FICHA_PLANTAO_ATIVO`,
`FFCM_PAPEL_DECLARADO_ATIVO`, `FFCM_SUBSTITUICAO_CM_ATIVO` e `FFCM_CONSULTA_VINCULOS_ATIVA`.

`FFCM_AUTH_INTERNO_ATIVADO` **deve continuar sendo variável de ambiente**, não chave de
banco: ler do banco para decidir se a autenticação funciona cria impasse sem saída — se o
banco não responde, ninguém entra para consertar.

### Dois defeitos que teriam aparecido no teste e foram corrigidos antes

**A tela de Regras caía inteira.** `ffcm.documentos.categorias` tinha `exposicao='publica'`
sendo lida pelo leitor do servidor, e `api.consultar_regras_atendimento` devolve todas as
chaves públicas — uma chave do tipo `lista` fazia o parse de `regraAtendimentoSchema`
lançar e derrubava FR-041 por completo. Um CHECK novo trava a recorrência.

**O relatório de turno cairia na primeira ficha com estado emocional.**
`rotinaTurnoPublicaSchema` não tinha a variante, enquanto a projeção já a emitia; como o
relatório valida o lote, o período inteiro ia junto.

Nenhum dos dois era alcançável por teste existente. O primeiro veio do levantamento de
customização, o segundo da implementação da ficha.

### Achado de método, repetido duas vezes em dois dias

`force row level security` faz o dono nem escrever nem ler sem policy, e **fixture que roda
como superusuário ignora RLS**. Uma semeadura quebrou a cadeia completa de migrations, e a
guarda que deveria pegar contava zero linhas e passaria verde falso.

É o mesmo tipo de falso verde que escondeu, até 19/11, o fato de a cadeia não aplicar sem
superusuário. A conclusão operacional: **o runner que vale é
`scripts/testar-cadeia-migrations-sem-superusuario-local.sh`**, e runner de fatia isolada
não substitui ele.

### O que impede o teste funcional completo, em ordem

1. **Publicar o frontend.** Sem isso, nada do trabalho novo existe no ar.
2. **Ligar as cinco variáveis** no painel do Netlify.
3. **Criar a conta com perfil `profissional`** pela tela de Acessos, e **depois conceder
   acesso ao caso**. Sem o vínculo, toda operação de turno é negada pelo banco — e
   pareceria defeito de tela.
4. **Ligar `ffcm.financeiro.ativo`** se o financeiro entrar no teste; a tela de concessão
   da audiência existe agora, mas fica sob esse interruptor.

### Avisos para quem for testar

O método de login do profissional importa: com `interno`, a agenda e a realização de
compromisso **não aparecem** — exigem `google_workspace`. Decidir na criação da conta.

A ficha do plantão não tem aba própria: aparece ao expandir "Ficha do plantão" dentro de
"Meu turno".

O administrador **lê** a ficha e não escreve, por projeto.

### Aberto, sem fingimento

PDF do consolidado ainda no layout anterior. Resposta de campo acrescentado não sai no PDF
nem no consolidado. A `visibilidade` das respostas é gravada, mas a projeção familiar não
consome a tabela nova — hoje nenhuma resposta chega à família, **fechado por omissão e não
por controle provado**, e isso precisa de prova antes de a família ser habilitada. A ficha
explica a causa de uma recusa atômica mas não aponta o campo exato. As matrizes de
autorização e RLS da ativação da ficha continuam pendentes.

Backup do projeto continua **não configurado**. O instantâneo lógico tirado hoje é rede de
uma vez só, não substitui backup, e não inclui material de chave do Vault.
