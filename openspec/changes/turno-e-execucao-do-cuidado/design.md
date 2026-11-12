# Design

## Context

Motivação em `proposal.md — Why`. Requisitos em `specs/turno-e-execucao/spec.md` e `specs/diario-e-evolucao/spec.md`.

O repositório já estabeleceu um padrão repetido para domínios sensíveis, e este recorte deve segui-lo em vez de inventar outro:

- Contratos Zod `strict()` por domínio em `packages/contracts/src/` (ver `tarefa-cuidado.ts`, `plano-cuidado.ts`), com `versao_esperada`, par `reserva_id`/`geracao_reserva` para idempotência e `campoCifradoSchema` para conteúdo sensível.
- Contrato HTTP e barreira de servidor separados (`barreira-tarefa-cuidado.ts` e `barreira-tarefa-cuidado-servidor.ts`), com cabeçalho `x-sessao`, `origin` nas mutações, `request_id` e `atestado` de operação.
- Função Netlify fina por domínio em `netlify/functions/`, delegando a composição em `packages/cadastro/src/`.
- RPC privada no Postgres com auditoria obrigatória na mesma transação, visível nas migrações `*_auditoria_obrigatoria.sql`, `*_auth_nao_admitido.sql` e `*_barreira_*_privada.sql`.
- Erros fechados em `sem_permissao`, `conflito`, `conflito_idempotencia`.

Diferença relevante deste domínio: até aqui o conteúdo clínico era texto livre cifrado. Turno traz dado estruturado que precisa ser **consultável como série** (sinais vitais) e **referenciável** (administração aponta para item prescrito). Isso cria uma tensão nova entre cifra de campo e consulta, tratada em Decisões.

## Goals / Non-Goals

**Goals**
- Modelar turno como fronteira temporal de autoria: todo registro de execução nasce dentro de um turno aberto, de um profissional identificado.
- Tornar a habilitação do executor um controle verificado no servidor **e** no banco, não uma condição de interface.
- Preservar integralmente registros de administração e aferição: retificação cria versão, nunca substitui.

**Non-Goals**
- Não definir o conjunto final de perfis habilitados nem os tipos de sinal vital. Ambos entram como configuração administrada, verificável em teste, com valores provisórios fictícios.
- Não introduzir notificação externa, fila, agendador ou job periódico. Turno vencido é calculado na leitura, não por processo de fundo.
- Não criar serviço, tabela ou abstração para cobrir funcionalidade que o mercado oferece mas a spec exclui (gravidade calculada, alerta clínico, repasse financeiro).

## Decisions

### D1 — Turno como agregado, registros como filhos imutáveis

Turno (`turno`) carrega caso, profissional, instante de abertura, instante de encerramento e situação. Aferição, administração e ocorrência referenciam `turno_id` e são append-only: retificação grava nova versão referenciando a anterior.

*Alternativa descartada:* registros soltos com carimbo de data e um campo `turno` denormalizado. Mais simples de escrever, mas perde a garantia de FR-063 — bastaria forjar o identificador para pendurar um registro em turno alheio. Com referência real, a autorização do turno cobre os filhos.

### D2 — Instante sempre do servidor; instante de aferição é dado, não autoridade

Abertura, encerramento e criação de registro usam o relógio do servidor (padrão já adotado em `conteudoTarefaSchema.data`). O `instante_afericao` de FR-058 é informação clínica fornecida pelo profissional e por isso é validado contra a janela do turno, mas nunca substitui o carimbo de auditoria.

*Alternativa descartada:* aceitar o instante do cliente como carimbo único. Permite antedatar administração de medicamento — exatamente o registro de maior risco de responsabilidade aqui.

### D3 — Cifra de campo para conteúdo textual, claro estruturado para o que precisa ser consultado

Síntese de passagem, descrição de ocorrência, motivo de recusa e fonte documental da prescrição seguem o envelope `campoCifradoSchema` com AAD vinculado a caso, turno, registro e versão, como já feito em anamnese e plano.

Tipo de medida, valor, unidade e situação da administração ficam em colunas estruturadas, **não cifradas**, porque FR-058 exige série cronológica consultável e FR-062 exige consolidado por período. Cifrar o valor obrigaria a decifrar a série inteira a cada leitura — custo real e sem ganho, já que a proteção efetiva vem da autorização por caso, não da opacidade do número.

*Risco assumido e mitigado abaixo:* um valor em claro no banco é legível por quem tenha acesso direto. Mitigação: sem grant direto às tabelas, leitura só por RPC autorizada e auditada, como nas migrações existentes.

*Alternativa descartada:* cifrar tudo e manter índice paralelo em claro. Reintroduz o dado em claro e acrescenta um componente para manter sincronizado.

### D4 — Habilitação como concessão verificada, não como papel no token

FR-059 e FR-060 exigem perfil habilitado: Administrador e o grupo de case managers da equipe da Edilaine. A verificação reaproveita o mecanismo de concessão de equipe já existente (`concessoes-equipe`, `preparar-concessao-equipe.ts`, `*_barreira_concessao_equipe_privada.sql`), acrescentando uma concessão específica de execução de medicação. A RPC confere a concessão vigente dentro da transação, sob o mesmo lock das demais barreiras.

Essa concessão é um controle de produto e **não atesta habilitação profissional**. O nome "habilitado" na spec designa quem pode operar o registro, não quem pode exercer o ato clínico. Por decisão de 11/11/2026, nenhuma evidência de habilitação profissional é coletada ou validada: não há campo de conselho, número de registro ou documento comprobatório a implementar, nem verificação do executor informado.

*Alternativa descartada:* checar um papel carregado na sessão. Uma concessão revogada continuaria valendo até a sessão expirar — incompatível com o cenário de revogação de FR-063, que exige efeito imediato.

### D8 — Executor e registrador são campos distintos

Quem administra medicamento na operação atual é a enfermagem, externa e sem conta no sistema. Quem opera o registro é Administrador ou case manager. Colapsar os dois num campo faria o relatório afirmar que a coordenação administrou o medicamento.

O registro de administração carrega portanto `executor` — nome e vínculo de quem administrou, dado informado — e `registrador` — identidade autenticada com concessão vigente, dado derivado da fronteira confiável, nunca aceito da entrada. Ausência de executor recusa o registro (FR-060). Relatório e exportação apresentam os dois papéis; nenhuma superfície pode exibir um no lugar do outro.

*Alternativa descartada:* conceder conta à enfermagem externa para que registre o próprio ato. Daria autoria exata, mas abre frente de identidade, convite e concessão para pessoas fora da Francescato, que não pertence a este recorte. Se essa frente existir um dia, o campo `executor` passa a referenciar um usuário em vez de texto, sem mudar o restante do modelo.

*Consequência aceita:* o executor é afirmação de terceiro, não autenticação. O sistema registra quem disse o quê e quando; não prova que o ato ocorreu.

### D5 — Unicidade de turno aberto no banco

"No máximo um turno aberto por profissional" (FR-055) é garantido por índice único parcial sobre `(profissional_id)` quando a situação é aberta, não por consulta prévia na aplicação. Duas requisições simultâneas passariam pela checagem na aplicação; o índice recusa a segunda.

### D6 — Passagem de turno reaproveita FR-009, não cria entidade

A síntese de encerramento é um registro de síntese profissional com o modelo de passagem, vinculado ao turno. A ciência é o mesmo mecanismo de FR-013 estendido. Isso evita duplicar publicação, audiência e retificação em um segundo lugar.

*Alternativa descartada:* entidade `passagem` própria. Duplicaria regras de audiência e retificação já especificadas, contrariando DRY e o princípio de reaproveitar o que existe.

### D7 — Medicação prescrita é transcrição versionada, sem catálogo

Item prescrito é texto estruturado digitado por profissional habilitado, com vigência. Sem base de medicamentos, sem autocomplete, sem validação de dose — qualquer uma dessas coisas aproximaria o sistema de sugerir conduta, que a spec proíbe explicitamente. Administração referencia `(item_id, versao)` vigente à época, para que uma alteração posterior do item não reescreva o que foi executado.

## Risks / Trade-offs

- **Dado de saúde estruturado em claro no banco (D3)** → sem grant direto; leitura apenas por RPC autorizada e auditada; prova negativa obrigatória de acesso direto com identidade sem vínculo.
- **Registro de administração cria exposição de responsabilidade profissional** → executor e registrador sempre identificados e distintos (D8), retificação preservada, auditoria em transação. A concessão é controle de produto, não atestado de habilitação clínica, e por decisão de 11/11/2026 nenhuma evidência de habilitação é exigida. O sistema registra uma afirmação datada e atribuída; não comprova quem podia administrar nem que o ato ocorreu. Relatório e exportação não podem sugerir o contrário.
- **Audiência familiar ampla sobre dado de saúde de pessoa adulta** → o acesso familiar a todo o conteúdo do turno decorre do fundamento de autorização registrado no caso (FR-038), nunca do parentesco, e é revogável (FR-037). A implementação deve negar por ausência de fundamento, não por ausência de vínculo, e o teste negativo correspondente é obrigatório.
- **Turno aberto indefinidamente** → situação derivada na leitura a partir da janela prevista na escala; não encerrar automaticamente, porque um encerramento sintético atribuiria à pessoa uma passagem que ela não escreveu. Expor como pendência em FR-027/FR-028.
- **Volume de aferição cresce rápido** → série paginada por período, sem carregar histórico completo; medir antes de indexar além do par `(caso, instante_afericao)`.
- **Escopo adjacente ao proibido** → a fronteira entre "registrar o executado" e "orientar conduta" é estreita. Nenhum campo calculado, nenhum rótulo derivado de valor, nenhum preenchimento automático. Revisão de código deve tratar isso como critério, não como detalhe.

## Migration Plan

Migrações aditivas locais, seguindo a numeração e o padrão das existentes: tabelas, índice único parcial de D5, RPCs privadas com auditoria obrigatória, políticas e revogação de grants diretos, e migração de grants de teste separada, como em `*_grant_*_teste.sql`.

Nenhuma operação remota é autorizada por este planejamento: sem deploy, sem migração no projeto Supabase, sem concessão e sem dados reais. Reversão precisa preservar registros de administração e aferição já gravados; uma reversão que apague esses lançamentos exige procedimento aprovado à parte.

## Open Questions

Questões que não alteram specs, abordagem ou tarefas, e podem ser respondidas na implementação ou depois dela:

- Paginação da série de aferições: cursor por instante ou por página. Qualquer uma atende FR-058.
- Formato do consolidado diário exportado (FR-062) dentro do que FR-032 já define.
- Se a escala exibe turno previsto e turno realizado na mesma lista ou em visões separadas.
- Como o executor externo é escolhido no registro: lista administrada de profissionais da enfermagem ou texto conferido. Começar por texto conferido atende FR-060; a lista é refinamento posterior sem mudança de contrato.
- Onde ficam os parâmetros de turno de FR-055: configuração institucional única ou por caso. A spec exige apenas que não sejam valor fixo em código.

As decisões que **mudariam** o recorte — perfis habilitados, autoria da administração, tipos de sinal vital, parâmetros de turno e audiência familiar — foram confirmadas em 11/11/2026 e estão em `proposal.md — Decisões aplicadas`. O que resta em aberto está em `proposal.md — Pendências` e bloqueia as tarefas marcadas como dependentes, em vez de ser resolvido por suposição aqui.
