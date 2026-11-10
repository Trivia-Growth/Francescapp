# Proposal

## Why

A interface conectada mostra uma tabela de pacientes com cinco botões por linha; não há uma ficha que reúna o caso, e o mock arquivado (referência provisória) mostra pessoas em linhas com situação e uma ficha com abas e visão do caso. FR-006/007 e a parte de cadastro de FR-001/002 ainda não têm jornada conectada. O solicitante pediu priorizar a parte do paciente: ficha e visão do caso primeiro, depois cadastro completo, depois registros e relatórios.

## What Changes

**Fatos observados em 08/11/2026** (prévia publicada, código e mock):

- A prévia lista pacientes (nome, preferência) e abre cada função em painel próprio: anamnese, plano, vínculos, edição e contato. O cadastro cria nome, preferência e nascimento; contatos são e-mail e telefone.
- Estão conectados e com testes: cadastro, edição, contato, anamnese, objetivos e tarefas por paciente. Há um resumo conectado de objetivos e tarefas (`web/resumo-conectado.ts`).
- Relações de pessoas (`pessoa_relacionada`, `relacao_paciente`) têm tabelas e contrato de rotas, sem handler ou tela observados. Situação do caso e case manager não existem no modelo. Diário tem apenas tabela de rascunho cifrado e contrato de campos, sem acesso de aplicação.
- `web/demonstracao.*` é prévia local fictícia, fora do sistema conectado. Resumo, linha do tempo, encaminhamentos e orientações existem só ali, com dados locais.

**Decisões do solicitante (08/11/2026):** ordem ficha e visão do caso, depois cadastro completo; o mock é base, adaptada a celular e à marca FFCMApp (não cópia fiel); "relatórios" inclui síntese/evolução profissional, exportação e resumo para reunião.

**Decisões do solicitante sobre o cadastro (08/11/2026):**

- O Administrador altera a situação do caso e define o case manager entre usuários ativos com perfil Administrador ou Profissional.
- O cadastro de caso novo exige todos os campos: nome, nome de preferência, nascimento, ao menos um contato, situação e case manager, sem valor padrão. Isso substitui, para casos novos, o cadastro mínimo DF-019 de 16/10/2026. O cadastro mínimo atual segue valendo até a entrega 2 e os casos já existentes continuam consultáveis, com os campos ausentes indicados como "a completar".
- A leitura de cada seção da ficha segue o acesso que o Administrador configura por concessão. Não há editor de permissão por seção neste recorte.

**Escopo planejado**

- **Entrega 1 — ficha e visão do caso:** lista de pessoas acompanhadas e ficha por paciente com navegação por abas, reunindo somente o que serviços autorizados retornam (identificação, contatos, anamnese, objetivos, tarefas). Seções sem fonte conectada aparecem como indisponíveis, nunca com dados de exemplo. Layout prioriza celular, foco visível e teclado.
- **Entrega 2 — cadastro completo:** cadastro de caso novo com todos os campos obrigatórios, situação do caso (entrada, ativo, pausado, encerrado, transferido) com data e motivo, case manager responsável e mapa de pessoas com vínculos distintos, sem somar permissões. Exige migration e rotas novas, com autorização no servidor e banco e provas positivas e negativas. O cadastro mínimo atual não muda na entrega 1.
- **Entrega 3 — registros e relatórios:** registrada como limite futuro, sem tarefas executáveis, pelas decisões materiais abertas abaixo.
- Excluídos: áudio, anexos no Drive, agenda Google, FR-044, FR-021/022, ficha para familiares, dados reais, deploy e migração remota. Nada aqui concede acesso, altera identidade ou promove evolução a compromisso.

**Pendências materiais (não inferidas):** substituição temporária de case manager (FR-037); se paciente e profissional entram como vínculo do mapa; se a idade aparece na lista; modelos de síntese por área (FR-009); formato, destinatário e propósito da exportação (FR-032); conteúdo do resumo para reunião; instruções de crise antes de depender do diário. A fatia depende de S-02 e da concessão de equipe para provar perfil profissional.

## Capabilities

### New Capabilities

- `ficha-do-paciente`: estrutura da ficha e da lista de pessoas, composição honesta da visão do caso, estados de carregamento, vazio, erro, indisponível e sucesso, e uso no celular. Apoia FR-006/007 sem criar requisito clínico.

### Modified Capabilities

- `caso-e-anamnese`: cenários de FR-001 (situação do caso com data e motivo, case manager) e novo requisito de cadastro completo de caso novo, que substitui DF-019 para casos novos; FR-002 (mapa de pessoas sem soma de permissões) e FR-006 (resumo com o que já tem fonte conectada). FR-007 (linha do tempo) fica para a entrega 3, pois depende de registros.

## Impact

Interface em `web/` (estrutura, estilos, navegação e montagem por paciente, reaproveitando os serviços atuais), contratos em `packages/contracts/`, e, na entrega 2, migration, RPCs privadas, handlers e auditoria no Supabase/Netlify. Guias: `DESIGN.md`, `PRODUCT.md` e a skill Impeccable no trabalho visual. Depende da fundação de identidade e autorização cujas provas reais estão pendentes (S-02). Nenhuma operação remota está autorizada por esta proposta.
