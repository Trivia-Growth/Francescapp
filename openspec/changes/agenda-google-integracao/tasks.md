# Tasks

## 1. Decisões para abertura da implementação

- [ ] 1.1 Confirmar bloqueadores materiais do design para FR-023/025/049/050 e registrar decisões verificáveis; evidência: respostas reconciliadas entre proposta, spec e design.
- [ ] 1.2 Após 1.1, detalhar fatia e revisão independente com autorização positiva e negativa, acesso direto, outro paciente/perfil, revogação, ACL Google, falha e resposta incerta; evidência: tarefas com dependências e critérios de aceite sem presumir integração.

Preparação local com Vault no servidor e integração desligada até configuração e prova real. Leitura HTTP da agenda primária iniciada em módulo interno: paginação e título genérico; ainda não conectada à sessão, Vault ou interface, portanto não constitui jornada funcional nem prova de autorização. Permanecem pendentes consentimento, renovação e revogação, vinculação, escrita, autorização no servidor e banco, provas reais e revisão independente. Nenhuma operação remota está autorizada por esta mudança.

Preparação OAuth interna: geração de state e PKCE, troca de código e renovação implementadas sem rota. Não existe persistência ou consumo único de state, vínculo com sessão ou usuário, guarda de tokens no Vault, revogação, nem prova real; os módulos não podem ser expostos ou ativados neste estado.

Reconexão solicita consentimento explícito para obter novo refresh token. Se Google não o fornecer, a troca falha fechada; nenhum token anterior é presumido nem substituído. A experiência de reconexão e a preservação da credencial vigente ainda dependem da integração com Vault e de prova real.

Nenhuma tarefa de integração é executável enquanto 1.1 estiver pendente.

Preparação posterior, ainda sem ativação: rota com bloqueio explícito, consentimento OAuth, state e PKCE vinculados à sessão, cookie temporário cifrado, verificação de ID token/JWKS e executor privado foram compostos localmente. O SQL de state, geração de revogação, atestado e Vault por usuário permanece em `supabase/drafts/20261115100000_agenda_google_conexao.sql`, sem migração ou concessão de papel a login. `pnpm run verificar:rapido` passou; o teste isolado do state passou antes de mudanças posteriores e não prova o estado atual. Não houve teste SQL, Google ou Vault real, credenciais, configuração remota, revisão final ou integração ativada. Permanecem necessários provas de autorização, concorrência e revogação no banco e servidor, ACL Google, logs de parâmetros, isolamento do executor, recuperação/limpeza e revisão independente; revogação local ainda não revoga consentimento no Google. Nenhuma checkbox foi concluída.

Consulta individual preparada na rota protegida: obtém refresh token do Vault via executor privado, renova acesso e consulta agenda primária, com título genérico; revalida sessão e credencial antes da resposta. Gate permanece fechado. A jornada ainda não foi comprovada contra Google, Vault, ACL ou sessão reais; provas de autorização positiva/negativa e revogação continuam pendentes.

A credencial preparada no SQL agora registra o subject validado pelo consentimento; gravação confere vínculo atual e leitura invalida a conexão local quando o subject diverge. A prova de troca de subject, revogação e isolamento no banco permanece pendente antes da ativação.

Criação, alteração e cancelamento individuais preparados na rota bloqueada: identificador estável na criação, `If-Match` em alteração/cancelamento, conflito de horário para decisão, proibição de alterar série mestra e resultado incerto sem repetição automática. A leitura expõe versão externa sem título clínico. Não há prova de concorrência, ACL, resultado perdido ou recorrência no Google real; ativação e revisão independente permanecem pendentes.

A escrita revalida sessão e geração após consultas prévias, imediatamente antes do envio. Revogação após o envio não cancela operação já recebida pelo Google; esse intervalo e resultado incerto exigem prova e reconciliação na ativação.

Preparação de reconciliação: reserva privada por operação antes do contato com Google bloqueia nova escrita enquanto pendente. Criação/alteração carregam marcador; consulta confirmada na origem pode resolver, mas ausência, erro ou 404 mantêm pendência. Não há liberação automática para pedido que não foi enviado ou cujo resultado não pode ser comprovado. Um timeout antes da reserva ainda pode anteceder a chegada tardia da requisição; a interface deve preservar o identificador e não interpretar ausência de pendência como prova de segurança. SQL e concorrência não foram executados; ativação depende de provas reais e revisão.

Falhas comprovadas antes do envio tentam resolver a reserva como não realizada; se a autorização estiver revogada ou a resolução falhar, o bloqueio permanece. Após mudança de subject, API informa apenas `conta_anterior`, sem ID nem dados da agenda antiga, e mantém pendência. Recuperação requer restabelecer acesso autorizado à conta anterior e comprovar resultado na origem; caso isso não seja possível, ainda não existe procedimento administrativo seguro de desbloqueio e o caso permanece pendente para decisão e revisão.
