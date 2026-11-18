# Tasks

## 1. Contratos, Vault e servidor

- [x] 1.1 Implementar catálogo/saída sem valor e RPC atestada admin-only com versões; provar cadastro, substituição, replay e negativas SQL/RLS/direto com dados fictícios.
- [x] 1.2 Implementar rota BFF limitada e serviço HTTP; provar origem, perfis, sessão, corpo e saída sem segredo nos testes afetados.

## 2. Interface e integração

- [x] 2.1 Entregar montarSegredosIntegracoes e serviço HTTP no padrão existente; provar limpeza do campo, estados e metadados no teste da tela.
- [ ] 2.2 Coordenação fiar navegação administrativa e conferir visual desktop/mobile sem credenciais reais.
- [ ] 2.3 Executar verificar:rapido e revisão independente padrões/spec; registrar evidência e limitações.
- [ ] 2.4 Coordenação aplicar migration/ativar e executar autorização positiva/negativa e roteiro publicado; sem prova real não marcar ativada.

## Evidências e suposições

Planejamento concluído antes implementação. Suposição: presença no Vault não comprova validade externa. Solicitante ausente, conforme briefing; nenhuma credencial real será manuseada.

18/11/2026 — implementação local entregue:

- OpenSpec `validate cadastro-segredos-integracoes --strict`: passou antes implementação.
- `sh scripts/testar-segredos-integracoes-local.sh`: passou. PostgreSQL descartável executa migration e prova cadastro, duas versões, preservação anterior, nome canônico, replay, conflito, Profissional/Família, revogação, ausência valor na resposta/auditoria e negação de acesso direto/ACL. O Vault deste teste é adapter; não comprova cifra/integração da extensão real.
- `vitest run netlify/functions/_shared/segredos-integracoes-nativo.test.ts --reporter=minimal --silent=passed-only`: 5 testes passaram (nega perfis no servidor antes Vault, CSRF, Administrador, saída strict sem valor). Adapter auth é simulado; Auth real não foi exercitado nesta frente.
- `vitest run web/segredos-integracoes.test.ts --reporter=minimal --silent=passed-only`: 1 teste passou (envio, limpeza imediata, metadados e desmontagem).
- `verificar:rapido`: lint/typecheck passaram antes inclusão de testes; execução final typecheck passou, único erro lint observado em arquivo concorrente `web/habilitacao-plano-crise.ts:79`. Gate consolidado fica com coordenação.
- Task 1.2: complemento `entrada-segredos-integracoes-nativa.test.ts`, 3 testes passando: sem sessão, tipo de conteúdo inválido, corpo excessivo e cancelamento por prazo de 15 segundos, sem chamar composição. Provas da operação cobrem perfis, origem e saída estrita. Não equivalem a Auth/Vault reais.
- Revisão independente de padrões e aderência à especificação sobre base `fa1af933` e arquivos novos: nenhum achado alto confirmado nesta superfície. Fiação em `web/main.ts`: Administração > Credenciais das integrações (`#administracao/integracoes`). Conferência visual e ativação continuam pendentes.
- Sem operação remota, credencial real, commit, push ou deploy. Revisão independente, conferência visual desktop/mobile, Vault real, navegação publicada e gate de ativação continuam pendentes.

Como testar após ativação: Administrador abre Administração > Credenciais das integrações, escolhe entrada e cadastra valor. Confira somente presença/versão/autoria/data; substitua e confirme incremento. Profissional/Família não podem listar/gravar, inclusive por HTTP e RPC direta. Segredos esperados: `ffcmapp.integracao.google_drive` (JSON conta serviço), `ffcmapp.integracao.openrouter` (chave API), `ffcmapp.integracao.google_calendar_client_id` e `ffcmapp.integracao.google_calendar_client_secret` (OAuth Calendar). Os valores serão cadastrados exclusivamente pelo solicitante. Rota segue interruptor operacional existente `FFCM_CONFIGURACAO_SISTEMA_ATIVO`.
