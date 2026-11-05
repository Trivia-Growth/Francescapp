# Tasks

## 1. Decisões para abertura da implementação

- [ ] 1.1 Confirmar bloqueadores materiais do design para FR-023/025/049/050 e registrar decisões verificáveis; evidência: respostas reconciliadas entre proposta, spec e design.
- [ ] 1.2 Após 1.1, detalhar fatia e revisão independente com autorização positiva e negativa, acesso direto, outro paciente/perfil, revogação, ACL Google, falha e resposta incerta; evidência: tarefas com dependências e critérios de aceite sem presumir integração.

Preparação local com Vault no servidor e integração desligada até configuração e prova real. Leitura HTTP da agenda primária iniciada em módulo interno: paginação e título genérico; ainda não conectada à sessão, Vault ou interface, portanto não constitui jornada funcional nem prova de autorização. Permanecem pendentes consentimento, renovação e revogação, vinculação, escrita, autorização no servidor e banco, provas reais e revisão independente. Nenhuma operação remota está autorizada por esta mudança.

Preparação OAuth interna: geração de state e PKCE, troca de código e renovação implementadas sem rota. Não existe persistência ou consumo único de state, vínculo com sessão ou usuário, guarda de tokens no Vault, revogação, nem prova real; os módulos não podem ser expostos ou ativados neste estado.

Reconexão solicita consentimento explícito para obter novo refresh token. Se Google não o fornecer, a troca falha fechada; nenhum token anterior é presumido nem substituído. A experiência de reconexão e a preservação da credencial vigente ainda dependem da integração com Vault e de prova real.

Nenhuma tarefa de integração é executável enquanto 1.1 estiver pendente.

Preparação posterior, ainda sem ativação: rota com bloqueio explícito, consentimento OAuth, state e PKCE vinculados à sessão, cookie temporário cifrado, verificação de ID token/JWKS e executor privado foram compostos localmente. O SQL de state, geração de revogação, atestado e Vault por usuário permanece em `supabase/drafts/20261115100000_agenda_google_conexao.sql`, sem migração ou concessão de papel a login. `pnpm run verificar:rapido` passou; o teste isolado do state passou antes de mudanças posteriores e não prova o estado atual. Não houve teste SQL, Google ou Vault real, credenciais, configuração remota, revisão final ou integração ativada. Permanecem necessários provas de autorização, concorrência e revogação no banco e servidor, ACL Google, logs de parâmetros, isolamento do executor, recuperação/limpeza e revisão independente; revogação local ainda não revoga consentimento no Google. Nenhuma checkbox foi concluída.
