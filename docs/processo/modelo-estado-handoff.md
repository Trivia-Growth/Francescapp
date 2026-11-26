# Modelo de estado e passagem (handoff)

**Decisão de 17/11/2026.** O projeto é conduzido por sessões curtas e por assistentes diferentes (Claude Code e Codex). Sem um registro de estado explícito, cada sessão nova reconstrói o contexto a partir do histórico e perde linearidade. Este documento define o artefato de estado, onde ele vive, quando é escrito e o que precisa conter.

Isto é uma convenção documental. Não cria gate automatizado, hook, tracker paralelo nem substitui `tasks.md`, `proposal.md` ou as fontes de verdade listadas em [AGENTS.md](../../AGENTS.md#fontes-de-verdade).

## Os dois níveis

| Nível | Arquivo | Quem escreve | Quando |
| --- | --- | --- | --- |
| Mudança | `openspec/changes/<id>/estado.md` | quem executa a tarefa | ao concluir cada tarefa de `tasks.md` |
| Projeto | `docs/processo/estado-do-projeto.md` | quem faz o merge | no merge da fatia para `main` |

O estado da mudança é o registro operacional vivo: ele muda junto com as tarefas e acompanha a branch, por isso não gera conflito entre frentes paralelas. O estado do projeto é a visão única do que está pendente; ele só é tocado no momento do merge para `main`, justamente para evitar que duas frentes editem o mesmo arquivo ao mesmo tempo.

Quando a mudança é arquivada, o `estado.md` é arquivado junto com ela (`openspec/changes/archive/`). O histórico fica preservado sem poluir a visão do que está aberto.

## Regras de escrita

- **Antes de agir, leia.** Sessão nova ou troca de assistente começa lendo `estado.md` da mudança ativa e, se a frente não estiver clara, `docs/processo/estado-do-projeto.md`. Ler não é um gate: é o que substitui a reconstrução de contexto.
- **Escreva ao fechar cada tarefa de `tasks.md`.** O mesmo commit que marca a tarefa atualiza o estado. Estado atualizado sem tarefa fechada é permitido; tarefa fechada sem estado atualizado, não.
- **Registre fatos verificados, não intenções.** Evidência significa comando executado e resultado, migração aplicada e onde, teste de autorização positivo e negativo executado. Checkbox marcado e arquivo existente não são evidência, conforme [AGENTS.md](../../AGENTS.md#especificações-e-execução-com-ia).
- **Substitua, não acumule.** O estado é curto e descreve o agora. Decisão superada sai; o histórico permanece nos commits, na `proposal.md` e no `design.md`.
- **Bloqueador é obrigatório quando existe.** Se uma verificação, migração ou operação externa não pôde executar, isso vira linha de bloqueio explícita — nunca sucesso presumido.
- **Não registre segredos nem dados pessoais.** Nome de ambiente e identificador de projeto, sim; e-mail de configuração, token, senha ou conteúdo clínico, não.

## Modelo — `openspec/changes/<id>/estado.md`

Copie o bloco abaixo ao abrir a mudança. Mantenha as seis seções mesmo vazias, com `Nenhum.` quando for o caso.

```markdown
# Estado — <id da mudança>

**Atualizado em:** <DD/MM/AAAA> · **Branch:** `<branch>` · **Por:** <assistente/pessoa>

## Onde está

<Uma a três frases: qual entrega da mudança está em curso e o que já funciona de ponta a ponta.>

## Última tarefa concluída

- `tasks.md` <número e título da tarefa>
- Evidência: <comando executado e resultado, migração aplicada e ambiente, teste positivo/negativo de autorização>

## Próximo passo

- <A próxima tarefa de `tasks.md`, com o arquivo ou contrato que ela toca.>

## Bloqueadores

- <Verificação que não executou, autorização pendente do solicitante, operação externa não autorizada. `Nenhum.` se não houver.>

## Decisões vigentes nesta mudança

- <Decisão + data + onde está registrada (proposal/design/tasks). Somente o que ainda vale.>

## Pendente de confirmação do solicitante

- <Dúvida material em aberto. `Nenhuma.` se não houver.>
```

## Modelo de linha — `docs/processo/estado-do-projeto.md`

No merge para `main`, a linha da fatia é criada ou substituída na tabela daquele arquivo:

```markdown
| <id da mudança> | <entrega/fatia> | <situação em até 8 palavras> | <bloqueador ou `—`> | <DD/MM/AAAA> |
```

Quando a mudança é arquivada, a linha sai da tabela de abertas e vai para a seção de concluídas, com a data do merge.

## Passagem entre assistentes

Claude Code e Codex leem o mesmo [AGENTS.md](../../AGENTS.md) e os mesmos artefatos; não há formato separado por ferramenta. Ao passar trabalho adiante — outra sessão, outro assistente ou subagente —, a passagem carrega: a tarefa, o requisito/cenário, a decisão aplicável, os arquivos permitidos, os limites e a evidência esperada, como já exige AGENTS.md. O `estado.md` é o lugar de onde essa passagem é montada, não um segundo plano escrito em paralelo.
