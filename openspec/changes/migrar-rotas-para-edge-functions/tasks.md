# Tasks

Cada tarefa indica dependência e evidência de aceite. Política de verificação em `AGENTS.md — Execução enxuta`.

Decisões herdadas de `executar-funcoes-no-supabase` e não reabertas aqui: destino Edge Functions em Deno (D1), migrar depois da V1 (D2), sem camada de abstração (D3), protocolo de identidade não migra junto (D4), toda prova de autorização refeita (D5), Netlify como proxy (D6), uma função por domínio (D7), Supavisor em transaction mode (D8).

**Nenhuma resposta de API pode mudar de forma.** Se um teste existente precisar ser alterado para passar contra a plataforma nova, isso é o achado — investigue antes de alterar o teste.

## 0. Pré-condições

- [ ] 0.1 V1 conectada entregue. Evidência: fatias de turno e financeiro demonstráveis pelo solicitante. **Bloqueia todos os grupos.**
- [ ] 0.2 Supabase local com Docker funcionando, com os testes do repositório executando contra ele. Evidência: saída de uma suíte de domínio rodando no ambiente local. Sem isso não há onde provar a migração — registrar bloqueio, não prosseguir.
- [ ] 0.3 Tarefas 2.1 e 2.2 de `executar-funcoes-no-supabase` concluídas: `concessoes-equipe` e `acesso-paciente` aliviadas, composição fora do arquivo de rota. Evidência: contagem de linhas das duas rotas próxima da mediana do conjunto, com os testes do domínio sem alteração de resultado.
- [ ] 0.4 Confirmar com o solicitante a autorização de operação externa vigente na data: criar funções no projeto Supabase, mover segredos e alterar a publicação. A autorização ampla de 17/11/2026 não se presume vigente meses depois. Evidência: confirmação registrada aqui.

## 1. Infraestrutura comum

Depende de 0.4.

- [ ] 1.1 Criar a estrutura das Edge Functions com `deno.json` resolvendo `packages/contracts`, `netlify/functions/_shared` e `supabase/functions/_shared`, sem duplicar código compartilhado. Evidência: `pnpm run typecheck:deno` cobrindo a estrutura nova.
- [ ] 1.2 Implementar a leitura de ambiente no isolate, concentrada num adaptador, preservando a regra de `configuracao-servidor.ts`: configuração variável vem do banco, ambiente é padrão e interruptor, e **falha de leitura nunca liga um serviço**. Evidência: teste cobrindo falha de leitura mantendo o que o ambiente dizia (design E5).
- [ ] 1.3 Implementar a conexão por Supavisor em transaction mode, sem pool próprio no isolate. Evidência: conexão estabelecida e uma consulta autorizada executada no ambiente local (D8).
- [ ] 1.4 Reavaliar o cache de 30 segundos de configuração no ciclo de vida do isolate e **medir a partida a frio**. Evidência: medição registrada aqui, com o número obtido; a medição de 13/11/2026 não vale como referência (design E5).
- [ ] 1.5 Implementar a tradução de erro preservando os códigos fechados existentes — `sem_permissao`, `conflito`, `conflito_idempotencia` — e o formato de erro público sem campos. Evidência: teste comparando a resposta de erro da plataforma nova com a da antiga, caractere a caractere.
- [ ] 1.6 Implementar o parseamento de sufixo de caminho para cobrir os 28 caminhos com parâmetro. Evidência: teste cobrindo caminho com parâmetro, caminho sem, e caminho desconhecido devolvendo o mesmo que hoje.

## 2. Proxy com encaminhamento por caminho

Depende de 1.6. É o mecanismo que torna a migração reversível (design E1).

- [ ] 2.1 Implementar no proxy da Netlify a tabela de encaminhamento por caminho, com destino selecionável entre função Netlify e Edge Function, sem alterar o cliente. Evidência: teste cobrindo um caminho encaminhado para cada destino, com a resposta idêntica.
- [ ] 2.2 Preservar os cabeçalhos de `netlify.toml` em `/api/*` — `Cache-Control: no-store`, `X-Content-Type-Options`, `Referrer-Policy` — e a mesma origem. Evidência: teste comparando os cabeçalhos de resposta antes e depois do proxy (D6).
- [ ] 2.3 Provar que o cookie de sessão selado atravessa o proxy e é lido pela Edge Function pela mesma cadeia de validação, com `x-sessao`, CSRF e atestado intactos. Evidência: teste positivo e negativo de sessão numa Edge Function com sessão emitida pela rota Netlify (design E2, D4).
- [ ] 2.4 Provar que reverter um caminho é alterar a tabela, sem republicar função e sem tocar no cliente. Evidência: reversão executada e verificada no ambiente local (design E4).
- [ ] 2.5 Mover os segredos das variáveis da Netlify para os segredos do projeto Supabase, mantendo no Vault o que já está lá, e conferir a fronteira nova. Evidência: lista do que foi movido e do que permaneceu; nenhuma credencial no repositório e nenhuma em log.

## 3. Lote 1 — piloto, 5 rotas e 5 caminhos

Depende de 2.5. `configuracao-sistema`, `regras-atendimento`, `auditoria`, `preautorizacoes-familiares`, `solicitacoes-titular`.

- [ ] 3.1 Migrar as cinco rotas como Edge Functions de domínio. Evidência: testes existentes de cada domínio executados contra a plataforma nova, sem alteração de expectativa.
- [ ] 3.2 Reexecutar a matriz de autorização dessas rotas contra as Edge Functions: positiva, negativa, acesso direto ao servidor e ao banco, outro perfil e revogação. Evidência: saída registrada (D5).
- [ ] 3.3 Encaminhar os cinco caminhos no proxy e verificar paridade de resposta e de cabeçalho com o estado anterior. Evidência: comparação registrada.
- [ ] 3.4 Confirmar a medição de partida a frio de 1.4 sob tráfego real do lote e registrar divergência, se houver. Evidência: medição registrada.

## 4. Lote 2 — barreiras, 4 rotas e 16 caminhos

Depende de 3.4. `barreira-acesso`, `barreira-contato`, `barreira-equipe`, `barreira-tarefa`. **É o lote de maior exigência de prova: são os próprios controles.**

- [ ] 4.1 Migrar as quatro barreiras. Evidência: testes existentes sem alteração de expectativa.
- [ ] 4.2 Reexecutar a matriz completa de cada barreira contra as Edge Functions, incluindo acesso direto ao banco com identidade sem vínculo, outro paciente, outro perfil, ausência de concessão e revogação com efeito imediato. Evidência: testes positivos e negativos, SQL direto incluído (D5).
- [ ] 4.3 Provar que a negação não vaza existência de recurso de outro caso, como hoje. Evidência: comparação da resposta negada entre as duas plataformas.
- [ ] 4.4 Encaminhar os 16 caminhos e verificar paridade. Evidência: comparação registrada.

## 5. Lote 3 — plano e coordenação, 9 rotas e 19 caminhos

Depende de 4.4. `plano`, `aprovador-plano`, `aprovar-objetivo`, `campo-extra-plano`, `habilitacao-plano-crise`, `plano-crise`, `orientacao`, `encaminhamento`, `tarefas-cuidado`. Primeiro lote com parâmetro em volume.

- [ ] 5.1 Migrar as nove rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 5.2 Provar o parseamento de sufixo nos caminhos com parâmetro, incluindo identificador inexistente, de outro caso e malformado. Evidência: testes cobrindo os três casos com a mesma resposta de hoje.
- [ ] 5.3 Reexecutar a matriz de autorização do domínio, incluindo a visibilidade familiar de plano e orientações. Evidência: testes positivos e negativos (D5).
- [ ] 5.4 Encaminhar os 19 caminhos e verificar paridade. Evidência: comparação registrada.

## 6. Lote 4 — paciente, vínculos e concessões, 9 rotas e 21 caminhos

Depende de 5.4. `pacientes`, `edicao-paciente`, `contato`, `acesso-paciente`, `vinculos-profissionais`, `concessoes-equipe`, `convites-familiares`, `cancelar-convite-familiar`, `consulta-convite-familiar`.

- [ ] 6.1 Migrar as nove rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 6.2 Provar idempotência e reserva onde existem, incluindo repetição de requisição e resposta perdida, sem duplicar lançamento. Evidência: testes de idempotência contra a plataforma nova.
- [ ] 6.3 Reexecutar a matriz de concessão e revogação, provando efeito imediato da revogação. Evidência: testes positivos e negativos, SQL direto incluído (D5).
- [ ] 6.4 Encaminhar os 21 caminhos e verificar paridade. Evidência: comparação registrada.

## 7. Lote 5 — conteúdo clínico, 8 rotas e 16 caminhos

Depende de 6.4. `anamnese`, `diario`, `saude`, `linha-tempo`, `contexto-cuidado`, `rede-cuidado`, `pendencias`, `documentos`.

- [ ] 7.1 Migrar as oito rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 7.2 Provar que a cifra de campo e o AAD continuam funcionando no isolate, com o conteúdo decifrando igual. Evidência: teste de leitura de conteúdo cifrado gravado antes da migração.
- [ ] 7.3 Reexecutar a matriz de audiência: equipe, familiar com fundamento, familiar sem fundamento, fundamento revogado e profissional de outro caso. Evidência: testes positivos e negativos (D5).
- [ ] 7.4 Encaminhar os 16 caminhos e verificar paridade. Evidência: comparação registrada.

## 8. Lote 6 — integrações externas, 3 rotas e 18 caminhos

Depende de 7.4. `agenda-google` (13 caminhos), `transcricao`, `exportacoes`.

- [ ] 8.1 Migrar as três rotas. Evidência: testes existentes sem alteração de expectativa.
- [ ] 8.2 Provar OAuth, renovação de credencial e leitura do Vault a partir do isolate, com conta autorizada e dados fictícios. Evidência: execução registrada; mock não comprova integração.
- [ ] 8.3 Provar o comportamento de falha e de resposta perdida nas integrações, sem repetição automática que duplique efeito externo. Evidência: testes de timeout e reconsulta.
- [ ] 8.4 Encaminhar os 18 caminhos e verificar paridade. Evidência: comparação registrada.

## 9. Lote 7 — identidade, 1 rota e 9 caminhos

Depende de 8.4. `auth`. Último por decisão de desenho (E2).

- [ ] 9.1 Migrar `auth` preservando literalmente cookie selado, `x-sessao`, CSRF, atestado de operação e os tempos de expiração. Nenhum campo, nome de cabeçalho ou formato muda (D4). Evidência: comparação do cookie e dos cabeçalhos emitidos entre as duas plataformas.
- [ ] 9.2 Provar entrada, renovação, encerramento e revogação de sessão contra a Edge Function. Evidência: testes positivos e negativos, incluindo sessão inválida, expirada e revogada.
- [ ] 9.3 Provar que sessão emitida pela plataforma antiga continua válida durante a transição, e vice-versa. Evidência: teste cruzado nas duas direções (design E2).
- [ ] 9.4 Encaminhar os 9 caminhos e verificar paridade. Evidência: comparação registrada.

## 10. Corte final

Depende de 9.4.

- [ ] 10.1 Reexecutar a **matriz de autorização completa** do produto contra as Edge Functions, com todas as 104 rotas encaminhadas. Evidência: saída registrada; nenhum teste do runtime antigo conta (D5).
- [ ] 10.2 Executar `pnpm run verificar:ativacao` uma única vez e o roteiro "Como testar" do PR. Evidência: saída registrada; gate que não executar vira bloqueio, não sucesso presumido.
- [ ] 10.3 Remover `netlify/functions/*.ts` e a configuração de função do `netlify.toml`, preservando a publicação do estático e os cabeçalhos. Evidência: diff e verificação de que `/api/*` continua respondendo com os mesmos cabeçalhos.
- [ ] 10.4 Conferir que nenhum arquivo remanescente importa de `netlify/functions/` fora do que foi migrado, e que `netlify/functions/_shared` foi reposicionado ou continua sendo importado corretamente. Evidência: `pnpm run verificar:rapido` limpo e busca registrada.
- [ ] 10.5 Solicitar revisão independente da fatia com `code-review`, informando a revisão-base, esta mudança OpenSpec e o diff exato. Atenção específica à paridade de autorização e de cabeçalho. Evidência: achados registrados e tratados.

## Workflow follow-up

- Atualizar `docs/projeto/fundacao.md` fechando DF-003 com a execução concluída, sem reescrever o histórico da deriva.
- Atualizar `docs/processo/estado-do-projeto.md` no merge.
- Esta mudança declara `skip_specs: true` e não tem delta; ao arquivar, não há sincronização com `openspec/specs/`.
- Registrar a medição de partida a frio obtida em 1.4 e 3.4 onde a próxima pessoa a encontre — a medição de 13/11/2026 ficou enterrada num comentário de código e quase foi transposta por engano.
