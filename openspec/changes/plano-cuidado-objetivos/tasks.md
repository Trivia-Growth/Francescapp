# Tasks

## 1. Preparação independente

- [ ] 1.1 Para FR-015/016, validar com equipe campos adicionais, responsável pela validação e periodicidade por caso; registrar respostas e exemplos fictícios nesta change, sem definir conduta por inferência.
- [ ] 1.2 Para cenários de acesso e revogação FR-015/016, confirmar matriz de leitura e escrita por perfil, vínculo e audiência, inclusive acesso familiar; registrar decisões e casos negados nesta change.
- [ ] 1.3 Para histórico FR-016, modelar ameaças de leitura, escrita e acesso direto e revisar a fundação disponível; evidenciar lacunas de cifra, auditoria, autorização e revogação sem presumir integração.
- [x] 1.4 Para FR-015/016, definir contrato de domínio local dos campos já confirmados e revisão versionada sem regras clínicas ou concessões; verificar testes de estados, preservação da versão anterior e conflito.
- [ ] 1.5 Preparar armazenamento privado local e validar sequência, isolamento e imutabilidade; revisão independente e integração segura permanecem pendentes. Não ativar rotas nem usar dados reais.

## 2. Planejamento da integração

- [ ] 2.1 Após 1.1–1.3, atualizar delta, design e tarefas executáveis com matriz confirmada e controles concretos; evidência: revisão de coerência entre requisitos, contrato, segurança e roteiro de teste.
- [ ] 2.2 Após 2.1, revisar independentemente padrões e aderência a FR-015/016 sobre diff definido; registrar achados, correções e limitações antes de solicitar ativação.

## Workflow follow-up

- A integração conectada exige tarefas específicas após decisões materiais, testes positivos e negativos no servidor e banco, prova real com dados fictícios e autorização para qualquer operação remota.
- Na ativação da fatia, executar verificações previstas em AGENTS.md e roteiro de teste; registrar bloqueios, nunca tomar mocks ou testes pulados como prova de integração.

Evidência 1.4: teste local de contrato passou (2 testes); `pnpm run verificar:rapido` passou. Sem persistência, autorização ou integração comprovadas.

Revisão do contrato identificou metadados misturados à entrada e compartilhamento de referências do histórico; correções e teste focado passaram. A futura fronteira autenticada deve fornecer identidade e data confiáveis. O histórico retornado é mutável pelo consumidor; a revisão local não substitui a revisão da fatia conectada.

Preparação 1.2/1.3: design registra aplicação provisória da decisão de colaboradores da anamnese e análise inicial de ameaças, com controles e provas pendentes. Família não recebe acesso por inferência. Matriz definitiva, hipóteses de operação, campos clínicos, recuperação e integração real seguem sem confirmação; 1.1–1.3 e S-02 permanecem abertos.

Preparação 1.5: migration aditiva cria objetivo por paciente e versões privadas imutáveis com envelope, sequência e predecessor no mesmo objetivo, RLS sem policies e sem grants para papéis de aplicação. `sh scripts/testar-plano-cuidado-local.sh` passou em PostgreSQL descartável: cadeia de versões, conflito de versão, isolamento do predecessor, imutabilidade, formato de envelope e privilégios diretos. Não prova concorrência real entre transações, cifra/AAD, autorização, auditoria, Auth/Vault ou grants remotos. Falta mecanismo comprovado de recuperação e limpeza seletiva compatível com imutabilidade; nenhuma operação remota ou rota foi ativada.

Revisão independente não encontrou bypass concreto no recorte privado. O teste usa fixture privilegiada e cadeia parcial; autoria confiável, privilégios efetivos, operações administrativas e concorrência ainda exigem provas antes da ativação.

Preparação posterior: componente web isolado e composição interna de servidor usam a versão atual, cifra autenticada e atestado; testes focados passaram com execução simulada. Revisão identificou risco de duplicação quando uma criação termina após resposta perdida. A interface bloqueia nova criação durante a montagem, mas esse bloqueio não sobrevive à recarga: não ativar a integração até existir reconciliação durável e provas de concorrência, resposta perdida e autorização. Histórico de revisões, Auth/Vault reais e integração com banco seguem pendentes.

Preparação adicional 1.5: operações SQL privadas locais consultam versões atuais e gravam revisão com versão esperada, atestado, revalidação de sessão/concessão e auditoria transacional, sem grant à aplicação. Teste em PostgreSQL descartável passou para criação, revisão, conflito, AAD adulterado, sessão encerrada, familiar, permissões diretas, rollback por falha de auditoria e preservação de memberships anteriores do migrador. Uma revisão apontou remoção indevida de memberships existentes; correção preserva carteira e opções existentes do verificador. Sem prova de concorrência/revogação concorrente específica, idempotência, integração de cifra/servidor, Auth/Vault reais, recuperação ou ativação; matriz definitiva e S-02 continuam pendentes.

Preparação 1.5 — idempotência SQL local: recibo privado vincula ator, operação, chave e digest à versão; repetição revalida autorização e auditoria, e falha de auditoria reverte recibo e versão. Teste local cobre repetição, digest divergente, sessão encerrada e rollback. Concorrência específica, integração com servidor/HMAC, Auth/Vault reais e ativação continuam pendentes. Nenhuma migration remota aplicada.

O servidor agora prepara chave e HMAC para o contrato de repetição; o teste usa executor simulado, sem comprovar integração SQL. Revisão corrigiu preservação de memberships da migration. Rotação da chave HMAC, concorrência e recuperação após recarga permanecem pendentes. A leitura de histórico foi preparada no servidor, mas sua operação SQL ainda não existe; não ativar como integração completa.

Atualização posterior: teste integrado local com PostgreSQL e cifra real passou para leitura de duas versões, paciente alheio e sessão encerrada; Auth/Vault e PostgREST permanecem fixtures, com grant temporário no banco descartável. Interface isolada apresenta histórico; revisão corrigiu limpeza de dados após resposta tardia de acesso negado. Integração remota e ativação continuam pendentes.

Preparação posterior: teste integrado local conectou servidor e PostgreSQL para criação, repetição e resposta perdida após gravação confirmada; Auth/Vault e PostgREST foram substituídos por fixtures e adaptador local. A operação SQL privada de histórico foi preparada e testada separadamente para ordem, outro paciente, sessão encerrada, auditoria e grants. Ainda faltam integrar o histórico ao servidor, provar concorrência e recuperação após recarga, e verificar Auth/Vault reais; nenhuma rota ou migration remota foi ativada.
