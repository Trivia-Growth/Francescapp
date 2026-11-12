# Tarefas — diário e evolução conectados

## 1. Armazenamento privado

- [x] 1.1 Criar `cadastro.diario_registro`, `cadastro.diario_registro_versao` e
  `cadastro.diario_consulta`, imutáveis, com RLS ligada e zero grant a
  `public`/`anon`/`authenticated`/`service_role`. Evidência: `supabase/tests/diario_operacoes_local.sql`
  confere os três papéis do PostgREST nas três tabelas antes do grant e falha com
  `ACESSO_INDEVIDO_TABELA` se algum alcançar. Migration `20261118200000`.
- [x] 1.2 Exigir justificativa na retificação pelo próprio banco, sem ver o texto:
  `diario_justificativa_chk` amarra `(estado = 'retificado') = (justificativa_cifrada is not null)`.
  Evidência: bloco 2 do teste SQL — retificar sem justificativa devolve `ENTRADA_INVALIDA`, com
  justificativa grava a versão 3 e as três versões continuam na tabela (`HISTORICO_PERDIDO`
  falharia).

## 2. Operação privada e autorização

- [x] 2.1 `api.diario_operacao_privada(jsonb)` + wrapper `api.diario_privado(jsonb)` sob
  `ffcmapp_diario_owner` (`nologin nosuperuser nobypassrls`, sem membros), `search_path=''`,
  `row_security=on`, atestado HMAC de 30 s, revalidação sob `for share`, idempotência por
  `operacao.requisicao` e auditoria obrigatória. Migration `20261118210000`.
- [x] 2.2 Duas trilhas de autorização, colaborador e familiar, sem afrouxar nenhuma das duas.
  Evidência (teste SQL): profissional grava e lê; familiar grava relato próprio; familiar com
  `amr = oauth` é negado (`AMR_TROCADO_ACEITO` falharia); `cadastro.acesso_paciente` revogado
  nega o familiar com sessão viva; concessão revogada e sessão encerrada negam o profissional.
- [x] 2.3 Audiência conferida no banco, não na tela. Evidência (teste SQL, bloco 5): a família
  lê 1 registro — o próprio relato — e não vê a evolução interna da equipe; a **outra** família
  vinculada ao mesmo paciente lê 0; o profissional lê 2.
- [x] 2.4 FR-013: retorno a relato familiar obrigado a alcançar o autor. Evidência (bloco 6):
  responder com `audiencia = 'equipe'` devolve `conflito`; com `equipe_e_familia` grava, o autor
  do relato passa a ler 2 registros e a outra família continua lendo 0.
- [x] 2.5 FR-013: consulta registrada uma vez e sem encerrar a solicitação. Evidência (bloco 5):
  após a leitura do profissional há 1 linha em `cadastro.diario_consulta`; reler mantém 1.
- [x] 2.6 Ninguém reescreve registro alheio. Evidência (bloco 3): o segundo profissional recebe
  `conflito` e nenhuma versão é gravada.
- [x] 2.7 Idempotência e AAD. Evidência (bloco 1): reenvio da mesma chave devolve `repeticao`
  com o mesmo registro; a mesma chave com digest diferente devolve `conflito_idempotencia`; AAD
  apontando para `cadastro.saude_versao` devolve `ENTRADA_INVALIDA`; MAC falso é recusado como
  `insufficient_privilege` antes de qualquer leitura.
- [x] 2.8 Auditoria obrigatória e identidade Auth sem perfil. Evidência (blocos 8 e 9): a
  identidade sem perfil é negada, auditada em `ator_auth_id` e **não** vira usuário; com a
  auditoria falhando por trigger, nada é persistido (nem `operacao.requisicao`, nem o registro).
- [x] 2.9 Grant do wrapper para `authenticated` assumindo o papel dono, com checagem defensiva
  do estado inicial. Migration `20261118220000`; o teste confere que `anon`, `service_role` e a
  função interna `api.diario_operacao_privada` continuam sem `execute`.

**Execução**: `sh scripts/testar-diario-operacoes-local.sh` — passou, sem saída de erro
(12/11/2026). O script sobe um PostgreSQL descartável na porta 55471 e encadeia
`cadeia_migrations_local.sql` + `20261112100000` + `20261111160000` (sessão familiar) + as três
migrations desta fatia.

## 3. Contratos e rota

- [x] 3.1 `packages/contracts/src/diario.ts` e `diario-http.ts`; AAD
  `cadastro.diario_registro_versao` (com `campo` em `conteudo | justificativa`) registrado em
  `rpc.ts` e em `supabase/functions/_shared/cifra-autenticada.ts`.
- [x] 3.2 Rota `GET`/`POST /api/pacientes/:paciente_id/diario` e
  `GET /api/diario/disponibilidade`, atrás de `ffcm.diario.ativo` (semeada **false**) com
  `FFCM_DIARIO_ATIVADO` como padrão de ambiente. `netlify/functions/diario.ts` e
  `_shared/{entrada-diario-nativa,compor-diario-nativo,diario-nativo,executor-diario-nativo}.ts`.
- [x] 3.3 Regras que o banco não pode conferir (porque o conteúdo é cifrado) ficam no contrato:
  relato exige data e descrição (FR-008); publicar evolução exige síntese (FR-009); retificar
  exige justificativa e publicar não a aceita (FR-012); relato familiar não amplia audiência nem
  responde ninguém; rascunho não responde ninguém; criação e revisão não se confundem; campo de
  autoridade (`autor_usuario_id`, `consultas`) enviado pela entrada é rejeitado.
  Evidência: `npx vitest run packages/contracts/test/diario.test.ts` — 10 testes, passou (12/11/2026).
- [x] 3.4 FR-009: `ffcm.diario.areas_sintese` no catálogo de configuração, editável pela tela de
  administração, lida pelo servidor via `listaConfigurada`. Migration `20261118230000`.

## 4. Interface

- [x] 4.1 `web/diario.ts` e `web/servico-diario-http.ts`: lista com situação, audiência,
  atenção, origem do texto e motivo da retificação; formulário de evolução com área vinda da
  configuração e destinatários mostrados **antes** de confirmar; rascunho e publicação; botão de
  retificação com justificativa obrigatória; resposta a relato familiar com audiência travada;
  sinalização de atenção com motivo, data e encaminhamento.
- [ ] 4.2 Ligar a aba na ficha. **Pendente de integração**: `web/main.ts` não foi editado por
  esta frente (regra da passagem). O trecho está no relatório de entrega.
- [ ] 4.3 Prova visual e de teclado na tela real. Não executada.

## 5. Limitações e pendências registradas

- **FR-010 e FR-011 não entram nesta fatia.** O gancho de áudio existe só como
  `origem_conteudo = 'audio_transcrito'`, declarado pelo cliente; nenhuma decisão de acesso
  depende dele e nada é transcrito aqui.
- **A jornada de login familiar continua desligada.** A autorização do familiar está no banco e
  comprovada por teste, mas quem autentica o familiar é outra fatia; as constantes que a
  desligam não foram tocadas.
- **"A publicação exige síntese" (FR-009) é conferida no contrato e no servidor, não no banco**,
  porque o banco não lê o conteúdo. O que o banco garante sozinho é autoria, data, estado,
  audiência e a presença da justificativa na retificação.
- **A criação da tarefa de FR-014 não acontece aqui.** A tela registra a sinalização com motivo,
  data e encaminhamento e aceita o identificador da tarefa pela porta `converterEmTarefa`; sem
  essa porta ligada, ela instrui a abrir a aba Tarefas. `tarefa_id` não tem chave estrangeira,
  de propósito — a tarefa é de outro owner.
- **"Coordenação" foi tratada como "colaboradores vinculados ao paciente"**, como nas demais
  fatias. Restringir o relato familiar à case manager é mudança de regra de negócio e precisa de
  decisão explícita.
- **Nenhuma migration foi aplicada remotamente e nenhuma flag foi ligada.** A chave
  `ffcm.diario.ativo` é semeada `false`.
- **Revisão independente desta fatia (dois eixos) ainda não foi feita.** Quem implementou não
  aprova a própria revisão.
- `pnpm run verificar:rapido`: **lint passou**; o typecheck do repositório falha em
  `web/servico-pendencias-http.ts` (`Cannot find module './pendencias-caso.ts'`), arquivo de
  outra frente em andamento, não desta. Os quatro projetos de typecheck passam nos arquivos
  desta fatia (`pnpm run typecheck:funcoes`, `:web` antes daquele arquivo existir, `:proxy` e os
  dois pacotes). Registrado como bloqueio externo, não como sucesso presumido.
