# Proposal

## Why

Diretriz do solicitante, 11/11/2026, em resposta à pergunta sobre onde guardar parâmetros variáveis:

> "tudo que é variavel deve ser preenchida no front e guardada no banco de dados"

Hoje o que liga e desliga serviço vive em variável de ambiente do Netlify. Isso obriga quem administra a abrir o painel do provedor, não deixa trilha de quem mudou o quê, e não aparece em lugar nenhum da plataforma. Parâmetro operacional precisa ter dono, tela e histórico.

## What Changes

- Tabela `identidade.configuracao_sistema`: catálogo de chaves com `valor` (jsonb), `tipo`, `rotulo`, `descricao`, `exposicao`, `versao` e autoria da última alteração.
- Operação privada `api.configuracao_sistema_privado` (ações `listar` e `gravar`), Administrador-only, no padrão canônico do projeto: atestado HMAC, autorização revalidada sob lock, auditoria em todo caminho (permitido e negado), idempotência por `operacao.requisicao`, owner dedicado `NOLOGIN NOBYPASSRLS`, `search_path=''`, zero grants a `anon`/`authenticated`/`service_role`/`public` antes da migration de ativação.
- Leitor do servidor `identidade.ler_configuracao_sistema_publica()` com cadeia de papéis própria (espelha o Vault), expondo só `exposicao = 'servidor'`.
- Rota HTTP `/api/admin/configuracao-sistema` e tela de administração em `web/configuracao-sistema.ts`.
- Migração de duas rotas como prova: `netlify/functions/contato.ts` e `netlify/functions/campo-extra-plano.ts` passam a ler o interruptor do banco, com a variável de ambiente como padrão.

## Decisões registradas

1. **O catálogo de chaves é definido por migration; a tela edita VALOR.** Quem lê a configuração é o código. Chave criada pela tela não teria leitor, e `tipo` editável pela tela invalidaria a validação do valor. Por isso `gravar` só faz UPDATE: sem INSERT, sem DELETE, e o grant de coluna do owner cobre apenas `valor`, `versao`, `atualizado_por_usuario_id` e `atualizado_em`.
2. **Configuração não é autorização.** Ligar uma rota por configuração nunca substitui sessão, concessão e atestado — a rota continua validando tudo no banco. Configuração decide disponibilidade do serviço, não permissão de quem chama.
3. **Falha de leitura nunca LIGA um serviço.** A variável de ambiente é o padrão; o banco só sobrepõe quando responde e traz a chave no tipo certo. Banco fora do ar mantém o que o ambiente já dizia.
4. **A rota de configuração não lê a si mesma.** `/api/admin/configuracao-sistema` continua em variável de ambiente (`FFCM_CONFIGURACAO_SISTEMA_ATIVO`), senão um valor errado gravado pela tela trancaria por fora a própria tela que o corrigiria.
5. **`exposicao` separa audiências.** `'servidor'` é o que o processo do servidor pode ler pela cadeia de papéis restrita; `'administracao'` só aparece na tela autenticada.

## Pendências explícitas

- **Os seis interruptores `= false` em código NÃO foram migrados** (`netlify/functions/agenda-google.ts:23`, `auth.ts:31`, `convites-familiares.ts:22`, `cancelar-convite-familiar.ts:23`, `consulta-convite-familiar.ts:23`, `enviar-convite-familiar.ts:19`). Eles são constantes de desativação de funcionalidade sem prova de ponta a ponta, não parâmetros operacionais. Trocar a constante por configuração no banco faria uma tela de administração ligar caminho nunca exercitado. A migração de cada um exige antes a prova real correspondente; só depois a chave entra no catálogo.
- **Passo operacional fora de migration**: a membership `grant ffcmapp_configuracao_leitor_executor to <FFCM_CONFIG_DB_USER> with inherit false, set true` precisa ser executada uma vez com o papel administrativo do projeto, como no Vault. Enquanto não for, o leitor falha e toda rota migrada cai no padrão do ambiente.
- Revisão independente de dois eixos e provas positivas/negativas de autorização em ambiente real continuam pendentes, como em qualquer fatia nova.

## Impact

Contratos (`packages/contracts/src/configuracao-sistema.ts`, duas rotas novas em `rotas.ts`), servidor (`netlify/functions/configuracao-sistema.ts` e `_shared/`), persistência (migrations `20261117400000`–`20261117430000`) e interface (`web/configuracao-sistema.ts`, `web/servico-configuracao-sistema-http.ts`, estilos). Nenhuma migration remota foi executada e nenhuma variável do Netlify foi alterada por esta mudança.
