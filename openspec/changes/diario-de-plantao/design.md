# Decisões técnicas — diário de plantão (FR-073 a FR-081)

## Contexto

A ficha de papel da equipe tem doze campos. Seis já têm lugar canônico no produto, três
existem parcialmente em outro artefato, três não existem. O produto guarda a execução
**evento a evento**, com instante, autor e retificação versionada por linha; a ficha é
**um formulário por plantão**. Esta mudança não escolhe entre os dois: mantém o
armazenamento evento a evento e acrescenta a ficha como superfície de entrada e de
leitura.

As decisões do solicitante de 20/11/2026 (ver `proposal.md`) são premissa, não objeto de
decisão aqui.

---

## D1 — Atomicidade: a ficha grava em várias tabelas numa só transação de banco

**Decisão.** A submissão da ficha é **uma** chamada a uma operação privada nova,
`operacao.ficha_plantao_operacao_privada`, sob owner dedicado
`ffcmapp_ficha_plantao_owner`. Essa operação executa, na mesma transação, as gravações
em `turno_execucao_registro` e nas tabelas `turno_*_versao` correspondentes, mais os
campos novos do plantão. O servidor não faz N chamadas. Vale a atomicidade nativa do
PostgreSQL: ou tudo comita, ou nada comita. A auditoria obrigatória entra na mesma
transação, no padrão já usado em `*_auditoria_obrigatoria.sql`.

**Se uma parte falhar:** a transação inteira é revertida, a interface informa a falha
sem sucesso falso, e o rascunho permanece recuperável para nova tentativa (FR-073,
cenário "Falha parcial não deixa meia-ficha"; FR-074). A idempotência segue o par
`chave`/`digest` já existente em `operacao.turno_execucao_recibo`: reenvio da mesma
chave com o mesmo digest devolve o mesmo resultado; com digest diferente devolve
`conflito_idempotencia`.

**Alternativa descartada — o servidor orquestra as chamadas existentes uma a uma.**
Reaproveitaria handlers prontos, mas cada chamada é sua própria transação: uma falha no
meio deixa metade do plantão gravado e metade não, exatamente a meia-gravação que o
requisito proíbe. Compensação no servidor (desfazer o que já entrou) é impossível aqui,
porque as tabelas são append-only com trigger que bloqueia UPDATE e DELETE: "desfazer"
viraria uma versão de retificação espúria no histórico imutável. Descartada.

**Alternativa descartada — uma tabela nova `ficha_plantao` que guarda tudo e replica
depois.** Cria a segunda fonte de verdade que a decisão 1 proíbe, e a replicação
assíncrona abre janela em que ficha e consolidado discordam. Descartada.

---

## D2 — Modelo de formulário: generalizar o catálogo do Plano, aditivamente

**Decisão.** Generalizar `cadastro.campo_extra_plano_catalogo`, em três movimentos
aditivos, em vez de criar um catálogo próprio:

1. **Coluna de escopo** `escopo text not null default 'plano_cuidado'`, com CHECK
   fechado em `('plano_cuidado','ficha_plantao')`. O `default` preserva as linhas
   existentes sem backfill de valor.
2. **Ações parametrizadas**: as ações literais `api.listar_campo_extra_plano` e
   `api.gravar_campo_extra_plano` ganham irmãs com escopo no corpo do pedido. As
   literais antigas continuam existindo e continuam significando `plano_cuidado`;
   nenhuma chamada em produção muda de significado.
3. **Revalidação do snapshot extraída para função chamável**. Hoje a revalidação do
   retrato id→versão sob `for share` está **injetada no corpo de
   `api.plano_cuidado_operacao_privada` por substituição de âncora textual**. Essa
   injeção é o ponto frágil: um segundo consumidor repetiria a substituição e a
   divergência entre as duas cópias seria silenciosa. A revalidação vira
   `operacao.campo_extra_revalidar_snapshot(escopo, snapshot)`, chamada pelos dois
   caminhos, com o mesmo `for share` e a mesma recusa com `conflito`.

**Colunas novas do catálogo**, as quatro lacunas levantadas: `ordem integer`
(apresentação determinística, hoje a listagem é por `criado_em`), `obrigatorio boolean
not null default false`, `de_fabrica boolean not null default false`, e ampliação do
CHECK de `tipo` para incluir `booleano` e `texto_longo`. Todas aditivas; o Plano não
muda de comportamento porque os defaults reproduzem o que ele faz hoje.

**Por quê.** O catálogo do Plano é **trilha já provada**, e provada exatamente na
garantia que a seção 9 do documento da cliente exige: não há grant de `DELETE` — remover
é `ativo = false`, que bumpa `versao`; os valores vivem dentro do envelope cifrado da
versão append-only, então mudar o catálogo não toca linha de resposta nenhuma; escrita
nova sob catálogo mudado manda o retrato id→versão, o banco revalida sob `for share` e
**recusa com `conflito`** em vez de ajustar em silêncio; a interface mantém valor de
campo inativo visível e bloqueia a revisão sem apagar. Evidências em
`supabase/tests/plano_campos_extras_local.sql:64-76` e `web/plano-cuidado.test.ts:498-595`.
Recriar isso num catálogo próprio é recriar quatro garantias e quatro provas.

**Custo aceito.** Tocar o catálogo do Plano é mexer em caminho em produção: exige
reexecutar as provas do Plano para demonstrar que o comportamento não mudou (tarefa 5.1,
evidência explícita). A extração da revalidação é refatoração de uma função que hoje é
montada por âncora textual — risco real, mitigado por teste que prova os dois caminhos
contra a mesma função.

**Alternativa descartada — catálogo próprio `cadastro.campo_ficha_plantao_catalogo`.**
Zero risco para o Plano e liberdade total de modelagem. Descartada pelo custo em
duplicação: dois catálogos, dois owners, duas telas de administração, duas
revalidações de snapshot que precisam concordar, e a mesma garantia de preservação
provada duas vezes. Pior, a divergência futura seria silenciosa — o Plano ganharia
ordem e a ficha não, ou o contrário. **Se a tarefa 5.1 revelar que a extração da
revalidação não pode ser feita sem mudar o comportamento do Plano, esta alternativa
volta à mesa e vira pendência ao solicitante**, não decisão do executor.

**Alternativa descartada — mover o catálogo do Plano para o novo e deixar o Plano
consumir.** É a generalização "limpa", e é a mais arriscada: renomear tabela, reapontar
owner, reescrever policies e migrar dados de um caminho que já funciona, por um ganho
estético. Descartada por KISS e por não haver requisito que a exija.

---

## D3 — Onde moram os cinco campos que faltam ou estão no lugar errado

Três destinos possíveis foram considerados para cada um: coluna nova em tabela
existente, tabela nova por plantão, ou campo do modelo configurável. O critério é:
**consultável como série e com semântica fechada → coluna ou tipo de medida; texto do
plantão → registro de plantão; variável por cliente → modelo configurável.**

### Plantão diurno/noturno → coluna em `cadastro.turno`

Coluna `periodo text` com CHECK em conjunto administrado (`'diurno'`, `'noturno'`),
nullable. É propriedade do turno, não de um registro dentro dele, e precisa estar
disponível sem ler nenhum evento (o consolidado agrupa por plantão antes de ler
conteúdo).

**Alternativa descartada — chave em `turno.parametros`.** O jsonb é `.strict()` com três
chaves de duração e tolerância, que são **configuração administrada vigente à época**, não
declaração do profissional. Misturar os dois faria o período herdar o versionamento dos
parâmetros. Descartada.

**Alternativa descartada — reaproveitar `turno_escala_versao.tipo`.** É
previsto/substituição/cobertura: cobertura de escala, não período do dia. Um turno
noturno pode ser qualquer um dos três. Descartada.

### Estado emocional → tipo novo em `turno_catalogo_medida`, classe `rotina`

`('estado_emocional','rotina',null)`, com `qualidade`-equivalente em conjunto
administrado e **sem valor numérico**. Herda de graça: instante de ocorrência, autor
identificado, retificação versionada com motivo, consulta como série por período, e o
campo `observacao` cifrado já existente. Herda também, e isso é o ponto, a proibição de
FR-064 de derivar diagnóstico, gravidade ou alerta a partir de medida.

**A ausência de `valor` é deliberada e é o controle:** sem número, não há média, não há
tendência, não há limiar. É a tradução em esquema de "observação declarada, não medida
clínica".

**Alternativa descartada — coluna de texto livre no plantão.** Perderia a consulta como
série e empurraria o conteúdo para prosa, que é exatamente o que FR-064 removeu.
Descartada.

**Alternativa descartada — campo do modelo configurável.** O conjunto de estados é
clínico-adjacente; deixá-lo configurável convidaria a cliente a criar uma escala
pontuada, que a seção 1 proíbe. Descartada por limite de produto, não por técnica.

### Atividades e Observações do plantão → tabela nova `cadastro.turno_plantao_versao`

Tabela append-only versionada por plantão, no mesmo desenho das demais `*_versao`
(`primary key(registro_id, versao)`, auto-FK `anterior`, motivo obrigatório a partir da
versão 2), com os textos cifrados e as respostas dos campos configuráveis no mesmo
envelope.

**Por que tabela nova e não coluna em `cadastro.turno`:** `cadastro.turno` é estado
mutável com `versao` de ciclo de vida (abrir, encerrar). Conteúdo clínico cifrado com
histórico imutável não pode morar numa linha que sofre UPDATE.

**Alternativa descartada — reaproveitar `conteudoEvolucaoDiarioSchema.atividade` do
diário.** É a evolução profissional por área (FR-009), publicada por quem faz a síntese,
com audiência e ciclo próprios. O plantão do AT não é a evolução do fonoaudiólogo.
Reaproveitar faria uma tabela significar duas coisas e quebraria a decisão 1 ao
contrário: um lugar para dois conteúdos. Descartada; FR-009 fica **inalterado**.

**Alternativa descartada — `turno_medida_versao.observacao`.** É observação **de um
registro de rotina**, por linha. A observação do plantão é do plantão. Descartada.

### Pendências escritas → `cadastro.turno_plantao_pendencia_versao`

Tabela própria, append-only versionada, com situação `aberta`/`resolvida` e carimbo de
resolução. Própria, e não dentro de `turno_plantao_versao`, porque pendência tem ciclo de
vida que ultrapassa o plantão: ela nasce num plantão e morre em outro.

**Alternativa descartada — reaproveitar a carteira de pendências.** Os quatro tipos de lá
são **derivados** (`revisao_proxima`, `atualizacao_ausente`, `encaminhamento_sem_retorno`,
`tarefa_atrasada`): calculados, sem autor, sem texto, sem resolução manual. Enfiar uma
pendência digitada nessa lista faria "quem escreveu" e "o que o sistema deduziu" terem a
mesma aparência — e FR-028 existe para manter essa diferença visível. Descartada. Se a
pendência escrita deve **aparecer** ao lado das derivadas, com origem declarada, é a
pendência P3, que bloqueia a tarefa 4.3.

---

## D4 — Papel declarado grava sem virar autorização

**Decisão.** Três barreiras, e a terceira é a que vale:

1. **Catálogo separado da identidade**: `cadastro.papel_declarado_catalogo`, metadado
   organizacional com `ativo`/`versao`, administrado pelo Administrador. Não é coluna de
   `public.usuario` nem de `identidade.concessao_equipe` — justamente para que ninguém
   possa lê-lo no mesmo `for share` em que a autorização é decidida.
2. **O papel é gravado no registro, não na pessoa**: coluna em
   `turno_plantao_versao`, parte do retrato daquele plantão. Por isso renomear ou
   desativar um papel no catálogo não reescreve ficha antiga (FR-079, último cenário).
3. **O owner da autorização não enxerga o catálogo.** O grant do papel
   `ffcmapp_turno_owner` e dos demais owners que decidem acesso **não** inclui
   `cadastro.papel_declarado_catalogo`. Uma regra de autorização que quisesse consultar o
   papel declarado falharia por privilégio, no banco, antes de existir. É controle
   estrutural, não convenção de código.

O enum `usuario.perfil` permanece `check (perfil in ('administrador','profissional','familia'))`.

**Alternativa descartada — acrescentar os papéis ao enum `usuario.perfil`.** É o caminho
intuitivo e é o erro: todo bloco de autorização do produto lê `perfil`, e acrescentar
`acompanhante_terapeutico` ali mudaria o resultado de dezenas de comparações existentes,
em silêncio. Descartada, e a decisão 2 do solicitante já a proíbe.

**Alternativa descartada — reaproveitar `turno_administracao_versao.executor_vinculo`.**
É cifrado, livre, exclusivo de medicação e descreve o **executor externo**, que pode nem
ter conta. Não é o papel de quem preenche a ficha. Descartada.

---

## D5 — A ficha exige turno aberto; o esquecimento tem caminho declarado

**Decisão.** A ficha de plantão **exige turno aberto**, pela mesma razão que FR-061 recusa
ocorrência em turno encerrado: sem turno, não há janela, não há vínculo verificado no
momento do ato e não há a quem atribuir o plantão.

**Quando o AT esquece de abrir:** a tela oferece **abrir o turno agora, declarando a
janela** (início e fim informados pelo profissional), e deixa explícito, no registro e na
apresentação, que a abertura foi **retroativa declarada** — o `aberto_em` do servidor e a
janela declarada ficam ambos gravados e ambos visíveis. O instante do servidor nunca é
substituído pelo informado (é o que FR-055 já determina). A tolerância de atraso continua
sendo a configuração administrada `ffcm.turno.tolerancia_atraso_minutos`; fora dela, a
abertura retroativa é recusada e vira assunto de coordenação, não de produto.

**SUPOSIÇÃO CONSERVADORA (S1):** que exista um teto para a abertura retroativa, e que ele
seja a tolerância administrada já existente, em vez de um parâmetro novo. É o
comportamento mais restritivo compatível com o que está no banco hoje. Se a cliente
quiser ficha retroativa **sem** turno — por exemplo, digitar ontem a ficha de papel de
anteontem —, o recorte muda: deixa de ser "superfície do turno" e passa a ser registro
independente com janela declarada e autorização própria. Isso é a pendência **P5**, que
**bloqueia a tarefa 3.4**. Não é suposto aqui.

**Alternativa descartada — ficha sem turno, criando o turno implicitamente ao salvar.**
Esconde do profissional que um turno foi criado em seu nome, e o índice único parcial
`turno_profissional_aberto_uidx` recusaria a criação se ele tiver outro turno aberto —
falha confusa no meio da submissão. Descartada.

**Alternativa descartada — ficha sem turno, vinculada só ao caso e à data.** É um segundo
caminho de escrita de conteúdo clínico, com autorização própria a construir, para resolver
um esquecimento. Viola KISS e a decisão 1. Descartada.

---

## D6 — Rascunho: no servidor, cifrado, sem audiência

**Decisão.** `cadastro.ficha_plantao_rascunho`, **uma linha por (turno, autor)**,
mutável por UPDATE (é rascunho, não histórico), conteúdo no mesmo envelope cifrado
autenticado dos demais textos livres, com AAD próprio. RLS: somente o **autor**, com
vínculo ativo no caso, lê e escreve a própria linha. **Nenhuma** superfície de relatório,
consolidado, exportação ou audiência familiar alcança a tabela — o grant simplesmente não
existe para os owners de relatório. A linha é removida na publicação bem-sucedida da
ficha, dentro da mesma transação de D1.

O rascunho **não** é versionado e **não** entra na trilha de versões: ele não é registro,
é trabalho em andamento. O histórico de edição exigido pela seção 12 é o das versões
publicadas (FR-074, cenários de edição com motivo), que já é o padrão append-only do
produto.

**SUPOSIÇÃO CONSERVADORA (S2):** o rascunho não tem prazo de expiração automática. Apagar
trabalho de alguém por tempo decorrido é perda de dado silenciosa, e nenhum requisito pede
retenção limitada aqui. Se a cliente quiser expiração, é decisão dela.

**Alternativa descartada — rascunho no navegador (`localStorage`/IndexedDB).** É o que o
`web/turno-execucao.ts` faz hoje, mas hoje o rascunho é **só em memória** (`let rascunho =
false` e o descarte explícito), o que não atende "salvamento e recuperação". Persistir no
navegador poria **conteúdo clínico em claro no aparelho**, fora do envelope cifrado, fora
da RLS, sobrevivendo ao logout e acompanhando o aparelho compartilhado de plantão.
Descartada por segurança, não por conveniência.

**Alternativa descartada — rascunho como versão 0 da própria `turno_plantao_versao`.**
Poluiria o histórico imutável com conteúdo não publicado e faria toda consulta de
relatório precisar filtrar "versão 0", um filtro que, esquecido uma vez, vaza rascunho
para a família. Descartada.

---

## D7 — Fonte da informação e segregação interno/compartilhável

**Decisão.** Dois atributos **por resposta**, não por ficha:

- `fonte` em conjunto fechado: `observacao_direta`, `relato_paciente`, `relato_familiar`,
  `documento`. Fechado em CHECK porque é critério de aceite da cliente e porque texto
  livre aqui vira ruído não consultável.
- `visibilidade` em `interna` | `compartilhavel`, com o padrão de cada campo definido no
  modelo administrado (FR-078) e sobrescrevível por resposta.

A segregação é aplicada **no servidor, na projeção**, não na interface: a consulta
familiar nunca decifra o conteúdo interno, em vez de decifrar e esconder. Omissão não
indica o teor do que foi omitido (FR-081, segundo cenário), seguindo o que FR-062 já faz.

**SUPOSIÇÃO CONSERVADORA (S3):** o padrão de visibilidade de **todo** campo de fábrica é
`interna`. Errar para o lado de não mostrar é recuperável; errar para o lado de mostrar
conteúdo clínico à família sem querer, não. A lista do que nasce compartilhável é a
pendência **P4**, que **bloqueia a tarefa 7.2**.

**SUPOSIÇÃO CONSERVADORA (S4):** mudar a visibilidade de uma resposta já gravada é ato
registrado com autor, instante e motivo, e a visibilidade anterior fica no histórico
(FR-081, terceiro cenário). Nenhum requisito pediu isso explicitamente; é o tratamento
coerente com "histórico imutável de versões relevantes, autoria e trilha de auditoria" da
seção 9.

**Alternativa descartada — uma única marca de visibilidade para a ficha inteira.** Mais
simples, e inútil na prática: a ficha mistura, no mesmo plantão, o que a família deve ler
e a nota que a equipe escreve para a equipe. Marcar tudo de uma vez levaria a marcar tudo
como interno, e a família deixaria de ver o que FR-062 lhe garante. Descartada.

---

## D8 — Nenhuma mudança de audiência, e por que a apresentação nova não é uma

A ficha e o consolidado no formato da ficha **reusam a projeção autorizada de FR-062**.
Não há consulta nova ao banco com regra própria: o que muda é o agrupamento e a rotulagem
do que a projeção já devolve. O PDF é o mesmo caminho de
`netlify/functions/_shared/turno-execucao-pdf.ts`, com um layout a mais, mantendo a
autorização da consulta e o evento de exportação de FR-039.

**Consequência deliberada:** se a projeção de FR-062 omitir conteúdo por audiência, a
ficha mostra o campo como não disponível **sem** revelar o teor — e a ficha impressa de
um familiar não é igual à ficha impressa da equipe. Isso é correto e é a regra vigente.

**Alternativa descartada — uma consulta própria da ficha, otimizada para o formato.**
Seria uma segunda implementação da audiência mais sensível do produto, com todas as
provas positivas e negativas a refazer, e a chance de divergir da primeira. Descartada.

---

## Suposições conservadoras — resumo

| # | Suposição | Onde |
|---|---|---|
| S1 | O teto da abertura retroativa é a tolerância administrada já existente, não um parâmetro novo | D5 |
| S2 | Rascunho não expira automaticamente | D6 |
| S3 | Todo campo de fábrica nasce com visibilidade `interna` | D7 |
| S4 | Mudança de visibilidade de resposta gravada é ato registrado com motivo e histórico | D7 |
| S5 | O conjunto administrado de período contém exatamente `diurno` e `noturno` na semeadura inicial, ampliável pelo Administrador sem alteração de código | D3 |
| S6 | O conjunto de estados emocionais é administrado e **sem valor numérico**, para impedir que vire escala pontuada | D3 |

Nenhuma dessas suposições muda o recorte. As que mudariam viraram pendência bloqueante.

## Pendências bloqueantes

| # | Pendência | Tarefa bloqueada |
|---|---|---|
| P1 | Lista inicial e termos exatos do catálogo de papéis declarados | 6.1 |
| P2 | Quais campos de fábrica nascem obrigatórios | 5.2 |
| P3 | Se a pendência escrita aparece na carteira ao lado das derivadas, e com qual prioridade | 4.3 |
| P4 | Quais campos de fábrica nascem compartilháveis (o padrão adotado é interno) | 7.2 |
| P5 | Se existe ficha retroativa **sem** turno aberto; se sim, o recorte muda | 3.4 |
| P6 | Se a extração da revalidação de snapshot do Plano (D2.3) não puder preservar o comportamento provado, escolher entre catálogo próprio e adiar a generalização | 5.1 |

## Contradições encontradas entre o documento da cliente e as specs existentes

1. **"Relatório diário por AT/enfermagem" (seção 8) × consolidado evento a evento
   (FR-062).** O documento descreve um relatório **redigido** por plantão; o produto
   produz um consolidado **reunido** a partir de eventos. Resolvido por FR-080: o
   armazenamento continua evento a evento, a apresentação passa a ser a ficha. Não é
   contradição de regra, é contradição de forma, e a decisão 1 do solicitante já a
   arbitrou.

2. **"Formulários configuráveis" (seção 9) × catálogo preso ao Plano.** O documento fala
   em formulários, no plural e por contexto; o mecanismo existente é um catálogo único,
   global, do Plano de cuidado, com nome de tabela sem escopo e ações literais. D2 resolve
   com escopo aditivo. Fica registrado que, se a cliente quiser modelos **por caso** ou
   **por profissional**, nem o catálogo do Plano nem esta generalização servem — seria
   recorte novo.

3. **"Estado emocional: estável" (ficha de papel) × FR-064 e FR-028.** A ficha de papel
   trata estado emocional como um dado a registrar e comparar; FR-064 proíbe derivar
   gravidade ou alerta de qualquer medida, e FR-028 exige separar situação operacional de
   sinalização clínica feita por profissional. A seção 1 do próprio documento da cliente
   confirma o limite. Resolvido tratando estado emocional como observação declarada **sem
   valor numérico** (D3), o que torna a derivação estruturalmente inviável, e não apenas
   proibida por texto.

4. **"Profissional (papel: Acompanhante terapêutico)" × `usuario.perfil`.** A ficha supõe
   que papel e perfil são a mesma coisa; no produto, perfil é controle de autorização com
   três valores. Resolvido por D4: papel declarado é rótulo de registro, em catálogo que
   os owners de autorização **não enxergam**. A decisão 2 do solicitante confirma.

5. **"Pendências" × as quatro pendências derivadas da carteira.** Mesmo nome, naturezas
   opostas: uma é escrita por pessoa, as outras são calculadas pelo sistema. Resolvido por
   FR-077, que exige origem declarada em toda superfície. O destino na carteira é P3.

6. **"Medicação" como campo de texto da ficha × FR-059/FR-060.** A ficha de papel tem uma
   linha para medicação; o produto separa prescrição (com fonte documental) de
   administração (com executor, registrador e situação). A ficha **não** pode virar um
   campo de texto para isso sem destruir a separação executor/registrador, que foi decisão
   explícita de 17/11/2026. A ficha apresenta as administrações do plantão como lista
   estruturada, não como linha livre. Registrado aqui porque é a maior distância entre a
   ficha de papel e o produto, e porque quem implementar vai sentir a tentação.
