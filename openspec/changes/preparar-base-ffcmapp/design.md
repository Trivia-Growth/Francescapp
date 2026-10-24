# Design

## Context

Ver [proposal.md](proposal.md) para motivação e escopo. Não há aplicação de produção, manifests de workspace ou código de domínio neste repositório. Existem o mock, seu empacotador, proposta HTML, PDFs e scripts de documentação. O empacotador grava em `output/mockup/`; a proposta carrega duas fontes de `../mockup/assets/`.

O Atendimento foi reconsultado em modo somente leitura na revisão `a0d4f57f2684fad40f60d936cd3dda36353b675f`: workspace pnpm/Turbo, Node 22, pnpm 9.15.9, TypeScript estrito e Biome. Esta é evidência local, não alegação de versões mais recentes ou auditoria de segurança. Os padrões React/Vite/TanStack e camadas permanecem a referência das futuras fatias; não se cria aplicação vazia apenas para declarar esse padrão instalado.

O requisito de isolamento já existe no delta de integridade operacional de `registrar-fundacao-real`. Como este pacote só prepara ferramentas e arquivos, `specs` fica deliberadamente omitido, com `skip_specs: true`. Nenhum FR/SC é adicionado, removido ou sincronizado.

## Goals / Non-Goals

**Goals:** permitir começar as fatias reais sem dependência da demonstração; preservar recursos e documentos; obter verificações locais úteis e reproduzíveis. As decisões técnicas abaixo são propostas para revisão, não configuração já aplicada.

**Non-Goals:** frontend de produção, tela vazia apresentada como produto, migrações de banco, login, acesso inicial administrativo, autorização/RLS, contratos de Google/OpenRouter, modelos de paciente, guarda, ambientes ou publicação. Não criar `netlify.toml` apontando para o mock nem reutilizar credenciais/configurações remotas do Atendimento.

## Decisions

### D1. Arquivo recuperável e separado

Mover o conteúdo de `mockup/` para `docs/legacy/mockup/source/` e a distribuição existente `output/mockup/` para `docs/legacy/mockup/portable/`, preservando bytes. Acrescentar índice de arquivo que identifique simulações, caminhos originais e a revisão anterior à movimentação. Não executar o empacotador arquivado: seus caminhos relativos são históricos, não comandos da base ativa.

Alternativa: apagar e depender só do Git. Rejeitada para esta proposta porque um arquivo explícito facilita consulta e preserva a apresentação. Alternativa: deixar em `mockup/` com aviso. Rejeitada por contrariar o pré-requisito de remover a demonstração da base ativa.

### D2. Fontes da proposta independentes do mock

Preservar Raleway/Cormorant e suas licenças SIL OFL em `assets/fonts/`. Alterar somente as duas URLs de fonte em `output/proposta-edilaine.html` para `../assets/fonts/`. O arquivo histórico mantém seus próprios recursos. Comparar conteúdo das fontes/licenças e todos os PDFs antes/depois. Não regenerar PDFs nem mudar valores comerciais, identidade Trivia ou o nome em snapshots para executar esta tarefa.

Alternativa: fazer a proposta depender do caminho de arquivo histórico. Rejeitada para manter recursos ativos independentes do mock. A cópia de fontes é intencional e limitada à preservação da proposta; não ratifica a fonte oficial da aplicação.

### D3. Referências e ferramentas locais mínimas

Corrigir links ativos em README/PRODUCT/DESIGN e metadados do Impeccable que apontem para a demonstração movida. Preservar `docs/legacy/spec-kit/` integralmente; não reescrever exemplos de caminhos em documentos históricos para fazê-los parecer atuais. Os testes de links devem distinguir documentos ativos de snapshots históricos.

Preparar raiz privada `ffcmapp`, Node 22 e `packageManager: pnpm@9.15.9`, seguindo a referência já escolhida. Workspace usa `apps/*` e `packages/*`, mas não cria pacotes vazios. Biome cobre apenas scripts/configuração próprios suportados, excluindo skills vendorizadas, apresentação e arquivos históricos. Turbo e configurações TypeScript seguem o padrão observado quando houver pacotes/arquivos que realmente os utilizem; não instalar ferramentas sem consumidor para simular avanço.

Criar `verificar:base` com verificações reais de documentação, preservação e isolamento; não oferecer scripts vazios de build, tipos, banco ou integração. A primeira fatia com código adicionará seus próprios gates de lint/tipos/testes/build. Dependências efetivamente usadas têm lockfile versionado e instalação congelada; compatibilidade e versões resolvidas ficam registradas no aceite, sem copiar o lockfile inteiro do Atendimento.

Alternativa: copiar o monorepo, CRM e automações do Atendimento. Rejeitada por KISS/YAGNI e pelo domínio diferente. Esta base não depende de resolver as pendências funcionais.

### D4. Verificar preservação e isolamento

Registrar inventário/hash dos materiais imediatamente antes da movimentação. Testar URLs de fontes, licenças, integridade dos arquivos movidos e PDFs, links ativos e ausência de entradas/dependências do mock nos manifests e configurações ativos. Excluir explicitamente o arquivo histórico da busca de contaminação, sem ignorar referências importadas pela base ativa.

Testes negativos usam diretórios temporários próprios: uma referência ativa ao mock precisa ser detectada; arquivo/fontes ausentes ou alterados precisam reprovar; menção documental permitida e arquivo histórico precisam passar. A verificação não deve modificar os arquivos reais para testar falhas. Verificadores estáticos não comprovam segurança em execução e não substituem futuros testes de autorização/integração.

Manter `scripts/check-framework-migration.mjs` verificando 54 FR, 12 jornadas, 12 SC e arquivo Spec Kit intacto. Só adaptar referências ativas afetadas; não afrouxar essas garantias para fazer a limpeza passar.

## Acceptance Evidence

| Critério local | Evidência exigida |
| --- | --- |
| BASE-01: arquivo recuperável | Inventário antes/depois, fonte/distribuição preservadas e índice de consulta; diretórios antigos fora da base ativa. |
| BASE-02: materiais preservados | Fontes/licenças e PDFs com mesmos hashes; HTML comercial difere apenas nas duas URLs previstas; logos JPEG recebidos permanecem idênticos. |
| BASE-03: isolamento | Verificador passa no estado válido e reprova fixture com dependência ativa do mock; menções históricas não são falso positivo. |
| BASE-04: ferramentas honestas | Instalação reproduzível das dependências usadas e `verificar:base` executando testes de verdade; sem comandos vazios ou alegação de serviços conectados. |
| BASE-05: documentação coerente | Links ativos válidos, 54 requisitos/fases e histórico Spec Kit preservados; limitações da base explícitas. |

BASE é identificação de critérios desta mudança de ferramentas, não novos requisitos FR nem metas SC.

## Risks / Trade-offs

- [Movimento quebra fontes da proposta] → desacoplar URLs e testar arquivos antes de remover o caminho antigo.
- [Busca de mock reprova todo documento ou deixa passar uma entrada ativa] → escopo explícito de fontes ativas e testes positivos/negativos; documentar a cobertura estática limitada.
- [Base mínima confundida com produto implementado] → não criar login, painel ou sucesso de integração fictícios; relatar o que foi executado e o que continua inexistente.
- [Documentos atuais têm formulações antigas de acesso/fornecedor] → ler junto aos deltas recentes; esta mudança não sincroniza essas regras nem fabrica prontidão da mudança anterior.
- [Worktree com materiais de marca ainda não commitados] → preservar as mudanças existentes; não usar checkout/reset nem staging indiscriminado. Antes do apply, conferir diferenças do usuário e parar se houver conflito material.

## Migration Plan

Após revisão e nova autorização para aplicar: criar verificações e inventário; preservar fontes ativas; mover os diretórios; corrigir somente referências afetadas; configurar ferramentas mínimas; executar os cinco critérios e verificadores existentes. Não há migração de dados nem deploy.

Reversão local: desfazer apenas movimentações/URLs/configurações desta mudança, preservando novas alterações do usuário. Em histórico compartilhado, usar reversão revisada, não reset destrutivo. Não remover o arquivo histórico ou recursos comerciais para “limpar” testes.

As perguntas de paciente, Drive, ambientes, identidade, áudio e governança do [roteiro](../../../docs/projeto/roteiro-especificacoes.md) não são decisões adiadas desta preparação: são bloqueios das próximas fatias, que ainda não têm tarefas executáveis.
