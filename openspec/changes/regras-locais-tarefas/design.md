# Design

## Capability de escrita por caso — retomada local de 18/11/2026

A interface mantinha escrita fixamente indisponível apesar do ciclo e HTTP já
existentes. GET de disponibilidade por paciente combina autorização vigente e as
três flags de tarefas, escrita e barreira. O resultado só informa os controles;
POST/barreira continuam autorizando cada operação no servidor e banco.

Reuso com minimização: `autorizacao_somente:true` estende apenas a leitura da RPC
existente, depois das guardas Auth/vínculo/locks e com auditoria transacional. Essa
modalidade devolve array vazio sem consultar ou decifrar tarefas; não se lê a lista
clínica inteira para obter um booleano. A migration `20261125110000` preserva
assinatura/owner/ACL e listagem anterior; flag malformada ou uso fora da ação de
leitura é recusado. Sem migration, disponibilidade falha fechada.

Ameaças: perfil/caso indevido exige negativa no banco; resposta tardia de outro
caso/sessão é descartada na interface; mudança posterior à capability não autoriza
a gravação, que refaz as barreiras. **SUPOSIÇÃO CONSERVADORA:** disponibilidade é
somente informativa, com padrão falso e sem exceção para Administrador. Provas
positivas/negativas, minimização sem SELECT clínico, instalação NOSUPER, revisão e
integração real foram preparadas, não executadas nesta retomada.

## Context

FR-017 é referência funcional, não evidência de implementação. Há uma demonstração local existente em `web/demonstracao.html` e `web/demonstracao.ts`; o projeto também mantém regras de domínio em pacotes próprios. Ver proposta e delta para o recorte.

## Goals / Non-Goals

**Goals:** Isolar regras confirmadas de conclusão e estados para exercício local com exemplos fictícios.

**Non-Goals:** Persistência, integração, autorização, classificação de prioridade ou uso com dados reais.

## Decisions

- Usar regras puras e prévia local, aproveitando padrões existentes. Alternativa conectada dependeria de autorização por caso e decisões materiais ainda não definidas.
- Preservar ação ou justificativa na conclusão; rejeitar valores vazios. Não especificar transições adicionais nem níveis de prioridade, pois não foram confirmados.
- Não inferir autorização de identidade, vínculo, audiência ou agenda a partir da demonstração. A integração futura exige desenho e provas próprios.

## Risks / Trade-offs

- [Prévia confundida com produto conectado] → Identificação visível de dados fictícios e ausência de persistência.
- [Regras locais confundidas com FR-017 completo] → Manter requisito integral e pendências explícitos; não declarar aceitação completa.

## Decisão de 04/11/2026: tarefa conectada

O solicitante definiu prioridades baixa, média e alta e restringiu criação e acompanhamento a profissionais vinculados ao paciente. Esta decisão substitui o limite de prévia como objetivo da mudança; não autoriza ativação ou dados reais. Família não integra esta fatia.

A fundação possui `cadastro.acesso_paciente`, que relaciona usuário e paciente e registra revogação. Seu uso nesta fatia exige verificar perfil profissional, usuário e concessão ativos, além de vínculo não revogado, no servidor e banco; plano e anamnese usam provisoriamente outra regra. Não tratar concessão geral de equipe como prova de vínculo. É necessário definir quem administra o vínculo e como ele é concedido e revogado antes de disponibilizar operações.

A tarefa e sua conclusão podem conter dados sensíveis: proteger conteúdo com cifra autenticada, auditar operações, negar em caso de falha e manter autorização desligada até revisão e provas. Provas necessárias incluem profissional vinculado e não vinculado, outro paciente, família, revogação, acesso direto e concorrência; execução de testes não autorizada nesta etapa.
