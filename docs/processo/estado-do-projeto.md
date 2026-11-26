# Estado do projeto

**Atualizado:** 17/11/2026 · **Passagem:** integração dos PRs #16 e #17 na main.

Este registro resume as fatias verificadas nesta integração. Requisitos e decisões de domínio continuam em OpenSpec; demais frentes devem ser retomadas pelo estado da respectiva change, sem presumir conclusão pelo merge.

## Mudanças ativas

| Mudança | Onde está | Evidência e próximo passo |
|---|---|---|
| Experiência mínima do mock e adições familiares do PR #16 | Código integrado à main em `afa9cf8a131cb991bc497e82d244b5e4bda194f5`; não arquivada | Revisão independente padrões/spec sem achado residual; verificação local e CI passaram. Cinco migrations autorizadas aplicadas, 191 versões remotas e equivalência dos arquivos/funções conferidas. Aceite conectado completo posterior à próxima onda de ajustes, por decisão do solicitante. [Estado](../../openspec/changes/experiencia-minima-do-mock/estado.md). |
| Refino visual do mock — PR #17 | Código integrado à main em `d5de49b9f479865e758794875f85e04d548977d9`; não arquivada | Sidebar recolhível/móvel, consistência e loading integrados às correções do #16; revisão independente e CI passaram. Verificação local integrada: 418 testes web, build/typecheck/lint/Deno e demais testes passaram; 30 testes skipped explicitados no estado. Conferência visual local usou API fictícia. Caderno conectado e aceite visual integral seguem pendentes. [Estado](../../openspec/changes/redesenhar-interface-ffcmapp/estado.md). |

## Decisões e limites vigentes

- Solicitante autorizou push/merges e somente as cinco migrations `20261124100000` a `20261124140000` no projeto `drdpuxcllpymtoskmuqv`. Aplicação concluída sem alterar flags, provisionar serviço ou fazer deploy manual.
- Caderno conectado completo será executado pelo solicitante após sua próxima onda de ajustes. A postergação permite integrar o código preparado e não prova autorização por perfil, revogação remota ou jornadas externas. Não marcar esses critérios como concluídos.
- Testes PostgreSQL descartáveis positivos/negativos de plano, documento, orientação e Diário passaram; metadados remotos foram conferidos. Esses resultados não substituem Google/Drive/áudio, aceites públicos ou testes por conta real autorizada.
- Estética aprovada: mock anexado, Cormorant Garamond/Raleway locais, sidebar branca e oliva em ações/seleções. Marca original preservada; material final permanece com marketing.
- Outras worktrees e alterações da sessão Claude não foram modificadas. Para continuar outra frente, atualizar sua branch a partir de `origin/main`, preservando trabalho local; as duas branches dos PRs permanecem disponíveis.

## Próxima entrega observável

Após a onda de ajustes do solicitante, executar o caderno em casos fictícios autorizados: Administrador, Profissional vinculado, negativa sem vínculo/outro caso, revogação e acesso direto nos pontos alterados; conferir desktop/celular, teclado, loading/erro/vazio e retorno à aba. Registrar resultados nos estados das changes e somente então encerrar os critérios correspondentes.
