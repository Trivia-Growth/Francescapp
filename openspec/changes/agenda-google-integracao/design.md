# Design

## Context

A fundação distingue sessão e concessões de aplicação do consentimento Calendar. A agenda individual pertence à conta do profissional; a global usa conta compartilhada. Nenhuma integração Calendar está comprovada. Ver proposta e delta.

## Goals / Non-Goals

**Goals:** delimitar controles e decisões necessários para uma futura fatia verificável com dados fictícios.

**Non-Goals:** decidir regras pendentes, executar integração, provisionar recursos ou ativar dados reais.

## Decisions

- A operação futura valida sessão e concessões no servidor e banco; ACL Google e OAuth não substituem autorização da aplicação. Identidade, caso, audiência e permissão de agenda são controles distintos. Alternativa de depender apenas da interface ou de escopo OAuth não satisfaz revogação nem isolamento.
- Tokens e integração permanecem no servidor; escopos Calendar exigem consentimento do próprio profissional, separados do login. Decisão autorizada: usar Supabase Vault para guarda das credenciais Google no servidor. Disponibilidade e limites no plano vigente, ciclo de renovação e revogação precisam de prova antes da ativação; não contratar recursos adicionais sem autorização.
- Identificar origem, versão externa e operação idempotente; confirmação somente após resposta ou reconciliação na origem. Alternativa de presumir sucesso ou reenviar sem conferir pode gerar divergência ou duplicação.

## Risks / Trade-offs

- [Exposição de dados clínicos pela agenda] Mitigação: autorização de caso e audiência independente; sem acesso clínico, exibir título genérico sem identificação do paciente.
- [Alteração concorrente ou resposta perdida] Mitigação: conferir estado externo; avisar sobre conflito e deixar a decisão à equipe; conferir estado externo antes de repetir operação incerta.
- [Revogação ou falha da ACL Google] Mitigação: revalidar concessões e testar permissões da aplicação e Google em conjunto, inclusive acesso direto.

## Bloqueadores materiais

Decisões aprovadas: fuso de São Paulo; início pela agenda individual e por compromissos individuais, com operações adicionais em séries posteriores; conflitos são avisados para decisão da equipe; eventos existentes são vinculados manualmente; sem acesso clínico, título genérico sem paciente. O profissional autoriza a conexão Google. Consultar e confirmar alterações diretamente no Google Calendar; em resposta incerta, informar a necessidade de conferir antes de repetir. A jornada existente exige preservar demais ocorrências em remarcação individual. Credenciais Google ficam no Vault no servidor; condições reais de prova permanecem pendentes.

Se uma operação incerta pertencer a conta Google anterior e não for possível restabelecer acesso a ela, a operação permanece bloqueada até comprovação do resultado na origem. Ausência de acesso ou de registro local não autoriza desbloqueio administrativo presumido. A desconexão local não comprova revogação do consentimento Google; a revogação externa continua desativada até prova do isolamento e tratamento de concorrência.

## Migration Plan

A meta autoriza operações e migrações no projeto de teste e publicação manual. A ativação exige provas positivas e negativas e revisão independente; dados reais e limpeza não estão autorizados. Rollback e reconciliação dependem do desenho aprovado.
