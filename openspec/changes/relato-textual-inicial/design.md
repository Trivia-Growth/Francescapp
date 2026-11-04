# Design

## Context

FR-008 exige data e descrição; outros campos são opcionais. O registro familiar dirige-se ao autor e à coordenação, com divulgação adicional sujeita a audiência explícita. Identidade, vínculo e audiência são controles distintos. A jornada conectada ainda depende de fundação e plano de crise aprovado.

## Goals / Non-Goals

**Goals:** preparar validação e revisão local de conteúdo em componente isolado, com aviso para usar somente dados fictícios, sem criar autoridade ou persistência fictícia.

**Non-Goals:** enviar, persistir, consultar, publicar ou compartilhar dados; decidir crise, retorno ou destinatários adicionais.

## Decisions

- Contrato local limitado aos campos confirmados; não recebe identidade nem audiência e não certifica autorização. Alternativa de API conectada depende de controles ainda não demonstrados e fica fora do recorte.
- O componente não é montado em rota e informa que nada é salvo ou enviado; a revisão usa texto, sem interpretar HTML.
- Dados fictícios em testes; nenhum conteúdo clínico em logs. A futura integração deverá validar entradas no servidor, autorizar perfil, vínculo e audiência no servidor e banco, e provar revogação e acesso direto.
- Padrões de responsabilidades e contratos explícitos seguem `docs/projeto/referencia-atendimento.md`, sem importar regras do Atendimento.

## Risks / Trade-offs

- Contrato local não comprova FR-008 completo, persistência nem segurança da jornada; não apresentar como entrega conectada.
- Antes da publicação real, definir e aprovar canais, horários e plano de crise; também provar vínculos, revisão de audiência, retificação e limites de retorno conforme specs aplicáveis.

## Migration Plan

Nenhuma migração ou operação externa neste recorte.
