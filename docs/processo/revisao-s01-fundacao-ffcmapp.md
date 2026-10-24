# Revisão S-01 — Fundação FFCMApp

Data: 16/10/2026. Objeto: pacote local `openspec/changes/fundar-identidade-e-seguranca-backend/`, incluindo arquivos não rastreados. Referência Git: `d5a551bb08b300c9500fed9c77a116e18568bac4`; os artefatos atuais foram lidos diretamente, pois ainda não estão commitados. Revisão de planejamento, sem implementação, migrações ou operações remotas.

## Decisão

**Estado atual: S-01 aprovado tecnicamente em 17/10/2026**, após contratos corrigidos, revisão independente e execução no Node 22. Libera autoria paralela conforme os limites de `tasks.md`. As tarefas 1.1, 1.2.1 e 1.2.2 estão concluídas; 22 tarefas permanecem pendentes.

Os achados abaixo preservam a revisão original de 16/10/2026 e suas correções.
A atualização de 17/10/2026 ao final registra a evidência do fechamento.

## Standards

### S01-01 — Alta prioridade: contratos compartilhados ainda não existem

Evidência: `tasks.md:22-24` exige contratos definidos antes das três frentes; `tasks.md:45-46` mantém pendentes os schemas HTTP, assinaturas RPC/adapters, estados e envelope criptográfico. A inspeção local não encontrou `packages/contracts/`. `design.md:115-128` lista rotas e responsabilidades, mas não define seus corpos completos, retornos, nomes/argumentos das RPCs, transições e tipos compartilhados.

Impacto: os executores teriam de inventar interfaces simultaneamente, contrariando a exigência de contratos explícitos de AGENTS.md e o próprio checkpoint. Antes da liberação, completar a preparação 1.1 e produzir 1.2.1/1.2.2 em sequência, incluindo DTO básico/administrativo, opcionais versus null em PATCH, cursores, versões, idempotência e contratos internos. Conferir esses artefatos em S-01.

### S01-02 — Alta prioridade: fronteira entre cifra e RPC precisa de contrato

Evidência: `design.md:82-86` descreve RPCs com JWT do solicitante, retorno autorizado auditado na transação e operações internas service-only; `design.md:103-107` coloca a cifra e a decifra no servidor, com chaves fora do alcance do usuário. Falta definir o objeto interno que atravessa essa fronteira e onde ocorre a transformação para o DTO HTTP.

Impacto: banco e servidor podem implementar retornos incompatíveis ou presumir que a outra camada verifica a validade dos campos antes de cifrá-los. Definir entradas cifradas, envelopes retornados, projeção/descriptografia autorizada, geração dos IDs usados em AAD e comportamento de falha. Explicitar como uma chamada direta às RPCs não contorna validação/integridade do fluxo; não resolver com service role genérica. Acrescentar teste de consumidor e cenário direto correspondente.

## Spec

### S01-03 — Alta prioridade: estado da concessão e perfil precisam de transições conjuntas

Evidência: `design.md:27-29` dá autoridade ao perfil/ativo de usuário e mantém perfil/método na concessão; `design.md:48` exige concessão vigente em toda operação; `design.md:60-64` armazena os dois estados, mas não define seu vínculo transacional para troca de perfil, revogação e nova concessão. O cenário de mudança de perfil em `specs/sigilo-e-governanca/spec.md` exige perda imediata do privilégio anterior.

Impacto: falta uma especificação suficiente para provar que novo login, corrida de admissão ou reativação não reutilizam o perfil antigo ou readmitem sessão revogada. Documentar a fonte de perfil após a primeira vinculação, identidade/versão da concessão associada à sessão e a transação de cada mudança. Definir o resultado de revogar e conceder novamente, mantendo os tombstones; testar login concorrente com a revogação.

### S01-04 — Prioridade média: pré-concessão sem usuário não tem operação de revogação definida

Evidência: `tasks.md:71` prevê atualização/revogação de concessões, mas `design.md:122-123` oferece somente GET/POST de concessões e PATCH do usuário pelo UUID. Uma concessão ainda não usada pode não ter usuário vinculado.

Impacto: o administrador pode precisar retirar uma concessão antes do primeiro login e não ter contrato para isso. Definir operação administrativa pelo ID da concessão, com versão, idempotência e auditoria, incluindo a disputa entre primeiro login e revogação. Isso concretiza a revogação já prevista no escopo.

## Coerência confirmada e evidências

A matriz D-07 respeita Admin com carteira completa, demais perfis com vínculo por paciente e separação entre relação pessoal e acesso. Cadastro somente com nome, opcionais e homônimos independentes estão coerentes. Auditoria transacional, ausência de privilégios em metadata editável e revogação local com JWT ainda válido estão corretamente previstos. São controles planejados, não evidência de implementação segura.

`openspec validate fundar-identidade-e-seguranca-backend --strict --no-interactive` passou. Isso verifica a estrutura do pacote; não substitui os contratos e as provas de autorização. Nenhum teste de aplicação, SQL, autenticação externa ou integração foi executado nesta revisão.

Correção editorial adicional: `design.md:144` diz que somente D-05 tem tarefas executáveis, mas o checklist inclui identidade, sessão, cifra e APIs de D-02 a D-10. Harmonizar essa frase ao revisar os artefatos.

Os ajustes acima devem anteceder a aprovação S-01 das interfaces compartilhadas.

## Pareceres independentes dos agentes

Os dois eixos abaixo preservam seus achados separadamente. São revisões dos artefatos de planejamento, sem implementação ou operações remotas.

### Standards — 3 achados

1. `tasks.md:22-25,34,45-46`: S-01 exige contratos 1.2, ainda pendentes e sem artefatos tipados. Antes de despachar, produzir tipos e mapeamento rota → handler → RPC → papel → erros → transação. É uma violação da pré-condição de execução paralela, não uma exigência de implementar todo o backend antes da revisão.
2. `design.md:84,103-107` e `tasks.md:14-16`: local da cifra, autoridade de leitura e retorno protegido não têm interfaces explícitas. Definir runtime/dono das chaves, envelope, entradas/saídas internas e ordem de autorização, decifra, auditoria e projeção HTTP, incluindo o comportamento em falha.
3. `design.md:27,29,48,60-61`: usuário e concessão armazenam perfil/estado sem transições conjuntas definidas. Fixar a fonte vigente, vinculação inicial, versões e transações para alterações/revogação, evitando divergência entre as duas representações.

Principal impedimento deste eixo: falta o contrato compartilhado que a execução paralela deve consumir. Não foram reportados smells de implementação: não há código de backend nesta revisão.

### Spec — 4 achados

1. `design.md:111-132`, `tasks.md:34,45`: lista de rotas/envelope não substitui schemas de request/response, campos/tipos/limites, DTO por perfil, cursores, versões e chave idempotente. Produzir esses artefatos para avaliar a aderência concreta.
2. `design.md:78-86`, `tasks.md:46`: faltam nomes/assinaturas SQL, argumentos/retornos, executores, transações e mapeamento de erros. Cada operação precisa estar ligada à RPC/adapters correspondentes antes de banco e handlers serem escritos em paralelo.
3. `design.md:43-52,64,117-121`, `tasks.md:62-64`: invariantes de sessão e tombstone estão descritos, mas faltam transições, resultados e resolução de disputa para desafio, admissão, renovação, revogação e logout externo pendente. A tabela de transições deve fixar o comportamento observável e a atomicidade necessária; não pressupõe que cada etapa exija uma coluna/estado persistido novo.
4. `design.md:29,122-123`, `tasks.md:71`: falta operação para revogar a pré-concessão ainda sem UUID vinculado. Definir rota/RPC com versão, motivo, idempotência, auditoria e efeito sobre admissão concorrente.

Principal impedimento deste eixo: DTOs, RPCs e transições exigidos pelo próprio pacote ainda precisam ser concretizados. Não foi identificado escopo funcional adicional material.

## Atualização — 17/10/2026

Escopo: pacote de contratos e testes, configurações locais, manifestos/lock,
validador de configuração e documentação da fatia. Base Git permanece
`d5a551bb08b300c9500fed9c77a116e18568bac4`, com inclusão dos arquivos novos
locais. Mudanças históricas de marca, proposta e arquivo do mock não compõem
esta revisão. Nenhuma operação de produto remota foi executada.

### Standards

A revisão independente encontrou duas violações materiais no estado inicial
da implementação: perda de parâmetros de rota/idempotência ao copiar DTO HTTP
para RPC; e uso de texto claro em persistência/retornos internos onde D-08
exigia envelopes cifrados. Também observou associação frágil por índices
numéricos. Os contratos internos foram refeitos por operação e chave nominal.

### Spec

A revisão independente confirmou os dois problemas acima e acrescentou
atestado sem vínculo explícito a usuário/sessão e ausência de envelope de
negativa esperada. No HTTP, corrigiram-se mensagem de erro livre que podia
ecoar segredo e telefone composto somente por pontuação. O aceite 1.2.1 foi
revisto e aprovado no nível contratual após essas correções.

### Evidência no runtime-alvo

Node **22.23.3** foi executado diretamente em
`/home/lucas/.local/bin/node`, evitando o wrapper que encaminhava comandos ao
runner Node 24. Comandos reproduzidos:

```bash
/home/lucas/.local/bin/node node_modules/typescript/bin/tsc --project packages/contracts/tsconfig.json
/home/lucas/.local/bin/node node_modules/vitest/vitest.mjs run --root packages/contracts
/home/lucas/.local/bin/node scripts/validar-configuracao-local.mjs
```

O primeiro estado passou 17 testes, typecheck, lint e configuração no Node 22.
Após as correções adicionais HTTP, seus 13 testes passaram novamente nesse
runtime. A revisão final dos contratos internos e a suíte completa são
registradas abaixo ao fechar o checkpoint. Esses testes não comprovam
RLS/Vault, JWT criptográfico, Google, transações ou integração de produto;
tais provas seguem nas tarefas 2.x a 5.x.

### Resultado final de execução

Em 17/10/2026: **61/61 testes de contratos**, typecheck, interpretação e
validação de configuração e Biome passaram no Node 22.23.3 local. OpenSpec
estrito e `git diff --check` passaram. Os oito testes de preservação/isolamento
e os verificadores de materiais também passaram. O formatter foi aplicado
mecanicamente aos quatro scripts da preparação ao ativar o gate; nenhuma
alteração funcional nesses scripts foi necessária.

O último bloqueio de idempotência foi corrigido: `digest_entrada` protege o
payload interno completo desta tentativa e `digest_idempotencia` é o HMAC
estável do comando lógico validado, protegido também pelo atestado. O teste
de duas tentativas com requests/envelopes distintos comprova o contrato,
não a futura execução criptográfica ou concorrente no banco.

O eixo Spec aprovou independentemente 1.2.1/1.2.2 após conferir o diff corrigido.
O fechamento Standards do diff de RPC é feito por revisor distinto de seu
autor, preservando a independência exigida no projeto.

### Fechamento

Standards: **0 bloqueios remanescentes** na revisão independente do diff de
RPC corrigido; parâmetros/contexto, envelopes, atestado, resultados e digests
conferidos. Spec: **0 bloqueios remanescentes**, com aceite explícito de
1.2.1/1.2.2. Os pareceres são limitados a contratos e seus consumidores de
teste, sem declarar mecanismos de segurança de produção implementados.

Com a instrução do solicitante para concluir essas verificações e registrar
a aprovação, a coordenação encerra S-01. Não houve troca automática de modelo.
Os checkpoints S-02 e S-03 continuam obrigatórios antes de integração protegida
e conclusão da fundação, respectivamente. Nenhum deploy, push, migração ou
bootstrap remoto foi realizado ou autorizado por este fechamento.
