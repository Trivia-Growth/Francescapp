# Design

## Context

Ver `proposal.md`. Reutilizar grupo 2 de `turno-e-execucao-do-cuidado` e seus contratos de barreira. A extensão da ficha herda linguagem visual existente, modo Operate, sem redesenho de marca. Validações foram adiadas expressamente em 18/11/2026.

## Goals / Non-Goals

**Goals:** abertura própria confirmada, consulta após recarga e recuperação de resultado incerto sem armazenamento clínico local.

**Non-Goals:** histórico, escala, passagem, ciência, localização, sinais, medicação, relatório ou encerramento clínico. Não concluir 13.1 da change principal nem ativar turno.

## Decisions

1. `GET /api/pacientes/:paciente_id/turnos/atual` retorna envelope `{ dados: Turno | null, request_id: UUID }`, somente turno aberto do profissional atual naquele caso. Reutiliza `turnoSchema`, sessão/concessão/vínculo sob locks, atestado, auditoria e reautorização final. Negativas não revelam outro profissional. Alternativa descartada: guardar ID clínico em localStorage ou tratar ausência de ID como ausência de turno.
2. Abertura reserva UUIDs aleatórios e chave idempotente em memória. A geração vem exclusivamente da `epoca` recebida na consulta da barreira do servidor, reapresentada na reserva e conferida pelo SQL tanto em `reserva_turno.epoca` quanto em `barreira_turno.epoca`; resposta da reserva deve ser `aberta` antes da abertura. Não se calcula geração no cliente. Qualquer resposta ambígua bloqueia nova abertura e pede recuperação. Nenhum relógio ou identidade enviado como autoridade.
3. Recuperação consulta barreira; reserva ativa é encerrada pelo comando da barreira, sem encerrar o turno clínico. Recibo confirmado é consultado pelo ID retornado antes de ser reconhecido. Recibo de outro caso fica pendente e orienta abrir aquela ficha, sem carregar seu conteúdo. IDs não são perdidos antes da confirmação; consulta atual permite recuperar após reconhecimento/recarga.
4. UI cria nós/textContent, usa botões e confirmação nativos, status vivo e controles existentes. Consulta malformada/503 não vira vazio; vazio só após resposta real válida. Desmontagem invalida respostas assíncronas e apaga conteúdo.

## Risks / Trade-offs

Modelo de ameaça restrito à extensão: conteúdo de turno e integridade da abertura são ativos; navegador é entrada não confiável, HTTP separa cliente do servidor e RPC separa handler do banco. Ator autenticado pode forjar IDs, trocar ficha/sessão, repetir mutação ou provocar resposta perdida. Controles existentes no servidor/banco são exigência preservada, não prova de execução desta change.

- Outro caso/autor ou sessão trocada: validação de resposta no cliente reduz exibição acidental; servidor/banco seguem responsáveis por negar acesso e revogação. Provas positivas/negativas pendentes.
- Rede perdida após persistência: recuperar recibo antes de tentar nova abertura; nunca afirmar sucesso por clique ou por reserva confirmada sem consulta.
- Turno aberto em outro caso: abertura pode conflitar; interface explica consultar a ficha de origem, sem expor lista.
- Configuração desligada: seção informa indisponibilidade com recarregar, sem fallback fictício.

## Migration Plan

Migration aditiva local 1300 para consulta atual, preservando ACL/owners e sem grants diretos a tabelas. Preparação local apenas; aplicar, testar autorização/RLS e ativar requer gates da change principal. Rollback de exposição desliga flag, preserva registros. Nenhuma operação remota autorizada por estes artefatos.

## Open Questions

Nenhuma dúvida material nova. Suposição conservadora aprovada: seção limitada a próprio turno aberto; não lista outros turnos nem substitui relatório futuro. Evidência visual, Auth real, revogação, RLS e integração ficam pendentes até etapa de validação autorizada.
