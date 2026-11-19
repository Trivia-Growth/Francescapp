# Design

## Context

As specs preservam FR-029 a FR-031; o delta `registrar-fundacao-real` confirma Drive compartilhado e canais distintos. Não há integração de documentos demonstrada. A referência Atendimento orienta organização e validação de fronteiras, não determina permissões ou credenciais deste produto.

## Goals / Non-Goals

**Goals:** delimitar a jornada e os controles verificáveis antes da conexão real.

**Non-Goals:** exportação, mudança de provedor, provisão ou configuração remota e acesso a dados reais.

## Decisions

- Guarda no Drive compartilhado confirmado, nunca Meu Drive como fallback. Alternativa de outro provedor contraria decisão vigente.
- Autorização deve conferir identidade, vínculo ao caso e audiência no servidor; acesso institucional direto exige coerência com compartilhamento gerido. Interface ou vínculo isolados não autorizam.
- Integração e segredos permanecem no servidor. Organizar por pastas de paciente e categorias gerais e de cuidado; família acessa somente pelo app. Formato de credencial, detalhes de audiência e política de revogação permanecem pendentes.
- Contrato isolado sem consumidor não prova integração e adiciona abstração prematura; implementar com a primeira operação real após decisões.

## Risks / Trade-offs

- Acesso direto ao Drive pode divergir do app: definir e provar concessão, detecção de compartilhamento incompatível e revogação antes da ativação.
- Falha entre Drive e banco pode deixar arquivo órfão: projetar reconciliação e recuperação após definição da integração.
- Testes fictícios não comprovam permissões ou acesso remoto: exigir prova conectada com dados fictícios, sob autorização específica.

## Migration Plan

Nenhuma operação remota autorizada. Após decisões, planejar implantação, reversão e conferência seletiva antes de executar.

## Open Questions

Bloqueadores materiais, não decisões adiáveis para implementação: identificador e raiz do Drive; detalhes operacionais da organização; identidade e consentimento Google; modelo e alterações de compartilhamento direto; audiência e sua revogação; tipos e limites de arquivos; tratamento de mudanças externas e falhas parciais. Confirmar com solicitante e registrar decisões antes de tarefas dependentes.

## Domínio provisório (10/11/2026) — sem código, sem integração

O solicitante pediu rascunho só de domínio/design esta rodada, sem código isolado (a decisão "Contrato isolado sem consumidor não prova integração" acima continua valendo — nenhum arquivo de contrato ou migration foi criado por este rascunho). Esboço do que um registro de anexo institucional precisaria representar, para acelerar a modelagem quando as perguntas acima forem respondidas:

- Identificação: referência ao paciente/caso; referência ao arquivo no Drive (id do Google, não o conteúdo); nome visível, que pode divergir do nome real do arquivo no Drive se a organização de pastas exigir.
- Classificação: categoria (ex.: documento geral do paciente vs. documento de cuidado/clínico) — a proposta já decidiu "pastas de paciente e categorias gerais e de cuidado", mas a lista fechada de categorias é um dos bloqueadores pendentes, não inventada aqui.
- Audiência: quem pode ver/baixar o anexo pelo app (perfil + vínculo ao caso, controles distintos como em outras fatias) — a proposta já é explícita que "família acessa somente pelo app", nunca por link direto do Drive; o modelo de revogação de audiência individual permanece bloqueador aberto.
- Proveniência e estado: quem anexou, quando, e um campo de estado que distinga "disponível"/"indisponível" (consistente com a decisão de "explicitar indisponibilidade e proibir substituição silenciosa de armazenamento" já na proposta) — não inventa aqui um fluxo de reconciliação Drive↔banco, que depende das decisões de falha parcial ainda pendentes.
- Auditoria: leitura e escrita deste registro devem seguir o mesmo padrão transacional (RPC auditada, autorização no servidor) já usado nas demais fatias — sem detalhe novo, só reafirmando consistência.

Isto é prosa de preparação, não um contrato implementável: nenhum destes campos tem forma final (tipo, obrigatoriedade, enum fechado) até as perguntas de "Open Questions" serem respondidas pelo solicitante, incluindo com acesso real ao Drive/Workspace, o que não é algo resolvível numa sessão sem o solicitante presente.


## FR-031 — decisão 17/11 aplicada em 18/11/2026

Detecção é somente leitura e nunca altera permissões. Adaptador usa
[permissions.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/list)
com paginação e host fixo, sem emails no contrato/log. Comparação encontra público incompatível
com ambas as audiências e domínio incompatível com equipe. Sem mapeamento nominal comprovado,
resultado encaminha revisão em vez de declarar segurança. Consultar apenas IDs de documentos
já autorizados pelo banco evita transformar conferência em oráculo para arquivos arbitrários.

Ameaças delimitadas: ACL externa ampliada (impacto alto, detectada/revisão manual); resposta
Google perdida (pendência, sem alteração automática); exfiltração de segredo por endereço
configurável (host fixo); leitura de outro caso (autorização/RLS antes da projeção/conferência).
Suposição explícita do briefing: dados fictícios; nenhuma prova de ACL real nesta passagem.

## Entrega do arquivo pelo app — retomada de 18/11/2026

Lacuna encontrada na implementação: listagem e envio estavam conectados, mas não
havia operação para recuperar os bytes pelo app. Família não deve receber link do
Drive para suprir essa lacuna. A entrega usa GET por paciente/documento, resolve o
identificador cifrado no servidor após a leitura privada autorizada e mantém a
flag administrada existente. A migration nova `20261125090000` estende a leitura
direcionada sem ampliar a consulta antiga ou seus grants; aplicação e provas ficam
pendentes, conforme adiamento de validações pedido pelo solicitante.

Modelo de ameaça do recorte: ativos são bytes clínicos, credencial de serviço e
auditoria; fronteiras são navegador/BFF, Auth/RPC/Vault e servidor/Google. IDOR e
outro caso exigem filtro de documento no banco com a audiência vigente. Nova
autorização depois da busca externa descarta bytes se vínculo, sessão, audiência ou
versão tiverem mudado. Endereço Google fixo e recusa de redirects limitam SSRF e
exfiltração. Leitura limitada ao teto já existente impede buffer sem limite.
`attachment`, tipo binário, nome saneado, `nosniff` e `no-store` evitam tratar o
conteúdo como página ativa ou armazená-lo em cache compartilhado. URL Blob existe
somente no navegador e é revogada; nenhuma URL pública/assinada do Drive é emitida.

**SUPOSIÇÃO CONSERVADORA:** entrega sempre como arquivo binário, sem preview nem
exportação de documento nativo Google. Formato não suportado produz erro honesto.
Revogação após a autorização final não recolhe bytes já emitidos. Auditoria comprova
autorização para entregar, nunca recebimento ou salvamento pelo destinatário.
Implementação não equivale a prova dessas mitigações; testes positivos/negativos,
revisão e integração real permanecem pendentes nesta retomada.


## Correções adversariais — 19/11/2026

PAD-01/ESP-01: fluxo passa a validar entrada, autenticar, cifrar comando provisório,
assinar prévia e executar `api.documento_preautorizar_privada` antes do primeiro efeito
Drive. Migration deriva corpo pós-DF-023 com hash esperado, preservando autenticadores,
owner, ACL e configuração. Prévia executa autorização da operação de escrita e existência
visível do paciente, mais identidade/propriedade/versão do documento e idempotência;
auditoria da prévia é obrigatória. Não cria versão nem reserva uma gravação concluída.
RPC final permanece transacional e repete autorização depois do I/O. Profissional exige
vínculo ativo por paciente também na leitura/escrita final; conta Administrador conserva
alçada preexistente. Família nunca passa pela prévia de escrita.

Digest de upload inclui conteúdo lógico anterior ao identificador Drive, tipo e SHA-256 dos
bytes; ID recebido do Google não muda o comando idempotente. Prévia detecta repetição já
concluída e evita reenvio. Resposta final perdida conserva arquivo que pode já estar vinculado,
retorna pendência e permite conferir. Nenhuma exclusão compensatória automática permanece,
mesmo após recusa confirmada; conteúdo preexistente e eventualmente comprometido é preservado.

ESP-02: raiz administrada continua inalterada. `cadastro.documento_pasta` guarda reserva privada
por `(paciente_id, raiz)` com ID Drive único e marcador opaco. RLS forçada, sem grants de tabela
aos papéis PostgREST; única RPC acessível exige duas provas assinadas e reexecuta pré-autorização
vigente do comando original, auditando na mesma transação da reserva. Candidatas concorrentes
retornam mesmo ID/marcador, sem transação DB aberta durante I/O Google.

Google [suporta IDs pré-gerados para folders](https://developers.google.com/workspace/drive/api/guides/create-file).
Adapter chama `files.generateIds`, reserva ID no banco, consulta esse ID exato e só cria se 404.
Timeout/retry e 409 recuperam mesmo ID; antes do upload confere ID, MIME de pasta, parent raiz,
`appProperties.ffcm_paciente` e `trashed=false`. Nenhuma adoção por nome ou deduplicação por
listagem. Título é `caso-<marcador opaco>` e arquivo novo recebe UUID do documento; nome original
permanece no conteúdo cifrado. Reserva existente preserva marcador mesmo com rotação HMAC.
Nenhuma pasta/arquivo antigo é importado, movido ou excluído; nenhuma ACL é escrita.
Prova real Google e concorrência SQL simultânea continuam adiadas, não presumidas.

ESP-03: edição inline nativa (`details`/`form`) só na superfície da equipe; labels, status e
bloqueio de submissão repetida preservam padrões existentes. Metadados mudam por nova versão,
sem alterar arquivo. Servidor consulta versão autorizada e preserva o `drive_file_id` dessa
versão; divergência do ID enviado é entrada inválida, criação sem arquivo é recusada. RPC final
confere a versão novamente. Comando e chave idempotente ficam na memória enquanto resultado estiver
incerto; campos ficam bloqueados, conferir consulta versão atual e replay usa mesmos dados.
Dados não são persistidos em armazenamento do navegador. Família não recebe editor e servidor
continua responsável por recusar escrita. Validação visual/teclado/celular foi adiada.

Ameaças delimitadas deste recorte: profissional tenta caso alheio ou revogado (impacto alto,
gate SQL em prévia e final); família tenta escrita direta (gate de operação/papel); auditoria
indisponível (exceção impede sucesso/prévia); timeout final induz remoção de arquivo válido
(preservar em incerteza); nomes externos revelam conteúdo clínico (títulos opacos); ACL externa
continua somente detecção/revisão, sem mudança automática. Fronteiras navegador/BFF,
BFF/RPC/Vault e BFF/Drive já descritas acima. Hipóteses do briefing permanecem: somente dados
fictícios, sem chamadas Google, credenciais, migração remota ou ativação nesta passagem.
Nenhuma hipótese material nova foi promovida a controle comprovado.
