# Histórico de saúde, avaliações e diagnósticos ou hipóteses (FR-004)

## Por quê

FR-004 estava inteiramente ausente: não havia tabela, operação, rota nem tela. A ficha
do paciente guardava anamnese e plano, mas nada registrava histórico de saúde,
avaliações e diagnósticos — nem a distinção entre diagnóstico e hipótese, nem a origem
de cada informação. Sem isso, a coordenação não tem onde registrar o que já foi apurado
sobre a saúde do paciente, e um relato de quem convive acabaria indistinguível de um
parecer profissional assim que entrasse no sistema.

## O que muda

- Nova tabela imutável versionada `cadastro.saude_versao`, com o conteúdo clínico apenas
  dentro do envelope AEAD. Nenhuma coluna legível carrega descrição, origem ou situação.
- Nova operação `api.saude_operacao_privada(jsonb)` sob owner dedicado
  `ffcmapp_saude_owner`, com atestado HMAC, revalidação de autorização sob trava,
  idempotência por `operacao.requisicao` e auditoria obrigatória em todos os caminhos.
- Rota HTTP `GET`/`PATCH /api/pacientes/:paciente_id/saude` atrás da flag
  `FFCM_SAUDE_ATIVADA`, desligada por padrão.
- Nova seção da ficha com a origem e a situação visíveis em cada registro.

## Fora de escopo

- **FR-020 (plano de crise)** permanece bloqueado: o requisito exige aprovação do
  "profissional habilitado" e o conceito de habilitação não existe no sistema. Ver
  `design.md`, seção "Bloqueio de negócio: FR-020".
- Histórico paginado de versões anteriores da saúde (o modelo já é versionado; falta a
  consulta). Não é exigido pelo FR-004.
- Qualquer regra clínica sobre quais combinações de natureza e situação são válidas. O
  contrato preserva o que foi informado; validação clínica é do profissional.
