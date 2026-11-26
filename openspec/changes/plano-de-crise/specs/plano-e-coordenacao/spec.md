## MODIFIED Requirements

### Requirement: FR-020 — Registrar plano de crise aprovado pelo profissional habilitado, com responsáveis

Fase: Inicial. Registrar plano de crise aprovado pelo profissional habilitado, com
responsáveis, contatos, limites do serviço e data de revisão. O diário SHALL informar
que não garante resposta imediata; a case manager não emite conduta clínica por assumir
a coordenação. Conforme DF-021, aprovação SHALL exigir habilitação explícita na
concessão vigente **e** ser o case manager atual daquele caso. Administrador e
Profissional podem receber habilitação; perfil isolado não concede alçada nem acesso.

#### Scenario: Condição de aceite FR-020

- **WHEN** a funcionalidade FR-020 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Registrar plano de crise aprovado pelo profissional habilitado, com responsáveis, contatos, limites do serviço e data de revisão. O diário deve informar que não garante resposta imediata; a case manager não emite conduta clínica por assumir a coordenação.

#### Scenario: Case manager atual habilitado aprova

- **WHEN** case manager atual com perfil Administrador ou Profissional, acesso vigente
  e habilitação explícita aprova a versão atual
- **THEN** sistema SHALL registrar carimbo imutável preso à versão e à concessão

#### Scenario: Habilitado fora do caso tenta aprovar por acesso direto

- **WHEN** ator habilitado que não é responsável atual chama aprovação diretamente
- **THEN** sistema SHALL negar sem carimbo, inclusive para Administrador

#### Scenario: Troca ou revogação preserva histórico e impede novo ato

- **WHEN** responsável muda, é removido ou perde habilitação/acesso antes de nova tentativa
- **THEN** sistema SHALL negar inclusive replay e preservar carimbos históricos
