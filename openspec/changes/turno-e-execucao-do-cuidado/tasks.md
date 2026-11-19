# Tasks

Cada tarefa indica requisito/cenário, dependência e evidência de aceite. A política de verificação é a de `AGENTS.md — Execução enxuta`: durante o desenvolvimento, somente `pnpm run verificar:rapido`; ao escrever um teste novo, executar uma vez apenas o arquivo afetado; `pnpm run verificar:ativacao` só na ativação da fatia.

Nenhuma tarefa autoriza deploy, migração remota, concessão de acesso ou uso de dados reais. Todos os dados de teste são fictícios.

**Suspensão histórica de 17/11/2026:** a implementação aguardava liberação da frente de frontend. **Retomada autorizada em 18/11/2026:** o solicitante determinou seguir nas features não impedidas, com agentes Sol em paralelo, deixando as validações para depois. O recorte retomado alcança os grupos 1 e 2, conforme ordem do briefing; grupo 3 não iniciado naquela retomada (registro histórico superado pela preparação integral abaixo). As provas de autorização/RLS permanecem obrigatórias antes da ativação. A autorização DF-022 para operações externas não alcança dados reais nem operações destrutivas; esta retomada prepara código e migration local, sem presumir ativação remota.

## 0. Pré-condições

Decisões 0.1 a 0.5 e 0.7 confirmadas pelo solicitante em 11/11/2026 e registradas em `proposal.md — Decisões aplicadas`. Permanecem aqui como marcadas para preservar o rastro.

- [x] 0.1 ~~Perfis habilitados: Administrador e grupo de case managers.~~ **Revisado em 17/11/2026**: qualquer profissional autenticado com vínculo ativo no caso registra medicação prescrita e administrada. A concessão continua modelada e nasce concedida a todo profissional com vínculo, como ponto de aperto futuro (FR-059, FR-060, design D4).
- [x] 0.2 Autoria da administração: executor e registrador são campos distintos; o executor pode ser profissional externo sem conta no sistema (FR-060, design D8).
- [x] 0.3 Tipos de sinal vital: padrões da medicina em conjunto configurável — PA sistólica/diastólica, FC, FR, temperatura, SpO2, glicemia capilar e dor 0 a 10 (FR-058).
- [x] 0.4 Parâmetros de turno — duração padrão, tolerância de atraso e tratamento de turno não encerrado — são configuração administrada, não valor fixo em código (FR-055).
- [x] 0.5 Audiência familiar alcança todo o conteúdo do turno, condicionada ao fundamento de autorização do caso e revogável (FR-062, FR-037, FR-038).
- [x] 0.6 **Revisado em 17/11/2026** — não se espera mais a fatia 1 inteira. Auditar o que já existe e está verificado de identidade, sessão, vínculo de caso e concessão de equipe no repositório, e listar a lacuna concreta que o turno exige. Evidência: relação dos mecanismos conferidos com arquivo e migração correspondentes, as provas positivas e negativas de autorização já executadas, e a lacuna aberta como tarefa própria. Uma lacuna não coberta vira bloqueador explícito aqui, não premissa. **Bloqueia todos os grupos seguintes.**
  **Auditoria documental concluída em 18/11/2026**, no recorte explicitamente liberado
  do bloco 7. Evidência em `design.md — Auditoria da base para 0.6`. Fechar esta auditoria
  não declara base remota aprovada, não encerra S-02 e não libera os grupos seguintes.
- [ ] 0.6.1 Fechar a lacuna de prova operacional da base antes da integração/ativação do
  turno: diagnóstico da entrada publicada (400/503), sessão vigente de Profissional e
  Família existentes, positiva/negativa por caso, acesso direto e revogação no servidor
  e banco reais. Referência: FR-063 e gates S-02 existentes. Evidência: resultados reais
  rastreáveis sem tokens/dados pessoais; não substituir por flags, deploy ou registry.
  **Bloqueador atual:** login e matriz Auth remota não comprovados na passagem.
- [ ] 0.6.2 Fechar o contrato reutilizável de autorização exigido pelo turno na fatia
  correspondente: distinguir vínculo de caso, concessão de medicação (5.1/6.3), fundamento
  familiar vigente e revogável (8.3) e liderança atual para localização (12.3). Evidência:
  mapa campo/operação/lock/teste positivo-negativo, sem transformar parentesco, motivo
  genérico, perfil Administrador ou habilitação de crise em autorização de turno.
  Não criar implementação nesta auditoria; integrar o contrato nos grupos já previstos.
  **Bloqueia persistência/exposição que dependa de um desses controles ainda ausentes.**
- [x] 0.7 Evidência de habilitação profissional **não** é exigida. Não implementar campo de conselho, registro profissional ou documento comprobatório, nem verificação do executor informado (FR-060).
- [x] 0.8 (17/11/2026) Rotina do turno em campos estruturados de alimentação, hidratação, sono e eliminações (FR-064).
- [x] 0.9 (17/11/2026) Consolidado semanal por caso, além do diário (FR-065).
- [x] 0.10 (17/11/2026) PDF gerado no servidor, com a mesma audiência da consulta e exportação auditada (FR-066).
- [x] 0.11 (17/11/2026) Anexo de ocorrência em repositório privado do Supabase, com migração posterior para o Drive (FR-061, FR-030 modificado, design D12).
- [x] 0.12 (17/11/2026) Check-in e check-out com localização declarada, consentida e revogável, visível só a Administrador e case manager, sem impedir o turno quando ausente (FR-067, design D13).
- [x] 0.13 (17/11/2026) Campos de FR-064 confirmados: refeição por momento (café, almoço, lanche, jantar, ceia) com aceitação em total, parcial, mínima ou recusou; hidratação em mililitros; sono com início, fim e qualidade em tranquilo, agitado ou não dormiu; eliminações como contagem por tipo (urina, fezes). Mais um campo textual livre de observações adicionais, opcional e cifrado.
- [x] 0.14 (17/11/2026) Retenção da localização de FR-067: **90 dias** contados do turno, com descarte depois e prazo informado no consentimento.

## 1. Contratos do domínio de turno

Depende da auditoria 0.6; integração/ativação permanecem bloqueadas por 0.6.1 e pelos controles pertinentes de 0.6.2.

- [ ] 1.1 Criar `packages/contracts/src/turno.ts` com os schemas Zod `strict()` de turno (caso, profissional, instante de abertura, instante de encerramento, situação), seguindo o padrão de `tarefa-cuidado.ts` (par `reserva_id`/`geracao_reserva`, `versao_esperada`, `campoCifradoSchema` para texto). Evidência: `pnpm run typecheck` limpo e teste de contrato novo em `packages/contracts/test/` executado uma vez, cobrindo entrada válida e rejeição de campo desconhecido (FR-055).
- [ ] 1.2 Criar `packages/contracts/src/turno-escala.ts` com turno previsto, substituição e cobertura, exigindo motivo na substituição. Evidência: teste do arquivo cobrindo substituição sem motivo rejeitada (FR-056, cenário "Substituição sem motivo é recusada").
- [ ] 1.3 Criar `packages/contracts/src/sinal-vital.ts` com tipo, valor numérico, unidade compatível com o tipo, instante de aferição e vínculo de turno. Evidência: teste cobrindo valor não numérico e unidade incompatível rejeitados (FR-058, cenário "Medida fora do formato é recusada").
- [ ] 1.4 Criar `packages/contracts/src/medicacao.ts` com item prescrito (nome, dose, via, horários, vigência, fonte documental) e administração (referência a `item_id`+`versao`, situação, motivo condicional). Evidência: teste cobrindo item sem fonte documental rejeitado e situação diferente de administrado sem motivo rejeitada (FR-059, FR-060).
- [ ] 1.5 Criar `packages/contracts/src/ocorrencia-turno.ts` com descrição, instante, providência e anexo opcional. Evidência: teste cobrindo criação válida e rejeição de campo extra (FR-061).
- [ ] 1.6 Registrar os contratos novos em `packages/contracts/src/index.ts` e as rotas em `rotas.ts`, seguindo o padrão existente. Evidência: `pnpm run verificar:rapido` sem erro de lint ou tipo.

**Implementação local do grupo 1 — 18/11/2026:** os cinco contratos, exports,
rotas e `packages/contracts/test/turno-execucao.test.ts` foram escritos por Sol.
Identidade e relógio não são autoridade da entrada; encerramento referencia síntese
publicada, sem criar domínio paralelo de passagem. **Validação adiada por pedido
do solicitante:** testes e typecheck não executados nesta retomada. Checkboxes
continuam abertas até cumprir a evidência prevista; contratos não provam autorização.

## 2. Turno: persistência, abertura e encerramento

Depende de 1.1.

- [ ] 2.1 Criar migração aditiva local das tabelas de turno, sem grant direto às tabelas, seguindo o padrão `supabase/migrations/*_privada.sql`. Evidência: migração aplicada no Postgres local e tabelas sem privilégio para os papéis de aplicação, comprovado por consulta de privilégios.
- [ ] 2.2 Criar índice único parcial que impeça segundo turno aberto por profissional (decisão D1/D5 do design). Evidência: teste SQL direto tentando abrir dois turnos concorrentes e obtendo recusa do segundo (FR-055, cenário "Segundo turno aberto é recusado").
- [ ] 2.3 Implementar RPC privada de abertura e encerramento com auditoria obrigatória na mesma transação, no padrão de `*_auditoria_obrigatoria.sql`. Evidência: teste SQL comprovando que falha de auditoria aborta a operação e nenhum turno é criado (FR-055, FR-063).
- [ ] 2.4 Garantir que instante de abertura e encerramento vêm do servidor e que instante enviado pelo cliente é descartado (decisão D2). Evidência: teste do handler enviando instante próprio e verificando que o valor persistido é o do servidor (FR-055, cenário "Instante informado pelo cliente é ignorado").
- [ ] 2.5 Implementar os parâmetros de turno (duração padrão, tolerância de atraso, tratamento de turno não encerrado) como configuração administrada, conforme 0.4. Evidência: teste comprovando que a alteração do parâmetro muda o comportamento sem alteração de código e que turnos já registrados preservam os parâmetros vigentes à época (FR-055, cenário "Parâmetros de turno alterados sem nova versão do produto").
- [ ] 2.6 Implementar a barreira de servidor e o handler HTTP de turno em `packages/cadastro/src/` e `netlify/functions/`, no padrão `barreira-tarefa-*`. Evidência: teste do handler cobrindo sucesso, `sem_permissao` e falha de persistência sem sucesso falso (FR-055, cenário "Falha de persistência no turno").
- [ ] 2.7 Auditar a recusa antecipada de perfil no servidor, sem carregar o cofre
  e sem conceder capacidade de operação à identidade recusada (FR-063/FR-039).
  RPC restrita a registrar `negado` com ator derivado de Auth, ação fechada e alvo
  UUID; nunca aceita resultado, autoria ou texto clínico da entrada. Evidência:
  Família/Admin negados antes do cofre com evento confirmado; falha da auditoria
  não vira negativa falsamente confirmada; acesso direto não forja ator/permitido
  nem lê ou altera domínio. Execução das provas adiada nesta retomada.
- [ ] 2.8 Preparar a concessão mínima dos wrappers para o caminho autenticado,
  com guardas de owner, assinatura, configuração e ACL inicial, sem acesso às
  tabelas ou ao Vault. Evidência: migration local de grant e matriz de ACL/acesso
  positivo-negativo, executadas antes de aplicar remotamente ou ativar a fatia.

**Preparação local do grupo 2 — 18/11/2026:** migrations novas `20261125080000`
e `20261125100000`, módulos HTTP/barreira/RPC e matrizes SQL/servidor foram escritos
por Sol. Nenhuma migration nova desta retomada aplicada; nenhum teste executado.
`ffcm.turno.ativo` permanece desligado. Abertura/consulta e reconciliação estão
preparadas; encerramento permanece recusado até o grupo 3 validar a síntese publicada.
Isso mantém 2.3 e os demais critérios de aceite abertos, sem simular entrega completa.

## 3. Escala e passagem de turno

Depende de 2.6.

- [ ] 3.1 Implementar persistência e RPC de turno previsto, substituição e cobertura, preservando o profissional originalmente previsto e as versões anteriores, com controle de versão esperada. Evidência: testes comprovando que após a substituição o previsto original, o motivo, a data e o autor permanecem consultáveis, e que substituição a partir de versão desatualizada é recusada sem sobrescrever (FR-056, cenários "Substituição preserva o previsto original" e "Substituições concorrentes").
- [ ] 3.2 Implementar o modelo de passagem de turno como modelo por área de FR-009, vinculado ao turno, reaproveitando a publicação existente de síntese profissional (decisão D6). Evidência: teste cobrindo publicação com data, autor e vínculo ao turno, e recusa de publicação sem síntese (FR-009 modificado).
- [ ] 3.3 Exigir síntese de passagem para encerrar o turno. Evidência: teste cobrindo encerramento sem síntese recusado e turno permanecendo aberto (FR-057, cenário "Encerramento sem síntese é recusado").
- [ ] 3.4 Estender o mecanismo de FR-013 com ciência registrada, distinta de consulta, preservando quem registrou e quando. Evidência: testes cobrindo ciência registrada, consulta que não registra ciência, tentativa de ciência por não destinatário negada e falha de persistência mantendo a situação como consultado (FR-013 modificado, FR-057).
- [ ] 3.5 Apresentar ao profissional que abre turno a passagem anterior pendente de ciência. Evidência: teste cobrindo abertura de turno em caso com passagem sem ciência e a pendência apresentada com autor e instante do turno anterior (FR-057).

**Retomada grupo 3 — 18/11/2026:** solicitante autorizou preparar 3.1–3.5 integralmente
em código, com validações adiadas. Contrato e SUPOSIÇÕES CONSERVADORAS constam do design:
gestão por Administrador Google + vínculo + case manager atual; ciência pelo profissional
do turno sucessor efetivamente aberto. Não constituem ratificação clínica. Preparadas
migration 1400, contratos/rotas, servidor, interface e provas SQL/NOSUPER/concorrência.
Checkboxes ficam abertas até executar evidência; sem ativação ou operação remota.

## 4. Sinais vitais

Depende de 2.6.

- [ ] 4.1 Criar persistência estruturada da aferição em colunas não cifradas, conforme decisão D3, com os tipos confirmados em 0.3 como configuração administrada, e sem grant direto às tabelas. Evidência: migração local aplicada e privilégios conferidos.
- [ ] 4.2 Implementar RPC e handler de registro de aferição, validando a janela do turno. Evidência: testes cobrindo registro válido, instante anterior à abertura do turno recusado e instante futuro recusado (FR-058, cenário "Instante de aferição anterior à abertura do turno").
- [ ] 4.3 Implementar leitura da série cronológica por caso e período, paginada. Evidência: teste cobrindo ordem cronológica e estado vazio após consulta real bem-sucedida, sem dados de exemplo (FR-058, FR-062).
- [ ] 4.4 Garantir ausência de interpretação clínica: nenhum rótulo de gravidade, alerta ou recomendação derivada do valor. Evidência: teste registrando valor fora de faixa configurada e verificando que a resposta traz apenas valor e faixa, sem rótulo ou recomendação (FR-058, cenário "Sistema não interpreta o valor").
- [ ] 4.5 Implementar retificação de aferição preservando a medida original. Evidência: teste comprovando que o valor original permanece consultável, que a retificação guarda autor, motivo e data, e que a série exibe a versão vigente sem ocultar a retificação (FR-058, cenário "Aferição incorreta é retificada sem apagar o original").
- [ ] 4.6 Semear o conjunto configurável com os tipos de 0.3 e suas unidades, recusando tipo fora do conjunto. Evidência: testes cobrindo os tipos semeados disponíveis para escolha e tipo fora do conjunto recusado (FR-058, cenários "Conjunto de tipos segue os padrões da medicina" e "Tipo fora do conjunto configurado é recusado").

## 5. Medicação prescrita

Depende de 2.6.

- [ ] 5.1 Acrescentar a concessão de execução de medicação ao mecanismo de concessão de equipe existente, conferida na transação sob o mesmo lock das demais barreiras (decisão D4). Evidência: teste SQL direto comprovando que a concessão revogada passa a negar imediatamente, sem depender de expiração de sessão (FR-059, FR-063).
- [ ] 5.2 Implementar persistência e RPC do item de medicação prescrita, com vigência, fonte documental e versionamento. Evidência: testes cobrindo criação válida, item sem fonte documental recusado e alteração que preserva a versão anterior consultável (FR-059).
- [ ] 5.3 Implementar handler HTTP do item prescrito. Evidência: testes positivos e negativos cobrindo perfil habilitado, perfil não habilitado, familiar e acesso revogado, com negação sem expor dados (FR-059, cenário "Perfil não habilitado é negado").
- [ ] 5.4 Garantir que o sistema não preenche medicamento, dose, via ou horário automaticamente. Evidência: teste verificando que o formulário e a resposta de criação não trazem valor sugerido a partir de histórico, diagnóstico ou modelo (FR-059, cenário "Sistema não propõe medicamento nem dose").

## 6. Administração de medicação

Depende de 5.3.

- [ ] 6.1 Implementar persistência da administração referenciando `(item_id, versao)` vigente, com campos separados de executor e registrador, instante do servidor, turno e situação (decisões D7 e D8). Evidência: teste cobrindo registro válido e referência a item de outro caso ou fora de vigência recusada sem revelar sua existência (FR-060).
- [ ] 6.2 Derivar o registrador exclusivamente da fronteira confiável e exigir executor identificado na entrada. Evidência: testes cobrindo registro sem executor recusado e tentativa de informar o registrador pela entrada descartada (FR-060, cenário "Registro sem executor identificado é recusado"; decisão D8).
- [ ] 6.3 Verificar a concessão de execução de medicação do registrador no servidor e no banco, independentemente da interface. Evidência: testes positivos e negativos, incluindo acesso direto ao banco com identidade sem concessão, resultando em negação ou conjunto vazio (FR-060, cenário "Registrador sem concessão é negado"; FR-063).
- [ ] 6.4 Exigir turno aberto e exigir motivo quando a situação for recusada, adiada ou não administrada. Evidência: testes cobrindo os dois casos recusados (FR-060).
- [ ] 6.5 Implementar retificação que preserva o registro original, o executor originalmente informado e a autoria da retificação. Evidência: teste comprovando que o registro original permanece consultável e que nenhum registro de administração é apagado (FR-060, cenário "Retificação preserva o registro original").
- [ ] 6.6 Auditar criação, consulta, retificação e exportação de administração na mesma transação. Evidência: teste comprovando que falha de auditoria aborta a operação (FR-060, cenário "Auditoria da administração"; FR-039).
- [ ] 6.7 Tratar falha de persistência ou de auditoria sem sucesso falso e sem duplicar lançamento em repetição. Evidência: teste comprovando que a falha não apresenta a administração como registrada e que a repetição idempotente não cria segundo lançamento (FR-060, cenário "Falha de persistência na administração").

## 7. Ocorrência de turno

Depende de 2.6.

- [ ] 7.1 Implementar persistência, RPC e handler da ocorrência vinculada ao turno aberto, com providência. Evidência: testes cobrindo registro válido e registro em turno encerrado recusado (FR-061).
- [ ] 7.2 Integrar a conversão da ocorrência em ação com responsável, reaproveitando FR-014. Evidência: teste cobrindo conversão com motivo, data e encaminhamento, e a ocorrência mantendo referência à ação gerada (FR-061).
- [ ] 7.3 Vincular anexo da ocorrência às regras de documentos já existentes. Evidência: teste cobrindo anexo submetido às regras de FR-011 e FR-029 a FR-031, incluindo audiência e revogação (FR-061).

## 8. Relatório de turno e consolidado diário

Depende de 3.5, 4.6, 6.7 e 7.3.

- [ ] 8.1 Implementar leitura do relatório de turno reunindo passagem, aferições, administrações, ocorrências e horários, apresentando executor e registrador como papéis distintos na administração. Evidência: testes cobrindo turno encerrado com autores identificados e o cenário "Registrador não é apresentado como executor" (FR-062, FR-060).
- [ ] 8.2 Implementar consolidado diário por caso, indicando lacunas de cobertura. Evidência: testes cobrindo turnos em ordem cronológica, lacuna indicada e estado vazio honesto (FR-062).
- [ ] 8.3 Aplicar a audiência familiar de 0.5: familiar com fundamento de autorização vigente vê todo o conteúdo do turno. A negação SHALL decorrer da ausência de fundamento, não da ausência de parentesco. Evidência: testes positivos e negativos cobrindo familiar autorizado, familiar vinculado sem fundamento e fundamento revogado, inclusive por acesso direto (FR-062, FR-036, FR-037, FR-038).
- [ ] 8.4 Aplicar a audiência de FR-036 ao restante do conteúdo exibido. Evidência: teste comprovando que a pessoa cuja audiência não alcança conteúdo restrito recebe somente o seu conteúdo, sem indicar o teor omitido (FR-062, FR-036).
- [ ] 8.5 Integrar a exportação à FR-032 e registrar a exportação conforme FR-039. Evidência: teste cobrindo exportação autorizada, conteúdo limitado à audiência e evento de exportação auditado (FR-062, FR-032, FR-039).

## 9. Rotina do turno (alimentação, hidratação, sono, eliminações)

Depende de 4.6 e 7.3. Reaproveita o modelo de medida de FR-058 (design D9).

- [ ] 9.1 Estender o catálogo de tipos de medida com os tipos de rotina de 0.13 — momentos de refeição, níveis de aceitação, qualidade de sono e tipos de eliminação — marcando-os como observação e não como medida fisiológica. Evidência: teste cobrindo tipo de rotina aceito, valor fora do conjunto rejeitado e rótulo de observação preservado na leitura (FR-064, cenário "Valor fora do conjunto confirmado é recusado").
- [ ] 9.2 Estender `packages/contracts/src/sinal-vital.ts` (ou arquivo irmão, se a leitura ficar confusa) com os campos de rotina e o campo textual de observação adicional usando `campoCifradoSchema`, mantendo instante de ocorrência, unidade e vínculo de turno. Evidência: teste do arquivo cobrindo entrada válida, registro sem observação aceito e rejeição de campo desconhecido (FR-064, cenários "Observação livre acompanha o registro estruturado" e "Registro sem observação é válido").
- [ ] 9.3 Implementar persistência e RPC privada de rotina com auditoria obrigatória na mesma transação, validando a janela do turno. Evidência: teste SQL cobrindo registro válido, instante fora da janela recusado e registro sem turno aberto recusado (FR-064, cenários "Instante informado fora da janela do turno" e "Registro de rotina sem turno aberto é recusada").
- [ ] 9.4 Implementar leitura da rotina como série paginada por período, com autor e turno de origem. Evidência: teste cobrindo ordem cronológica e paginação, sem carregar histórico completo (FR-064, cenário "Rotina consultável como série").
- [ ] 9.5 Implementar retificação preservando o registro original com autor, motivo e data. Evidência: teste comprovando que nenhum lançamento é apagado (FR-064, cenário "Retificação preserva o registro original").
- [ ] 9.6 Provar as negativas: profissional sem vínculo, familiar e acesso revogado, inclusive por acesso direto ao servidor e ao banco. Evidência: testes negativos no handler e em SQL direto, com auditoria da negação (FR-064, cenário "Pessoa sem vínculo é negada").
- [ ] 9.7 Garantir que nenhuma superfície derive rótulo de adequação, gravidade, alerta ou recomendação dos valores de rotina, e que nenhum campo seja pré-preenchido a partir de histórico. Evidência: teste de leitura e de interface cobrindo o cenário "Sistema não interpreta a rotina" (FR-064).

## 10. Consolidado semanal e emissão em PDF

Depende de 8.5 e 9.4.

- [ ] 10.1 Implementar o consolidado semanal como consulta derivada de sete dias, sem tabela materializada nem job periódico, reunindo turnos, rotina, aferições, administrações e ocorrências, com lacunas de cobertura indicadas. Evidência: teste cobrindo ordem cronológica, lacuna indicada e estado vazio honesto após consulta real (FR-065, design D10).
- [ ] 10.2 Aplicar ao consolidado semanal a mesma audiência de 8.3 e 8.4. Evidência: testes positivos e negativos com familiar autorizado, familiar sem fundamento e fundamento revogado, e com audiência parcial no período (FR-065, FR-036, FR-037, FR-038).
- [ ] 10.3 Garantir que o consolidado não afirme tendência, evolução, melhora, piora ou recomendação. Evidência: teste cobrindo o cenário "Consolidado não interpreta" (FR-065).
- [ ] 10.4 Escolher a biblioteca de PDF medindo tempo frio e tamanho do pacote no runtime da função; registrar a medição. Se não couber, registrar o bloqueio e propor serviço de renderização autorizado — **não** mover a geração para o navegador. Evidência: medição registrada aqui com a decisão tomada (FR-066, design D11).
- [ ] 10.5 Implementar a emissão de PDF no servidor para relatório de turno, consolidado diário, consolidado semanal e exportação de caso, montando o conteúdo exclusivamente a partir da persistência e da identidade autenticada. Evidência: teste comprovando que conteúdo, registros ou identidade enviados no corpo são descartados (FR-066, cenário "Conteúdo do PDF não vem do cliente").
- [ ] 10.6 Registrar cada emissão como exportação conforme FR-039 e FR-032, com destinatário e propósito. Evidência: teste cobrindo emissão autorizada com evento auditado e emissão negada sem arquivo produzido (FR-066, FR-032 modificado, FR-039).
- [ ] 10.7 Aplicar a audiência ao conteúdo do PDF e preservar executor e registrador como papéis distintos. Evidência: testes cobrindo PDF de familiar limitado à sua audiência e PDF com administração de medicação (FR-066, FR-060).
- [ ] 10.8 Tratar falha de geração ou de registro da exportação sem apresentar sucesso nem entregar arquivo parcial. Evidência: teste cobrindo o cenário "Falha na geração não é apresentada como sucesso" (FR-066).

## 11. Anexo da ocorrência em repositório privado

Depende de 7.3.

- [ ] 11.1 Criar o repositório privado do Supabase para anexos de execução de turno, com política ligada à mesma prova de autorização do caso e sem bucket público. Evidência: migração aplicada localmente e teste SQL cobrindo leitura autorizada e leitura negada por identidade sem vínculo (FR-030 modificado, design D12).
- [ ] 11.2 Implementar envio do anexo preservando caso, classificação, audiência e autor, e marcando a origem como destino temporário até a definição da raiz do Drive. Evidência: teste cobrindo o cenário "Anexo de turno guardado no repositório privado" (FR-061, FR-030 modificado).
- [ ] 11.3 Implementar entrega por fluxo autorizado a cada leitura, sem URL pública e sem URL assinada de longa duração que sobreviva à revogação. Evidência: testes cobrindo "Anexo de turno não é público" e "Revogação alcança o anexo", inclusive por acesso direto (FR-061, FR-030 modificado, FR-037).
- [ ] 11.4 Garantir que anexos que não pertencem à execução de turno continuem indo para o Drive institucional. Evidência: teste cobrindo o cenário "Destino temporário não altera as demais classes de anexo" (FR-030 modificado).

## 12. Check-in, check-out e localização

Depende de 2.5.

- [ ] 12.1 Implementar o registro de consentimento de localização como versão, com identidade, finalidade, audiência informada e data; revogação cria nova versão em vez de apagar. Evidência: teste cobrindo concessão, consulta pelo próprio profissional e revogação preservando o histórico (FR-067, design D13).
- [ ] 12.2 Implementar a persistência da localização em tabela própria, separada do retorno do turno, com latitude, longitude, precisão informada, instante do servidor e referência ao consentimento vigente à época. Evidência: migração local e teste SQL cobrindo abertura e encerramento com localizações distintas (FR-067).
- [ ] 12.2.1 Implementar o descarte da localização após 90 dias do turno, preservando turno e demais registros. Evidência: teste cobrindo "Localização descartada após 90 dias", com a consulta posterior retornando ausência por retenção expirada e não erro (FR-067, FR-042).
- [ ] 12.3 Implementar a leitura da localização por RPC distinta, com prova própria de perfil Administrador ou case manager. Evidência: testes negativos comprovando que familiar autorizado e profissional sem coordenação não obtêm a localização, inclusive por acesso direto ao banco — a omissão não pode depender do cliente nem da serialização (FR-067, design D13).
- [ ] 12.4 Garantir que ausência de localização — permissão negada, recurso indisponível, consentimento ausente ou revogado — não impeça abertura nem encerramento, registrando o motivo. Evidência: testes cobrindo os quatro motivos, sem coordenada inventada, estimada ou derivada de endereço de rede (FR-067).
- [ ] 12.5 Implementar a coleta no cliente com aviso de finalidade, audiência e retenção de 90 dias antes do primeiro check-in. Evidência: teste de interface cobrindo aceite, recusa e turno aberto sem localização (FR-067, cenário "Consentimento registrado com finalidade e audiência").
- [ ] 12.6 Garantir que nenhuma superfície apresente a localização como prova de presença, nem derive atraso, falta, conformidade ou ranqueamento dela. Evidência: teste cobrindo os cenários "Localização não é apresentada como prova de presença" e "Coordenada enviada sem coleta real é tratada como declarada" (FR-067).
- [ ] 12.7 Auditar registro, consulta e exportação de localização conforme FR-039. Evidência: teste cobrindo os três eventos com identidade, ação, caso e instante (FR-067, FR-039).

## 13. Interface de turno no celular

Depende de 8.2.

- [ ] 13.1 Implementar as telas de abrir turno, registrar aferição, registrar administração, registrar ocorrência e encerrar turno com passagem, em `web/`, com estados de carregamento, vazio, erro e sucesso. Evidência: teste de interface cobrindo os quatro estados sem fallback de dados de exemplo em erro.
- [ ] 13.2 Garantir uso confortável no celular, com teclado, foco visível e alternativa ao áudio quando houver. Evidência: verificação registrada em viewport de celular, conforme `AGENTS.md — Qualidade e experiência`.
- [ ] 13.3 Apresentar a passagem pendente de ciência na abertura de turno, com ato explícito de ciência. Evidência: teste de interface comprovando que consultar não registra ciência (FR-057, FR-013 modificado).
- [ ] 13.4 Implementar as telas de rotina do turno, consolidado semanal e emissão de PDF, com os quatro estados. Evidência: teste de interface sem fallback de dados de exemplo em erro (FR-064, FR-065, FR-066).
- [ ] 13.5 Implementar o check-in e o check-out com o aviso de consentimento e o caminho sem localização. Evidência: teste de interface cobrindo aceite, recusa e turno aberto sem localização (FR-067).

## 14. Revogação, negativas e verificação integrada

Depende de 13.3.

- [ ] 14.1 Provar que a revogação de vínculo impede novas ações imediatamente e preserva os registros existentes. Evidência: teste SQL direto e teste de handler cobrindo revogação com turno aberto (FR-063, cenário "Revogação impede novas ações").
- [ ] 14.2 Provar isolamento entre casos: profissional de outro caso não enxerga turno, aferição, medicação ou ocorrência deste caso, e a negação não revela a existência do caso. Evidência: testes positivos e negativos, incluindo acesso direto (FR-063).
- [ ] 14.3 Provar que perfil familiar não registra execução, independentemente da interface. Evidência: teste no servidor e no banco (FR-063, cenário "Perfil familiar não registra execução").
- [ ] 14.3.1 Provar que perfil familiar não obtém localização em nenhuma superfície — leitura, relatório, consolidado, PDF e acesso direto ao banco — ainda que tenha fundamento de autorização vigente. Evidência: testes negativos nas cinco superfícies (FR-067).
- [ ] 14.4 Provar que registros permanecem com o autor original após encerramento do vínculo, sem anonimizar ou reatribuir. Evidência: teste de leitura de relatório anterior (FR-063).
- [ ] 14.5 Executar `pnpm run verificar:ativacao` uma única vez e o roteiro "Como testar" do PR na retirada do draft, com os testes positivos e negativos de autorização e RLS obrigatórios. Evidência: saída registrada; se algum gate não executar, registrar o bloqueio aqui em vez de presumir sucesso.
- [ ] 14.6 Solicitar revisão independente da fatia com `code-review`, informando a revisão-base, esta mudança OpenSpec e o diff exato, incluindo arquivos novos. Evidência: achados registrados e tratados; correções seguidas apenas pelos testes afetados pelo diff.

## Workflow follow-up

- Sincronizar os deltas com `openspec/specs/` e arquivar a mudança somente após a revisão independente e os critérios de aceite atendidos. Conferir que as seções "Jornadas e testes independentes preservados" (User Stories 13 a 15) e "Rastreabilidade com as metas SC" chegaram à spec principal de `turno-e-execucao`; se o arquivamento não as copiar, transcrevê-las à mão, como nas demais capacidades.
- Atualizar `docs/projeto/roteiro-especificacoes.md` com a posição desta capacidade entre as fatias, sem marcar fatias alheias como concluídas.


### Resumo operacional grupo 3 — preparação local, 18/11/2026

Código de 3.1–3.5 preparado: contratos `turno-passagem.ts`, publicação filha do Diário
atômica com vínculo versionado append-only, escala versionada, encerramento com reserva
existente/resultado recuperável e ciência explícita distinta de consulta. `turnos/ultimo`
recupera o próprio turno encerrado após recarga para remetente consultar recebimento.
Nova migration única `20261125140000_turno_escala_passagem.sql`; nenhuma aplicada.

BFF: `turno-grupo3-{nativo,compor-nativo,entrada-nativa,executor-nativo}.ts`, dispatch
único `turnos.ts`, ramo de cifra para AAD de motivo e testes novos de BFF/cifra. UI de
escala/passagem e serviço próprios, sem entidade clínica paralela. Republicação exige
versão de vínculo esperada e ato explícito; filha sempre nova evolução no Diário.

Provas SQL escritas: `supabase/tests/turno_grupo3_local.sql` (wrapper authenticated,
escala/versão/stale/motivo, publicação atômica/replay, retificação/republicação, fechamento
com reserva não zero/recibo perdido/consulta UUID e ultimo, consulta vs ciência/revogação,
ACL/owner/membership em migração NOSUPERUSER) e
`supabase/tests/turno_grupo3_concorrencia_local.sql` (duas conexões: retificação e
revogação antes do fechamento). Runner `scripts/testar-turno-grupo3-local.sh` escrito.
Novo teste servidor `turno-grupo3-encerramento.test.ts` prende versão fechada/digest e
consulta ultimo. Nenhum desses comandos/testes foi executado; não declarar aprovação.

Revisão de fonte identificou/corrigiu grant insuficiente para SELECT completo na passagem
(projeção curta só onde necessária) e policy de requisição que só admitia abertura
(policy aditiva específica de encerramento, preservando abertura). Revisão Spec levou a
paginação por cursor estável e rótulos de identidades efetivamente presentes nos registros,
separados do catálogo de profissionais elegíveis. Rótulo atual de concessão histórica
não prova nome à época. Matriz operacional real, verificações executáveis e ativação
continuam pendentes; checkboxes de aceite permanecem abertas.


Releitura independente de fonte concluída em dois eixos, base fixa
`eb494f2dbc014e8e23bcf31b4bbeb26b6a404eef`, diff `git diff eb494f2` mais arquivos
novos pertinentes (sem `.impeccable` preexistente). Padrões/segurança identificou
os bloqueios SQL acima; Spec identificou nomes, período real do turno, paginação e
recuperação de recusa definitiva. Revisão cruzada UI/BFF cobriu ainda rascunho
incompleto, projeção de identidades antes da cifra e coerência HTTP. Executor das
correções não aprovou o próprio código: releitura Spec e cruzada vieram de outros
Sol. Nenhum P1/P2 de fonte remanescente nos deltas relidos. Isso não comprova
runtime: nenhum teste, SQL, build ou gate de ativação foi executado; aceite continua aberto.


Consolidação da preparação: código em `f1b4de0`, fixture em `6b59e64`, enviados à
branch autorizada. Hooks existentes preservados: pre-commit formatou e apontou
literal de teste, corrigido; pre-push apontou campo `repeticao` ausente na fixture,
corrigido em commit próprio. Novo push saiu 0 com lint (759 arquivos) e typechecks.
Nenhum teste de comportamento/SQL/build/Deno/manual foi executado. Esse resultado
dos hooks não fecha autorização/RLS, critérios de aceite ou ativação.
