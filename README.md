# FFCMApp

Sistema de coordenação do cuidado da Francescato. A fundação parcial de contratos, configuração, cifra, sessão e migração está versionada; a aplicação conectada e suas integrações ainda não foram implementadas.

Nome confirmado em 15/10/2026: **FFCMApp**. [Identidade visual e imagens recebidas](docs/projeto/identidade-visual.md). O repositório e os materiais históricos ainda usam o nome anterior Francescapp; esta decisão não altera endereços ou integrações.

## Desenvolvimento com IA

O processo ativo é **OpenSpec**, desde 14/10/2026, com diretrizes em [AGENTS.md](AGENTS.md). O Spec Kit foi preservado apenas como histórico.

- [Requisitos por capacidade](openspec/specs)
- [Roteiro das especificações de desenvolvimento](docs/projeto/roteiro-especificacoes.md) e [primeiro pacote: preparação da base](openspec/changes/preparar-base-ffcmapp/proposal.md).
- [Fundação do backend: proposta](openspec/changes/fundar-identidade-e-seguranca-backend/proposal.md), [banco, APIs e integrações](openspec/changes/fundar-identidade-e-seguranca-backend/design.md) e [tarefas de implementação](openspec/changes/fundar-identidade-e-seguranca-backend/tasks.md). Pacote parcialmente implementado, com evidências e pendências registradas nas tarefas.
- [Contexto e decisões pendentes](docs/projeto/fundacao.md)
- [Jornadas, metas e regras de negócio](docs/projeto/contexto-negocio.md)
- [Referência de código Atendimento](docs/projeto/referencia-atendimento.md)
- [Registro da migração e rastreabilidade](docs/processo/migracao-openspec.md)
- [Produto](PRODUCT.md) e [contexto visual](DESIGN.md)
- [Especificações de features e regras de negócio para João](docs/projeto/especificacoes-para-joao.md) e PDF correspondente em `output/pdf/especificacoes-francescapp-joao.pdf` (versão de 14/10/2026, anterior ao novo nome e aos materiais de marca).

## Fluxo

## Prévia local para feedback

Para abrir a prévia neste computador, execute na raiz do projeto:

```sh
node scripts/local-feedback-start.mjs
```

Informe uma senha local de pelo menos 12 caracteres quando o terminal pedir e abra `http://localhost:5173/demonstracao.html`. Mantenha o terminal aberto durante o uso. O acesso funciona apenas neste computador; cadastros, anamneses e tarefas fictícias ficam salvos em `~/Library/Application Support/FFCMApp Feedback`.

Use somente dados fictícios. Essa prévia não conecta o Supabase e não é um ambiente para informações reais ou clínicas. O login local não substitui as permissões do aplicativo final.

## Base local de desenvolvimento

Pré-requisitos desta preparação: Node 22.12 ou superior na série 22 e pnpm 9.15.9. Na raiz do repositório, instale somente o que está congelado no lockfile e execute a verificação desta base:

```sh
pnpm install --frozen-lockfile
pnpm run verificar:base
```

`verificar:base` executa os testes de preservação e isolamento em diretórios temporários, confere os materiais arquivados, os links e a migração de requisitos, além do lint dos verificadores próprios. Ele não inicia o mock, não cria um frontend, não conecta a Supabase/Google/OpenRouter e não é uma prova de autorização ou integração.

Para a fundação já versionada, instale também [Deno](https://docs.deno.com/runtime/getting_started/installation/). A versão testada neste notebook é 2.9.5; o uso em outro runtime, inclusive Supabase Edge, ainda requer validação. Execute:

```sh
pnpm run verificar:fundacao
```

Esse gate executa lint, typecheck TypeScript e Deno, testes, build web e validação de configuração sem acessar Supabase ou outros serviços da aplicação. O Deno pode baixar dependências npm fixadas quando elas não estiverem em cache. Durante a pausa de Docker/Supabase local, o gate não executa migrações, RLS, grants ou integração HTTP→banco; essas provas permanecem pendentes para ambiente Supabase isolado, explicitamente confirmado e com dados fictícios.

O workspace reserva `apps/*` e `packages/*` para as próximas fatias, mas não cria pacotes vazios. React/Vite, TypeScript, camadas de domínio, banco, funções e seus respectivos gates entram somente com a primeira fatia de código aprovada.

1. Explorar pendências com `openspec-explore`.
2. Propor uma mudança com `openspec-propose`: proposta, specs, decisões técnicas e tarefas, sem implementar na mesma etapa.
3. Revisar com o solicitante; implementar com `openspec-apply-change` após autorização.
4. Validar critérios de aceite, testes afetados e gates proporcionais ao risco; registrar evidências.
5. Revisar deltas com `openspec-update-change`; sincronizar/arquivar quando solicitado e validado.

Codex usa skills; Claude usa os comandos `opsx` equivalentes. São seis fluxos: explore, propose, update, apply, sync e archive. Não é necessário escolher ou trocar um modelo automaticamente. Novas skills ficam disponíveis no próximo turno; se a interface não atualizar, reabra a sessão.

```sh
pnpm exec openspec list --json
pnpm exec openspec validate --all --strict --no-interactive
```

Validação do OpenSpec verifica artefatos, não comprova que o produto existe ou que seus testes passaram.

## Mockup e proposta

- [Demonstração arquivada — consulta, não comando ativo](docs/legacy/mockup/README.md)
- [Proposta HTML](output/proposta-edilaine.html)
- PDFs em `output/pdf/`.

Não usar dados reais na demonstração. Não provisionar contas, executar migrações remotas ou publicar sem autorização.
