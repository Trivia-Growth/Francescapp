# Tasks

**Estado:** planejamento registrado antes do código; implementação local em frentes independentes. **Execução de validações adiada pelo solicitante em 18/11**; escrever testes agora não equivale a provas executadas. A ativação exige positivos e negativos de autorização/RLS; nenhum gate foi dispensado. Checkboxes de implementação permanecem abertos até conferir seus critérios; entregas locais estão registradas abaixo.

## 1. Contrato e servidor

Código e cinco arquivos de testes entregues em `b56e90c`, sem execução. Operações
comuns reutilizam preparadores; conversão chama uma única RPC agregada. Erro de
infraestrutura não é apresentado como conflito de versão. Áreas vêm do catálogo.

- [ ] 1.1 FR-014 — Extrair preparação dos transportes nativos sem mudar operações comuns, definir contratos de consulta/comando/recibo e endpoint atômico com flags, autorização e revalidação. Evidência: testes afetados de contratos, servidor e HTTP, incluindo perfil errado, flag falsa, erro e resposta perdida; execução adiada.
- [ ] 1.2 FR-014 — Compor conteúdo humano cifrado e atestado agregado de origem/versão e transportes; negar divergências e nunca devolver conteúdo original ou envelopes. Evidência: testes de vinculação dos transportes e ausência de segunda RPC isolada; execução adiada.

## 2. Banco

Migration 1200, runner e cinco arquivos SQL entregues em `346d94c`, sem execução.
Cobrem composição, negativas, migrador/executor NOSUPER, snapshots e concorrência
`dblink` (mesma origem, revogação e retificação). Sintaxe/runtime, locks, privilégios
reais e integração Auth/Vault ainda precisam ser comprovados; nenhum resultado foi
presumido. Flag desligada e nenhuma aplicação remota.

- [ ] 2.1 FR-014 — Criar migration aditiva 1200 com ledger operacional único por origem, RPC de consulta/conversão e role restrita. Reutilizar wrappers, conferir metadados e flags, reverter ambas as filhas em falha e auditar negativa externa. Evidência: migration e matriz SQL de atomicidade, concorrência, deduplicação, ACL/RLS, outro caso/perfil, rascunho, versão e revogação; execução adiada. Depende do contrato 1.1; elaboração em paralelo coordenada.
- [ ] 2.2 FR-014 — Escrever prova com executor NOSUPERUSER/NOBYPASSRLS, acesso direto e snapshots de owner/ACL/membership/CREATE preservados; registrar limitações. Evidência: SQL e runner executáveis existentes, sem alegar execução agora.
  Inclui auditador estreito da negativa de perfil antes do cofre: não aceita ator ou
  sucesso da entrada, não revela existência clínica e falha fechada se a auditoria
  não confirmar; nenhuma permissão das operações existentes é ampliada.

## 3. Interface conectada

Código e três arquivos de testes entregues em `df01629`, sem execução. Fiação em
main, formulário explícito, recuperação por origem/barreira e invalidação de versão
sem descarte silencioso de campos. Nenhuma persistência clínica no navegador.

- [ ] 3.1 FR-014 — Substituir fluxo sequencial não conectado por formulário explícito, em relatos/evoluções publicadas elegíveis, com área configurada e audiência equipe informada; compor serviço em main. Evidência: testes UI/cliente de campos, elegibilidade, recibo existente, vazio, falha e acessibilidade; execução adiada. Depende dos contratos 1.1.
- [ ] 3.2 FR-014 — Reutilizar reserva e barreira para resultado incerto/recarga; cercar execução anterior antes de nova tentativa, descartar respostas após troca de caso/sessão, sem persistência clínica no navegador. Evidência: testes de incerteza, encerramento/reconhecimento e resposta tardia; execução adiada.

## 4. Integração e ativação futura

- [ ] 4.1 FR-014 — Revisão independente dos eixos padrões/spec, correções e execução dos testes afetados, matriz inteira de autorização/RLS e roteiro interface com dados fictícios. **ADIADO por instrução do solicitante**; não marcar a fatia ativada sem resultados.
- [ ] 4.2 FR-014 — Aplicar migration 1200 somente após gates obrigatórios; ligar flag pela Administração e comprovar conversão pela aplicação autenticada. **PENDENTE** de validação, ambiente publicado e autenticação; bloqueio não interrompe outras implementações.
- [x] 4.3 Atualizar relatório existente e PR com arquivos, suposições destacadas, migration pendente, testes escritos não executados e exclusões explícitas. Evidência: relatório no último commit e corpo do PR correspondente.

## Workflow follow-up

- Sincronizar/arquivar somente depois de validação e aceite reais; manter fase Inicial e histórico das mudanças anteriores.
