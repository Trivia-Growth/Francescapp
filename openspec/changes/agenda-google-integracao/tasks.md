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

Vínculo manual local preparado: servidor consulta evento na agenda da conta, revalida sessão e credencial; SQL privado exige profissional, subject vigente e acesso ativo ao paciente, registra auditoria e trata repetição do mesmo par como idempotente. Outro paciente resulta em conflito sem divulgar identidade. Não altera nem envia dados clínicos ao Google. Leitura do vínculo após recarga, provas SQL/Google, corrida de revogação e revisão independente permanecem pendentes; gate continua fechado.

Correção de concorrência preparada para vínculo manual: geração da credencial é atestada e conferida sob o mesmo bloqueio de salvar/revogar. Ainda requer prova SQL de corrida e revisão independente antes da ativação.

Leitura em lote preparada para vínculos locais: até 250 eventos por chamada, somente profissional com acesso ativo ao paciente, subject e geração vigentes; SQL audita e devolve nomes cifrados, servidor usa projeção existente e revalida acesso antes de responder. Gate permanece fechado; provas SQL de acesso direto, outro paciente, revogação concorrente, privacidade e integração real continuam pendentes.

Desconexão local preparada sob geração e subject, com revogação do segredo e dos states no Vault/banco e auditoria; pendências de escrita são preservadas. Cliente de revogação Google preparado, mas gate específico permanece fechado: [Google informa](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) que a revogação afeta escopos e tokens de todos os clientes do projeto. Antes de habilitar é preciso comprovar isolamento do projeto e impedir reconexão durante resultado externo incerto. Resposta informa `nao_comprovada`; nenhum pedido remoto foi executado. Provas SQL, ACL e concorrência continuam pendentes.

Reconexão usa `prompt=consent`, sem presumir que Google emitirá refresh token. Após validar ID token, audiência, nonce e subject, ausência de refresh leva a `?agenda=autorizar-novamente` sem substituir credencial anterior. A orientação deve apontar para [conexões da Conta Google](https://support.google.com/accounts/answer/13533235?hl=pt-BR), explicar que remover acesso pode afetar outros acessos do projeto e não garantir emissão posterior. Prova Google real permanece pendente.

Desconexão local agora exige versão observada e UUID de operação; recibo transacional permite repetir o mesmo pedido após timeout e compara geração sob lock, impedindo pedido antigo de apagar conexão posterior. Resposta inclui estado atual além do resultado anterior. SQL, concorrência e recuperação após falhas ainda exigem prova; revogação Google segue não comprovada e gate fechado.

Para impedir replay de um marcador em outra conta, status de conexão emite comprovante selado vinculando usuário, subject, versão e UUID; desconexão o confere contra identidade autenticada antes do recibo SQL. Comprovante não substitui autorização nem sessão. Prova de troca de usuário e concorrência permanece pendente.

Consulta somente de recibo preparada para recuperar resultado após rotação/perda do comprovante: filtra usuário e subject atuais, não executa desconexão e responde desconhecido quando não encontra recibo. Ausência não prova que pedido anterior deixou de estar em trânsito. Provas de isolamento e corrida permanecem pendentes; gate segue fechado.

Limitação identificada antes da preparação de cancelamento — desconexão: se a aba fechar após salvar o marcador local e antes de enviar o POST, e o comprovante não tiver sido preservado, a consulta do recibo pode permanecer `desconhecido` indefinidamente. Ausência de recibo não comprova que o pedido não está em trânsito. Definir e provar recuperação segura desse intervalo e da rotação da chave, sem liberar operação nem criar novo UUID apenas por ausência.

Preparação posterior: cancelamento autenticado de intenção de desconexão grava recibo `cancelada` sob o mesmo bloqueio do POST original. Se cancelar vencer, POST atrasado encontra o recibo e não altera credencial; se desconexão vencer, cancelamento devolve o desfecho anterior. Operação não depende do comprovante antigo e não altera conexão nova. Implementação SQL local ainda requer provas de corrida, isolamento entre usuários e revisão antes da ativação.

Retirada de vínculo manual preparada com UUID por associação, exclusão lógica e auditoria: exige profissional, paciente vinculado, subject e geração vigentes; repetição de vínculo antigo não remove outro posterior. Não modifica Google. Provas de acesso direto, revogação concorrente, histórico e repetição permanecem pendentes; gate fechado.
