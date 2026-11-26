# Proposal

## Why

`executar-funcoes-no-supabase` decidiu o destino, mediu o custo e fechou as quatro questões de desenho em 17/11/2026. Falta a fatia que **executa**: mover 39 rotas e 104 caminhos de `netlify/functions/` para Edge Functions do Supabase.

Sem esta mudança, a decisão existe e a ação não — exatamente o que o solicitante pediu para evitar ao mandar registrar as tarefas.

## What Changes

- Estabelecer o proxy de `/api/*` na Netlify com tabela de encaminhamento **por caminho**, o que permite migrar rota a rota sem corte único.
- Estabelecer a infraestrutura comum das Edge Functions: `deno.json`, importação do código compartilhado, leitura de ambiente, conexão por Supavisor em transaction mode e tradução de erro.
- Migrar as 39 rotas em 7 lotes por domínio e risco, mantendo as duas plataformas servindo em paralelo durante a transição.
- Reexecutar a matriz de autorização completa contra as Edge Functions, por lote e ao final.
- Desligar as rotas Netlify e remover `netlify/functions/*.ts` somente depois da verificação final.

### Exclusões deste recorte

- Mudança de protocolo de sessão. Cookie selado, `x-sessao`, CSRF e atestado de operação permanecem exatamente como estão.
- Mudança de esquema, RLS, RPC, contrato de API ou comportamento observável. Nenhuma resposta muda de forma.
- Acesso direto do cliente ao Supabase. A origem continua sendo a da Netlify.
- Mudança de hospedagem do site estático.
- Otimização de desempenho que não seja a conexão exigida pela plataforma nova.

### Decisões herdadas

De `executar-funcoes-no-supabase`, todas de 17/11/2026. Não são reabertas aqui.

- Destino: Supabase Edge Functions em Deno (D1). Netlify fica com o estático e o proxy.
- Uma Edge Function por domínio, 39 ao todo, cada uma parseando o próprio sufixo (D7).
- Supavisor em transaction mode, sem pool próprio no isolate (D8).
- Netlify permanece como proxy de `/api/*`, preservando mesma origem (D6).
- Transporte migra, protocolo de identidade não (D4).
- Toda prova de autorização é refeita na plataforma nova (D5).
- Sem camada de abstração entre plataformas (D3).

### Pré-condições que bloqueiam o início

- **V1 conectada entregue.** Esta fatia é posterior (D2). Migrar antes obrigaria a migrar 39 rotas e depois acrescentar cerca de 20 de turno e financeiro sobre a plataforma nova, com duas matrizes de autorização em vez de uma.
- **Supabase local com Docker funcionando.** O deploy preview por PR foi abandonado em 17/11/2026, e a verificação passou a depender desse ambiente. Sem ele, não há onde provar a migração antes do corte. É bloqueador, não inconveniente.
- **Tarefas 2.1 e 2.2 de `executar-funcoes-no-supabase` concluídas**: `concessoes-equipe` (449 linhas para 1 caminho) e `acesso-paciente` (152 para 2) aliviadas, com a composição movida para fora do arquivo de rota. Migrar regra de negócio junto com transporte mistura dois riscos.

## Capabilities

Nenhuma. Troca de runtime de transporte, sem alteração de requisito, comportamento observável, autorização ou audiência. `skip_specs: true` no `.openspec.yaml`; nenhum requisito foi inventado para satisfazer validação.

Se durante a execução aparecer qualquer diferença de comportamento observável, ela é **defeito da migração**, não requisito novo — corrigir, não especificar.

## Impact

39 arquivos de rota removidos, 39 Edge Functions criadas, configuração de publicação e de proxy alterada, segredos movidos das variáveis da Netlify para o projeto Supabase.

O risco concentra-se em autorização: a barreira depende de como a identidade chega à RPC, e é exatamente isso que muda de transporte. Nenhum teste executado contra as funções Netlify vale como evidência do estado migrado.

Não autoriza, por si, operação remota. Cada passo que toque o projeto Supabase ou a publicação exige a autorização vigente na data da execução.
