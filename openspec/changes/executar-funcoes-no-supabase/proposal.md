# Proposal

## Why

O padrão de referência registrado em `docs/projeto/fundacao.md` diz "Edge Functions em Deno, integrações isoladas em adapters e segredos tratados no servidor". A decisão DF-003 escolheu a Netlify para a infraestrutura e deixou explícito que "publicação, configuração aplicável ao ambiente único e **eventual execução de funções ainda não foram definidos**".

A implementação foi para `netlify/functions/`, com 39 arquivos de rota e 104 caminhos declarados. Isso nunca foi decidido: é deriva de implementação sobre um ponto que a fundação deixou em aberto. Também contraria a diretriz permanente de 01/11/2026 do `AGENTS.md`, que manda preferir recurso nativo do Supabase disponível sem custo adicional no plano vigente, em vez de reimplementá-lo.

Em 17/11/2026 o solicitante informou que seu padrão é executar funções no Supabase, não na Netlify. Esta mudança registra a decisão, mede o custo real e define quando e como migrar — sem executar a migração agora.

## What Changes

- Resolver DF-003: a execução de funções passa a ser Supabase Edge Functions em Deno; a Netlify permanece como publicação do site estático.
- Congelar a superfície acoplada: nenhuma rota nova deve aumentar o acoplamento à Netlify, e as fatias em andamento (`turno-e-execucao-do-cuidado`, `financeiro-despesa-e-repasse`) escrevem no formato portável.
- Planejar a migração das 39 rotas como fatia própria, posterior à V1 conectada, com a matriz de autorização reexecutada na plataforma nova.
- **Não** alterar o protocolo de sessão, autorização, esquema, RLS ou comportamento observável. Esta é troca de runtime de transporte, nada mais.

### Medição de 17/11/2026

Levantada sobre `origin/main` nesta data. Números, não estimativa.

| Camada | Arquivos | Linhas | Portável como está |
| --- | --- | --- | --- |
| Rotas `netlify/functions/*.ts` | 39 | 2.809 | não — é a superfície a migrar |
| Composição `netlify/functions/_shared/**` | 177 | 21.270 | sim |
| `packages/cadastro/src/**` | 24 | 2.106 | sim |
| `supabase/functions/_shared/**` | 42 | 5.143 | sim — **já é Deno** |

A superfície acoplada é **2.809 linhas, cerca de 9% do código de servidor**. As 21 mil linhas de composição não dependem de plataforma.

Acoplamento concreto encontrado:

- **Zero importação de `@netlify/*`** em qualquer arquivo. Nenhuma API proprietária em uso.
- `export const config = { path: [...] }` nas 39 rotas, somando 104 caminhos, vários com parâmetro (`/api/pacientes/:paciente_id/plano`).
- `process.env` em 39 arquivos, com a configuração variável já vindo do banco por `configuracao-servidor.ts` e o ambiente servindo apenas como padrão e interruptor.
- `supabase/functions/_shared` já existe em Deno, com `deno.json` por `npm:` specifiers, **já importado pelas funções Netlify**, e já coberto por `pnpm run typecheck:deno`.

### Decisões aplicadas

- **Destino**: Supabase Edge Functions em Deno, alinhado ao padrão de `fundacao.md` e à diretriz de 01/11/2026.
- **A Netlify permanece** servindo o site estático e os cabeçalhos de `netlify.toml`. A migração move execução de função, não hospedagem.
- **Momento**: depois da V1 conectada. Migrar 39 rotas agora, com outra frente ativa em `web/` e as fatias de turno e financeiro na fila, trocaria risco de entrega por consistência de arquitetura, e obrigaria a migrar primeiro e escrever as rotas novas depois — em vez de escrevê-las já portáveis.
- **O protocolo de sessão não muda junto.** Edge Function do Supabase recebe `Authorization: Bearer` do SDK nativamente, e será tentador trocar o cookie selado, o `x-sessao`, o CSRF e o atestado de operação por isso. Trocar transporte e protocolo de identidade na mesma fatia destrói a capacidade de atribuir qualquer regressão a uma das duas mudanças. A troca de protocolo, se desejada, é decisão material própria.

### Exclusões deste recorte

- Execução da migração. Este pacote decide e planeja; a fatia de execução é posterior e tem suas próprias tarefas.
- Mudança de protocolo de sessão, de autorização, de esquema ou de RLS.
- Mudança de hospedagem do site estático.
- Troca de provedor de banco, de IA ou de armazenamento.

### Decisões de 17/11/2026, segunda rodada

Todas confirmadas pelo solicitante. Nenhuma pendência de decisão permanece aberta neste pacote.

- **Perda do deploy preview aceita**; D1 confirmada. O solicitante trará Docker na semana seguinte para subir o Supabase local e executar os testes ali.
- **Granularidade**: uma Edge Function por domínio, 39 ao todo, cada uma parseando o próprio sufixo de caminho (design D7).
- **Conexão**: Supavisor em transaction mode, sem pool próprio no isolate. Cache de configuração e partida a frio reavaliados e medidos de novo no ambiente novo (design D8).
- **Origem e cabeçalhos**: a Netlify permanece como proxy de `/api/*`, preservando mesma origem, cookie selado e `netlify.toml` versionado. Acesso direto fica adiado e exigiria decidir o protocolo de sessão de novo (design D6).

### Pendências que permanecem

- O ambiente Supabase local com Docker ainda não existe. Enquanto não existir, a verificação conectada da migração fica bloqueada — registrar o bloqueio, não presumir cobertura.

## Capabilities

Nenhuma. Esta mudança não altera requisito funcional, comportamento observável, autorização ou audiência. É decisão de arquitetura e planejamento de migração de runtime, por isso `skip_specs: true` no `.openspec.yaml`. Nenhum requisito foi inventado para satisfazer validação.

## Impact

Enquanto a migração não executa, o impacto é de **disciplina**: as fatias em andamento escrevem rotas finas e composição fora da camada de rota, de modo que a migração futura toque apenas a borda.

Quando executar, o impacto é alto e concentrado: 39 arquivos de rota, a configuração de publicação, as variáveis de ambiente e a fronteira de origem. Trocar o runtime **invalida toda prova de autorização executada no runtime antigo** — a matriz positiva e negativa precisa ser reexecutada por inteiro contra a plataforma nova, incluindo acesso direto, outro paciente, outro perfil e revogação. Nenhum teste anterior vale como evidência do estado migrado.

Esta proposta não autoriza deploy, migração remota, criação de função no projeto Supabase, mudança de variável de ambiente ou qualquer operação externa.
