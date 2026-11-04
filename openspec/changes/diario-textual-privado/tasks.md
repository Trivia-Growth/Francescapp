# Tasks

## 1. Estrutura local fechada

- [ ] 1.1 Preparar tabela de rascunho cifrado, sem grants ou políticas de aplicação, com RLS forçada; FR-008/012. Dependência: proposta e design. Evidência: teste SQL direto de privilégios e isolamento, inclusive papéis privilegiados aplicáveis.
- [ ] 1.2 Revisar diff e comprovar testes locais; dependência 1.1. Evidência: comandos e limitações registrados; sem declarar jornada conectada.

- [ ] 1.3 Preparar AAD de cifra para paciente, autor, rascunho e versão; evidência: teste isolado de cifra passou com conteúdo fictício e rejeitou substituição de cada identificador e versão. Revisão independente pendente.

## Evidência parcial

Teste SQL isolado passou em PostgreSQL temporário: RLS forçada, ausência de políticas e de privilégios explícitos para anon/authenticated/service_role. Revisão independente não identificou bypass concreto no recorte fechado; observou que o teste verifica metadados em fundação simulada, sem provar acesso direto na fundação real, grants herdados, revogação ou caminhos privilegiados. Envelope é validado apenas quanto ao formato, sem prova de cifra. Docker indisponível; fundação Supabase completa e caminhos privilegiados não foram verificados. A revisão da fatia integrada segue pendente.

## Limites

Sessão familiar, operações, audiência, crise, publicação e retificação permanecem pendentes. Ativação depende de testes positivos e negativos de autorização, revogação, acesso direto e caminhos privilegiados, além de revisão de segurança independente.
