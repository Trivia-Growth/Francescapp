# Transcrição de áudio para rascunho revisável (FR-010)

## Por quê

FR-010 estava inteiramente ausente. O relato só existia por texto
(`web/relato-textual.ts`, protótipo local sem servidor), e nada no sistema gravava
áudio, transcrevia, permitia ouvir o original ou registrava a revisão humana. Sem isso,
quem convive com a pessoa cuidada precisa digitar tudo na hora em que menos tem tempo —
e a jornada "registrar um acontecimento em casa" (User Story 2) perde o caminho que a
proposta previa.

O requisito tem três exigências que mudam o desenho, não só a tela:

1. **A transcrição automática não é revisão.** O delta confirmado em 16/10/2026 é
   explícito: gerar ou salvar rascunho MUST NOT disparar exclusão por revisão.
2. **O original fica ouvível durante a revisão e é descartado depois dela**, com estado
   verificável — pendente, confirmada ou falha — e repetição segura.
3. **Deve haver alternativa por texto**, sempre. O áudio é atalho, nunca requisito.

## O que muda

- Nova tabela `cadastro.audio_transcricao`, com ciclo de vida protegido por trigger: o
  áudio só pode desaparecer (nunca ser substituído ou ressuscitado), a revisão é
  confirmada uma vez e a exclusão confirmada é terminal. O áudio e os dois textos viajam
  no envelope AEAD; nenhuma coluna legível carrega fala.
- O áudio é cifrado em **partes numeradas**: a cifra compartilhada limita cada texto
  cifrado a 32 KiB, e `parte` entra na ligação criptográfica para que nenhuma parte possa
  ser trocada, reordenada ou movida para outro áudio.
- Nova operação `api.transcricao_operacao_privada(jsonb)` sob owner dedicado
  `ffcmapp_audio_transcricao_owner`, com quatro ações (registrar, ler, confirmar revisão,
  excluir áudio), atestado HMAC, revalidação sob trava, idempotência por
  `operacao.requisicao` e auditoria obrigatória em todos os caminhos.
- Rotas HTTP `POST/GET/PATCH/DELETE /api/pacientes/:paciente_id/transcricoes[/:audio_id]`
  atrás da flag `FFCM_TRANSCRICAO_ATIVA` e da chave `ffcm.transcricao.ativa`, ambas
  desligadas.
- Provedor **OpenRouter** (decisão do solicitante de 11/11/2026), com o **modelo escolhido
  na tela** entre opções Whisper/Groq. Para isso, `identidade.configuracao_sistema` ganhou
  a coluna `opcoes`: uma chave de texto passa a ter catálogo fechado, validado no banco.
- Novo leitor de segredo de integração no Vault
  (`identidade.ler_segredo_integracao_vault`), na mesma cadeia de papéis do cofre de cifra.
- Novo componente `web/transcricao-audio.ts`, reutilizável pelo diário: grava, transcreve,
  deixa ouvir o original, exige confirmação humana e informa o estado do descarte.

## Fora de escopo

- **Publicação do relato.** Este componente devolve o texto revisado a quem o montou; quem
  publica, versiona e retifica é a fatia de diário (FR-008/012), em andamento em paralelo.
- **Revisão de audiência antes de publicar.** FR-010 cita "revisar texto e audiência"; a
  audiência pertence ao registro do diário, não ao áudio. Ver `design.md`.
- **Exclusão com estado `falha`.** O estado existe no modelo, mas não é alcançável
  enquanto o original vive na mesma transação do banco. Ver `tasks.md`, item 2.5.
- **Prazo de 30 dias do áudio abandonado.** A coluna `expira_em` e o índice existem; a
  varredura que apaga e avisa não. Ver `tasks.md`, item 6.1.
