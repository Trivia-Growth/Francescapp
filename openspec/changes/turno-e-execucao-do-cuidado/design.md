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

**Revisado em 17/11/2026.** FR-059 e FR-060 passam a admitir qualquer profissional autenticado com vínculo ativo no caso. A verificação reaproveita a prova de vínculo já usada pelas demais barreiras (`*_barreira_*_privada.sql`), conferida dentro da transação, sob o mesmo lock.

A concessão específica de execução de medicação **continua modelada**, mas nasce concedida a todo profissional com vínculo. Isso não é cerimônia vazia: é o ponto de aperto. Restringir de novo passa a ser mudar quem recebe a concessão, não reescrever a barreira, a RPC, o contrato e os testes. O custo de manter a coluna agora é muito menor que o de reintroduzir o conceito depois sobre dados já gravados.

*Alternativa descartada:* conferir apenas o vínculo e remover o conceito de concessão. Mais enxuto hoje, mas o requisito de restringir volta assim que a equipe crescer — e aí a mudança alcança dados de medicação já persistidos.

Essa concessão é um controle de produto e **não atesta habilitação profissional**. Nenhuma evidência de habilitação é coletada ou validada: não há campo de conselho, número de registro ou documento comprobatório a implementar, nem verificação do executor informado.

*Risco explicitado:* com a abertura de 17/11/2026, o único controle sobre o registro de medicação é o vínculo com o caso. A revisão de código deve tratar a prova negativa — familiar, profissional de outro caso, acesso revogado, acesso direto ao banco — como critério de aceite, não como teste acessório.

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

### D9 — Rotina do turno reaproveita o modelo de medida, não cria domínio

FR-064 (alimentação, hidratação, sono, eliminações) tem a mesma forma de FR-058: tipo, valor, unidade opcional, instante de ocorrência, instante do servidor, autor, turno. Entra na mesma tabela de medidas do turno, distinguida por um tipo em catálogo administrado, com as mesmas regras de janela, retificação e paginação.

*Alternativa descartada:* tabela própria por categoria (`refeicao`, `sono`, `eliminacao`). Multiplica migração, RPC, barreira e teste para três formas idênticas, e obriga a consolidar em três lugares ao montar FR-062 e FR-065.

*Consequência aceita:* "aceitação da refeição" é escala observada, não medida fisiológica. Fica em catálogo com rótulo explícito de observação, e vale a mesma proibição de interpretação de D-não-interpretar: nenhum rótulo de adequação é derivado do valor.

### D10 — Consolidado semanal é consulta derivada, não tabela materializada

FR-065 lê os mesmos registros de FR-062 numa janela de sete dias. Nenhuma tabela de resumo, nenhum job noturno, nenhuma materialização. Um consolidado materializado precisaria ser invalidado a cada retificação — e retificação é esperada neste domínio.

*Quando revisitar:* se a leitura de sete dias passar a doer em volume real, medido, e não antes. Paginação e o índice `(caso, instante)` de FR-058 vêm primeiro.

### D11 — PDF montado no servidor a partir da persistência

FR-066 gera o PDF na função Netlify, pela mesma RPC autorizada que alimenta a tela. O corpo da requisição informa **o quê** (caso, período, tipo de relatório), nunca **o conteúdo**. Isso mantém uma única fonte de autorização e torna a emissão auditável como exportação (FR-039, FR-032).

*Alternativa descartada:* gerar no navegador a partir do que já está em tela. Barato, mas a exportação deixa de ser um evento do servidor, e o conteúdo passa a depender do que o cliente tinha carregado — inclusive do que ele conseguiu carregar.

*Risco:* biblioteca de PDF em runtime de função é dependência nova e pesada. Escolher na implementação medindo tempo frio e tamanho do pacote; se não couber, a saída é um serviço de renderização autorizado, não mover a geração para o cliente.

### D12 — Anexo de turno em repositório privado, sem URL pública

A foto de FR-061 vai para armazenamento privado do Supabase, com política ligada à mesma prova de autorização do caso. Entrega por fluxo autorizado a cada leitura; sem bucket público, sem URL assinada de longa duração que sobreviva à revogação.

*Por que não esperar o Drive (FR-030):* a raiz institucional não está definida e o recorte não deve ficar bloqueado por isso. O anexo guarda caso, classificação, audiência e autor, então migrar depois é cópia de arquivo com reescrita de referência — não redefinição do modelo de autorização.

*Alternativa descartada:* URL assinada longa para simplificar a exibição no celular. Quebra FR-037: o link continuaria funcionando depois da revogação.

### D13 — Localização é dado declarado, com consentimento versionado e audiência própria

FR-067 persiste latitude, longitude e precisão **informadas pelo aparelho**, junto do consentimento vigente à época. Três consequências de modelagem:

1. **Nunca é autoridade.** O instante continua sendo o do servidor (D2). A coordenada não valida, não confirma presença e não alimenta cálculo de atraso ou falta. Nenhuma coluna derivada, nenhum rótulo de conformidade.
2. **Audiência separada do resto do turno.** A família enxerga o conteúdo do turno (decisão de 11/11/2026) mas não a localização. Logo a localização não pode ser coluna do mesmo retorno: fica em tabela própria, lida por RPC distinta, com sua própria prova de perfil. Filtrar no cliente ou na serialização seria um controle de interface, não autorização.
3. **Consentimento é registro versionado, não flag.** Guarda identidade, finalidade, audiência informada e data; revogação cria nova versão em vez de apagar. Sem isso não há como responder, depois, sob qual base um ponto foi coletado.

*Alternativa descartada:* guardar apenas "dentro/fora do local esperado". Expõe menos, mas exige cadastrar o endereço do caso como geocoordenada e fixar um raio — duas decisões de negócio não tomadas — e ainda assim deriva um juízo a partir de um dado não confiável.

*Pendência que bloqueia a persistência:* prazo de retenção da localização não definido (ver `proposal.md — Pendências`).

## Risks / Trade-offs

- **Dado de saúde estruturado em claro no banco (D3)** → sem grant direto; leitura apenas por RPC autorizada e auditada; prova negativa obrigatória de acesso direto com identidade sem vínculo.
- **Registro de administração cria exposição de responsabilidade profissional** → executor e registrador sempre identificados e distintos (D8), retificação preservada, auditoria em transação. A concessão é controle de produto, não atestado de habilitação clínica, e por decisão de 11/11/2026 nenhuma evidência de habilitação é exigida. O sistema registra uma afirmação datada e atribuída; não comprova quem podia administrar nem que o ato ocorreu. Relatório e exportação não podem sugerir o contrário.
- **Audiência familiar ampla sobre dado de saúde de pessoa adulta** → o acesso familiar a todo o conteúdo do turno decorre do fundamento de autorização registrado no caso (FR-038), nunca do parentesco, e é revogável (FR-037). A implementação deve negar por ausência de fundamento, não por ausência de vínculo, e o teste negativo correspondente é obrigatório.
- **Turno aberto indefinidamente** → situação derivada na leitura a partir da janela prevista na escala; não encerrar automaticamente, porque um encerramento sintético atribuiria à pessoa uma passagem que ela não escreveu. Expor como pendência em FR-027/FR-028.
- **Volume de aferição cresce rápido** → série paginada por período, sem carregar histórico completo; medir antes de indexar além do par `(caso, instante_afericao)`.
- **Localização do profissional e endereço da pessoa acompanhada (D13)** → dado pessoal de trabalhador somado a endereço residencial de pessoa adulta acompanhada. Tratar sob FR-042 com o mesmo rigor do conteúdo clínico: audiência restrita provada no banco, consentimento versionado, prova negativa obrigatória para perfil familiar e para profissional sem coordenação, e retenção declarada antes da primeira gravação.
- **Ferramenta de registro vira ferramenta de vigilância** → a observação do próprio solicitante no levantamento de 11/11/2026 vale aqui: o aplicativo deve apoiar o cuidado, não vigiar. Nenhuma superfície pode ranquear, pontuar ou alertar sobre a presença de profissional, e nenhum cálculo de atraso ou falta pode derivar da coordenada.
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

## Auditoria da base para 0.6 — 18/11/2026

Escopo: leitura do código, migrations, specs desta mudança, DF-021/DF-022 e evidências
já registradas. Nenhum teste repetido, conta criada, segredo lido ou operação remota
executada nesta auditoria. Liberação recebida alcança somente 0.6; suspensão dos demais
trabalhos não é revogada por fechar a checkbox de auditoria.

| Controle existente conferido | Âncora de implementação | Evidência e limite |
| --- | --- | --- |
| Identidade nativa, perfil único, admissão por concessão | `20261017113000_fundacao_identidade_cadastro.sql` (`usuario`, `concessao_equipe`, `sessao`); `20261105120000_auth_privado.sql`; `20261105130000_auth_nativo_sessao.sql`; `netlify/functions/_shared/auth-nativo/cliente.ts` | Fundação tasks registra login/cadastro/recarga Admin reais anteriores e negativas Auth sem concessão; não prova Profissional/Família atuais ou estabilidade da entrada publicada. |
| Sessão, concessão e revogação conferidas no banco | `20261106180000_bloqueios_auth.sql`; `20261106190000_wrappers_privados.sql`; `supabase/functions/_shared/atestado-operacao.ts` e `cifra-autenticada.ts` | Ponte Auth, locks e atestado de operação são mecanismos existentes, não novo protocolo de turno. Fundação/S-02 mantém limites de Auth/Vault reais e replay/revogação remotos. |
| Vínculo ativo por paciente, concessão/revogação auditadas | `20261112050000_conceder_acesso_paciente_privado.sql`; `20261112060000_revogar_acesso_paciente_privado.sql`; `20261112070000_owners_acesso_paciente_privado.sql`; `20261112180000_barreira_acesso_paciente.sql` | `fundar-identidade-e-seguranca-backend/tasks.md` registra PostgreSQL local positivo Admin, negativas Profissional/sessão encerrada/direto, replay e rollback; fixtures Auth/Vault não comprovam integração real. |
| Exemplo vigente de domínio que exige vínculo sob lock antes de replay | `20261125010000_anamnese_vinculo_caso.sql`; `supabase/tests/anamnese_vinculo_caso_local.sql`; `anamnese_vinculo_revogacao_concorrente_local.sql` | Anamnese tasks, evidência bloco 4: runners vínculo e integrado saída 0; Admin/Profissional vinculados positivos; outro paciente, Família, inativo e revogações negados; dblink nas duas ordens de lock. Auth/PostgREST/Vault fixtures. É referência a reutilizar, não autorização herdada por tabela futura. |
| Concessão de equipe e barreira de alteração | `20261112310000_criar_concessao_equipe_privado.sql`; `20261112320000_replay_concessao_equipe_versionado.sql`; `20261112350000_barreira_concessao_equipe_privada.sql` | Provas locais existentes em `criar_concessao_equipe_privado_local.sql`, `replay_concessao_equipe_versionado_local.sql` e `barreira_concessao_equipe_local.sql`; estado de execução remota/perfis não foi revalidado aqui. Não confundir concessão de equipe com concessão específica de medicação. |
| Família tem admissão/vínculo e audiência separadas | `20261111160000_admissao_familiar_privada.sql`; `20261112040000_consultar_paciente_familiar_privado.sql`; `20261120400000_materializar_acesso_familiar.sql`; `20261120420000_cancelar_preautorizacao_revoga_acesso.sql` | Testes `jornada_familiar_local.sql` e diário provam caminhos locais. `cadastro.acesso_paciente` registra concessor/motivo cifrado/revogação; não está comprovado que esse motivo materialize o fundamento específico, vigente e revogável exigido por FR-062. Parentesco nunca supre fundamento. |
| Liderança por caso, sem quarto perfil (DF-021) | `20261113100000_acompanhamento_caso.sql`; `20261125040000_plano_crise_case_manager_atual.sql` | Runner crise saída 0 nesta passagem: responsável atual Admin/Profissional habilitados positivos; demais atores/direto/replay após troca negados; carimbos preservados. Habilitação de crise não é concessão de medicação. |

**Lacunas concretas e destino.** 0.6.1 retém a prova operacional pendente. 0.6.2 exige
amarrar os controles novos aos grupos existentes, sem criar camadas antecipadas:

- Ainda não há persistência/RPC de turno nem vínculo de autoria/turno aberto dos filhos;
  isso pertence a 2.1–2.6 e FR-063, não é garantido pela autorização da anamnese.
- Concessão de medicação de D4 ainda precisa ser modelada e verificada em 5.1/6.3;
  `habilitado_plano_crise` não serve como substituto. Pela revisão de 17/11/2026,
  profissional com vínculo é elegível; liderança de caso não é exigência adicional.
- Fundamento familiar de 8.3 precisa de prova independente da mera relação/vínculo,
  inclusive revogação. Não presumir equivalência do motivo cifrado sem contrato verificável.
- Localização requer consentimento próprio versionado, retenção 90 dias e RPC de audiência
  própria (12.1–12.7); nenhum mecanismo clínico atual comprova esses controles.
- Anexo privado e PDF têm fronteiras novas (11 e 10); sua autorização ainda não existe.

**Coerência com decisões vigentes.** D8 conserva descrição histórica do registrador como
Administrador/case manager; para elegibilidade aplica-se revisão de D4/0.1/FR-060:
profissional autenticado com vínculo, com registrador derivado e executor declarado distintos.
A pendência histórica de retenção em D13 foi resolvida por 0.14: 90 dias. Essas correções
de leitura não autorizam começar implementação de grupos posteriores.

**Estado remoto informado pela coordenação, não observado nesta auditoria:** sete migrations
novas aplicadas, oito flags runtime ligadas, grant do executor Agenda aplicado e deploy
`ddf2415` promovido pela UI e depois revertido: contexto de preview trouxe 503 de
configuração operacional. O deploy anterior `76838b4` voltou publicado/LOCKED;
novo build com contexto correto está em preparação. Isso não prova entrada funcional ou negativas reais:
login 400/503 e gates Auth continuam pendentes. DF-022 autoriza operação no ambiente real,
mas somente com dados fictícios; publicação não equivale a go-live nem a aprovação S-02.

**Conclusão de 0.6:** inventário e lacunas estão registrados; auditoria concluída.
Base reaproveitável identificada, integração/ativação de turno ainda bloqueadas pelos itens
0.6.1/0.6.2 pertinentes. Nenhum grupo de implementação foi iniciado nesta passagem.
