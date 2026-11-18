# Design

## Context

Motivação e medição em `proposal.md`. Esta mudança não altera requisito; por isso não há delta de spec.

Arquitetura atual: navegador consome `/api/*` servido por 39 funções Netlify, que são finas e delegam a composição para `netlify/functions/_shared/` e `packages/cadastro/src/`, que por sua vez chamam RPCs privadas no PostgreSQL com auditoria obrigatória na mesma transação. Autorização é provada no servidor **e** no banco. Configuração variável vem do banco; ambiente é padrão e interruptor.

O ponto que torna esta migração barata, e que precisa ser preservado: **a camada de rota já é fina**. São 2.809 linhas em 39 arquivos, contra 21.270 linhas de composição independentes de plataforma. A rota faz roteamento, validação de borda e tradução de erro; não contém regra de negócio. A migração troca a borda e não toca no resto.

## Goals / Non-Goals

**Goals**
- Resolver DF-003 com decisão registrada, não com deriva de implementação.
- Manter a camada de rota fina o suficiente para que a migração continue barata enquanto não acontece.
- Preservar integralmente protocolo de sessão, autorização, esquema e RLS.

**Non-Goals**
- Executar a migração nesta mudança.
- Trocar o protocolo de identidade, o modelo de autorização ou o provedor de banco.
- Mover a hospedagem do site estático.
- Criar camada de abstração sobre a plataforma para "ficar agnóstico". Ver D3.

## Custo por rota

Medido em 17/11/2026 sobre `origin/main`. "Param" conta caminhos com parâmetro no path, que é onde o roteamento declarativo da Netlify não tem equivalente direto no Supabase.

| Rota | Caminhos | Com param | Linhas |
| --- | --- | --- | --- |
| `agenda-google` | 13 | 0 | 40 |
| `auth` | 9 | 0 | 85 |
| `pacientes` | 7 | 0 | 64 |
| `plano` | 7 | 3 | 51 |
| `edicao-paciente` | 6 | 1 | 65 |
| `pendencias` | 4 | 3 | 64 |
| `barreira-tarefa` | 4 | 0 | 61 |
| `barreira-acesso` | 4 | 0 | 55 |
| `barreira-contato` | 4 | 0 | 51 |
| `barreira-equipe` | 4 | 0 | 51 |
| `anamnese` | 3 | 2 | 88 |
| `plano-crise` | 3 | 2 | 63 |
| `transcricao` | 3 | 2 | 57 |
| `acesso-paciente` | 2 | 2 | 152 |
| `documentos` | 2 | 1 | 70 |
| `encaminhamento` | 2 | 1 | 63 |
| `orientacao` | 2 | 1 | 63 |
| `diario` | 2 | 1 | 60 |
| `saude` | 2 | 1 | 58 |
| `exportacoes` | 2 | 2 | 53 |
| `concessoes-equipe` | 1 | 0 | 449 |
| `cancelar-convite-familiar` | 1 | 0 | 127 |
| `consulta-convite-familiar` | 1 | 0 | 107 |
| `convites-familiares` | 1 | 0 | 99 |
| `vinculos-profissionais` | 1 | 1 | 86 |
| `contexto-cuidado` | 1 | 1 | 58 |
| `rede-cuidado` | 1 | 1 | 58 |
| `tarefas-cuidado` | 1 | 1 | 56 |
| `linha-tempo` | 1 | 1 | 48 |
| `solicitacoes-titular` | 1 | 0 | 44 |
| `aprovar-objetivo` | 1 | 0 | 43 |
| `auditoria` | 1 | 0 | 43 |
| `regras-atendimento` | 1 | 0 | 43 |
| `aprovador-plano` | 1 | 0 | 42 |
| `habilitacao-plano-crise` | 1 | 0 | 42 |
| `campo-extra-plano` | 1 | 0 | 41 |
| `contato` | 1 | 1 | 40 |
| `preautorizacoes-familiares` | 1 | 0 | 36 |
| `configuracao-sistema` | 1 | 0 | 33 |
| **Total** | **104** | **28** | **2.809** |

Leitura do quadro:

- **28 dos 104 caminhos usam parâmetro no path.** Esse é o trabalho real de roteamento, concentrado em poucas rotas.
- `agenda-google` tem 13 caminhos em 40 linhas: é um despachante puro. Migra praticamente por cópia.
- `concessoes-equipe` tem 449 linhas para 1 caminho. É a exceção e merece inspeção: provavelmente contém composição que pertence a `_shared/`, e deveria ser aliviada **antes** da migração, não durante.
- `acesso-paciente`, com 152 linhas para 2 caminhos, está na mesma situação em menor grau.

## Decisions

### D1 — Supabase Edge Functions em Deno é o destino; a Netlify fica com o estático

Alinha a implementação ao padrão já registrado em `fundacao.md` e à diretriz de 01/11/2026 de preferir o recurso nativo do Supabase. A Netlify continua publicando `web/dist` e servindo os cabeçalhos de `netlify.toml`.

*Alternativa descartada:* permanecer na Netlify e atualizar `fundacao.md` para refletir a prática. Seria honesto e é a opção mais barata, mas contraria a preferência explícita do solicitante e a diretriz permanente do `AGENTS.md`. Fica registrada porque continua sendo a saída se a perda do deploy preview se mostrar inaceitável.

### D2 — Migrar depois da V1 conectada, não agora

Três razões, em ordem de peso:

1. Há outra frente ativa em `web/` e as fatias de turno e financeiro na fila. Migrar agora troca risco de entrega por consistência de arquitetura.
2. Migrar antes de escrever turno e financeiro significaria migrar 39 rotas e depois acrescentar cerca de 20 novas sobre a plataforma nova. Migrar depois significa escrever essas 20 já no formato certo e migrar 59 de uma vez, com uma matriz de autorização só.
3. A matriz de autorização precisa ser reexecutada inteira após a troca de runtime. Fazer isso uma vez, com o conjunto completo de rotas, custa menos que fazer duas vezes.

### D3 — Nenhuma camada de abstração sobre a plataforma

Não criar adaptador, fachada ou "porta" para tornar o código agnóstico entre Netlify e Supabase. A rota já é fina por construção; o que a prende à plataforma são o bloco `config` e a leitura de ambiente. Uma camada de abstração acrescentaria um componente permanente para resolver um problema que ocorre uma vez.

A disciplina que substitui a abstração: **regra de negócio nunca entra no arquivo de rota**. É o que mantém a migração em 2.809 linhas em vez de 24.000.

*Consequência:* `concessoes-equipe` (449 linhas) e `acesso-paciente` (152) violam essa disciplina hoje e devem ser aliviadas antes da migração.

### D4 — Transporte migra; protocolo de identidade não

Edge Function do Supabase recebe `Authorization: Bearer` do SDK nativamente. Será tentador aposentar o cookie selado, o cabeçalho `x-sessao`, o CSRF e o atestado de operação em favor disso.

Não nesta fatia. Trocar runtime e protocolo de identidade juntos torna impossível atribuir qualquer regressão de autorização a uma das duas mudanças — e autorização é exatamente o que não pode regredir sem ser percebido. Se a troca de protocolo for desejada, é decisão material própria, posterior, com sua própria matriz.

### D5 — Toda prova de autorização é refeita na plataforma nova

Teste de autorização executado no runtime antigo **não é evidência** do estado migrado. A fatia de execução reexecuta a matriz completa — positiva e negativa, incluindo acesso direto ao servidor e ao banco, outro paciente, outro perfil, ausência de concessão e revogação — contra as Edge Functions.

Isto não é zelo excessivo: a barreira depende de como a identidade chega à RPC, e é exatamente isso que muda de transporte.

### D6 — Netlify permanece como proxy de `/api/*`; a origem não muda

Confirmado em 17/11/2026. O cliente continua chamando `/api/*` na mesma origem e a Netlify encaminha para as Edge Functions.

A alternativa — cliente falando direto com o Supabase — parece mais limpa e é mais rápida por um salto, mas custa caro em dois pontos. Primeiro, torna tudo origem cruzada, e o cookie de sessão selado passaria a exigir `SameSite=None`, reabrindo a superfície de CSRF que o desenho fechou com cookie selado, token CSRF e mesma origem. Isso é decidir o protocolo de identidade de novo — o acoplamento que D4 proíbe. Segundo, os cabeçalhos sairiam de um arquivo versionado para 39 funções, com 39 chances de omitir um.

O ganho de desempenho não compensa: estas rotas são dominadas pela ida e volta ao PostgreSQL, não pelo salto HTTP.

*Consequência aceita:* a Netlify permanece no caminho da requisição. A migração move execução, não remove a Netlify.

*Alternativa adiada, não descartada:* acesso direto. Se for desejado, é mudança material própria, com sua própria decisão sobre sessão — nunca efeito colateral desta migração.

### D7 — Uma Edge Function por domínio

39 funções espelhando os arquivos de rota atuais, cada uma parseando o próprio sufixo de caminho para cobrir os 28 caminhos com parâmetro. Mantém a organização mental existente, limita o raio de impacto de um deploy a um domínio, e torna o diff da migração legível arquivo a arquivo.

*Alternativas descartadas:* uma função por caminho (104 pastas e 104 superfícies de partida a frio) e poucas funções grandes com router (qualquer deploy republica tudo, e um erro derruba a API inteira).

### D8 — Supavisor em transaction mode, sem pool próprio no isolate

Recurso nativo do Supabase, conforme a diretriz de 01/11/2026. O isolate abre e devolve a conexão; o pooler cuida do resto.

Duas consequências que a implementação não pode presumir resolvidas:

1. O cache de 30 segundos de `configuracao-servidor.ts` passa a viver por isolate, com ciclo de vida diferente do processo Netlify atual. Precisa ser reavaliado, não transposto.
2. A partida a frio precisa ser **medida de novo**. A cicatriz de 13/11/2026 — primeira requisição a processo novo não concluindo a leitura de configuração — nasceu exatamente de uma suposição sobre conexão que não se confirmou. Repetir a suposição na plataforma nova seria repetir o erro.

*Alternativa descartada:* session mode com o pool próprio atual. Pouparia reescrita, mas isolate efêmero segurando conexão de sessão tende a esgotar o limite sob concorrência.

## Riscos e questões abertas

- **Deploy preview por PR: perda aceita em 17/11/2026.** D1 confirmada. A verificação passa a depender do Supabase local com Docker, que o solicitante informou que trará na semana seguinte. Enquanto esse ambiente não existir, a verificação conectada da migração fica bloqueada — registrar como bloqueador, não presumir cobertura.
- **Segredos.** Variáveis hoje na Netlify passam a segredos do projeto Supabase. O Vault já é usado para chave de provedor; a fronteira muda de lugar e precisa ser reconferida, não assumida.

## Migration Plan

Esta mudança não executa migração. A fatia de execução, quando autorizada, segue esta ordem:

1. Aliviar as rotas que carregam composição (`concessoes-equipe`, `acesso-paciente`), ainda na Netlify, com os testes atuais verdes. Reduz o que se migra e isola o risco.
2. Decidir roteamento, conexão e cabeçalhos; medir, não supor.
3. Migrar em lotes por domínio, mantendo as duas plataformas servindo em paralelo enquanto durar.
4. Reexecutar a matriz de autorização completa contra as Edge Functions.
5. Desligar as rotas Netlify somente depois de 4.

Reversão: enquanto o passo 5 não ocorre, reverter é apontar o cliente de volta para `/api/*` da Netlify.

Nenhuma operação remota é autorizada por este planejamento.
