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
