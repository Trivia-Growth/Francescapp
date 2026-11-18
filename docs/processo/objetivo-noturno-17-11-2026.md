# Objetivo noturno — 17/11/2026

Briefing completo do trabalho autônomo da noite de 17 para 18/11/2026. O comando `/goal` tem limite de 4000 caracteres e aponta para este arquivo; as travas de segurança estão repetidas lá para valerem mesmo que esta leitura falhe.

O solicitante **não está disponível**. Não perguntar nada: decidir, registrar a decisão e seguir.

## Objetivo único

Na noite de 18/11/2026 o solicitante quer **entrar na aplicação, cadastrar as chaves das dependências externas pela interface, ligar as integrações e começar a testar**. Tudo que não serve a isso é secundário.

## Paralelismo e isolamento

Usar subagentes sempre que possível. **Impedimento em um bloco não pode impactar os outros**: bloco travado vira bloqueio registrado, e o trabalho segue nos demais.

## Autorização vigente (DF-022)

Não há nada em produção. Autorizado a aplicar migrations no Supabase remoto, publicar na Netlify, fazer push e abrir PR sem pedir. A limpeza seletiva de DF-015 ocorre antes do go-live.

**Dado real continua proibido.** Ambiente real não é dado real; usar dados fictícios.

**Nunca manusear credencial.** Construir o caminho para o solicitante cadastrar as chaves; não criar, não pedir, não gerar e não escrever nenhuma credencial em arquivo, log, commit ou relatório. Teste que precise de segredo usa valor fictício, e a prova real fica registrada como dependente dele.

## Regras de operação desacompanhada

- Nenhuma decisão de negócio está aberta: todas foram fechadas em 17/11/2026, nos `tasks.md` e em `docs/projeto/fundacao.md` (DF-001 a DF-022). Dúvida nova: escolher a opção mais conservadora, implementar e **registrar a suposição em destaque no relatório final** — não parar.
- Nenhuma operação destrutiva: sem limpeza de dados, remoção de tabela, revogação de acesso existente ou reescrita de histórico.
- Commits pequenos e frequentes. Push ao fim de cada bloco. PR em draft por frente, com roteiro "Como testar".
- `AGENTS.md — Execução enxuta`: durante o desenvolvimento só `pnpm run verificar:rapido`; teste novo roda só o próprio arquivo; `verificar:ativacao` na ativação de cada fatia.
- Teste positivo e negativo de autorização e RLS é obrigatório e nunca pulado.

## Base

Partir de `origin/main` (Codex integrou os PRs 16 e 17). A branch `fatia7/turno-execucao-cuidado` tem 8 commits de spec já rebaseados; fazer push dela e seguir a partir dali.

## Bloco 1 — Consertar a porta de entrada (prioridade máxima)

Sem isto, nada do objetivo funciona.

1. `configuracao-no-banco` 6.7: a tela de configuração do sistema **está quebrada** e consta como não corrigida. Diagnosticar e consertar. É por onde o solicitante liga tudo.
2. `configuracao-no-banco` 3.2: fiação da navegação em `web/index.html` e `web/main.ts`, adiada por coordenação. O `web/` está livre.
3. Provar leitura e escrita das chaves `ffcm.*` pela tela com perfil Administrador, e negativa para Profissional e Família — no servidor e no banco.

## Bloco 2 — Cadastro de segredos pela interface

Não existe hoje: o JSON da conta de serviço do Drive e a chave do OpenRouter só entram por SQL manual. Criar a mudança OpenSpec antes de implementar, com este desenho:

- Superfície **somente de escrita**: o valor entra, vai para o Supabase Vault e **nunca é devolvido** — nem em resposta, nem em tela, nem em log, nem em auditoria. A tela mostra apenas se o segredo está cadastrado, quem cadastrou e quando.
- **Somente Administrador**, provado no servidor e no banco. Prova negativa obrigatória para Profissional e Família, inclusive por acesso direto.
- Substituir cria nova versão; não apaga a anterior silenciosamente.
- Cobrir ao menos `ffcmapp.integracao.google_drive`, a chave do OpenRouter e as credenciais do Google Calendar (`FFCM_AGENDA_GOOGLE_CLIENT_ID` e `_CLIENT_SECRET`).
- Nenhum valor de exemplo que pareça credencial real, no código ou nos testes.

## Bloco 3 — Fechar as seis fatias que estão a um passo

`ficha-do-paciente` (1 pendente) · `contexto-e-rede-de-cuidado` (1) · `diario-conectado` (2) · `historico-de-saude` (4) · `plano-de-crise` (4) · `configuracao-no-banco` (restante).

Inclui as fiações pendentes em `web/main.ts`, aplicar as migrations no ambiente real, ligar as flags, e `plano-de-crise` 7.2 — registrar a habilitação de aprovação para o **case manager do caso**, conforme DF-021.

## Bloco 4 — Dívida de autorização da anamnese

`anamnese-gradual-dominio`. Hoje qualquer profissional com concessão vigente lê e edita a anamnese de **todos** os pacientes. A regra definitiva, decidida em 17/11/2026, é **exigir vínculo ativo com o caso**.

É mudança de comportamento sobre trilha já implementada: migrar a autorização e **reexecutar a matriz inteira** — positiva, negativa, outro paciente, outro perfil, acesso direto ao banco e revogação. Nenhum teste da regra anterior vale como evidência da nova.

Vem antes das integrações de propósito: é a única regressão de segurança conhecida e aberta, e o sistema será testado ligado.

## Bloco 5 — Integrações prontas para receber chave

O objetivo não é prová-las — sem as chaves não é possível. É que, ao cadastrar a chave, tudo o mais já esteja no lugar.

- **Drive** (`documentos-institucionais-integracao`): a leitura familiar o Codex já implementou. Garantir que `ffcm.documentos.drive_pasta_raiz` é editável na tela, que a rota lê o segredo do Vault pelo nome exato `ffcmapp.integracao.google_drive`, e que a flag liga e desliga. Implementar FR-031 como **sinalizar, nunca alterar**: comparar permissões com a audiência e levantar pendência; jamais escrever permissão no Drive.
- **OpenRouter** (`transcricao-audio-relato`): chave lida do Vault, flag `ffcm.transcricao.ativa` funcional, e o expurgo de 30 dias do áudio abandonado em **`pg_cron`** (tarefa 6.1).
- **Agenda Google** (`agenda-google-integracao`): V1 é **somente evento único na agenda individual** — consultar, criar, alterar e cancelar uma ocorrência, confirmando na origem antes de informar sucesso. Recorrência, agenda global e lembretes ficam fora. Começar pela tarefa 1.2; a 1.1 está fechada.

Para cada uma, o relatório deve dizer **exatamente o que cadastrar e onde**.

## Bloco 6 — Publicar e deixar testável

- Aplicar as migrations pendentes no ambiente real e publicar.
- Verificar que a aplicação publicada sobe, autentica e mostra as telas com estados honestos.
- Escrever roteiro "Como testar": entrar como Administrador, cadastrar um segredo, editar configuração, ligar uma flag e verificar o efeito.

## Bloco 7 — Se sobrar noite

`turno-e-execucao-do-cuidado`, na ordem do `tasks.md`: tarefa 0.6 (auditar a base de autorização existente), depois grupos 1 e 2. **Não começar o grupo 3 sem poder terminá-lo.**

Não iniciar financeiro, PWA nem a migração para Edge Functions.

## Relatório final

No último commit e na descrição do PR:

1. O que ficou pronto, com a evidência de cada bloco.
2. **A lista exata de chaves a cadastrar, com o nome de cada uma e onde entrar para cadastrar.**
3. O que ficou bloqueado e por quê.
4. Toda suposição feita por indisponibilidade do solicitante, em destaque.
5. O que **não** foi feito, dito explicitamente — nada descoberto por omissão.
