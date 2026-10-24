# Tasks

Planejamento para revisão; nenhuma tarefa executada nesta etapa. Referência: [design.md](design.md), critérios BASE-01 a BASE-05. Vínculo funcional de suporte: FR-042 e isolamento da demonstração em `registrar-fundacao-real`; não comprova segurança ou integração do produto. Não há delta funcional novo (`skip_specs: true`).

## 1. Inventário e proteção da preservação

Arquivos permitidos: scripts/verificações próprios, testes próximos e registro de inventário em `docs/processo/`. Não alterar os materiais nesta etapa. Limites: não registrar dados de pacientes/segredos; não tocar `docs/legacy/spec-kit/`.

- [x] 1.1 Registrar inventário e hashes de `mockup/`, `output/mockup/`, fontes/licenças, proposta HTML, PDFs e `assets/brand/francescato/`, mais a revisão/worktree de origem. Dep.: nenhuma. Aceite BASE-01/02: inventário localizável e conferência dos bytes originais; alterações pré-existentes do usuário identificadas e preservadas.
- [x] 1.2 Criar testes/verificador de preservação com diretórios temporários próprios: caso válido passa, fonte/licença/PDF alterado ou ausente reprova. Dep.: 1.1. Aceite BASE-02: executar testes positivos e negativos sem modificar os arquivos reais; documentar o comando e a cobertura no registro do inventário.

## 2. Desacoplar a proposta e arquivar a demonstração

Arquivos permitidos: movimentações de `mockup/` e `output/mockup/`, `docs/legacy/mockup/`, `assets/fonts/`, apenas URLs de fonte de `output/proposta-edilaine.html`, scripts/testes de preservação e documentação ativa afetada. Não redesenhar proposta ou mock; não regenerar PDFs.

- [x] 2.1 Preservar as duas fontes e respectivas licenças em `assets/fonts/` e trocar somente as duas URLs correspondentes na proposta HTML. Dep.: 1.2. Aceite BASE-02: verificar resolução dos caminhos, mesmos hashes das fontes/licenças e diferença de HTML limitada às URLs previstas; documentar os novos caminhos.
- [x] 2.2 Mover fonte/distribuição para `docs/legacy/mockup/source/` e `docs/legacy/mockup/portable/`, acrescentando índice com origem, natureza demonstrativa e aviso de que o empacotador arquivado não é comando ativo. Dep.: 2.1. Aceite BASE-01/02: arquivos inventariados recuperáveis com mesmos bytes, PDFs/logos preservados e ausência dos antigos diretórios ativos; teste de preservação atualizado passa.
- [x] 2.3 Corrigir referências ativas em README/PRODUCT/DESIGN e sidecar Impeccable, preservando snapshots e todo o Spec Kit arquivado. Dep.: 2.2. Aceite BASE-05: links ativos resolvem para o arquivo correto e `node scripts/check-framework-migration.mjs` continua preservando os 54 FR/fases, 12 jornadas, 12 SC e arquivos históricos.

## 3. Isolamento e ferramentas mínimas

Arquivos permitidos: `package.json`, `pnpm-workspace.yaml`, lockfile, configuração Biome necessária, `.gitignore`, scripts/testes próprios e instruções de desenvolvimento. Não criar aplicação, pacotes vazios, modelo de dados, credenciais ou configuração de publicação. O alvo de ferramentas é somente o código próprio suportado, não skills ou documentos históricos.

- [x] 3.1 Criar verificador de referências/dependências ativas à demonstração com testes de import/entrada indevida, menção documental permitida e arquivo histórico permitido. Dep.: 2.3. Aceite BASE-03: fixture ativa indevida reprova e fixtures válidas passam; documentar escopo e limites da análise, sem declará-la prova de segurança em execução.
- [x] 3.2 Preparar raiz privada `ffcmapp`, Node 22, pnpm 9.15.9 e padrão de workspace observado, instalando somente ferramentas com consumidor nesta mudança e versionando o lockfile correspondente. Dep.: 3.1. Aceite BASE-04: instalação congelada reproduzível e versões efetivamente usadas registradas; sem copiar configurações/segredos/pacotes de CRM do Atendimento.
- [x] 3.3 Criar `verificar:base` unindo verificações realmente implementadas de preservação, links/histórico e isolamento; configurar lint somente sobre arquivos próprios pertinentes. Dep.: 3.2. Aceite BASE-03/04/05: comando passa no estado válido e retorna erro quando um dos verificadores falha em fixture isolada, sem scripts vazios de build/tipos/integração.
- [x] 3.4 Documentar instalação/comandos exatos, consulta do arquivo e limites da base; indicar que React/Vite/camadas e seus gates serão acrescentados com a primeira fatia de código, sem alegar frontend ou conexão existente. Dep.: 3.3. Aceite BASE-04/05: seguir as instruções com instalação congelada e reproduzir o comando documentado; nenhum comando ativo inicia o mock.

## 4. Aceite integrado da preparação

Arquivos permitidos: relatório de evidências em `docs/processo/` e correções dentro dos limites dos grupos anteriores. Não marcar testes de aplicação, autorização ou integração como executados se não existem.

- [x] 4.1 Executar `verificar:base`, teste de preservação, testes negativos de isolamento, verificação de migração e validação OpenSpec estrita; conferir proposta/fontes, PDFs e imagens contra inventário. Dep.: 3.4. Aceite BASE-01 a BASE-05: registrar comandos, saídas resumidas, achados/correções e limitações; todas as verificações afetadas aprovadas, sem reduzir suas garantias.
- [x] 4.2 Revisar o diff final, confirmar que nenhum serviço foi provisionado ou chamado, não há credenciais/dados reais e as decisões pendentes das próximas fatias permanecem pendentes. Dep.: 4.1. Aceite: relatório informa somente preparação concluída, preserva mudanças do usuário e não declara `registrar-fundacao-real`, login ou núcleo funcional implementados.

## Workflow follow-up

- Submeter os artefatos ao solicitante; iniciar apply somente após novo pedido de implementação.
- Sincronizar/arquivar apenas após conclusão comprovada e solicitação no fluxo correspondente; não arquivar `registrar-fundacao-real` como efeito colateral.
- Gerar a próxima mudança funcional depois das decisões materiais do roteiro, sem promover evoluções à primeira entrega.
