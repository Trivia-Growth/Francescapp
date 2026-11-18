# Design

## Context

Motivação em `proposal.md — Why`. Requisitos em `specs/financeiro-do-cuidado/spec.md` e `specs/evolucoes-propostas/spec.md`.

O repositório tem um padrão consolidado para domínios autorizados, e este recorte o segue sem inventar outro: contratos Zod `strict()` por domínio em `packages/contracts/src/`, barreira de servidor separada do contrato HTTP, função Netlify fina delegando a `packages/cadastro/src/`, RPC privada com auditoria obrigatória na mesma transação, sem grant direto às tabelas, e migração de grants de teste apartada.

A diferença deste domínio é a audiência. Até aqui, toda autorização do produto derivava do **vínculo com o caso**: quem cuida da pessoa vê o conteúdo da pessoa. Financeiro não funciona assim. Fabiana precisa ver valores de profissionais de todos os casos; o profissional que cuida do caso não vê valor nenhum, nem o seu. É a primeira audiência do produto que **não** é função do caso, e é isso que o desenho precisa resolver sem contaminar as barreiras existentes.

## Goals / Non-Goals

**Goals**
- Modelar a audiência financeira como concessão independente, que não se deriva nem se infere do vínculo de cuidado.
- Tornar a apuração reconstituível: toda linha aponta o turno e a vigência de valor que a produziram.
- Impedir que o financeiro carregue conteúdo clínico, e que o clínico carregue valor.

**Non-Goals**
- Não calcular obrigação trabalhista, hora extra, adicional ou banco de horas a partir da duração do turno.
- Não movimentar dinheiro, não integrar banco, não emitir documento fiscal.
- Não precificar serviço, contrato ou mensalidade da família.
- Não criar relatório gerencial, projeção ou indicador financeiro antes de existir apuração real para medir.

## Decisions

### D1 — Audiência financeira é concessão própria, nunca derivada do vínculo de caso

A concessão financeira é registrada no mesmo mecanismo de concessão de equipe já existente, mas como permissão distinta, conferida dentro da transação pela RPC financeira. Nenhuma função financeira consulta vínculo de caso para decidir acesso, e nenhuma função de cuidado consulta a concessão financeira.

*Alternativa descartada:* tratar financeiro como mais uma audiência do caso, ao lado de equipe e família. Pareceria econômico, mas acoplaria a visão da Fabiana à existência de vínculo com cada paciente — e criaria o caminho exato que FR-047 proíbe: quem cuida passaria a enxergar valor por já ter acesso ao caso.

*Consequência:* a prova negativa precisa ser feita nas duas direções. "Audiência de cuidado não alcança despesa" e "audiência financeira não alcança conteúdo clínico" são dois testes, não um.

### D2 — O profissional não é leitor do próprio dado de remuneração

Por decisão de 17/11/2026, o profissional não consulta seu valor acordado nem sua apuração pelo produto. Isso significa que o valor **não** pode ser coluna do cadastro de usuário nem do retorno de escala: teria de ser filtrado na serialização, e filtro de serialização é controle de interface, não autorização. Fica em tabela própria, lida por RPC própria.

*Risco registrado, não resolvido pelo produto:* o profissional é titular desse dado. Não expô-lo pelo sistema é decisão do solicitante sobre o canal, não eliminação do direito de acesso. Uma solicitação de titular (FR-040) sobre remuneração continua respondível fora do produto, e a decisão de abrir uma visão própria depois é mudança de audiência, não de esquema.

### D3 — Apuração é consulta derivada, com referência explícita à origem

A apuração lê turnos encerrados e vigências de valor; não há lançamento gravado na apuração. Cada linha carrega `turno_id` e a vigência aplicada, de modo que o total seja reconstituível a partir dos registros.

*Alternativa descartada:* gravar o repasse como lançamento no momento da apuração. Daria estabilidade ao número, mas uma retificação de turno passaria a divergir silenciosamente do lançamento, e retificação é esperada em turno (FR-055, FR-060).

*Pendência que muda isto:* se o solicitante definir ciclo de apuração com travamento (ver `proposal.md — Pendências`), passa a existir um fechamento gravado, e a decisão aqui muda de consulta derivada para consulta derivada **mais** instantâneo fechado. Por isso o contrato não deve impedir um fechamento futuro.

### D4 — Valor é dado versionado por vigência, sem sobreposição

Alterar valor cria nova vigência; a anterior permanece. A ausência de sobreposição é garantida por restrição no banco, não por checagem na aplicação: duas requisições simultâneas passariam pela checagem e produziriam duas vigências aplicáveis à mesma data, e a apuração não teria como escolher.

### D5 — Comprovante no mesmo repositório privado dos anexos, com política financeira

O comprovante de FR-069 usa o repositório privado do Supabase adotado em `turno-e-execucao-do-cuidado` (design D12 de lá), com política própria ligada à concessão financeira — não à autorização do caso. Entrega por fluxo autorizado a cada leitura, sem URL pública e sem URL assinada longa que sobreviva à revogação.

### D6 — Apuração não transporta conteúdo clínico

O retorno da apuração contém turno, data, profissional e valor. Não contém passagem, aferição, medicação, rotina nem ocorrência. Isso é restrição de contrato e de RPC, verificável em teste, e não uma convenção de quem monta a tela: a Fabiana tem acesso a valores de todos os casos, e um retorno descuidado lhe daria conteúdo de saúde de todos eles.

## Risks / Trade-offs

- **Primeira audiência não derivada do caso (D1)** → risco de contaminar as barreiras existentes ao reaproveitá-las. Mitigação: funções e políticas próprias; nenhuma alteração nas trilhas de cuidado já provadas; prova negativa obrigatória nas duas direções.
- **Dado de remuneração de pessoa identificada** → classe de dado nova no produto, sob FR-042 e FR-039. Auditar consulta, alteração e exportação desde a primeira versão, não depois.
- **Profissional sem acesso ao próprio valor (D2)** → decisão do solicitante, com consequência de titularidade registrada. Não implementar contorno informal (exportar para o profissional por fora do produto) sem decidir a audiência.
- **Apuração derivada diverge de um "fechado" mental** → enquanto não houver ciclo travado, dois usuários podem ver totais diferentes do mesmo período em momentos diferentes, se houve retificação entre as consultas. Apresentar sempre o instante da apuração; não esconder a data da consulta.
- **Escopo vizinho ao proibido** → a fronteira entre apurar repasse e calcular obrigação trabalhista é estreita. Nenhuma derivação de hora extra, adicional ou jornada. Revisão de código deve tratar isso como critério.

## Migration Plan

Migrações aditivas locais seguindo a numeração existente: tabelas de valor acordado, despesa e comprovante, restrição de não sobreposição de vigência, RPCs privadas com auditoria obrigatória, políticas e revogação de grants diretos, e migração de grants de teste separada.

Nenhuma operação remota é autorizada por este planejamento. Reversão precisa preservar despesas e vigências já gravadas.

## Open Questions

Resolvíveis na implementação, sem mudar specs ou tarefas:

- Moeda e precisão do valor: inteiro em centavos ou decimal com escala fixa. Centavos evita erro de ponto flutuante e é o padrão mais comum; decidir na primeira migração.
- Se a apuração pagina por profissional ou por período quando a lista crescer.
- Formato do comprovante aceito e limite de tamanho, dentro do que FR-029 a FR-031 já definem para anexo.

As decisões que **mudariam** o recorte — valor por turno ou por hora, tratamento de turno não encerrado, ciclo de apuração travado e alçada da despesa — estão em `proposal.md — Pendências` e bloqueiam as tarefas correspondentes, em vez de serem supostas aqui.
