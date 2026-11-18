# Design

## Context

Ver `proposal.md`. A porta opcional atual em `web/diario.ts` encadeia criação de tarefa e salvamento de evolução; ainda não está ligada em `web/main.ts`. Também usa audiência familiar, área fixa e campos implícitos. A preparação de cifra/atestação hoje executa junto com a RPC em `tarefa-cuidado-nativo.ts` e `diario-nativo.ts`. A migration local 1100 acrescenta leitura de autorização sem selecionar tarefas. O ciclo existente de Tarefas já possui reserva, geração, encerramento e recibo, inclusive após recarga.

## Goals / Non-Goals

**Goals:** compor os dois domínios numa transação nativa, reutilizando contratos explícitos, autorização por caso, cifra, atestação e auditoria. Preservar o padrão Atendimento e separar UI, contrato HTTP, composição nativa e armazenamento.

**Non-Goals:** substituir os módulos de Diário/Tarefas; criar fila, saga, cache clínico, integração externa nova, tarefa automática, retorno familiar implícito ou grupo 3 de Turno. Não executar validações enquanto vigorar o adiamento solicitado.

## Decisions

1. **Transação PostgreSQL única.** RPC `api.conversao_diario_tarefa_privada(jsonb)` compõe autorização de Tarefas (`autorizacao_somente:true`), criação de tarefa e evolução através das wrappers existentes. Se qualquer filha falhar, lançar exceção dentro de subtransação para desfazer as duas gravações e seus recibos. Negativa externa auditada fora do subbloco. Alternativa de duas chamadas/reconciliação rejeitada por manter estado clínico parcial.
2. **Ledger operacional aditivo.** Guardar somente IDs de caso, origem estável/versão, tarefa/evolução, ator e horário; unicidade pela origem estável. Só inserir recibo completo. Consulta após autorização retorna referências, nunca envelopes clínicos. **SUPOSIÇÃO CONSERVADORA:** uma conversão por registro; ações adicionais seguem pelo módulo Tarefas. Um replay confirmado devolve o recibo original, sem trocar autoria ou atualizar tarefa.
3. **Autorização em camadas.** Servidor exige Profissional Google; SQL comprova sessão, concessão, vínculo ativo e visibilidade/versão publicada da origem. Role própria NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOINHERIT, acesso só a metadados necessários e wrappers, sem texto cifrado ou Vault direto. Validar flags de Diário/Tarefas e `ffcm.diario.conversao_tarefa_ativa` (false inicial) também no banco. Negar falha de configuração. Consulta não dispensa autorização na escrita.
4. **Atestado agregado.** Preparadores puros extraídos dos caminhos nativos existentes recebem IDs explícitos, sem executar RPC. O servidor prepara tarefa e evolução com os mesmos paciente, ator, sessão e request. Atestado externo da conversão vincula origem/versão e três transportes filhos. SQL confere ações e correspondência integral; HMAC de cada filha sozinho não comprova proveniência. Digest lógico de conversão não depende dos novos IVs/envelopes/IDs sorteados para permitir recuperação.
5. **Conteúdo humano explícito.** UI exige motivo, data da atenção, encaminhamento, responsável, prazo, prioridade e área do catálogo. Servidor deriva tarefa e evolução desses campos, sem copiar texto original. **SUPOSIÇÃO CONSERVADORA:** evolução publicada `equipe`, `atencao:true`, `tarefa_id` correspondente, sem `responde_registro_id`; conversão é distinta do retorno FR-013. Não mudar suas regras existentes.
6. **HTTP e recuperação.** GET/POST `/api/pacientes/:paciente_id/diario/:origem_id/conversao-tarefa`. GET devolve recibo ou ausência, após autorização. POST usa reserva/geração/chave idempotente existentes, origem e versão esperada mais campos humanos. UI usa ciclo de Tarefas com gravação atômica substituível, consulta ledger antes de reservar e depois de incerteza. **Ausência de ledger não libera repetição:** encerrar barreira anterior cerca execução tardia, ou reconhecer recibo confirmado, consultar novamente e só então liberar nova gravação. Troca de caso/sessão descarta respostas tardias e formulário; nenhum armazenamento persistente clínico no navegador.
7. **Ordem de locks.** Compor autorização que trava paciente antes de consultar metadados da origem. Não adquirir lock inverso ao Diário existente. Unicidade final resolve concorrência; perdedor reverte suas gravações antes de devolver conflito/recibo autorizado.

## Risks / Trade-offs

- Mudança de contrato sensível: provas novas devem cobrir servidor e SQL direto, RLS, revogação, chamada privilegiada, concorrência, falha da segunda gravação e resposta perdida. Escritas agora, execuções adiadas; não considerar ativado.
- Restrição de uma conversão por origem pode limitar encaminhamentos: registrada como suposição conservadora, sem impedir criação manual de outras tarefas.
- Leitura de autorização e composição com roles novas podem expor privilégios: snapshot de owners, ACLs, memberships e CREATE; grants mínimos somente da nova role; preservar acesso anterior.
- Interface pode não obter área configurada ou capacidade de escrita: mostrar bloqueio explicativo e manter Diário/recursos independentes disponíveis.

## Migration Plan

Adicionar migration `20261125120000_conversao_diario_tarefa_atomica.sql`, após 1100, sem remover dados, tabelas ou privilégios existentes. Aplicação da migration e ativação da flag dependem das provas obrigatórias futuras. Rollback operacional: manter nova flag desligada; preservar ledger e histórico. Não executar rollback destrutivo. Publicação e autenticação remotas continuam pendentes separadamente.
