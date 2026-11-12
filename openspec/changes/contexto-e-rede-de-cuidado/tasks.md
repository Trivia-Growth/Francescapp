# Tasks

## 1. Armazenamento privado

- [x] 1.1 Criar `cadastro.contexto_cuidado_versao` e `cadastro.rede_cuidado_versao` versionadas, imutáveis e cifradas, sem grant de aplicação. Evidência: `20261117300000_contexto_cuidado_versoes_privadas.sql` e `20261117330000_rede_cuidado_versoes_privadas.sql`; `scripts/testar-contexto-rede-cuidado-local.sh` confirma RLS ligada, zero privilégio para `anon`/`authenticated`/`service_role` e que `update`/`delete` disparam o gatilho de imutabilidade nas duas tabelas.

## 2. Operações privadas

- [x] 2.1 Criar as operações com owner dedicado, autorização revalidada sob trava, idempotência por chave e auditoria obrigatória. Evidência: `20261117310000_contexto_cuidado_operacoes_privadas.sql` e `20261117340000_rede_cuidado_operacoes_privadas.sql`. O teste local prova: leitura vazia devolve nulo; gravação cria v1 e encadeia v2; versão defasada devolve `conflito`; repetição com mesma chave e mesmo digest não regrava e devolve `repeticao`; mesma chave com digest diferente devolve `conflito_idempotencia`; AAD apontando para outra tabela é recusado com `22023` sem gravar; atestado emitido para outra operação (inclusive `api.ler_anamnese`) é recusado.
- [x] 2.2 Provar as negativas de autorização e a auditoria dos dois caminhos. Evidência: perfil `familia` recebe `sem_permissao` com auditoria por `ator_usuario_id`; identidade Auth sem perfil recebe `sem_permissao` com auditoria por `ator_auth_id` e nenhuma linha criada em `public.usuario`. Owners não se alcançam entre si nem leem `cadastro.paciente.nome_cifrado`.
- [x] 2.3 Grant de execução só do wrapper, com guardas. Evidência: `20261117350000_grant_contexto_rede_teste.sql` recusa wrapper com owner, flags ou ACL inesperados; depois do grant, `authenticated` executa apenas `api.contexto_cuidado_privado` e `api.rede_cuidado_privado`, nunca as operações internas, e `anon`/`service_role` seguem sem acesso.

## 3. Contratos e fronteira HTTP

- [x] 3.1 Contratos de domínio com as seis categorias de FR-005 e os sete vínculos de FR-002. Evidência: `packages/contracts/src/contexto-cuidado.ts` e `rede-cuidado.ts`; AAD das duas tabelas registrada em `rpc.ts` e em `cifra-autenticada.ts`.
- [x] 3.2 Rotas desligadas por flag (`FFCM_CONTEXTO_CUIDADO_ATIVADO`, `FFCM_REDE_CUIDADO_ATIVADA`) e composição compartilhada. Evidência: `netlify/functions/contexto-cuidado.ts`, `rede-cuidado.ts` e `_shared/documento-paciente-nativo.ts`, `compor-documento-paciente-nativo.ts`, `entrada-documento-paciente-nativa.ts`.
- [x] 3.3 Teste de integração HTTP. Evidência: `netlify/functions/_shared/entrada-documento-paciente-integracao.test.ts`, 6 testes passando. Cobre: texto clínico e nome de pessoa não saem em claro no transporte; AAD e operação atestada corretas por feature; categoria fora de FR-005 e vínculo fora de FR-002 recusados com 422 sem chamar o banco; `conflito` do banco vira `conflito_versao` com 409; corpo que não termina é cancelado em 15 s sem chamar a composição.

## 4. Telas

- [x] 4.1 Telas montáveis, com estados de carregamento, vazio, erro, conflito e salvamento incerto. Evidência: `web/contexto-cuidado.ts` (um bloco por categoria de FR-005, com texto de ajuda e seleção de objetivos do plano) e `web/rede-cuidado.ts` (pessoa com nome, contato, observação e os sete vínculos em caixas de seleção, com aviso de que vínculo não dá acesso), sobre `web/editor-documento-paciente.ts` e `web/servico-documento-paciente-http.ts`. `web/contexto-rede-cuidado.test.ts` (3 testes) confirma as seis categorias de FR-005, os sete vínculos de FR-002 com acúmulo na mesma pessoa, rótulo associado a cada campo, recusa de elemento em branco, de pessoa sem nome e de pessoa sem vínculo, aviso explícito de que vínculo não dá acesso, ausência de campo de permissão no que é enviado, e preservação do rascunho após conflito de versão.
- [ ] 4.2 Ligar as duas abas em `secoesDaFicha` de `web/main.ts`. Pendente por decisão de coordenação: o arquivo está sendo alterado por outras frentes em paralelo, e o trecho exato de ligação foi entregue no relatório da frente em vez de aplicado aqui.

## 5. Verificação

- [x] 5.1 `pnpm run typecheck` limpo para os arquivos desta frente. Observação: a execução conjunta acusa `netlify/functions/_shared/executor-orientacao-nativo.ts(1,45): error TS2307` de outra frente em andamento, não desta.
- [x] 5.2 Lint limpo para os arquivos desta frente. Observação: `pnpm run lint` aponta formatação pendente em `encaminhamento-postgres-local.test.ts` e `orientacao-nativa.ts`, de outras frentes. O comando falhou várias vezes com `Linter process terminated abnormally (possibly out of memory)` enquanto três frentes rodavam em paralelo; só completou após repetição.

## Limites

Nenhuma migration foi aplicada em ambiente remoto e nenhuma flag foi ligada. As rotas devolvem 503 enquanto as flags estiverem desligadas. Áudio, anexo e relatório agregado por vínculo continuam fora deste recorte.

## Revisão independente (11/11/2026)

Revisor de contexto limpo, dois eixos. Rodou o teste SQL local (exit 0), o teste de integração HTTP (6/6) e `tsc --noEmit` filtrado nesta fatia (zero erro).

**Eixo padrões/segurança: nenhum achado alto ou médio.** Conferidos contra os canônicos: autorização revalidada sob trava igual à da anamnese; auditoria presente nos cinco caminhos de retorno mais o `PZ001` do wrapper, com a negativa de Auth sem perfil provada; idempotência serializada por `for update` no paciente, com `on conflict do nothing` e releitura no ramo perdedor; versionamento com unicidade, check de sequência, FK auto-referente e gatilho; grants por coluna, `_lock` com `with check (false)`, restritiva de ator exclusivo, `operacao.requisicao` isolada por `operacao`, `search_path=''` e `row_security=on`; AAD do TypeScript idêntica à exigida no SQL, com a tabela dentro da AAD canônica impedindo trocar envelope entre features.

**Eixo spec, FR-002: nenhum achado.** Sete vínculos exatos, acúmulo suportado, nenhuma estrutura com campo de permissão.

**Eixo spec, FR-005: um achado alto, corrigido.** `web/contexto-cuidado.ts` apagava silenciosamente o vínculo com objetivo ao salvar em dois casos: tela montada sem a lista de objetivos (o padrão enquanto a ligação em `main.ts` está pendente) e objetivo já vinculado que não estivesse na lista recebida (arquivado, de outra página, lista desatualizada). Como o documento é versionado e imutável, isso gravaria uma versão nova com dado clínico a menos, sem aviso. Corrigido na raiz: a linha guarda os vínculos que não têm caixa, `coletar()` os une aos marcados, e a tela avisa em texto que eles continuam guardados. Regressão coberta por `web/contexto-rede-cuidado.test.ts`, caso "preserva vínculo com objetivo que não tem caixa na tela".

**Acessibilidade: um achado médio, corrigido.** Botões de remoção repetiam o mesmo texto em toda a lista, deixando uma ação destrutiva e sem confirmação indistinguível em leitor de tela. Agora cada botão recebe `aria-label` com o alvo (categoria e descrição, ou nome da pessoa), atualizado no `input` do campo correspondente.

**Baixos, todos corrigidos.** A rota passou a validar a saída pelo contrato (`documentoContextoCuidadoSchema` / `documentoRedeCuidadoSchema`) antes de responder, como faz a anamnese. Os dois schemas de resposta privada duplicados viraram um só, `respostaDocumentoPacientePrivadaSchema` em `packages/contracts/src/documento-paciente.ts`, eliminando a cópia morta que podia divergir. Os dois casts que anulavam checagem de tipo saíram: `rpc` passou a ser união literal dos dois nomes e a composição é chamada com o genérico, restando um único ponto de conversão, comentado, onde a RPC ainda não existe nos tipos gerados do Supabase.

Verificação após as correções: teste SQL local exit 0; `web/contexto-rede-cuidado.test.ts` e `entrada-documento-paciente-integracao.test.ts` com 10 testes passando; `pnpm run typecheck` e `pnpm run lint` limpos no repositório inteiro.
