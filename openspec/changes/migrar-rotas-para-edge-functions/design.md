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

## Riscos

- **Barreiras migradas cedo (lote 2).** É deliberado: elas são o controle, e migrar com volume pequeno dá atenção total. Mas um erro aqui é o pior erro possível. A matriz deste lote é a mais exigente, com prova de acesso direto ao servidor e ao banco.
- **Duas implementações no repositório durante a transição (E4).** Mitigado pelo tempo curto por lote e por nenhum lote começar antes do anterior fechar.
- **Segredos mudando de lugar.** Variáveis da Netlify viram segredos do projeto Supabase; o Vault continua com a chave de provedor. A fronteira muda e precisa ser conferida, não assumida.
- **Comportamento observável mudando sem ninguém notar.** Qualquer diferença é defeito, não requisito novo. Os testes existentes de cada domínio rodam contra a plataforma nova sem alteração de expectativa — se um teste precisar mudar para passar, isso é o achado.
- **Ambiente de verificação inexistente.** Sem Supabase local com Docker, não há onde provar antes do corte. Bloqueia o início, não só a verificação.

## Migration Plan

Ordem em `tasks.md`. Reversão por lote conforme E4; reversão depois do corte final exige republicar as rotas Netlify a partir do histórico, e por isso o corte só ocorre após a matriz completa.
