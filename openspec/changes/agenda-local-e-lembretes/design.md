# Decisões técnicas — agenda local e lembretes (FR-089 a FR-093)

## Contexto

O produto tem uma agenda e ela é do Google, individual, por profissional, lida por quem
entra em modo `google`. Quem entra pelo método `interno` não tem conta no domínio, não tem
Calendar e hoje não tem agenda alguma.

O pedido de 22/11/2026 cria um segundo tipo de compromisso: um que **não tem origem
externa**. A partir daqui convivem, na mesma tela, um compromisso do qual o produto não é
dono — decisão de 19/11/2026, intacta — e um do qual ele é dono porque não existe mais
ninguém para ser. Esse é o fato estruturante, e todas as decisões abaixo decorrem dele.

As decisões do solicitante de 22/11/2026 e as decisões anteriores não reabertas (ver
`proposal.md`) são premissa, não objeto de decisão aqui.

---

## D1 — Onde o compromisso local vive

**Decisão.** Tabela própria `cadastro.compromisso_local`, append-only versionada no mesmo
desenho das demais tabelas de conteúdo do produto: `primary key (registro_id, versao)`,
auto-FK `anterior`, motivo obrigatório a partir da versão 2, trigger bloqueando UPDATE e
DELETE, RLS ligada, `revoke all` dos papéis de aplicação e owner dedicado
`ffcmapp_compromisso_local_owner`.

Guarda: `titular_usuario_id`, janela (`inicio`, `fim`), propósito de catálogo administrado,
local ou modalidade e observação como texto livre **cifrado**, situação de vigência
(`vigente` / `desativado`), autor, instante do servidor e versão.

**Uma agenda por pessoa.** Não há tabela de "agenda": a agenda local de alguém é o conjunto
dos compromissos locais cujo titular é essa pessoa. Não existe agenda sem titular, não
existe compromisso local com dois titulares, e não existe compromisso local sem titular.
Isso é o que mantém a agenda local **individual** e fora do recorte de agenda institucional
compartilhada, que ficou fora da V1.

**Exclusão é desativação versionada**, nunca DELETE: uma versão nova com situação
`desativado`, autor e motivo. O compromisso sai da agenda e continua consultável no
histórico, como todo o resto do produto.

**Alternativa descartada — criar o compromisso numa agenda Google da Francescato e
compartilhá-la com a pessoa.** É a solução "sem código" aparente, e não funciona para o
problema: compartilhar uma agenda Google com alguém exige que esse alguém tenha conta
Google, que é exatamente o que o titular não tem. Além disso recriaria a agenda
institucional compartilhada, que ficou fora da V1 e é recorte próprio. Descartada por
impossibilidade, antes de preferência.

**Alternativa descartada — estender `cadastro.realizacao_compromisso` com linhas sem
`evento_id`, tratando-as como "compromisso".** Aquela tabela registra o que a equipe
**declara sobre** um compromisso alheio; ela não tem janela, não tem propósito e
deliberadamente não tem conteúdo. Transformá-la em compromisso faria uma tabela significar
duas coisas opostas e apagaria a fronteira que a decisão de 19/11/2026 estabeleceu.
Descartada.

**Alternativa descartada — guardar o compromisso local em `cadastro.turno`.** O turno é
execução de plantão: tem check-in, check-out, escala e apuração. Um compromisso não é um
turno, e enfiá-lo ali abriria buraco nos quatro. Descartada.

---

## D2 — A origem é o eixo, e por que isso importa

**Decisão.** `origem` é atributo de primeira classe da projeção de agenda, em conjunto
fechado de exatamente dois valores: `google_individual` e `local`. Dele decorrem quatro
regras, e são elas que fazem as duas origens coexistirem sem virar duas agendas
desconexas nem uma agenda mentirosa.

1. **Uma lista só, ordenada por instante.** A pessoa vê os compromissos do período em
   ordem cronológica, independentemente de origem. É a leitura que ela precisa: o que vem a
   seguir.
2. **Cada item declara sua origem, sempre.** Não há item sem origem visível, nem estado em
   que a origem esteja implícita no agrupamento. É FR-025 literal, e aqui é o que impede o
   produto de parecer dono do que é do Google.
3. **Toda operação é roteada pela origem, no servidor.** Item `local` só é escrito pelo
   caminho novo; item `google_individual` só pelo caminho de FR-049, com a autorização de
   agenda que já existe. Não há operação genérica "editar compromisso" que decida depois
   onde gravar — o roteamento é por tipo na fronteira, não por `if` no fundo.
4. **Nenhum compromisso existe nas duas origens.** Não há espelho, não há cópia, não há
   sincronização em nenhuma direção. Um compromisso local nunca vira evento no Google e um
   evento do Google nunca vira linha local.

**A "última atualização" de FR-025 significa coisas diferentes por origem, e é apresentada
como tal.** Para `google_individual`, é o instante da **última consulta bem-sucedida à
origem**: o produto não sabe quando o Google mudou, sabe quando perguntou. Para `local`, é
o instante da **última versão gravada**, que o produto sabe exatamente. Rotular os dois do
mesmo jeito transformaria "li às 9h" em "está atualizado até 9h", que é afirmação que o
produto não pode fazer sobre agenda alheia — e FR-050 proíbe apresentar dado possivelmente
desatualizado como atual.

**Consequência deliberada:** quando a consulta ao Google falha, a lista apresenta os
compromissos locais, que são confiáveis, e declara que a parte Google está indisponível,
sem apresentar lista parcial como completa. A falha de uma origem não derruba a outra, e
também não se disfarça.

**Alternativa descartada — duas abas: "Minha agenda" e "Agenda local".** Mais simples de
implementar e falsamente honesta: separa bem as origens e destrói a única pergunta que a
agenda responde, que é "o que vem a seguir". Quem usa teria de saber **onde** o compromisso
está antes de saber **quando** ele é. Descartada.

**Alternativa descartada — unificar escondendo a origem, "para a experiência ficar
limpa".** Contraria FR-025 na letra e, pior, faria a pessoa acreditar que editar qualquer
item do calendário produz o mesmo efeito — quando um deles depende de uma integração
externa que pode falhar e o outro não. Descartada.

**Alternativa descartada — espelhar os eventos do Google numa tabela local para "unificar o
modelo de dados".** Daria um código mais bonito e criaria uma segunda fonte de verdade
sobre algo que o produto não é dono, com janela de divergência entre espelho e origem. É
exatamente a decisão de 19/11/2026 ao contrário. Descartada.

---

## D3 — Autorização: agenda da pessoa, administrada por terceiro

**Decisão.** Três papéis distintos sobre a mesma agenda, decididos no banco e repetidos no
servidor.

| Quem | Lê a agenda local do titular | Cadastra, corrige, desativa | Põe lembrete | Registra realização (FR-024) |
|---|---|---|---|---|
| **Titular** | Sim, a sua inteira | Não (S3) | Sim, só os seus | Sim, nos seus |
| **Administrador** | Sim, de qualquer titular | Sim | Não, nos de outra pessoa | Sim |
| **Outro profissional, inclusive do mesmo caso** | Não | Não | Não | Não |
| **Família, como leitora de outra agenda** | Não | Não | Não | Não |

**Família como titular é caso legítimo e separado.** Uma conta de perfil `familia` é
`interno` e, por isso, está entre "pessoas que não possuem acesso ao domínio". Ela pode ser
**titular** da própria agenda local e pôr os próprios lembretes. O que ela nunca faz é ler
a agenda de outra pessoa. Essa distinção — titular versus leitor de agenda alheia — é a que
a policy precisa expressar, e não "família não acessa agenda".

**Como se decide, e onde.** A policy do owner filtra por
`titular_usuario_id = auth_privado.uid()` **ou** perfil Administrador do ator com sessão
válida, e a operação repete a mesma condição antes de gravar. Esconder botão não é
autorização — é a regra de `AGENTS.md`, e aqui ela tem um motivo concreto: a condição atual
de `web/main.ts:2082` é de montagem de tela, nunca foi controle, e quem implementar vai
sentir a tentação de tratá-la como se fosse.

**Autoria individual é preservada na agenda administrada.** O compromisso guarda
`titular_usuario_id` e `autor_usuario_id` como colunas distintas, e a apresentação diz quem
cadastrou. Agenda administrada por terceiro não é agenda do terceiro, e um compromisso
cadastrado pela Edilaine não vira compromisso dela.

**Permissão de agenda não concede acesso clínico.** É FR-023 escrito, e vale aqui sem
exceção: ser Administrador da agenda de alguém não dá acesso a caso, evolução, plano,
diário ou anamnese, nem o contrário. Os quatro controles que `AGENTS.md` separa —
identidade, vínculo com caso, audiência e permissão de agenda — continuam separados, e o
owner da agenda local **não recebe privilégio nenhum** sobre `cadastro.paciente`,
`identidade.agenda_google_vinculo_paciente` ou qualquer tabela de conteúdo clínico. Como em
D6 o compromisso local não guarda paciente, não há nada a vazar no caminho: o controle é
estrutural, não convenção.

**SUPOSIÇÃO CONSERVADORA (S2):** a agenda local do titular é lida pelo titular e por quem
administra, e por mais ninguém. Outro profissional do mesmo caso **não** vê. É o mesmo
recorte que `registrar-realizacao-do-compromisso` adotou para a situação de realização, e é
coerente com a agenda ser individual. Ampliar depois é aditivo e recuperável; estreitar
depois quebra expectativa já criada.

**SUPOSIÇÃO CONSERVADORA (S3):** o titular não cria nem edita compromisso na própria agenda
local. O pedido lhe dá lembretes, não compromissos. Ele registra a realização (FR-024) e
pede mudança fora do produto. Se isso não servir à operação, é a pendência **P3**, que
**bloqueia a tarefa 3.3** — não é suposta aqui, porque dar escrita ao titular cria um
segundo autor na mesma agenda e muda o que "cadastrado pela Edilaine" significa.

**Alternativa descartada — tratar a agenda administrada como concessão nominal, pessoa a
pessoa** (uma tabela "quem administra a agenda de quem"). É o desenho mais flexível e o
mais caro: uma superfície de concessão nova, com atribuição, revogação, auditoria e provas
próprias, para expressar hoje uma regra de uma linha ("Administrador administra todas").
YAGNI. Se P1 trouxer a case manager, a concessão nominal volta à mesa como recorte próprio.
Descartada.

**Alternativa descartada — derivar a autorização do vínculo com o caso.** Faria permissão
de agenda nascer de acesso clínico, que é precisamente o acoplamento que FR-023 proíbe, e
na direção menos óbvia. Descartada.

---

## D4 — Lembrete sem canal externo, e o alcance real

**Decisão.** O lembrete é uma **antecedência declarada pelo titular sobre um compromisso
local seu**, em `cadastro.compromisso_local_lembrete`, uma linha por
(compromisso, titular), com `antecedencia_minutos` e situação de leitura. Seu efeito é
**um aviso no sino de FR-072**, e nada mais.

**O aviso é derivado na consulta, não materializado por agendador.** Um lembrete está
vencido quando `inicio - antecedencia <= agora`; a consulta de avisos passa a incluir os
lembretes vencidos e ainda não lidos do destinatário. Não há `pg_cron`, não há fila, não há
job. Isso não é economia: é consequência direta de não existir canal de saída. Um agendador
que dispara às 7h não alcança ninguém às 7h se o aviso só aparece quando a pessoa abre o
aplicativo — ele só move o mesmo evento para mais cedo, numa tabela que ninguém lê antes.

Isso mantém o desenho D6 de `pwa-e-avisos-no-app`: aviso é **projeção de evento existente**,
não entidade com texto próprio gravado na criação.

**O alcance real, dito com todas as letras.** O lembrete **só alcança quem abre o
aplicativo**. Um lembrete que vence às 7h e uma pessoa que abre às 14h produzem um aviso às
14h — sete horas atrasado. O produto não pode impedir isso e **não vai disfarçá-lo**: o
aviso de lembrete vencido é apresentado marcado como atrasado, com o instante em que
venceu, em vez de parecer pontual (S6). Se a operação exigir que a pessoa seja alcançada
**sem** abrir o aplicativo — e para medicação, consulta e plantão é plausível que exija —,
a decisão seguinte é push ou WhatsApp. Isso é **mudança de escopo própria**, com canal,
consentimento, conteúdo mínimo e retenção a decidir; não é ajuste deste recorte, e não deve
ser contrabandeada como "aviso melhorado".

**O lembrete é da pessoa.** Cada um vê só os seus; quem cadastrou o compromisso **não** vê
os lembretes do titular e **não** sabe se foram lidos (S4). O contrário transformaria o
lembrete em confirmação de leitura, e FR-072 separa deliberadamente aviso lido de ciência
registrada — colapsar os dois aqui reintroduziria, pela agenda, exatamente o que FR-057
proíbe. Se houver consequência operacional para lembrete não aberto, é a pendência **P4**,
que **bloqueia a tarefa 6.4**.

**Nesta fatia o lembrete alcança apenas compromisso local.** O pedido é sobre quem não tem
domínio, e estender ao evento do Google exige chave estável por origem e a concessão
`google_workspace`, que o titular não tem. A extensão é aditiva e cabe numa fatia posterior
(S5).

**Alternativa descartada — gravar o lembrete como `reminder` no Google Calendar.** É onde
um lembrete "naturalmente" moraria, e exige conta Google — que é exatamente quem não tem.
Descartada por impossibilidade.

**Alternativa descartada — notificação do sistema operacional pelo service worker.** Daria
alcance real sem abrir o aplicativo, e é notificação externa: foi descartada em 17/11/2026,
e exige permissão do sistema e registro de dispositivo, ambos excluídos explicitamente em
`pwa-e-avisos-no-app`. Descartada por decisão vigente, não por técnica — e é justamente a
decisão que o solicitante precisará reabrir se o alcance do sino não bastar.

**Alternativa descartada — materializar o aviso num job no instante do vencimento.**
Custo de infraestrutura (agendador, idempotência, reprocessamento) por zero ganho
observável, pelo motivo acima. Descartada.

**Alternativa descartada — tabela de notificação com título e corpo gravados.** É a
alternativa que `pwa-e-avisos-no-app/design.md — D6` já descartou: congela no aviso um texto
cuja audiência pode mudar depois, e a revogação não alcança o que já está escrito.
Descartada por coerência com a decisão existente.

---

## D5 — FR-024 é reusado, por extensão aditiva, com contingência

**Decisão.** A situação de realização do compromisso local entra em
`cadastro.realizacao_compromisso`, a mesma tabela de FR-024. **Não** há mecanismo paralelo.

A extensão é aditiva: coluna `origem` em conjunto fechado (`google`, `local`), coluna
`compromisso_local_id` nullable, e um CHECK de exclusividade — ou `subject_google` e
`evento_id` estão preenchidos e `compromisso_local_id` é nulo, ou o inverso. Tudo o mais
vale sem mudança: append-only com versionamento, unicidade por versão que recusa registros
vigentes contraditórios, catálogo fechado de motivo sem termo clínico, obrigatoriedade de
motivo em `faltou`, proibição de texto livre em `realizado`, vínculo de remarcação nas duas
direções, e a ausência deliberada de `paciente_id`.

**`realizacao_nao_confirmada` continua não sendo gravável**, e a função pura
`cadastro.realizacao_situacao_derivada` continua sendo a única fonte dessa situação. No
ramo local há uma melhora de graça: hoje o instante de término do compromisso **vem do
cliente**, porque o produto não é dono do evento do Google. No compromisso local o `fim`
está no banco, então o ramo local **lê o próprio `fim` e não aceita instante do cliente**.
O ramo local é mais forte que o ramo Google nesse ponto, e deve ser implementado assim em
vez de nivelado por baixo.

**Por quê reusar.** Duplicar significaria recriar cinco garantias já provadas — não
gravabilidade de `realizacao_nao_confirmada`, recusa de transformar ausência de registro em
falta, unicidade por versão provada com duas conexões reais, catálogo de motivo que não
insinua diagnóstico, e ausência de canal lateral paciente↔compromisso — e manter duas
apresentações que precisam concordar. A divergência futura entre elas seria **silenciosa**:
uma ganharia um motivo novo e a outra não, e ninguém descobriria por falha.

**Custo aceito, e ele é real.** Dois pontos do caminho provado são tocados:

1. `subject_google text not null`
   (`supabase/migrations/20261126120000_realizacao_compromisso.sql:18`). O titular sem conta
   no domínio não tem `subject_google`. A coluna precisa ser nullable no ramo local, com o
   CHECK garantindo que o ramo Google continua exigindo-a.
2. O bloco de autorização da operação hoje admite **apenas** `oauth` com concessão
   `google_workspace` de perfil Profissional ou Administrador — que é precisamente o gate
   que exclui o titular local.

**Os dois ramos de autorização ficam explícitos e separados dentro da mesma operação**, um
por origem, cada um com suas provas positivas e negativas, e **nenhum ramo alcança as
linhas do outro**: todas as policies carregam predicado de `origem`. Um bloco único que
aceitasse os dois modos faria uma falha de lógica no ramo local abrir a agenda Google de
outra pessoa, e isso não é risco que se aceite por elegância.

A tarefa correspondente exige **reexecutar as provas existentes de FR-024** para demonstrar
que o ramo Google não mudou de comportamento. Se não puder ser demonstrado, vale a
contingência: **pendência P5**, que **bloqueia a tarefa 7.1** — escolher entre tabela
paralela com a dívida e o motivo técnico registrados, ou adiar a realização do compromisso
local. Essa escolha é da coordenação, não do executor.

**Alternativa descartada — `cadastro.realizacao_compromisso_local`, tabela paralela.** Zero
risco para o caminho provado, e é por isso que ela é a contingência de P5 e não a decisão.
Como decisão, custa duas tabelas, dois owners, duas derivações que precisam concordar e a
mesma garantia provada duas vezes. Descartada, com retorno condicionado.

**Alternativa descartada — guardar a situação dentro da própria versão do compromisso
local.** Pareceria natural, já que o produto é dono: bastaria uma coluna `situacao`. E faria
o mesmo conceito ter dois desenhos — um na tabela do compromisso, outro na de realização —
obrigando carteira, consolidado e qualquer relatório futuro a ler os dois e concordar.
Descartada.

---

## D6 — O que o compromisso local guarda, e o que não guarda

**Decisão.** O compromisso do Google tem título genérico de propósito, sem paciente, por
decisão registrada em `agenda-google-integracao`. O compromisso local segue a **mesma
disciplina**, e aqui ela é ainda mais estrita, porque ele não tem paciente nenhum.

**Guarda:** titular, autor, janela (`inicio`, `fim`, no fuso de São Paulo, igual à decisão
da integração), **propósito de catálogo administrado e fechado** (P6 define os termos
iniciais), local ou modalidade como texto curto, observação opcional, situação de vigência,
versão, motivo a partir da versão 2 e instante do servidor.

**Não guarda:** identificação de paciente, diagnóstico, trecho de evolução, transcrição,
conteúdo de diário, anexo, participante externo, endereço de terceiro.

**Título é propósito de catálogo, não texto livre.** Um campo `titulo` livre convidaria a
escrever "Sessão da Maria — TEA", e esse texto vazaria para quem vê a agenda sem acesso ao
caso. Pior: seria irreversível, porque já estaria escrito, e nenhuma política posterior
desfaz o que a pessoa digitou. Fechar o conjunto é o controle que funciona antes do erro,
não depois.

**Texto livre vai cifrado.** `local_modalidade` e `observacao` são os únicos campos livres,
no mesmo envelope AEAD autenticado das demais fatias, com AAD próprio
(`cadastro.compromisso_local`, `registro_id`, `versao`, nome do campo), e o ramo novo em
`supabase/functions/_shared/cifra-autenticada.ts` é aditivo. FR-042 vale integralmente.
Decifrar acontece no servidor, para quem a operação já autorizou.

**SUPOSIÇÃO CONSERVADORA (S1):** "pessoa que não possui acesso ao domínio" é operacionalizada
como conta com `metodo = 'interno'` em `packages/contracts/src/acessos.ts:10`. É o único
marcador que o produto tem, e é o que separa quem tem Calendar de quem não tem. A agenda
local, porém, **não é negada a quem tem conta Google**: ela é oferecida a quem não tem
outra agenda, e nada no desenho a torna exclusiva. Se a cliente quiser que também a equipe
com domínio use a agenda local, isso é aditivo e não muda nenhum controle.

**SUPOSIÇÃO CONSERVADORA (S8):** sem recorrência nesta V1, igual à V1 do Google. Série e
exceção justificada de FR-023 ficam para quando a recorrência existir nas duas origens; meia
recorrência numa origem só produziria uma agenda que se comporta diferente conforme a
linha.

**Alternativa descartada — campo `titulo` livre com aviso na interface pedindo que não se
escreva nome de paciente.** É o desenho mais flexível e o que confia o controle a quem está
com pressa no meio do plantão. Descartada.

**Alternativa descartada — coluna `paciente_id` no compromisso local.** Resolveria FR-023
("consolidar compromissos do caso") de imediato, e faria a agenda virar canal lateral de
"quem atende quem" para quem tem permissão de agenda e não tem acesso ao caso — o mesmo
motivo pelo qual `cadastro.realizacao_compromisso` **não** tem `paciente_id`. Descartada
nesta fatia; se a cliente precisar do vínculo, é a pendência **P2**, que **bloqueia a tarefa
5.3** e muda o recorte.

---

## D7 — A superfície de agenda deixa de ser condicionada ao modo de acesso

A condição atual de `web/main.ts:2082` (`perfil === 'profissional'` **e**
`modo-acesso === 'google'`) e a recusa de `web/agenda-individual.ts:121` passam a
significar apenas **"a parte Google da agenda só é consultada em modo Google"**. A parte
local é consultada por qualquer pessoa autenticada, sobre a própria agenda, e pelo
Administrador, sobre a agenda que ele administra.

**Isso não é afrouxamento de controle, porque aquela condição nunca foi controle.** Ela é
escolha de montagem de tela: a autorização da agenda Google está na concessão
`google_workspace` verificada no servidor e no banco, e continua intacta. A autorização da
agenda local nasce em D3, no banco e no servidor, e é provada positiva e negativamente —
inclusive por chamada direta ao wrapper, com a tela fora do caminho.

**Alternativa descartada — tela separada para a agenda local, deixando a tela atual
intocada.** Evitaria mexer em superfície existente durante outra frente de frontend, e
desfaz D2: duas telas são duas agendas, com a origem virando endereço em vez de atributo.
Descartada.

---

## Suposições conservadoras — resumo

| # | Suposição | Onde |
|---|---|---|
| S1 | "Sem acesso ao domínio" é a conta com `metodo = 'interno'`; a agenda local não é negada a quem tem domínio | D6 |
| S2 | A agenda local é lida pelo titular e por quem administra, e por mais ninguém | D3 |
| S3 | O titular não cria nem edita compromisso; registra realização e pede mudança fora do produto | D3 |
| S4 | O lembrete é da pessoa: quem cadastrou não vê os lembretes do titular nem se foram lidos | D4 |
| S5 | Nesta fatia o lembrete alcança apenas compromisso local; estender ao Google é aditivo | D4 |
| S6 | Lembrete vencido é apresentado marcado como atrasado, com o instante do vencimento | D4 |
| S7 | Fuso de São Paulo, igual à decisão vigente da integração Google | D6 |
| S8 | Sem recorrência nesta V1, igual à V1 do Google | D6 |
| S9 | Exclusão de compromisso é desativação versionada com motivo, nunca DELETE | D1 |

Nenhuma dessas suposições muda o recorte. As que mudariam viraram pendência bloqueante.

## Pendências bloqueantes

| # | Pendência | Tarefa bloqueada |
|---|---|---|
| P1 | Quem, além do perfil Administrador, administra a agenda de outra pessoa | 3.2 |
| P2 | Se o compromisso local se vincula a paciente ou caso; se sim, o recorte muda | 5.3 |
| P3 | Se o titular cria ou edita compromisso próprio, além de pôr lembretes | 3.3 |
| P4 | Se lembrete vencido e não aberto tem consequência operacional para quem cadastrou | 6.4 |
| P5 | Contingência se a extensão aditiva de FR-024 não preservar o comportamento provado | 7.1 |
| P6 | Catálogo inicial de propósitos do compromisso local | 2.2 |

## Contradições entre o pedido de 22/11/2026 e decisões já tomadas

1. **"Pessoa colocar os lembretes" × notificação externa descartada em 17/11/2026.** É a
   contradição material do pedido. Um lembrete, na expectativa comum, é algo que **chega**
   à pessoa; o único canal que o produto tem é o sino de FR-072, que só alcança quem abre o
   aplicativo. Resolvido por D4 e por FR-092, que escrevem o limite no requisito e
   apresentam o lembrete atrasado como atrasado. **Não resolvido** está o caso operacional
   em que o alcance precisa ser garantido — medicação, consulta, plantão. Esse caso exige
   push ou WhatsApp, é mudança de escopo própria e **precisa de decisão do solicitante**;
   nenhuma tarefa aqui o entrega, e nenhuma deve fingir que entrega.

2. **"Edilaine cadastra os compromissos" × "o produto não é dono do compromisso"
   (19/11/2026).** Aparenta contradição e não é: aquela decisão trata do compromisso **do
   Google**, cuja origem é externa. O compromisso local não tem origem externa, então ou o
   produto é dono, ou ninguém é. A distinção é fácil de perder na implementação — o atalho
   "já que somos donos deste, vamos também espelhar aquele" apaga as duas decisões de uma
   vez. É por isso que D2.4 proíbe espelho em qualquer direção, e por isso a origem é o
   eixo e não um rótulo.

3. **Agenda administrada por terceiro × agenda institucional compartilhada, fora da V1.**
   A proximidade é real. A diferença que a mantém dentro do recorte: a agenda local é **da
   pessoa**, uma por titular, sem audiência coletiva; quem administra cadastra **na agenda
   de alguém**, não publica num calendário comum onde a equipe se vê. Se a cliente quiser um
   calendário único da Francescato, é o recorte excluído e precisa de proposta própria.

4. **FR-025 × a ausência de canal externo.** FR-025 manda "oferecer lembretes e avisos de
   mudança segundo preferência do destinatário" e regula "mensagens externas". O requisito
   foi escrito supondo um canal que a decisão de 17/11/2026 removeu. Resolvido pelo MODIFIED
   de FR-025: "preferência do destinatário" é, hoje, a antecedência declarada por ela dentro
   do aplicativo; a frase sobre conteúdo mínimo de mensagem externa **permanece escrita**
   como limite preexistente para quando o canal existir, e nenhuma mensagem sai do produto
   nesta fatia.

5. **FR-023 × a existência de quem não tem conta Google.** FR-023 fala em "agenda individual
   na própria conta Google do profissional", pressupondo que todo participante tem conta.
   Não é contradição de regra, é lacuna de cobertura: FR-023 nunca disse o que acontece com
   quem não tem conta, e `web/main.ts:2082` implementou a suposição. FR-089 cobre a lacuna
   sem alterar FR-023.

6. **`realizacao_compromisso.subject_google not null` × titular sem domínio.** Contradição
   concreta de esquema, não de requisito: o desenho de FR-024 supôs que toda realização se
   refere a evento de agenda Google de alguém com concessão. Resolvido por D5, com o custo e
   a contingência explícitos em P5.

7. **FR-072 "lido não é ciência" × a tentação de usar o lembrete como prova de aviso.**
   Registrada aqui porque é o erro mais provável na implementação: lembrete lido não prova
   que a pessoa foi avisada a tempo, e não deve alimentar nenhum indicador que afirme isso.
   S4 e P4 tratam disso.

8. **FR-024 já tem um MODIFIED ativo em `registrar-realizacao-do-compromisso`.** Por isso
   esta mudança **não** reedita FR-024 no seu delta, para não manter duas versões ativas do
   mesmo requisito, o que `AGENTS.md — Fontes de verdade` proíbe. A obrigação de reuso está
   escrita como cenário de FR-089 e como decisão em D5.
