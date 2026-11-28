# Estado — transcricao-audio-relato

**Atualizado em:** 27/11/2026 · **Branch:** `claude/audio-capacidade` · **Por:** Claude Code

## Onde está

A rota de transcrição não manda mais áudio ao provedor externo sem a pré-autorização do
banco (`tasks.md` 7.1 e 7.2). Ativação remota (seção 5) continua pendente; o interruptor
`ffcm.transcricao.ativa` nasce `false`.

## Última tarefa concluída

- `tasks.md` 7.2 — a borda chama `api.autorizar_transcricao_audio` antes de `transcrever`.
- Evidência: `sh scripts/testar-audio-pre-autorizacao-local.sh` saída 0 (positivos/negativos
  em 7.1); contraprova SQL saída 3 `PRE_PACIENTE_INEXISTENTE`; vitest
  `compor-transcricao-nativa.test.ts` 3/3 e contraprova 3/3 falhando; `transcricao-nativa.test.ts` 8/8.

## Próximo passo

- 7.3, quando o dono decidir o recorte por caso.
- 7.4 fica com o worker da casca React (`web/main.ts`, seção de áudio).

## Bloqueadores

- Migration `20261128250000` não aplicada remotamente (exige autorização explícita).
- Cadeia completa sem superusuário para em `20261124160000` (defeito anterior, reportado).
- Integração real com o OpenRouter segue não comprovada (5.4).

## Decisões vigentes nesta mudança

- Pré-autorização usa a mesma fonte da operação privada (DF-023), sem copiar a prova Google
  antiga — 27/11/2026, `tasks.md` 7.1.
- A operação privada continua sendo a autoridade final; a pré-autorização não a substitui.

## Pendente de confirmação do solicitante

- Recorte por caso no áudio (7.3): recomendação (a) levada ao dono em 27/11/2026.
