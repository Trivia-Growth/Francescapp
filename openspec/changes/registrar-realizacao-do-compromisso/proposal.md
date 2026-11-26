# Registrar a realização do compromisso (FR-024)

## Por quê

FR-024 — "registrar realizado, faltou, cancelado, remarcado ou realização não confirmada,
com motivo e vínculo entre datas" — não existia em nenhuma camada. A agenda individual
(FR-023) lista compromissos lidos do Google Calendar, mas nada no produto diz o que
aconteceu com cada um deles. A própria mudança `agenda-google-integracao` registra que
"carteira, avisos e registro de realização permanecem no núcleo inicial, fora deste
recorte" (`proposal.md:20`), então o registro precisa de fatia própria.

Sem esta fatia faltam três coisas que o requisito manda distinguir: falta, cancelamento e
**ausência de confirmação**. Hoje não há onde gravar motivo de barreira nem como relacionar
o compromisso original à nova data quando ele é remarcado.

## Decisão do solicitante (19/11/2026)

A situação de realização mora em **tabela local própria, chaveada pelo identificador do
evento**. O compromisso continua vivendo no Google Calendar; o produto não vira dono do
compromisso. A implementação não depende do gate do Google estar ligado — a prova local
roda com a flag da integração desligada.

## O que muda

- Nova tabela append-only `cadastro.realizacao_compromisso`, chaveada por
  `(usuario_id, subject_google, evento_id, versao)`, com situação, motivo de catálogo
  fechado, observação cifrada opcional, autor, instante e auditoria obrigatória.
- Situações **registráveis**: `realizado`, `faltou`, `cancelado`, `remarcado`.
  `realizacao_nao_confirmada` **não é um valor do CHECK** — é o estado derivado de um
  compromisso já passado sem registro. Não há como gravá-lo nem confundi-lo com falta.
- Vínculo entre datas: `remarcado` nomeia `evento_destino_id`, com CHECK que impede
  apontar para si mesmo e que exige destino exatamente nas remarcações. A consulta
  devolve as duas direções (destino e origens).
- Nova operação `operacao.realizacao_compromisso_privada(jsonb)` sob wrapper
  `api.realizacao_compromisso_privado(jsonb)` e owner dedicado
  `ffcmapp_realizacao_compromisso_owner`, com duas ações: consultar e registrar.
  Registrar e retificar são a mesma ação: retificar grava versão nova e preserva a anterior.
- Rota HTTP própria `GET`/`POST /api/agenda/realizacao`, atrás da flag
  `ffcm.realizacao_compromisso.ativo`, desligada por padrão e **independente** da flag da
  integração Google.
- A agenda individual passa a mostrar a situação de cada compromisso e a ação de registrar.
  Compromisso passado sem registro aparece como "realização não confirmada", nunca como falta.

## Fora de escopo

- Qualquer alteração em `openspec/changes/agenda-google-integracao/**`. Recorrência/séries,
  agenda global e lembretes continuam fora da V1 daquela mudança e não são promovidos aqui.
- Carteira, avisos, lembretes e indicadores derivados da realização (FR-025, FR-026).
- Escrever a situação de volta no Google Calendar. O produto não é dono do compromisso.
- Vincular a situação ao paciente: a tabela não guarda `paciente_id`, de propósito.
- Ativação remota: migrations não aplicadas, flag não ligada, nada comitado.
