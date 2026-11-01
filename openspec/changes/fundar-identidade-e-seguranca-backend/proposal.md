# Proposal

## Why

O FFCMApp precisa de uma fundação de backend verificável antes das tabelas e jornadas de cuidado: uma identidade autenticada não é, por si só, um usuário autorizado. Hoje existe conta técnica no Supabase, mas ainda não há a estrutura de autorização da aplicação nem um pacote técnico completo para iniciá-la.

## What Changes

- Revisão aprovada em 01/11/2026: adotar permanentemente os recursos nativos Supabase sem custo adicional no plano vigente. Google OAuth/PKCE, validação de identidade e renovação usam Auth/SDK oficiais; não promover desafio Google, JWKS, cifra de refresh, prova por geração ou autoridade criptográfica de sessão próprios. O desenho vigente está em D-14; os controles de concessão, perfil, vínculo, revogação, auditoria e proteção de campos permanecem. Preservar os experimentos sem tratá-los como dependências da entrega. Recursos nativos continuam sujeitos a quotas; esta decisão não autoriza contratação, deploy, migração ou configuração remota.
- Especificar a primeira fatia executável do backend: identidade local vinculada ao Supabase Auth, perfil único, concessões prévias da equipe, sessão first-party, revogação, bootstrap administrativo restrito e auditoria.
- Incluir cadastro mínimo de paciente e vínculos por paciente para provar a autorização sobre dados persistidos. Confirmado nesta rodada: nome obrigatório; nome de preferência, nascimento e contatos opcionais; familiares/responsáveis vinculados separadamente, sem CPF obrigatório.
- Desenhar migrações versionadas, schemas, chaves/constraints, permissões mínimas, RLS e testes positivos/negativos, seguindo os padrões do Atendimento sem copiar o CRM.
- Delimitar APIs de sessão e administração, erros sanitizados, concorrência, idempotência e resultados parciais; não mascarar ausência de configuração com mocks.
- Registrar o mapa relacional e a sequência do backend completo do núcleo, distinguindo o que é implementável agora das configurações e decisões de governança ainda abertas.
- Incorporar as respostas desta rodada: apagar o áudio original após revisão e incluir criação/cancelamento na primeira agenda. Detalhar essas integrações em suas próprias fatias antes de implementá-las.
- Atualizar o estado factual da conta técnica: login Supabase criado e testado; o perfil Administrador do produto não foi concedido. Não armazenar senha, token, chave ou identificadores pessoais na especificação.

### Escopo implementável deste pacote

Identidade, concessões da equipe, sessão, perfil, paciente mínimo, vínculos, auditoria, bootstrap e migrações correspondentes. O alvo remoto informado é `drdpuxcllpymtoskmuqv`, mas esta proposta não executa migração, concede perfil, publica função ou modifica configuração do serviço.

Não implementa ainda anamnese completa, diário, convite/recuperação familiar completos, documentos, áudio, plano ou agenda. Essas funcionalidades continuam na primeira entrega; o recorte é ordem de execução, não redução dos 45 requisitos iniciais. As 9 evoluções permanecem separadas. O login técnico e o login da equipe não comprovam a jornada familiar.

## Capabilities

### New Capabilities

Nenhuma capacidade paralela às existentes. O backend dá execução às decisões de identidade e governança já aprovadas.

### Modified Capabilities

- `identidade-e-convites`: contrato de entrada que diferencia conta Auth de concessão local, login técnico excepcional já autorizado e tratamento fechado de autenticação incompleta. Complementa FR-035 e prepara FR-051 a FR-054, sem declarar convite familiar entregue.
- `sigilo-e-governanca`: autoridade vigente do perfil, bootstrap fora do navegador, auditoria atômica de concessões/revogações e proteção dos dados/segredos de identidade. Complementa FR-036 a FR-039 e FR-042.
- `caso-e-anamnese`: cadastro mínimo confirmado e distinção entre relação familiar e autorização por paciente; prepara FR-001/002 sem declarar a anamnese completa entregue.
- `diario-e-evolucao`: exclusão do áudio original após revisão humana, com falha e pendência explícitas; complementa FR-010/012/042, sem implementar o pipeline nesta fatia.
- `agenda-e-carteira`: criação e cancelamento confirmados junto da consulta/alteração, preservando origem e permissões; complementa FR-023/024/049/050, sem implementar a integração nesta fatia.

## Impact

Futura implementação em `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`, contratos compartilhados e proxy first-party Netlify. Sem frontend clínico, novas credenciais de fornecedor, multitenancy, cópia de dados ou acesso aos serviços do Atendimento.

### Pausa operacional temporária

Enquanto Docker/Supabase local estiver indisponível na execução local, as provas que dependem desse ambiente serão executadas somente em um projeto Supabase de testes isolado, explicitamente identificado antes da operação. O solicitante autorizou migrações e testes nesse alvo com dados fictícios, seguidos de limpeza seletiva e rastreável desses dados; essa autorização não alcança projeto compartilhado ou de produção, bootstrap, concessão real, configuração de segredos, deploy ou limpeza global. Há CI de qualidade nos PRs prontos para revisão e em pushes na main; continua sem deploy ou migração remota.

### Evidência e dependências

- Repositório atual: demonstração, documentos e specs, sem backend de produção versionado. Em 16/10/2026, consulta somente leitura ao OpenAPI do projeto retornou nenhum modelo de tabela exposto e somente a RPC `rls_auto_enable`; isso não prova ausência de objetos privados nem de contas Auth.
- A conta técnica foi criada e o login verificado na operação autorizada anterior. Uma nova migration deve inspecionar o estado existente e preservar essa identidade, sem recriar usuário ou redefinir senha.
- Referência de leitura reconsultada: Atendimento, revisão `a684d96c9cc044bcf391f558a69ac48db928b51d`, ADR-0001, ADR-0037 e exemplos de sessão/log seguro. Não é auditoria de suas suítes nem adoção de suas regras comerciais.
- [Preparação local](../preparar-base-ffcmapp/proposal.md) deve ser aplicada e validada antes do código da aplicação; não repetir suas movimentações neste pacote.
- [Fundação real](../registrar-fundacao-real/proposal.md) e seus deltas continuam a referência das decisões confirmadas. Esta mudança os complementa sem reescrever ou arquivar os artefatos anteriores. As dependências do OpenSpec entre mudanças são documentais, não uma garantia automática do CLI.
- Retenção, backup/recuperação, configuração Workspace/SMTP, segredos e liberação para dados reais são gates de operação, não valores inventados nesta proposta.
