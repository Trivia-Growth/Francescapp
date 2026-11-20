# Design

## Context

Decisão, medição e desenho em `executar-funcoes-no-supabase`. Este documento trata só da execução.

Ponto de partida medido em 17/11/2026: 39 arquivos de rota, 104 caminhos, 28 com parâmetro, 2.809 linhas. A composição — 21.270 linhas em `netlify/functions/_shared`, 2.106 em `packages/cadastro/src` e 5.143 em `supabase/functions/_shared` — não muda.

## Decisions

### E1 — O proxy é o mecanismo de migração, não só um guardador de cabeçalhos

A decisão D6 manteve a Netlify como proxy de `/api/*` por segurança — mesma origem, cookie selado, cabeçalhos num arquivo versionado. A consequência operacional é maior que o motivo original: com uma **tabela de encaminhamento por caminho**, cada um dos 104 caminhos escolhe seu destino de forma independente.

Isso elimina o corte único. Um caminho migra, é verificado, e os outros 103 continuam onde estavam. Se falhar, volta alterando uma linha da tabela — sem republicar função, sem tocar no cliente, sem janela de indisponibilidade.

*Consequência de ordem:* a granularidade do encaminhamento é o caminho, não o domínio. Uma função de domínio pode ser publicada no Supabase e receber só parte dos seus caminhos enquanto a verificação avança.

### E2 — Identidade migra por último, e isso só funciona por causa do proxy

`auth` é a rota de maior risco: 9 caminhos, sessão, CSRF, atestado. Fica no último lote.

O que torna isso possível: como o proxy preserva a mesma origem, o cookie de sessão selado emitido pelas rotas Netlify chega ao proxy e é encaminhado à Edge Function junto com o resto da requisição. A Edge Function lê a mesma sessão, pela mesma cadeia de validação, sem saber que quem a emitiu está em outra plataforma.

Logo, durante toda a transição há **uma só autoridade de sessão**, e as 38 rotas restantes migram contra uma identidade conhecida e estável. Trocar isso de ordem — migrar `auth` primeiro — colocaria emissão nova e consumo novo no mesmo passo, sem referência para atribuir uma regressão.

### E3 — Lotes por risco crescente, com a matriz reexecutada a cada lote

Sete lotes, do menos arriscado ao mais. Cada um fecha com a matriz de autorização do seu domínio reexecutada **contra as Edge Functions**, não contra o runtime antigo (D5).

| Lote | Rotas | Caminhos | Conteúdo | Por que nesta posição |
| --- | --- | --- | --- | --- |
| 1 | 5 | 5 | `configuracao-sistema`, `regras-atendimento`, `auditoria`, `preautorizacoes-familiares`, `solicitacoes-titular` | Um caminho cada, nenhum parâmetro. Valida a infraestrutura comum com o menor dano possível se estiver errada |
| 2 | 4 | 16 | `barreira-acesso`, `barreira-contato`, `barreira-equipe`, `barreira-tarefa` | São as próprias barreiras. Migrar cedo e com atenção total, ainda com volume pequeno e zero parâmetro |
| 3 | 9 | 19 | `plano`, `aprovador-plano`, `aprovar-objetivo`, `campo-extra-plano`, `habilitacao-plano-crise`, `plano-crise`, `orientacao`, `encaminhamento`, `tarefas-cuidado` | Primeiro domínio com parâmetro no path. Exercita o parseamento de sufixo em volume real |
| 4 | 9 | 21 | `pacientes`, `edicao-paciente`, `contato`, `acesso-paciente`, `vinculos-profissionais`, `concessoes-equipe`, `convites-familiares`, `cancelar-convite-familiar`, `consulta-convite-familiar` | Cadastro, vínculo e concessão. Depende das barreiras do lote 2 já estarem provadas |
| 5 | 8 | 16 | `anamnese`, `diario`, `saude`, `linha-tempo`, `contexto-cuidado`, `rede-cuidado`, `pendencias`, `documentos` | Conteúdo clínico com audiência familiar. Precisa dos lotes 2 e 4 provados |
| 6 | 3 | 18 | `agenda-google`, `transcricao`, `exportacoes` | Integrações externas. `agenda-google` tem 13 caminhos em 40 linhas, mas depende de OAuth e Vault |
| 7 | 1 | 9 | `auth` | Maior risco, migra com todo o resto já provado (E2) |
| | **39** | **104** | | |

### E4 — Cada lote é reversível por linha de tabela até o corte final

Enquanto as rotas Netlify existirem, reverter um lote é editar o encaminhamento. As funções Netlify só são removidas na tarefa final, depois da matriz completa.

*Custo aceito:* o repositório carrega as duas implementações durante a transição, e uma correção de defeito nesse período pode precisar ser aplicada nos dois lados. Esse é o preço da reversão barata, e é menor que o de um corte único que não volta.

### E5 — Medir a partida a frio, não transpor a medição antiga

`configuracao-servidor.ts` tem cache de 30 segundos e uma cicatriz documentada: em 13/11/2026, mediu-se em produção que a primeira requisição a um processo novo às vezes não concluía a leitura de configuração, e o serviço inteiro respondia "indisponível".

Essa medição é de outro runtime. No isolate, o ciclo de vida do cache é outro. O lote 1 existe também para medir isso com rotas de baixo impacto, antes que qualquer rota de autorização dependa do comportamento.

*Regra:* nenhuma falha de leitura de configuração pode **ligar** um serviço. O comportamento atual — falha mantém o que o ambiente já dizia — é preservado literalmente.

### E6 — O que a execução de 19/11/2026 apurou, e onde o desenho precisou ser corrigido

Grupos 1 e 2 executados no que não depende de operação remota. Três coisas mudaram de entendimento.

**O cookie selado não é o que atravessa o proxy nas 38 rotas.** `supabase/functions/_shared/sessao/nucleo.ts` emite o cookie de sessão com `Path=/api/sessao`. O navegador só o envia para `/api/sessao/*`. Nas outras rotas a identidade que viaja é o cabeçalho `x-sessao`, mais `x-csrf` nos comandos. A conclusão de E2 — uma só autoridade de sessão durante a transição — continua de pé, mas o mecanismo é o cabeçalho, não o cookie. Quem for executar o lote 7 precisa saber disso: é na rota `auth` que o cookie realmente atravessa.

**O caminho é derivado da URL, nunca de um cabeçalho.** A Edge Function reconstrói `/api/*` removendo o prefixo `/functions/v1/<nome>` do próprio `pathname`. A alternativa — o proxy informar o caminho original num cabeçalho — foi recusada: cabeçalho é entrada controlável pelo cliente, e aceitar um viraria desvio de roteamento por requisição. Pelo mesmo motivo o proxy descarta `authorization` e `apikey` vindos do cliente antes de acrescentar os seus.

**O cache de 30 segundos vira estado por isolate.** `cache` e `emVoo` de `configuracao-servidor.ts` são estado de módulo. No processo Netlify a janela de 30 s cobre muitas requisições; no isolate, efêmero e numeroso, ela tende a cobrir pouquíssimas, e a retentativa de 150 ms do caminho frio passa a ser exercitada com muito mais frequência. Nada foi alterado: mexer nisso antes da medição na plataforma real repetiria exatamente o erro que E5 descreve. A decisão fica para 3.4, com o número em mãos.

*Limite desta passagem:* o módulo de encaminhamento existe (`netlify/functions/_shared/encaminhamento-api.ts`), mas não há arquivo de função registrando o proxy em `/api/*`, e `netlify.toml` não foi alterado. A ligação é o primeiro passo de quem retomar. Nenhuma Edge Function de domínio foi criada — isso é o grupo 3.

### E8 — O que a execução de 20/11/2026 apurou no lote 1

**Não existe implantação na Netlify deste repositório.** Com a sessão da CLI autenticada, nenhum dos 12 projetos das três equipes do solicitante é o FFCMApp. Isso derruba a premissa de 2.5 ("mover as variáveis da Netlify") e redefine o que "estado anterior" significa nas tarefas de paridade: o lado antigo é o módulo de rota executado, não uma implantação servindo tráfego. A reversão por tabela (E4) continua correta como mecanismo, mas hoje reverte para um destino não publicado.

**A migração abre uma porta fora da mesma origem.** D6 manteve a Netlify como proxy para preservar a mesma origem. A Edge Function publicada, porém, também responde em `https://<ref>.supabase.co/functions/v1/<nome>/...` a quem tiver a chave anônima, que é pública por construção. `verify_jwt` barra quem não a tem (401 sem a função ser invocada), e a barreira real continua sendo sessão, concessão e atestado no banco — não é escalonamento. Mas os controles que dependiam de origem passam a ter um caminho que não atravessa o proxy, e isso precisa de tratamento antes de encaminhar qualquer caminho em produção.

**A paridade de cabeçalho não é automática.** A plataforma acrescenta 17 cabeçalhos à resposta, entre eles `sb-error-code: EDGE_FUNCTION_ERROR` — numa resposta de negócio legítima — e um `set-cookie` da Cloudflare com `Domain=supabase.co`. O proxy repassa a resposta inteira, inclusive `set-cookie`, por decisão deliberada de 2.2. Corpo e status ficam idênticos; o cabeçalho, não.

**A partida a frio real é uma ordem de grandeza maior que a de 1.4.** Função de domínio publicada, bundle de 1,5 MB: 369-498 ms no primeiro pedido após a publicação, 89-142 ms quente — de ~280 a ~400 ms de custo de isolate, contra os ~28 ms medidos localmente com cache de módulo quente e função mínima. E esse número ainda não inclui banco: as respostas medidas pararam no gate de interruptor.

**O gate de interruptor e o roteamento trocam de ordem.** Na Netlify o roteamento é da plataforma (`config.path`) e acontece antes do gate; na Edge o roteamento é da própria função e `criarFuncaoEdge` o aplica antes do gate. A diferença não é observável pelo cliente porque o proxy casa o caminho contra a tabela antes de encaminhar — mas é observável por quem chamar a função direto, e aí o envelope de API substitui o 404 do site.

## Riscos

- **Barreiras migradas cedo (lote 2).** É deliberado: elas são o controle, e migrar com volume pequeno dá atenção total. Mas um erro aqui é o pior erro possível. A matriz deste lote é a mais exigente, com prova de acesso direto ao servidor e ao banco.
- **Duas implementações no repositório durante a transição (E4).** Mitigado pelo tempo curto por lote e por nenhum lote começar antes do anterior fechar.
- **Segredos mudando de lugar.** Variáveis da Netlify viram segredos do projeto Supabase; o Vault continua com a chave de provedor. A fronteira muda e precisa ser conferida, não assumida.
- **Comportamento observável mudando sem ninguém notar.** Qualquer diferença é defeito, não requisito novo. Os testes existentes de cada domínio rodam contra a plataforma nova sem alteração de expectativa — se um teste precisar mudar para passar, isso é o achado.
- **Ambiente de verificação inexistente.** ~~Sem Supabase local com Docker, não há onde provar antes do corte.~~ **Resolvido em 19/11/2026** (0.2): o Supabase local sobe nas portas 55421-55425, com Supavisor em transaction mode e Edge Runtime. O risco mudou de lugar: o host tem ~1,9 GiB de memória para Docker e divide com a pilha de outro projeto, então **a pilha completa não cabe** — o Supavisor entra em laço de reinício. Prova-se banco, pooler e Edge Runtime, um conjunto enxuto por vez.
- **A cadeia de migrações não aplica limpa num banco novo.** Parou em `20261125160000_contexto_acessos_gerenciados.sql` com `permission denied for function cadastro_gerenciado_proprio`: a migração troca o dono da função antes de revogar a ACL, e o migrador tem a membership com `inherit false`. 207 de 234 migrações aplicaram. O teste de cadeia do repositório não pega isso porque roda como superusuário e cobre só as ~20 primeiras migrações. Sem banco novo reconstruível não há como provar a migração de rotas em cima dele.

### E7 — O que a execução de 19/11/2026 mediu no ambiente local

**Partida a frio, medida no Edge Runtime, não transposta (E5).** Função mínima, política `per_worker`: 402,8 ms na primeira requisição com o módulo ainda não compilado; 51,1-51,2 ms na primeira requisição a um isolate novo com cache de módulo quente; 22,4-23,4 ms nas requisições seguintes do mesmo isolate. Ou seja, criar isolate custa de ~28 ms a ~380 ms **acima** do atendimento quente, para código que não importa nada e não toca no banco. A conexão ao banco entra por cima: 64,3 ms na primeira consulta de um processo frio pelo Supavisor, contra 9,7-13 ms quente. O número de uma rota de domínio real continua sendo tarefa de 3.4 — o daqui é piso, não teto.

**Consequência para o cache de 30 s.** O isolate é barato de criar, logo será criado com frequência, e a janela de 30 s de `configuracao-servidor.ts` cobrirá pouquíssimas requisições por isolate. Isso confirma a leitura de E6 com número, mas não autoriza mexer: a decisão espera 3.4, como E5 manda.

**Supavisor em transaction mode provado localmente (D8).** `supabase start` passou a subir o pooler (bloco `[db.pooler]` em `supabase/config.toml`, porta 55425, `pool_mode = "transaction"`). O adaptador do isolate conecta, executa consulta autorizada, recebe negativa de papel sem grant, mantém `SET LOCAL ROLE` dentro da transação e devolve o papel de login entre invocações. A RPC `api.consultar_regras_atendimento` foi executada ponta a ponta por esse caminho, com atestado verificado pelo banco contra a chave do Vault — é a parte que faltava em 2.3.

**Portas locais deslocadas.** 55321-55324 colidiam com a pilha local de outro projeto do solicitante. O conjunto foi movido +100, de forma previsível (API .21, banco .22, Studio .23, SMTP .24, pooler .25), e `major_version` corrigido de 15 para 17, que é o do projeto remoto e o mínimo exigido pela sintaxe `grant ... with inherit false` das migrações. `scripts/validar-configuracao-local.mjs` ainda afirma 15 e passa a falhar: pendência registrada em `tasks.md` 0.2, não corrigida aqui por ser de outra frente.

## Migration Plan

Ordem em `tasks.md`. Reversão por lote conforme E4; reversão depois do corte final exige republicar as rotas Netlify a partir do histórico, e por isso o corte só ocorre após a matriz completa.
