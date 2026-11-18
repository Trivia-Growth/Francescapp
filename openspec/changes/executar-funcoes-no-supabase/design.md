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

## Riscos e questões abertas

- **Perda do deploy preview por PR.** Custo operacional concreto, sem equivalente no Supabase. É a questão que mais pode reverter D1. Decisão do solicitante.
- **Granularidade das funções.** 39 funções espelhando as rotas, ou menos com roteamento interno. Os 28 caminhos com parâmetro concentram a dificuldade.
- **Conexão ao PostgreSQL no isolate.** Pool, Supavisor e o cache de 30 segundos de `configuracao-servidor.ts` precisam ser decididos e medidos. Há cicatriz documentada de processo frio medida em produção em 13/11/2026; não transpor sem medir de novo.
- **Cabeçalhos e origem.** `/api/*` deixa de herdar `no-store`, `X-Content-Type-Options` e as demais regras de `netlify.toml`. Definir proxy, responsabilidade por função, ou ambos.
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
