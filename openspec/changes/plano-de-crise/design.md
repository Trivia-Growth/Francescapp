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

DF-021 (17/11/2026) esclarece a alçada: o case manager atual do caso recebe
habilitação explícita. Pode ter perfil Administrador ou Profissional; ser administrador
não basta. A interpretação anterior que excluía Administrador foi substituída pela
migration aditiva `20261125040000_plano_crise_case_manager_atual.sql` no CHECK,
na operação de habilitação e na aprovação. Não há concessão automática nem backfill.
O CHECK cobre perfil; `estado = 'vinculada'` é exigido ao marcar e aprovar, permitindo
revogar concessões já habilitadas. Desmarcar continua possível em qualquer estado.

A aprovação consulta o último retrato de `cadastro.acompanhamento_caso` por versão,
com igualdade entre `responsavel_usuario_id` e ator autenticado. Sem retrato ou com
responsável nulo, recusa. A consulta ocorre **após** a trava `FOR UPDATE` do paciente,
a mesma trava usada por `operacao.editar_paciente_privado` ao trocar responsável;
vale também antes de devolver replay. Policy restritiva de INSERT exige a mesma
liderança atual, além da policy de identidade/concessão existente. O owner recebe só
SELECT de paciente, versão e responsável no histórico, filtrado pelo acesso ao paciente.

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
o grant por coluna e a policy que só aceita habilitação para Administrador ou Profissional.

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
que só case manager atual e habilitado aprova, e explica a recusa quando ela vem do servidor.

## Avisos obrigatórios são texto fixo

As duas frases exigidas pelo FR-020 — o diário não garante resposta imediata; a case
manager não emite conduta clínica por assumir a coordenação — são constantes da tela, não
campos do plano. Não dependem do que alguém digitou e não podem ser apagadas por engano
ao editar o plano. `web/plano-crise.test.ts` falha se alguma sumir.

## Recorte de ameaças e evidências — DF-021

Escopo: integridade do carimbo de crise; navegador/HTTP não confiáveis, servidor que
assina atestado e RPC PostgreSQL com owner dedicado/RLS. Ator autenticado pode tentar
RPC diretamente ou reenviar pedido antigo, mas não recebe o papel owner nem a chave de
assinatura. Não inclui migração remota ou validação do provedor Auth real.

- **Alta:** colaborador habilitado globalmente aprovar caso liderado por outra pessoa.
  Mitigação implementada: responsável atual após trava do paciente + INSERT RLS restritivo.
- **Alta:** antigo titular repetir pedido após troca/revogação. Mitigação implementada:
  revalidar liderança antes de idempotência e manter concessão/sessão/habilitação vigentes.
- **Alta:** confundir liderança administrativa com alçada clínica. Mitigação implementada:
  habilitação explícita e liderança do caso cumulativas, para ambos os perfis.

Suposição conservadora: o último retrato por versão é fonte vigente; ausência/nulo não
restaura titular anterior. DF-021 confirma negócio; nenhuma habilitação real é inventada.
`supabase/tests/plano_crise_case_manager_local.sql` prova wrappers como `authenticated`,
INSERT direto negado, RLS sob owner, troca, falta de habilitação, sessão encerrada,
Família e preservação dos carimbos. A serialização usa a trava já existente da edição;
este teste não exercita duas transações concorrentes. Integração remota segue pendente.
