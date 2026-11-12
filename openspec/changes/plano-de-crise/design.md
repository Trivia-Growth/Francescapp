# Decisões técnicas — plano de crise (FR-020)

## Decisão do solicitante (11/11/2026)

Entre as quatro opções levantadas em `openspec/changes/historico-de-saude/design.md`, o
solicitante escolheu a **marca de habilitação na concessão**, preenchida na tela de
administração. Isso fecha o bloqueio de negócio registrado em
`openspec/changes/historico-de-saude/tasks.md` item 6.1.

## Onde a marca mora, e por quê

A marca fica em `identidade.concessao_equipe`, não em `public.usuario` nem numa tabela
nova de aprovadores:

- é propriedade do **acesso** daquela pessoa àquele workspace, e some junto com ele
  quando a concessão é revogada — não fica órfã como ficaria numa lista à parte;
- a autorização já lê a concessão do ator sob `for share` em toda operação privada;
  aproveitar essa mesma leitura evita uma segunda consulta e uma segunda janela de
  corrida entre "conferi a marca" e "gravei a aprovação";
- a lista separada `identidade.aprovador_plano_cuidado` (opção 4) existe para o plano de
  cuidado, onde a aprovação é carimbo e não portão. Aqui é portão: misturar os dois
  faria uma mudança numa lista alterar o significado da outra.

`habilitacao_versao` é coluna própria, separada de `versao` da concessão: marcar ou
desmarcar não pode interferir no versionamento do ciclo de vida da concessão (criação,
vínculo, revogação), nem o contrário.

O CHECK `concessao_habilitacao_perfil_chk` cobre só o perfil, não o estado. FR-020 diz
que a case manager não emite conduta clínica por assumir a coordenação, então
administrador nunca recebe a marca — isso é invariante e vale no banco. Já exigir
`estado = 'vinculada'` no CHECK quebraria a revogação de uma concessão marcada: o
`update` que revoga falharia. O estado é exigido onde ele é decisão, não invariante: ao
**marcar** (na operação) e ao **aprovar** (no bloco de autorização, que já exige
concessão vinculada). Desmarcar continua possível em qualquer estado, para que retirar
uma habilitação nunca fique travado.

## Aprovação é carimbo preso à versão

`cadastro.plano_crise_versao` é imutável, como as demais fatias versionadas. A aprovação
não pode ser campo dentro dela: registrá-la exigiria reescrever a versão, e editar o
plano passaria a carregar junto a aprovação anterior. Então a aprovação é
`cadastro.plano_crise_aprovacao`, insert-only, com `unique (registro_id,
aprovador_usuario_id)`.

Consequências deliberadas:

- editar o plano cria versão nova, **sem aprovação**, e a tela diz isso antes de salvar;
- aprovar nomeia `registro_id` **e** `versao`, e a operação recusa se essa não for a
  versão corrente: aprovar "o plano" sem nomear a versão aprovaria um texto que pode ter
  mudado entre a leitura e o clique;
- desmarcar a habilitação de alguém **não** apaga o carimbo que ele já deu. O carimbo é
  registro histórico do que foi aprovado e por quem; apagá-lo reescreveria o passado. A
  coluna `concessao_id` guarda qual concessão habilitada autorizou cada carimbo.

## Owners dedicados

Duas fatias, dois owners:

- `ffcmapp_habilitacao_crise_owner` enxerga a equipe inteira (é operação administrativa)
  mas grava **apenas** as quatro colunas da habilitação — `perfil`, `estado` e
  `email_cifrado` não estão no grant de UPDATE;
- `ffcmapp_plano_crise_owner` lê a marca mas **não** pode gravá-la, não enxerga
  `nome_cifrado` do paciente e não alcança as tabelas das outras fatias.

Como `for share`/`for update` exigem privilégio de UPDATE além do de SELECT no
PostgreSQL, cada tabela travada recebe `update` de uma coluna inócua acompanhado de uma
policy `_lock` com `using (true) with check (false)`. A exceção é
`identidade.concessao_equipe` no owner da habilitação, que precisa de UPDATE real — daí
o grant por coluna e a policy que recusa marcar quem não é profissional.

## `sem_permissao` na aprovação não derruba a ficha

Recusa por falta de habilitação volta como `sem_permissao` (HTTP 403), o mesmo código de
quem perdeu o acesso: o erro público não revela se faltou vínculo, sessão ou marca. Mas
`exigeNovoAcesso()` trata 403 como perda de acesso, e isso expulsaria da ficha quem
apenas não tem a marca. Por isso **só o botão de aprovar** trata `sem_permissao` antes do
descarte de sessão, explicando a recusa; as demais chamadas da tela continuam
descartando o acesso em 403. O teste `web/plano-crise.test.ts` prende esse
comportamento.

A tela não esconde o botão de aprovar para quem não tem a marca: a sessão não carrega
essa informação, e esconder controle não é autorização. Ela mostra o botão, diz em texto
que só profissional habilitado aprova, e explica a recusa quando ela vem do servidor.

## Avisos obrigatórios são texto fixo

As duas frases exigidas pelo FR-020 — o diário não garante resposta imediata; a case
manager não emite conduta clínica por assumir a coordenação — são constantes da tela, não
campos do plano. Não dependem do que alguém digitou e não podem ser apagadas por engano
ao editar o plano. `web/plano-crise.test.ts` falha se alguma sumir.
