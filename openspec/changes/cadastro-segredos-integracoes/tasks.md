# Tasks

**Retomada em 19/11/2026 após “Siga”:** runner SQL de segredos reexecutado com
saída 0; suíte servidor/HTTP/UI também exercitada. Vault e Auth continuam adapters
locais, com valores fictícios. Isso não fecha 2.4 nem prova extensão Vault remota.
Evidências atuais na
[entrega complementar](../../../docs/processo/entrega-complementar-19-11-2026.md);
menções posteriores a execução adiada descrevem o histórico anterior.

## 1. Contratos, Vault e servidor

- [x] 1.1 Implementar catálogo/saída sem valor e RPC atestada admin-only com versões; provar cadastro, substituição, replay e negativas SQL/RLS/direto com dados fictícios.
- [x] 1.2 Implementar rota BFF limitada e serviço HTTP; provar origem, perfis, sessão, corpo e saída sem segredo nos testes afetados.

## 2. Interface e integração

- [x] 2.1 Entregar montarSegredosIntegracoes e serviço HTTP no padrão existente; provar limpeza do campo, estados e metadados no teste da tela.
- [x] 2.2 Coordenação fiar navegação administrativa e conferir visual desktop/mobile sem credenciais reais.
  **Fechamento local em 19/11/2026:** `segredos-integracoes-navegacao.test.ts`,
  2/2, importa `main.ts` real: Administrador abre Credenciais, sai para carteira e
  retorna; campo é limpo e só metadados são relidos. Profissional com rota forçada
  não monta nem consulta a área. Visual desktop/mobile do componente/CSS real
  registrado nas evidências de 19/11. Revisão independente de padrões/spec sem
  P1/P2 confirmado. Auth/fetch são fictícios; navegação publicada permanece em 2.4.
  **Parcial em 18/11/2026:** fiação implementada em `#administracao/integracoes`;
  componente real/CSS real conferidos em Chrome headless isolado, desktop 1366×900
  e celular 390×844, serviço fictício: sem overflow; Tab com foco de 3px; Enter envia;
  carregar/erro/sucesso e limpeza de campos conferidos. Capturas e medidas no
  relatório noturno. Navegação integrada permanece pendente. Critério inteiro não fechado.
- [x] 2.3 Executar verificar:rapido e revisão independente padrões/spec; registrar evidência e limitações.
  **18/11/2026:** revisão de dois eixos sobre base `fa1af933`, incluindo arquivos novos,
  sem achado alto nesta superfície. `verificar:rapido` final: saída 0, lint e todos os
  typechecks. Gate integrado `verificar:ativacao`: saída 0 (1.364 passaram, 30 pulados);
  SQL direto executado separadamente. Conferência visual e ativação continuam nos gates
  2.2/2.4; contagem do gate genérico não substitui Auth/Vault reais.
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
- Revisão independente de padrões e aderência à especificação sobre base `fa1af933` e arquivos novos: nenhum achado alto confirmado nesta superfície. Fiação em `web/main.ts`: Administração > Credenciais das integrações (`#administracao/integracoes`). Conferência visual integrada e ativação continuam pendentes; componente isolado conferido conforme 2.2.
- Nesta frente não houve operação remota, credencial real, commit, push ou deploy. Revisão de dois eixos local registrada acima; Vault real, navegação publicada e ativação permanecem pendentes. Coordenação versionou capturas e medidas do componente desktop/mobile no relatório noturno.

Como testar após ativação: Administrador abre Administração > Credenciais das integrações, escolhe entrada e cadastra valor. Confira somente presença/versão/autoria/data; substitua e confirme incremento. Profissional/Família não podem listar/gravar, inclusive por HTTP e RPC direta. Segredos esperados: `ffcmapp.integracao.google_drive` (JSON conta serviço), `ffcmapp.integracao.openrouter` (chave API), `ffcmapp.integracao.google_calendar_client_id` e `ffcmapp.integracao.google_calendar_client_secret` (OAuth Calendar). Os valores serão cadastrados exclusivamente pelo solicitante. Rota segue interruptor operacional existente `FFCM_CONFIGURACAO_SISTEMA_ATIVO`.

## Retomada local — preservação da escrita pendente (18/11/2026)

- [x] 2.5 Impedir nova escrita/recarga durante POST e exigir leitura de metadados após
  falha ou resposta incerta, sem guardar valor para repetir; limitar leitura HTTP por
  bytes/prazo e cancelar stream interrompido. **Código escrito:** `web/segredos-integracoes.ts`
  bloqueia controles durante envio; limpa valor antes de chamar adapter, inclusive recusa
  síncrona; após falha somente recarga de metadados libera novos formulários. Serviço
  `web/servico-segredos-integracoes-http.ts` limita resposta a 64 KiB/20 segundos, cancela
  leitura no erro e distingue escrita incerta de leitura indisponível. Nenhum erro devolve
  corpo bruto ou valor. **Testes escritos, não executados:** regressão UI de POST pendente,
  recarga e versão; HTTP de teto, corpo sem fim e resposta inválida na escrita. Validação,
  revisão independente e integração Auth/Vault reais continuam pendentes por instrução.
  **Suposição UX conservadora:** uma escrita administrativa por vez; toda falha exige
  recarregar metadados antes de tentar novamente, sem tentativa automática nem valor retido.
  **Fechamento local em 19/11/2026:** UI 4/4 e HTTP 5/5 passaram. Regressões novas
  detectaram stream aberto quando status/MIME era recusado antes do leitor;
  cancelamento agora também cobre esse caminho. Falha da conferência GET mantém
  bloqueio; próxima intenção usa somente a versão da leitura concluída e valor
  novamente informado. Revisão independente de padrões/spec sobre base `c99b890`
  sem P1/P2 confirmado. A indicação anterior de testes não executados é histórica;
  Auth/Vault reais e ativação continuam pendentes em 2.4.
