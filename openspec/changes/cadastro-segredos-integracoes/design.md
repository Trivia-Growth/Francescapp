# Design

## Context

Reutilizar fluxo BFF cookie/x-sessao, autorização Google/técnica e atestado existente de configuração do sistema. Vault já usado pelos leitores server-only.

## Goals / Non-Goals

**Goals:** escrita administrativa, proteção contra replay e concorrência, histórico preservado.
**Non-Goals:** verificar credenciais na origem, permitir download/revelação, apagar versões, editar configuração comum.

## Decisions

- Catálogo fechado de quatro nomes `ffcmapp.integracao.google_drive`, `ffcmapp.integracao.openrouter`, `ffcmapp.integracao.google_calendar_client_id`, `ffcmapp.integracao.google_calendar_client_secret` (Calendar alinhado com frente de integrações).
- Versão começa em zero sem cadastro gerenciado. Segredos preexistentes são detectados por nome, sem inventar autoria. Ao substituir, renomear registro anterior com sufixo UUID e criar novo sob nome canônico na mesma transação. Nunca ler coluna secret/decrypted_secret.
- Reusar protocolo atestado/idempotência HMAC e autorização admin existentes, com RPC e owner dedicados. Metadados separados de valor. Auditoria grava somente ator, ação, objeto, resultado e request ID.
- Formulário envia valor uma vez; limpa campo antes da resposta e nunca persiste em storage. POST exige origem exata, cookie, sessão e idempotência.
- Retomada 18/11/2026: uma escrita por vez na tela. Durante envio, recarga e demais escritas ficam indisponíveis. Resposta incerta exige nova leitura de metadados antes de outra tentativa; falha dessa leitura não libera formulário antigo. Resposta HTTP tem teto de 64 KiB e prazo de 20 segundos inclusive na leitura do corpo. Nenhum segredo é retido para repetição automática.
- Suposição conservadora: nenhum segredo será validado contra provedor; status cadastrado não significa integração comprovada.

## Risks / Trade-offs

- Exfiltração via resposta/log: schemas strict sem valor na saída, erros públicos fixos; SQL não seleciona valor e não inclui entrada em exceções.
- CSRF/elevação/revogação: origem exata, sessão revalidada, atestado e autorização SQL com locks, provas negativas diretas.
- Concorrência/perda de versão: lock da linha catálogo, versão esperada, transação e histórico imutável pelo fluxo.
- Disponibilidade: limite de corpo e tempo, falha fechada; ausência de Vault bloqueia operação.

## Migration Plan

Migration aditiva 20261125020000; sem remoção ou revogação de acessos existentes. Reversão operacional consiste em retirar rota/tela; preservar metadados e versões. Provas locais somente fictícias; operações remotas e revisão independente ficam com coordenação.
