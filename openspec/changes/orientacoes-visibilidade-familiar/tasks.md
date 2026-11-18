# Tasks

## 1. Implementação (17/11/2026)

- [x] 1.1 Decisão do solicitante registrada verbalmente durante `experiencia-minima-do-mock`:
  "Sim, opção de marcar somente interno ou pública" — mesma pergunta de negócio de plano de
  cuidado (rule #1) e documentos (rule #2), vocabulário `interna`/`publica` reaproveitado de
  `visibilidadeObjetivoSchema` (`packages/contracts/src/plano-cuidado.ts`), não duplicado.
  Confirmado também: quem já registra orientação (qualquer colaborador com concessão vigente)
  marca a visibilidade — sem portão administrador-only (mesma pergunta feita para documentos,
  reaproveitada aqui por serem a mesma classe de decisão).
- [x] 1.2 Migration aditiva `20261124130000_orientacao_visibilidade.sql`: coluna
  `visibilidade text not null default 'interna' check (in ('interna','publica'))` em
  `cadastro.orientacao_versao`. Default preserva o comportamento de quem grava sem informar o
  campo (testes/chamadores existentes).
- [x] 1.3 Migration `20261124140000_orientacao_familia_privada.sql`: `create or replace
  function api.orientacao_operacao_privada` (redefine a função já existente de
  `20261117140000`) com trilha familiar só para `api.ler_orientacoes` — `cadastro.acesso_paciente`
  vigente, `identidade.sessao` método `familia` sem concessão, `amr=password`. Filtro de
  visibilidade aplicado no agregado de saída (`filter (where papel='colaborador' or
  v.visibilidade='publica')`), preservando `apenas_vigentes` como filtro independente. Novas
  policies em `cadastro.acesso_paciente` (select + `_lock` com `using` espelhando a policy de
  select, **não** `using(false)` — mesmo achado real já documentado em
  `plano-cuidado-objetivos/design.md`) e segunda policy PERMISSIVE em `cadastro.paciente`
  (soma por OR à do colaborador, sem tocar nela).
- [x] 1.4 Contratos: `visibilidade: visibilidadeObjetivoSchema` adicionado a `orientacaoSchema`,
  `salvarOrientacaoSchema` e ao schema de registro bruto do banco (`registroSchema`, interno).
  `netlify/functions/_shared/orientacao-nativa.ts`: `visibilidade` roteado pelo `Comando` de
  gravação (opcional na camada interna — testes chamam direto sem passar pelo contrato HTTP,
  que já exige o campo —, default `'interna'` espelhando a coluna), incluído na checagem de
  consistência pós-gravação e no resultado decifrado devolvido à tela.
- [x] 1.5 Interface: `web/orientacoes-local.ts` ganhou seletor "Visibilidade para a família" no
  formulário (registrar/substituir) e parâmetro `ehFamilia` (lista somente leitura, sem
  formulário, para a família). `web/orientacoes.ts` roteia `visibilidade` e o novo parâmetro.
  `web/servico-orientacoes-http.ts`: gate de fluxo corrigido para aceitar
  `modo-acesso==='familiar'` (mesma classe de achado já corrigida em
  `servico-regras-atendimento-http.ts`/`servico-diario-http.ts`/`servico-plano-http.ts`/
  `servico-documentos-http.ts`). `web/main.ts`: seção `'orientacoes'` adicionada à ficha da
  família.
- [x] 1.6 Scripts de teste de integração desatualizados corrigidos nesta mesma passagem (achado
  incidental, não desta fatia especificamente, mas descoberto ao validar): três scripts
  (`testar-plano-cuidado-integrada-local.sh`, `testar-plano-composicao-integrada-local.sh`,
  `testar-plano-http-integrada-local.sh`) paravam a cadeia de migrations em
  `20261108130000_plano_cuidado_paginacao_privada.sql`, sem as três migrations de auditoria
  (`20261112100000`/`122000`/`200000`) já aplicadas desde antes desta sessão — corrigidos para
  aplicar a cadeia completa, incluindo as duas novas desta leva de trabalho
  (`20261111160000_admissao_familiar_privada.sql` e as da própria fatia de plano). O mesmo para
  `testar-orientacao-integrada-local.sh`, que parava em `20261117150000`. Sem essa correção,
  esses três+um scripts testavam uma versão desatualizada das funções — mascarando, não
  provando, o comportamento atual.

## 2. Evidência

- `supabase/tests/orientacao_familia_local.sql` via `scripts/testar-orientacao-familia-local.sh`
  (PostgreSQL descartável): positivo (família com acesso vigente lê só a orientação pública),
  4 negativos (sem `cadastro.acesso_paciente`, tenta gravar, acesso revogado, sessão de equipe
  disfarçada `amr=oauth`) e 1 regressão (colaborador continua lendo as duas, pública e interna,
  sem filtro) — passou (exit 0) de primeira, aplicando direto as lições já registradas em
  plano-cuidado-objetivos (época da reserva, policy `_lock`) e documentos (fixtures `auth.users`/
  `auth.sessions`).
- `scripts/testar-orientacao-integrada-local.sh` (corrigido, ver 1.6): passou (exit 0) — prova
  o handler TypeScript real, cifra e atestado reais contra PostgreSQL descartável, Auth/Vault
  fictícios.
- `pnpm run test:web` (801/801, excluindo um timeout isolado e não relacionado em
  `web/demonstracao.test.ts`, confirmado flake de contenção de recursos ao reexecutar sozinho —
  31/31 — não regressão desta fatia) e `pnpm run test:proxy` (397 passed/15 skipped, os skipped
  são os `*-postgres-local.test.ts` que exigem Postgres descartável e não rodam via vitest) sem
  regressão. `pnpm --filter @ffcmapp/contratos test` (133/133). `pnpm run verificar:rapido`
  limpo.
- **Sem ativação**: nenhuma flag de orientações foi tocada, nenhuma migration aplicada
  remotamente, nenhum deploy.
- **Revisão independente desta adição ainda não feita** — quem implementou não aprova a própria
  revisão, mesma regra do resto do trabalho desta sessão.
