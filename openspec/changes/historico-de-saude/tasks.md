# Tarefas — histórico de saúde (FR-004)

## 1. Domínio e contrato

- [x] 1.1 Modelar `RegistroSaude` com `origem`, `natureza` e `situacao` separados, mais
  `tipo`, `descricao` e `data`.
  **Evidência:** `packages/contracts/src/saude.ts`; `validarRegistrosSaude` recusa chave
  desconhecida, id repetido, data inexistente (`2026-02-30`), descrição ou origem vazias
  e mais de 200 registros.
  **Prova:** `npx vitest run packages/contracts/test/saude.test.ts` — 6 testes, todos
  passando.
  **Limitação deliberada:** nenhuma regra proíbe `relato_leigo` + `confirmado`; isso
  seria regra clínica nova. Ver `design.md`.
- [x] 1.2 Contrato HTTP isolado, sem tocar o `rotas.ts` compartilhado.
  **Evidência:** `packages/contracts/src/saude-http.ts` (`GET`/`PATCH
  /api/pacientes/:paciente_id/saude`), no mesmo padrão de `plano-http.ts`.
- [x] 1.3 Registrar o AAD da nova tabela.
  **Evidência:** `metadadosAadSaudeSchema` em `packages/contracts/src/rpc.ts`; o ramo de
  `cifra-autenticada.ts` passou a cobrir `cadastro.saude_versao` junto da anamnese,
  porque o formato é idêntico e a `tabela` entra na ligação.

## 2. Banco

- [x] 2.1 Tabela imutável versionada.
  **Evidência:** `supabase/migrations/20261117200000_saude_versoes_privadas.sql` —
  `unique(paciente_id, versao)`, restrição de sequência com auto-FK, CHECK estrito do
  envelope, RLS ligada, `revoke all` de `public/anon/authenticated/service_role` e
  trigger que bloqueia UPDATE e DELETE.
  **Prova:** `sh scripts/testar-saude-local.sh` — saída 0. Cobre RLS presente,
  ausência de privilégio nos quatro papéis, recusa de UPDATE/DELETE, versão duplicada,
  sequência inválida, predecessor ausente e envelope com campo extra.
- [x] 2.2 Operação privada com atestado, trava, idempotência e auditoria obrigatória.
  **Evidência:** `supabase/migrations/20261117210000_saude_operacoes_privadas.sql`, com
  owner dedicado `ffcmapp_saude_owner`.
- [x] 2.3 Grant do wrapper para `authenticated`, com asserções defensivas.
  **Evidência:** `supabase/migrations/20261117220000_grant_saude_teste.sql`
  (`WRAPPER_INESPERADO` / `ACL_INICIAL_INESPERADA`, `SET ROLE` antes do grant).
- [x] 2.4 Provas positivas e negativas de autorização.
  **Prova:** `sh scripts/testar-saude-operacoes-local.sh` — saída 0.
  Positivas: gravação versão 1; leitura devolve a versão corrente; reenvio da mesma
  chave devolve o mesmo registro com `repeticao=true`; auditoria `permitido` gravada.
  Negativas: nenhum acesso de `anon`/`authenticated`/`service_role` antes do grant;
  owner isolado (não vê `nome_cifrado`, não alcança a anamnese, sem membros);
  `anon`/`service_role` continuam sem execute depois do grant; mesma chave com digest
  diferente devolve `conflito_idempotencia`; AAD de outra tabela recusado; sessão
  encerrada, perfil `familia` e concessão revogada devolvem `sem_permissao`; MAC forjado
  recusado com `insufficient_privilege`; identidade Auth sem perfil é auditada por
  `ator_auth_id` sem criar usuário; falha ao gravar auditoria desfaz a gravação inteira.

## 3. Camada HTTP

- [x] 3.1 Composição, entrada, executor e função.
  **Evidência:** `netlify/functions/_shared/{saude-nativa,compor-saude-nativa,`
  `entrada-saude-nativa,executor-saude-nativo}.ts` e `netlify/functions/saude.ts`,
  com teto de 32 KiB no corpo, limite de 15 s e flag `FFCM_SAUDE_ATIVADA` desligada.
  **Prova:** `npx vitest run netlify/functions/_shared/saude-nativa.test.ts` — 9 testes
  passando. Cobre: nenhum conteúdo clínico legível no transporte; AAD correto;
  digest idempotente estável entre tentativas; envelope com AAD de anamnese não abre;
  resposta de outro paciente recusada; `conflito`, `conflito_idempotencia` e
  `sem_permissao` mapeados; gravação sem chave e natureza inválida barradas antes de
  executar; sessão divergente negada antes de executar; sessão revogada durante a
  leitura não entrega conteúdo; queda de sessão após iniciar a gravação vira
  `pendencia_externa`.
- [x] 3.2 Serviço do navegador isolado.
  **Evidência:** `web/servico-saude-http.ts`, no padrão de `servico-plano-http.ts`
  (revalidação de identidade antes e depois, teto de resposta, `redirect: 'error'`).

## 4. Tela

- [x] 4.1 Seção da ficha com origem e situação sempre visíveis.
  **Evidência:** `web/saude.ts` — cada registro é um `fieldset` cuja legenda mostra
  "tipo — natureza — situação", com `data-natureza`/`data-situacao` no elemento; o CSS
  em `web/styles.css` dá contorno próprio ao relato leigo e destaque à hipótese.
  Estados de carregamento, vazio, erro, conflito de versão e salvamento incerto seguem
  o mesmo comportamento já revisado da anamnese.
- [ ] 4.2 Ligar a seção em `secoesDaFicha` de `web/main.ts`.
  **Bloqueio operacional:** o arquivo está sob edição simultânea de outras frentes; a
  coordenação pediu para não editá-lo. O trecho exato foi entregue no resumo final.
- [ ] 4.3 Verificação visual real no navegador e passagem de leitor de tela.
  **Pendente:** depende de 4.2 e da ativação da flag.

## 5. Ativação

- [ ] 5.1 Aplicar as três migrations no projeto de teste e ligar `FFCM_SAUDE_ATIVADA`.
  **Pendente:** exige autorização explícita para operação remota; não executada.
- [ ] 5.2 Revisão independente de dois eixos sobre o diff da fatia.
  **Pendente.**

## 6. FR-020 — plano de crise

- [ ] 6.1 Definir quem é o "profissional habilitado" que aprova o plano de crise.
  **Bloqueio de negócio, não técnico.** Não existe conceito de habilitação no sistema e
  `docs/projeto/roteiro-especificacoes.md:45` ainda lista o item como pendente. As
  opções e a recomendação estão em `design.md`, seção "Bloqueio de negócio: FR-020".
  Nada foi implementado para evitar inventar a regra.
