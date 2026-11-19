# Design

## Context

Ver `proposal.md`. Hoje há três perfis-base, concessão Google de equipe e exceção técnica por senha. Admissão interna isolada seria insuficiente: o inventário inicial encontrou 17 policies e dezenas de RPCs que conferem Google diretamente. A alteração precisa alcançar esses predicados sem retirar as autorizações clínicas adjacentes.

O pedido atual substitui a exclusividade Google e cria quatro funções de conta (DF-023). A autorização por caso de DF-021 permanece. Usuário determinou que validações manuais permaneçam adiadas: escrever provas, preservar gates e não declarar ativação.

## Goals / Non-Goals

**Goals:** criação administrativa revisável pelo usuário, consulta restrita, admissão pelos dois métodos e preservação da autorização em todos os consumidores afetados.

**Non-Goals:** provisionar usuário real durante desenvolvimento, mudar senha de conta existente, fundir identidades, atribuir paciente automaticamente, modificar permissões de Drive/Agenda, excluir ou revogar acessos existentes.

## Decisions

1. **SUPOSIÇÃO: login é e-mail, uma função e um método por conta.** Método `google_workspace` ou `interno`. Valores de função `administrador`, `case_manager`, `familia`, `profissional`; UI mostra “Familiar”. Não criar resolvedor de apelidos nem habilitar métodos adicionais implicitamente.
2. Função administrativa nova fica separada do perfil-base legado: Case Manager e Profissional usam perfil-base `profissional`, Familiar usa `familia`, Administrador usa `administrador`. Somente cadastro de conta registra a nova função; DF-021 continua a exigir responsável e vínculo do caso. Expandir todos os enums clínicos criaria privilégio ambíguo sem necessidade.
3. Senha pertence exclusivamente ao Supabase Auth. Backend privilegiado separado da conexão autenticada que executa RPC/RLS. Nenhuma chave privilegiada no navegador; dependência ausente produz indisponibilidade explícita. Identidade e configuração já existentes são reutilizadas sem ler ou copiar credenciais.
4. Cadastro usa reserva administrativa auditada, provisionamento nativo e confirmação pelo UUID/identificador confiável da operação. Nome/e-mail cifrados com AAD e busca por HMAC conforme padrões existentes; senha não participa de SQL, recibo, digest ou auditoria. Conflito não altera conta existente. Resultado incerto permite apenas conferência, sem repetição automática.
5. Conta Google não recebe senha. Admissão só após provar identidade Google real, e-mail verificado, domínio institucional e cadastro aprovado; ligação nativa de identidades não substitui autorização de conta/método. Conta interna usa método password real e cadastro explicitamente aprovado, sem fingir OAuth ou marcar exceção técnica.
6. Predicado autenticador compartilhado confere Auth/sessão/concessão/conta vigentes. Substituições SQL limitadas a inventário explícito de consumidores, com âncoras verificadas e falha fechada se divergirem. Preservar literalmente autorização por caso, audiência, perfil, habilitação, locks, owners, ACL, search_path e RLS. Não criar policy permissiva que burle policies restritivas. Agenda OAuth mantém requisitos próprios.
7. **SUPOSIÇÃO: Familiar sem vínculo pode autenticar e recebe carteira vazia.** Conta criada não cria vínculo; criação interna não se passa por aceite de convite antigo. Convites existentes permanecem.
8. UI separa Administração > Acessos da gestão Equipe existente. Nome/e-mail/função/método/motivo; senha somente no método interno, apagada do formulário antes de enviar. Operação pendente impede POST repetido e permite consultar estado. Nenhuma senha em storage ou recibo. Sessão trocada limpa estado.
9. **SUPOSIÇÃO: criação administrativa não prova posse do e-mail.** Conta interna é criada sem confirmação artificial do endereço. Destinatário solicita código nativo do Supabase com `shouldCreateUser:false`, valida código e depois entra com senha. Sessão OTP fica somente no servidor e nunca é admitida como sessão da aplicação; o método interno exige password. Código também é transitório, sem logs/storage/recibo. `createUser` não envia confirmação e `resend` pressupõe signup anterior: não presumir esse fluxo como primeira confirmação. Template nativo deve fornecer código e entrega deve ser homologada antes da ativação. Falha de envio fica explícita; resposta pública não revela existência de conta.
10. Sessões gerenciadas informam `usuario.funcao` opcional, validada pelo servidor, para apresentar a função correta; os controles existentes continuam usando perfil-base, capacidades e autorização por caso. Sessões legadas permanecem compatíveis. Rotas técnica e familiar antigas não admitem contas gerenciadas por método divergente; confirmação OTP usa cliente nativo isolado em memória, sem PKCE/cookies de navegador.
11. Bridges Auth mínimas preservam explicitamente o owner da bridge `auth_privado.identidades` já existente. Não presumir que o migrador pode delegar `USAGE auth`, nem conceder `SET postgres` para viabilizar testes. Prova de bootstrap de plataforma e prova de negócio NOSUPER são etapas distintas; não certificar cadeia integral NOSUPER por fixture privilegiada.
12. Recusa nativa definitiva `weak_password` fica em `falha_confirmada` somente após conferir ausência do UUID Auth reservado. Essa operação não é repetida; preserva histórico e permite nova operação manual para o mesmo e-mail com senha novamente digitada. Unicidade do e-mail exclui apenas esse estado terminal. Não generalizar a falhas desconhecidas, timeout ou conflito de identidade: esses não autorizam nova tentativa automática nem troca de credencial. Evita reservar permanentemente um login sem conta criada após senha recusada.

## Threat model

Ativos: contas Auth, funções, vínculos de caso, senha inicial, chave administrativa, cadastro cifrado e auditoria. Fronteiras: navegador não confiável/BFF; BFF autenticado/RPC; BFF privilegiado/Auth; Auth/identidade local; função de conta/autorização clínica.

**SUPOSIÇÃO de exposição:** aplicação web pública na internet, com acesso de negócio restrito. Atacante pode enviar HTTP arbitrário, adulterar payload/metadata e possuir uma conta sem permissão ou um vínculo revogado; não possui a chave administrativa, a chave de atestação ou o owner da plataforma. Escalação, tomada de conta e exposição clínica têm impacto alto; falhas parciais e enumeração têm impacto médio. Prioridade alta para controles de autorização/método e não vazamento, mesmo com baixa frequência, porque a fronteira é pública e o conteúdo pode ser sensível.

- Escalação por payload/metadata: enum estrito; perfil derivado no banco; Administrador revalidado sob locks antes de reserva e confirmação; metadata cliente nunca concede função.
- Tomada de conta por colisão: não redefinir senha nem adotar UUID por e-mail; confirmar UUID e marcador de operação confiável; ligação OAuth nativa continua sujeita ao método cadastrado e domínio.
- Vazamento de senha: fronteira de escrita isolada, resposta construída por allowlist, erros sanitizados, sem corpo em logs, campo limpo, sem retry automático.
- Auth criado e confirmação perdida: estado durável, sem acesso de negócio até conclusão; recuperação reautorizada não requer senha.
- Bypass por sessão interna: prova de password, identidade ativa e método cadastrado; adaptar autenticador sem remover vínculo/audiência/responsável e testar acesso direto.
- Abuso de Case Manager/Familiar: função não atribui caso nem habilitação; matriz novo ator/outro caso/revogado/privilegiado.
- CSRF/enumeração: origem/sessão e validação existentes, metadados só Administrador, resposta pública de login genérica, paginação e limites de corpo.

Evidência de implementação a revisar: `netlify/functions/_shared/acessos-nativo.ts` (projeção, reserva e reautorização), `auth-nativo/{admin,cliente-otp,interno,confirmar-email-interno,entrada-interna}.ts` (clientes separados e transporte), `web/{acessos-administracao,login-interno,servico-acessos-http}.ts` (limpeza e resultado incerto) e migrations `20261125150000`/`160000`/`170000` (RLS, admissão e consumidores). Estes são controles em código, **não evidência de execução**; testes escritos e revisão de fonte não substituem matriz real. Não há alteração em pipeline/CI que conceda permissão de aplicação.

## Risks / Trade-offs

- Mudança transversal de autenticação pode deixar consumidor antigo negando login interno. Inventário explícito, revisão independente e matriz completa obrigatórios antes de ativar.
- Auth remoto e banco de negócio não têm transação única. Operação durável e estado honesto evitam compensação destrutiva; nenhuma exclusão automática.
- Serviço Auth e envio/verificação de e-mail dependem da configuração nativa. Não presumir integração comprovada por testes fictícios; registrar estado pendente quando necessário.
- **SUPOSIÇÃO:** senha inicial aceita política nativa e mínimo local conservador de 12 caracteres, sem regras artificiais de composição. Criação não prova posse do e-mail; não transformar e-mail digitado em identidade Google verificada.

## Migration Plan

Migrations aditivas locais após `20261125140000`: cadastro/provisionamento, admissão/contexto e consumidores. Nenhuma alteração remota nesta frente enquanto validações estiverem adiadas. Aplicação só deve ser declarada ativa após provas servidor+SQL positivas/negativas, método/perfil/caso/revogação, revisão em dois eixos e roteiro real com dados fictícios.

Retorno conservador: desabilitar nova entrada/rota por configuração e manter estados pendentes, preservando contas e histórico. Não remover tabelas, limpar dados, reescrever histórico ou revogar acessos como compensação.

Referências primárias consultadas: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [código de confirmação por e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless); SDK instalado para contrato efetivo. Documentação demonstra capacidade, não integração real.
