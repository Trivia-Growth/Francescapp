# Estado — experiencia-minima-do-mock

**Atualizado:** 17/11/2026 · **Branch de revisão:** `codex/revisao-pr16` · **PR:** #16 · **Base:** `76838b4050e511db67bf21592a140f5d60d3817b` · **Head recebido:** `804428e79334234a59b1cd415692a976b60246ef`

## Onde está

PR #16 recebeu revisão independente nos eixos padrões e especificação e correções locais. Esta passagem reúne somente os achados da revisão; não declara encerradas as changes de domínio nem paridade integral com o mock. Refino visual continua separado no PR #17, em draft, inicialmente com base na branch do #16.

Usuário autorizou push e merge após validação. Confirmou que as cinco migrations novas **não foram aplicadas** no Supabase usado pela main. Depois confirmou autorização explícita para aplicar somente as cinco migrations revisadas, após conferir histórico remoto. Flags e deploy manual continuam sem autorização por esta frente. Sem merge realizado.

## Correções da revisão

- **Plano familiar:** filtrar visibilidade da última versão antes de limite/contagem/cursor; nenhum identificador interno pode comandar a paginação pública. Regressão cobre privado antes/entre públicos e objetivo antes público que se tornou interno; limite 1 mantém cursor público coerente. Teste local falhou antes da correção (`FAMILIA_PAGINA_1`, exit 3) e passou depois, exit 0.
- **Família e sessão:** mesma identidade/vínculo confirmado preserva editor do Diário. Troca de sessão, usuário, perfil/capacidades, revogação ou verificação inconclusiva fecha conteúdo protegido. Revalidação consulta a rota familiar e confere ID; respostas antigas não reabrem ficha.
- **Audiência:** ocultar aba elimina leituras familiares da memória/DOM. Diário conserva apenas editor próprio e reconsulta registros ao voltar; outras seções familiares são desmontadas e consultadas novamente. Confirmar vínculo do caso não substitui revalidar audiência de registros/documentos/plano/orientações.
- **Diário:** categoria opcional existente no contrato; retomar somente rascunho próprio com ID/versão; editor único para relato/retificação, confirmação de descarte, cleanup de áudio e bloqueio durante gravação. Sem controles de evolução profissional ou ampliação de audiência para família. Loading/erro/vazio distintos, `aria-busy` por região e anúncio fora da região ocupada.
- **Consulta e escrita:** resposta de consulta iniciada antes de um salvamento incorpora somente gravações concluídas durante essa consulta, por ID. Não reaproveita leituras antigas; ocultação invalida consulta/mapa. Regressão com GET vazio atrasado depois do POST falhou antes (exit 1) e passou depois (11 testes, exit 0).
- **Teclado:** faixa primária mantém entrada por Tab quando seção secundária está ativa. Gaveta móvel fechada fica inerte; abertura/foco, Escape, contenção de Tab, resize e ocultação tratados.
- **Ordem de migrations:** cinco versões de 17/11 dependiam de bases posteriores, inclusive documentos/papel criados em 20/11. Como não foram aplicadas, renomeadas após a última base `20261123100000`, sem repair remoto. Referências de scripts/testes/OpenSpec/comentários atualizadas.

| Antes | Agora | Finalidade |
|---|---|---|
| 20261117230000 | 20261124100000 | Visibilidade de objetivo |
| 20261117240000 | 20261124110000 | Leitura familiar de plano/paginação |
| 20261117250000 | 20261124120000 | Leitura familiar de documento |
| 20261117260000 | 20261124130000 | Visibilidade de orientação |
| 20261117270000 | 20261124140000 | Leitura familiar de orientação |

## Evidências locais

- Terra 6.1 implementou frentes exclusivas de SQL, shell/ficha e Diário. Coordenação integrou; revisão independente somente leitura. Worktrees das outras sessões preservadas.
- `pnpm run verificar:rapido`: exit 0, lint 665 arquivos e typechecks contracts/cadastro/functions/web/proxy, 37,27s; final após corrida do Diário passou novamente, 10,01s. Formatação de dois testes corrigida antes desse resultado.
- Testes focais: Diário 11 testes; ficha 19; gaveta 1; três arquivos de sessão/revalidação familiar 3 testes. Todos passaram nas últimas execuções dos respectivos executores. Fixtures de visibilidade atualizam `hidden` e `visibilityState` de forma coerente. Mocks comprovam comportamento DOM, não autorização remota.
- Runners PostgreSQL locais após renomear: `testar-plano-cuidado-familia-local.sh`, `testar-documento-caso-familia-local.sh`, `testar-orientacao-familia-local.sh`: exit 0, conforme executor SQL. Asserções positivas/negativas cobrem leituras permitidas, conteúdo interno/outra família, vínculo/revogação e papéis de banco. Cada runner monta sua cadeia própria; não é bootstrap cronológico completo do Supabase.
- Coordenação executou `rtk proxy sh scripts/testar-diario-operacoes-local.sh`: exit 0. PostgreSQL temporário com asserções de publicação/retificação/histórico, autor/audiência, leitura familiar, outra família, sessão/concessão/vínculo revogados, método trocado e acesso direto. Não envolve produção.
- `rtk proxy pnpm run verificar:ativacao`: exit 0, executado uma vez nesta revisão. Lint/typecheck/Deno, contratos 133, cadastro 137, funções 257, proxy 397, web 414 testes passaram; build e configuração local passaram. Cadastro 9, funções 6 e proxy 15 testes ficaram skipped: não são autorização comprovada. Runners SQL acima fornecem provas locais delimitadas; jornadas externas continuam pendentes. Última correção de corrida do Diário veio depois: teste afetado repetido, 11 passaram, sem repetir suíte completa.
- `git diff --check`: exit 0 após correções. IDs únicos e dependências anteriores conferidos estaticamente. Renomeação não prova estado do banco remoto.

## Bloqueadores e próximo passo

1. Comando de ativação local passou; revisão focal final da corrida do Diário concluída sem achado residual; lint/typecheck finais conferidos antes do envio. Sem declarar ativação remota.
2. Atualizar PR #16 e reconciliar seu novo head no PR #17 preservando o refino visual e os controles revisados.
3. Confirmar lista real de migrations do Supabase e aplicar somente as cinco versões revisadas, autorizadas explicitamente pelo solicitante em 17/11/2026. Projeto aprovado em `docs/projeto/fundacao.md`: `drdpuxcllpymtoskmuqv`. Esta worktree não está vinculada; consulta somente leitura no diretório já vinculado não respondeu e foi encerrada. Nenhuma migration remota executada.
4. Provar compatibilidade das rotas existentes de plano/orientações com banco atualizado; flags familiares desligadas não isolam todos os contratos alterados. Sem essa prova, não mergear código que será publicado automaticamente.
5. Aceite conectado por perfis e roteiro dos PRs, incluindo revogação/acesso direto no ambiente aprovado, permanecem pendentes. CI verde e testes simulados não fecham esses critérios. Atualizar registro global somente no merge.

## Revisão independente

- **Padrões:** revisão estática final do delta de correções, base `76838b4`/head recebido `804428e` mais locais e novos; nenhum achado material residual. Renomes, dependências, paginação, controles de sessão/audiência e teclado conferidos.
- **Spec:** controles e loading conferidos; encontrou a corrida GET/POST descrita acima, corrigida por Terra com teste vermelho/verde. Releitura focal desse último hunk confirmou correção, sem achado material residual de audiência ou cleanup. Revisores não executaram testes nem operação remota.
