# Proposal

## Why

A conversão FR-014 existe como porta opcional no Diário, mas não está conectada: criar tarefa e depois evolução em chamadas separadas pode deixar gravação parcial. Fechar essa ligação permite transformar relato ou evolução em ação atribuída, preservando a sinalização humana e os controles existentes de Tarefas.

## What Changes

- Uma operação transacional cria tarefa e evolução interna de atenção; falha em qualquer gravação desfaz ambas. O registro original permanece intacto.
- Consulta autorizada por origem e recibo persistido permitem recuperar resposta perdida sem duplicar a conversão.
- Formulário explícito de motivo, data da atenção, encaminhamento, responsável, prazo, prioridade e área configurada, sem copiar texto clínico da origem automaticamente.
- Reutilizar autorização, cifra, atestação e barreira de Tarefas/Diário; manter negativas no servidor e banco. Flag própria começa desligada.
- **SUPOSIÇÕES CONSERVADORAS — autonomia noturna:** uma conversão por registro de origem; somente Profissional Google com vínculo ativo; evolução resultante restrita à equipe, sem constituir retorno à família. Novas ações independentes continuam disponíveis em Tarefas. São escolhas registradas, não decisões clínicas ratificadas.
- Validações executáveis ficam adiadas por instrução posterior do solicitante; escrever provas positivas e negativas, sem alegar execução ou ativação.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `diario-e-evolucao`: detalhar FR-014 (fase Inicial) com atomicidade, rastreabilidade humana, recuperação, conservação da audiência e autorização por caso.

## Impact

`web/diario.ts`, composição em `web/main.ts`, cliente HTTP e formulário; contratos compartilhados; funções Netlify e preparação dos transportes nativos de Diário/Tarefas; migration PostgreSQL aditiva com ledger operacional e RPC atômica; testes locais e SQL diretos. Não iniciar grupo 3 de Turno, financeiro, PWA, migração Edge, alteração de permissões do Drive ou registro de credenciais. Publicação, autenticação e 503 continuam bloqueios separados, registrados no relatório existente.
