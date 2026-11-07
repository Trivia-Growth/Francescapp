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

Bloqueio de ativação FR-015/016: lista de objetivos e histórico SQL retornam conjuntos completos, enquanto o cliente HTTP limita a resposta a 1 MiB. Um plano ou histórico legítimo pode ultrapassar esse limite e ficar indisponível. Antes de ativar, definir e implementar paginação de ponta a ponta com ordenação estável, contrato, operação SQL atestada, autorização e auditoria por página, interface e testes de continuidade, limites e acesso. Não elevar ou remover o limite como correção: isso não limita memória ou tempo no servidor. A entrada preparada e o dispatcher protegido permanecem inativos até resolver este bloqueio e cumprir S-02.

Desenho mínimo para próxima implementação: paginar objetivos por `objetivo_id` e histórico por `versao`, ambos em ordem crescente com cursor exclusivo e tamanho limitado. Incluir paciente, objetivo quando aplicável, cursor e limite na entrada canônica atestada; revalidar sessão e autorização e auditar cada página. A resposta deve indicar próximo cursor apenas quando houver outra página; interface carrega páginas sem omitir ou repetir registros e trata alterações concorrentes sem alegar snapshot. Testar coleção acima de 1 MiB, fronteiras de página, cursor adulterado ou de outro paciente, acesso revogado entre páginas e conjuntos vazios; definir e testar o comportamento de alterações concorrentes antes de liberar. Esse desenho é preparação, não aprovação de migration ou operação remota.

Atualização: paginação foi preparada no banco, servidor e interface, com cursor vinculado ao contexto. Testes locais percorreram histórico de 55 versões e mais de 1 MiB em três páginas, além de revogação entre páginas e cursores inválidos; PostgreSQL e cifra foram reais, Auth/Vault e transporte simulados. Alterações concorrentes não constituem snapshot e precisam de prova antes da ativação. Nenhuma rota ou migration remota foi ativada.

Teste concorrente posterior executou a cadeia SQL atual e passou para revogação de sessão e concessão nas duas ordens, repetição após revogação e conflito de revisões. As conexões comprovaram bloqueio entre transações, sem identificar a linha responsável; Auth e atestado permanecem fixtures e não comprovam integração remota.

Montagem local conecta a tela de plano ao fluxo de pacientes; retorno à aba revalida antes de exibir dados e teste com 403 simulado confirma limpeza e saída. Teste HTTP integrado local passou com PostgreSQL, cifra e atestado reais; Auth, Vault e transporte PostgREST foram simulados e grant concedido apenas no banco descartável. Dispatcher segue inativo; isso não comprova acesso ou revogação reais no Supabase.

O teste HTTP integrado foi ampliado para reserva, gravação confirmada com resposta perdida, repetição, revisão, histórico paginado e negativa de outro paciente. A gravação é comprovada no banco antes da repetição; Auth e Vault seguem simulados.

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

Preparação privada local: criação exige reserva vinculada ao ator, paciente e época; confirmação e objetivo compartilham transação. Encerramento usa o mesmo bloqueio, gera recibo pendente e impede envio atrasado após avanço de época. Contrato de reserva, consulta, encerramento e reconhecimento exige autorização vigente e auditoria pelo futuro chamador na mesma transação; não há grants ou rotas. Teste PostgreSQL local cobre confirmação, consulta, bloqueio por recibo, reconhecimento, envio atrasado e cancelamento. Teste adicional com duas conexões confirma que reserva aguarda bloqueio do paciente e criação prossegue sem deadlock; grant CREATE preexistente é preservado. Faltam composição autorizada, provas das demais corridas e revisão independente; integração continua bloqueada.

Revisão incremental identificou ordem de locks divergente e possível remoção de grant existente; correções foram verificadas por leitura e teste local. A revisão da integração completa continua pendente.

Composição privada preparada com atestado, autorização e auditoria; teste PostgreSQL local passou para reserva, encerramento, sessão encerrada, assinatura adulterada e rollback de auditoria. Revisão estática não identificou nova falha concreta. O teste novo não comprova família, usuário inativo, concessão revogada, expiração sob espera ou revogação concorrente; composição com servidor e integração real seguem pendentes. Nenhum grant ou rota foi ativado.

Preparação posterior: handler e executor da barreira foram conectados localmente ao PostgreSQL descartável; teste integrado passou com Auth/Vault e transporte simulados. Revisão corrigiu classificação de timeout de consulta como mutação incerta. Fluxo web, outras corridas, Auth/Vault reais e ativação continuam pendentes.

Preparação posterior: controlador web isolado inicia criação bloqueada até consultar e reconhecer a reserva; servidor encaminha reserva e geração na criação. Testes integrados locais de reserva e gravação passaram com fixtures. Revisão corrigiu perda de rascunho durante reconciliação e sucesso indevido de replay usando outra reserva. Rotas, Auth/Vault reais e provas de integração externa continuam pendentes.

Verificação adicional da composição privada: `sh scripts/testar-plano-composicao-integrada-local.sh` passou em PostgreSQL descartável, incluindo negação para usuário inativo, perfil familiar e concessão revogada após reserva. Auth/Vault e transporte seguem simulados; o teste não prova revogação concorrente ou integração remota.

Prova no Supabase de teste: um objetivo fictício foi reservado, criado e recuperado no paciente do lote; conteúdo decifrado, versão e auditoria confirmados. Handler, cifra, atestado, Vault e PostgreSQL reais; JWT e autorização simulados no contexto SQL. Grants e memberships temporários foram removidos e conferidos ausentes. Jornada HTTP, Auth real e negativas por perfil continuam pendentes; rota permanece fechada.

A tela do plano pede confirmação antes de descartar alterações ao cancelar; teste web focado passou. Integração HTTP real e ativação permanecem pendentes.

Atualização de 06/11/2026: migration `20261112122000` aplicada ao Supabase de teste para exigir registro de auditoria; conferidos os privilégios do migrador antes da aplicação. Testes SQL locais cobriram inclusão suprimida e rollback. A aplicação não concede acesso às RPCs e não comprova a jornada HTTP nem encerra S-02.

Atualização de 06/11/2026: migration `20261112200000` aplicada ao Supabase de teste para registrar negativas de Auth sem perfil. Teste SQL local usou fixtures; integração real, grant e rota do plano permanecem pendentes.

Atualização de 06/11/2026: com JWT Auth e atestados Vault reais, conta fictícia `c1f34cd1-d7f2-48b1-a505-5695b7fe4382` sem perfil recebeu negativas de leitura, histórico e gravação; três eventos foram auditados. Grants temporários foram revogados; após revisão e teste local, migration `20261112240000` habilitou dois wrappers no Supabase de teste. Flag somente na branch privada, deploy `6aee2f5dfac4f0515dc67a0a`. Prova positiva por interface, recarga, revogação e perfis seguem pendentes; usar somente dados fictícios.

Prévia privada atualizada para deploy `6aee309e547179236da2ab09`; flag do plano mantida apenas na branch de teste. Prova positiva pela tela e persistência após recarga seguem pendentes.

Preparação web: resumo para profissional consulta objetivos paginados e tarefas em aberto pelos serviços existentes, descartando conteúdo ao fechar, ocultar a aba ou trocar sessão/perfil. Testes focados cobrem paginação, resposta tardia e troca de profissional; revisão e prova visual/HTTP real permanecem pendentes. FR-006 não está concluído: faltam situação, mudanças recentes, atenção sinalizada, agenda, revisão responsável e indicação de informação não incorporada, além da comprovação de autorização e audiência.

Prévia privada: deploy `6aee6dfebddb343a03dbb57c` do commit `9db7ca0`, estado ready, 16 funções Node 22; produção preservada e builds automáticos parados. Resumo parcial para profissional publicado; acesso visual, dados persistidos e autorização real ainda sem prova nesta versão.
