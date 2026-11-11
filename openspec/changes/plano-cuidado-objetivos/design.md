# Design

## Context

FR-015/016 são referência, não prova de implementação. `packages/contracts/src/anamnese.ts` mostra contratos validados e versão esperada; não comprova integração do plano. A referência Atendimento recomenda domínio sem I/O, contratos explícitos e autorização no servidor e banco.

## Goals / Non-Goals

**Goals:** definir fatia conectada e histórico verificável, preservando decisões clínicas.

**Non-Goals:** conduta clínica automatizada, tarefas e demais requisitos de coordenação, ou liberar dados reais.

## Decisions

- Tratar objetivo e revisões por caso, com versões imutáveis e atualização concorrente condicionada à versão esperada. Sobrescrever registro perderia histórico; manter versões exige transação e testes de concorrência.
- Usar contratos tipados e validação em fronteira, persistência no Supabase com proteção de conteúdo e auditoria conforme fundação vigente. Avaliar disponibilidade e limites nativos antes de adotar recursos; não criar serviços adicionais sem lacuna concreta.
- Autenticação, vínculo por caso e audiência são controles distintos; agenda não concede acesso. A decisão provisória de colaboradores está delimitada abaixo; não presumir acesso familiar ou autorização pela atribuição clínica. A matriz definitiva permanece pendente e nenhuma exposição conectada deve ser ativada sem seus controles e provas.
- Motivo e responsável integram revisão, com data gerada em fonte confiável. Não definir transições clínicas ou intervalos automáticos.

## Recorte local provisório para implementação

Para preparar a integração, aplicar provisoriamente a decisão de anamnese: colaboradores ativos com concessão de equipe vigente podem ler e editar objetivos de qualquer caso, sem vínculo individual; família e permissões de agenda não concedem acesso por inferência. Sessão, identidade e concessão devem ser revalidadas no servidor e banco, inclusive na revogação concorrente. A matriz definitiva e eventual acesso familiar continuam pendentes; este recorte não autoriza ativação nem dados reais.

O contrato local já contém descrição, área, responsável, situação inicial, observação de progresso, data de revisão e estado. Cada objetivo deve ter identificador estável e versões imutáveis vinculadas ao caso; revisão exige versão esperada e motivo, com ator e data derivados da fronteira confiável. Entrada e metadados não podem escolher identidade de auditoria. Uma transação deve autorizar, conferir versão, gravar nova versão e auditar; conflito ou falha de auditoria não pode alterar o histórico. Não inventar campos adicionais, regras clínicas, periodicidade ou responsável pela validação.

## Decisões do solicitante (10/11/2026) — campos extras e aprovação

Fecham parte das pendências de 1.1/1.2:

- **Campos extras**: Edilaine (Administrador) pode criar campos extras do objetivo pela própria plataforma. Catálogo **global** (mesma lista em todo objetivo de todo caso, não por caso/tipo de objetivo). Quatro tipos: texto livre, número, data e lista de opções (as opções da lista também são definidas pela Edilaine, 1 a 20 por campo). Não há periodicidade obrigatória de revisão (fica livre, profissional decide quando revisar). Valor dos campos extras preenchido por caso **ainda não está integrado** ao objetivo/envelope cifrado — só o catálogo (nome/tipo/opções/ativo) está implementado nesta rodada; ver "Estado da implementação" abaixo.
- **Aprovação**: é um carimbo (quem aprovou, quando), não um portão — qualquer colaborador com concessão vigente registra objetivo/revisão normalmente (mesmo modelo provisório da anamnese), e a aprovação não bloqueia nada. Edilaine aprova por padrão; ela pode indicar qualquer colaborador específico (não só outro Administrador) como aprovador extra. **Não implementado nesta rodada** — fica para a próxima sessão supervisionada, junto da integração dos campos extras ao objetivo.
- **Matriz de acesso do objetivo em si** (ler/editar objetivo e revisão): confirmado reaproveitar o modelo provisório da anamnese já descrito acima — sem mudança.

Nome/tipo/opções do campo extra não são conteúdo clínico do paciente (são definição de esquema, administrada por Administrador), por isso **não** entram no envelope cifrado — diferente do valor que um profissional viria a preencher por caso, que deve seguir cifrado como qualquer outro campo do objetivo quando essa integração existir.

## Estado da implementação (10/11/2026, trabalho noturno não supervisionado)

Implementado e testado localmente (PostgreSQL descartável, não aplicado em nenhum ambiente remoto):
- `supabase/migrations/20261116130000_campo_extra_plano_catalogo.sql`: tabela `cadastro.campo_extra_plano_catalogo` (nome, tipo, opções, ativo, versão), RLS habilitada, zero grants a `anon`/`authenticated`/`service_role`/`public`.
- `supabase/migrations/20261116140000_campo_extra_plano_operacoes_privadas.sql`: `operacao.campo_extra_plano_operacao_privada`/`api.campo_extra_plano_privado`, atestado HMAC obrigatório, autorização administrador-only (bloco de autorização copiado literalmente de `operacao.criar_concessao_equipe_privado`, sem alteração de lógica), idempotência via `operacao.requisicao`, auditoria em todo caminho permitido/negado, owner dedicado `ffcmapp_campo_extra_plano_owner` sem login nem bypass RLS.
- `supabase/tests/campo_extra_plano_local.sql` + `scripts/testar-campo-extra-plano-local.sh`: positivo (administrador lista, cria campo texto, cria campo lista com opções, edita com versão esperada), negativo (profissional negado, família negada, sessão revogada negada, tipo inválido rejeitado, lista sem opções rejeitada, texto com opções rejeitada, conflito de versão não altera registro, conflito de idempotência, falha de auditoria não deixa efeito parcial). Passou (exit 0). `pnpm run verificar:rapido` limpo.

**Não implementado nesta rodada, fica para próxima sessão supervisionada:**
- Lista de aprovadores (tabela + RPC admin-only pra Edilaine indicar/remover) e o carimbo de aprovação no objetivo/revisão.
- Integração do valor dos campos extras ao envelope cifrado do objetivo (`api.plano_cuidado_operacao_privada`) — hoje só o catálogo existe, nenhum objetivo grava valor de campo extra ainda.
- Interface web para Edilaine gerenciar o catálogo (criar/editar/desativar campo pela tela) e para o profissional preencher os campos extras no formulário do objetivo.
- **Revisão independente desta adição**: quem implementou (eu, nesta mesma madrugada) não pode aprovar a própria revisão — pendente antes de qualquer ativação ou aplicação remota.

O servidor deve validar entrada e cifrar conteúdo clínico com envelope autenticado e AAD vinculado ao caso, objetivo, versão e campo, conforme fundação aplicável. Banco recebe envelope, não texto clínico; leitura autoriza e audita antes de decifrar. Sem grant direto às tabelas e sem acesso público a chaves; wrappers, atestado e privilégios precisam de revisão e prova, não apenas reutilização nominal da anamnese. Falhas de cifra, atestado ou auditoria devem negar a operação sem fallback em texto claro. A implementação depende dos controles efetivamente disponíveis e não libera rotas antes de S-02.

## Ameaças e evidências provisórias (FR-015/016)

Ativos são conteúdo e histórico clínico, integridade da autoria e versões, credenciais e trilha de auditoria. Fronteiras previstas: navegador para servidor autenticado; servidor para RPC/banco e Vault; executor privilegiado para tabelas privadas. Atacante pode controlar entradas e identificadores ou usar sessão própria, inclusive após revogação; não se presume controle de chaves ou administração do banco. A exposição e operação reais dependem de confirmação antes do relatório final.

| Caminho de abuso | Impacto e prioridade provisória | Mitigação e evidência necessária |
|---|---|---|
| Familiar, sessão revogada ou acesso direto lê/altera objetivo alheio | Alto, dados clínicos e integridade expostos | Revalidar autorização no servidor e banco sob locks; testar anônimo, familiar, inativo, concessão/sessão revogada, acesso direto e caminhos privilegiados, além de colaborador permitido. |
| Troca de envelope entre caso, objetivo ou versão | Alto, conteúdo revelado ou atribuído incorretamente | Cifra autenticada e AAD vinculados aos identificadores e versão; testar adulteração e troca, sem retorno parcial. |
| Revisões concorrentes ou autoria forjada | Alto, perda de histórico ou atribuição falsa | Versão esperada e gravação atômica; ator e data confiáveis; testar concorrência e entrada que tente fornecer metadados. |
| Leitura ou alteração sem evidência, ou vazamento em logs | Alto, perda de rastreabilidade ou exposição clínica | Auditoria transacional mínima e logs sanitizados; testar falha de auditoria, negativa e ausência de conteúdo/segredos. |

A fundação descreve RPC auditada, cifra/AAD, Vault e atestado, mas suas tarefas registram S-02 e provas reais de Auth, Vault, grants e integração pendentes. Anamnese tem operações privadas e testes locais com fixtures; isso não comprova os controles do plano nem o ambiente remoto. A validação de hipóteses materiais, recuperação e matriz final continua pendente; prioridades acima são condicionais e não representam certificação.

## Risks / Trade-offs

- Conteúdo sensível ou versões anteriores expostas: autorização no servidor e banco, cifra aplicável, logs sanitizados e provas diretas positivas e negativas.
- Revisões concorrentes: controle de versão e erro explícito, sem substituir atualização anterior.
- Regras abertas: validar campos, responsáveis e audiência com equipe antes de disponibilizar fluxo. Proposta não atesta segurança nem integração.

## Migration Plan

Preparar migração aditiva local e testes; nenhuma operação remota ocorre sem autorização explícita. Antes de ativar, definir recuperação e reversão que preservem dados e histórico; uma reversão não elimina registros sem procedimento aprovado.

A gravação privada local exige chave idempotente e digest HMAC do comando lógico, atestados pelo servidor confiável. O recibo registra ator, operação e referência à versão, sem conteúdo clínico; repetição revalida autorização e retorna a versão original, inclusive quando identificadores gerados mudarem. Reuso com digest diferente ou paciente distinto gera conflito; gravação, recibo e auditoria compartilham transação. Integração real e concorrência específica ainda exigem prova.
