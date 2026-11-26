# Repasse de continuidade — 13/11/2026

Estado do FFCMApp ao fim da sessão de 12–13/11/2026, para quem retomar o trabalho.
Não substitui as fontes de verdade: `AGENTS.md`, `openspec/specs/`, `openspec/changes/`,
`docs/projeto/`. Lê-se junto com elas, não no lugar delas.

## Onde o código está

- Branch de trabalho: `feat/ficha-cadastro-situacao`, **3 commits à frente da main**.
- **PR #14** aberto, CI verde, contendo os três: conserto da tela de Configuração,
  seções da anamnese + formato da exportação, e a home do profissional.
- O solicitante pediu para **não levar à main** até acrescentar mais escopo.
- `main` está em produção em https://ffcmapp.netlify.app e funciona.
- PRs #1 e #6 estão abertos e velhos; conferir se ainda fazem sentido.

## O que está no ar e provado

Leitura exercitada em produção, logado como administrador: cadastro, saúde, visão do
caso, plano de cuidado, plano de crise, tarefas, encaminhamentos, orientações, carteira
com filtros e sinal operacional, pendências, auditoria (25 registros reais, filtro por
caso), solicitações do titular, regras de funcionamento, diário, exportação.

**Nenhuma escrita foi exercitada em produção.** Ninguém publicou evolução, aprovou plano
de crise nem criou tarefa no ambiente real. É metade do requisito, e a metade arriscada.

## Pendente de desenvolver, por impacto

1. **Agenda — a migration nunca foi promovida.**
   `supabase/drafts/20261115100000_agenda_google_conexao.sql` (50 KB) está em `drafts/`,
   não em `migrations/`. Existe composer, existem rotas, existem telas, e **nenhuma
   tabela no banco**. Cinco FR Iniciais presos (FR-023, FR-024, FR-025, FR-049, FR-050).
   Maior ganho por esforço do projeto.
2. **FR-011** — anexar imagem ou documento ao registro do diário. O contrato do diário
   não tem campo de anexo; documentos existem como fatia separada, sem ligação.
3. **FR-038** — consentimento e versão de termos. Não existe tabela.
4. **FR-037** — substituição temporária da case manager não existe.
5. **Linha do tempo** — a tela ficou em "Carregando a linha do tempo…" no último sweep.
   Não foi determinado se é defeito ou latência da agregação de 12 fontes.
6. **FR-042** — prova de restauração. Adiado por decisão do solicitante de 13/11/2026,
   porque os dados são fictícios. **Precisa mudar antes do primeiro dado real**, não
   depois: é o único item cuja falha não tem conserto.

## Bloqueado por ação do solicitante

- Segredo `ffcmapp.integracao.google_drive` no Supabase Vault → destrava FR-029/030/031.
- Segredo `ffcmapp.integracao.openrouter` no Vault → destrava FR-010.
  A chave que ele usou passou por um transcript de chat e **deve ser revogada**.
- Segunda conta Google Workspace → destrava S-02 e a prova de FR-051 a FR-054.
- Decidir se os valores `entregue` e `conferida` saem do contrato da exportação.

## Dívida de qualidade

- **Revisão independente de dois eixos não foi feita em nenhuma fatia desta leva**,
  incluindo linha do tempo e exportação, que foram ligadas em produção mesmo com o
  código exigindo essa revisão. `AGENTS.md` a exige; está em aberto conscientemente.
- Telas de rotina/recursos e rede de cuidado não reconferidas após o conserto do
  processo frio.
- Dez migrations `grant_*_teste.sql` seguem sem teste que as exercite (três foram
  fechadas em 13/11).
- A home não tem prova em navegador real.

## Armadilhas que custaram tempo nesta sessão

- **`alter function ... owner to` exige CREATE no schema para o NOVO dono.** Localmente o
  migrador costuma ser dono do schema e mascara a falta; no projeto remoto recusa com
  42501. Padrão de conserto em `20261110130000_carteira_tecnica_nativa.sql`: conceder
  CREATE só pelo tempo da troca e revogar depois.
- **Ciclo de módulos entre `identidade.ts` e `rpc.ts`.** O TypeScript aceita; em execução
  um lado enxerga `undefined`. Derrubou 17 arquivos de teste. Por isso o envelope de
  cifra mora em `comum.ts`, que é a base que ninguém importa de volta.
- **Interruptor de serviço mora no banco**, em `identidade.configuracao_sistema`, não na
  variável de ambiente — a variável é só padrão de emergência. Três rotas ficam de fora
  de propósito e têm comentário dizendo para não "corrigir" isso: `auth.ts` e
  `configuracao-sistema.ts` (senão um valor errado tranca todo mundo para fora) e
  `vinculos-profissionais.ts` (não usa o pool).
- **Leitura de configuração em processo frio falhava** e derrubava rotas; corrigido com
  retentativa só no processo frio.
- **`parse(resultado.dados)` dentro de `try` com `catch { 503 }` existe em 26 pontos.**
  Qualquer divergência entre contrato e banco vira serviço indisponível mudo. Todos
  passam a registrar; um defeito real assim custou horas de investigação.
- **Log de função do Netlify não existe na API REST.** Só pela CLI:
  `npx netlify-cli@latest logs --source functions --function <nome> --since 10m --filter ffcmapp --auth <token>`.
  O `--filter ffcmapp` é obrigatório (monorepo), senão abre menu interativo e trava.
- **Plano Free do Netlify não constrói repositório privado de organização.** Por isso
  `Trivia-Growth/Francescapp` foi tornado **público** em 13/11/2026, por decisão do
  solicitante, ciente de que 39 arquivos nomeiam pessoas reais e o modelo de ameaças vai
  junto.
- O Supabase **não tem backup configurado** ("No backups" no painel).

## Como trabalhar aqui

- `pnpm run verificar:rapido` durante o desenvolvimento (lint + typecheck).
- `pnpm run verificar:ativacao` antes de fechar uma fatia. **Ele pegou dois defeitos
  reais nesta sessão que nenhuma outra verificação pegou.** Não pule.
- Testes SQL em PostgreSQL descartável: `supabase/tests/`, banco obrigatoriamente
  `ffcm_cadeia_local`, porta livre entre 55432 e 55448.
- Migrations novas em faixa própria, para não colidir com trabalho paralelo.
- **Não declare conclusão por checkbox.** `AGENTS.md` é explícito. Verifique que o teste
  novo *pega* o defeito — removendo a correção, ele precisa falhar. Teste que só passa
  não prova nada.
- Operação remota (deploy, push, merge, migration remota) exige autorização explícita do
  solicitante, caso a caso.
