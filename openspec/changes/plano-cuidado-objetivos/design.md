# Design

## Context

FR-015/016 são referência, não prova de implementação. `packages/contracts/src/anamnese.ts` mostra contratos validados e versão esperada; não comprova integração do plano. A referência Atendimento recomenda domínio sem I/O, contratos explícitos e autorização no servidor e banco.

## Goals / Non-Goals

**Goals:** definir fatia conectada e histórico verificável, preservando decisões clínicas.

**Non-Goals:** conduta clínica automatizada, tarefas e demais requisitos de coordenação, ou liberar dados reais.

## Decisions

- Tratar objetivo e revisões por caso, com versões imutáveis e atualização concorrente condicionada à versão esperada. Sobrescrever registro perderia histórico; manter versões exige transação e testes de concorrência.
- Usar contratos tipados e validação em fronteira, persistência no Supabase com proteção de conteúdo e auditoria conforme fundação vigente. Avaliar disponibilidade e limites nativos antes de adotar recursos; não criar serviços adicionais sem lacuna concreta.
- Autenticação, vínculo por caso e audiência são controles distintos; agenda não concede acesso. Negar por padrão até matriz específica ser confirmada. Não presumir que perfil ou atribuição clínica concede acesso. A matriz pode usar concessão específica ou vínculo existente, conforme decisão explícita; sem ela nenhuma exposição conectada deve ser ativada.
- Motivo e responsável integram revisão, com data gerada em fonte confiável. Não definir transições clínicas ou intervalos automáticos.

## Risks / Trade-offs

- Conteúdo sensível ou versões anteriores expostas: autorização no servidor e banco, cifra aplicável, logs sanitizados e provas diretas positivas e negativas.
- Revisões concorrentes: controle de versão e erro explícito, sem substituir atualização anterior.
- Regras abertas: validar campos, responsáveis e audiência com equipe antes de disponibilizar fluxo. Proposta não atesta segurança nem integração.

## Migration Plan

Preparar migração aditiva local e testes; nenhuma operação remota ocorre sem autorização explícita. Antes de ativar, definir recuperação e reversão que preservem dados e histórico; uma reversão não elimina registros sem procedimento aprovado.
