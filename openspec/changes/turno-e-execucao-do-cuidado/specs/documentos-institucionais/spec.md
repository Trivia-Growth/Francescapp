# Spec Delta

## MODIFIED Requirements

### Requirement: FR-030 — Guardar anexos no Google Drive institucional administrado pela Francescato, em

**Fase de origem**: Inicial.

Guardar anexos no Google Drive institucional administrado pela Francescato, em organização vinculada ao caso. A pessoa que envia deve classificar o anexo e confirmar sua audiência antes de concluir.

Por decisão de 17/11/2026, os anexos de execução de turno — hoje a foto da ocorrência de FR-061 — SHALL ser guardados em repositório privado do Supabase, sujeito à mesma autorização do caso, enquanto o identificador, a raiz e a organização do Drive institucional não estiverem definidos. Esse destino SHALL ser temporário e registrado como tal: o anexo SHALL preservar classificação, audiência, caso e autor de forma que a migração posterior para o Drive seja cópia de arquivo, sem redefinir o modelo de autorização. Os demais anexos SHALL permanecer no Drive institucional conforme a condição original.

#### Scenario: Condição de aceite FR-030

- **WHEN** a funcionalidade FR-030 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Guardar anexos no Google Drive institucional administrado pela Francescato, em organização vinculada ao caso. A pessoa que envia deve classificar o anexo e confirmar sua audiência antes de concluir.

#### Scenario: Anexo de turno guardado no repositório privado
- **WHEN** profissional com turno aberto anexa foto a uma ocorrência fictícia
- **THEN** o arquivo é guardado em repositório privado do Supabase vinculado ao caso, com classificação, audiência e autor preservados, e a origem temporária fica registrada no próprio anexo

#### Scenario: Anexo de turno não é público
- **WHEN** alguém tenta obter o arquivo por endereço direto, sem autorização vigente no caso
- **THEN** o acesso é negado, nenhuma URL pública ou assinada de longa duração é emitida, e a tentativa é auditada

#### Scenario: Revogação alcança o anexo
- **WHEN** o vínculo ou o fundamento de autorização de quem consultava é revogado
- **THEN** as consultas seguintes ao arquivo são negadas imediatamente, inclusive por acesso direto, e o arquivo permanece íntegro

#### Scenario: Destino temporário não altera as demais classes de anexo
- **WHEN** um anexo que não pertence à execução de turno é enviado
- **THEN** ele segue para o Google Drive institucional conforme a condição original, sem usar o repositório temporário

### Requirement: FR-032 — Oferecer exportação autorizada por caso ou período de registros, plano

**Fase de origem**: Inicial.

Oferecer exportação autorizada por caso ou período de registros, plano, pendências e relação de anexos, identificando conteúdo indisponível e preservando autoria e datas. O destinatário e o propósito devem ser registrados.

Por decisão de 17/11/2026, a exportação SHALL admitir PDF como formato, gerado no servidor conforme FR-066, além dos formatos já existentes. A escolha do formato NÃO SHALL alterar a autorização, a audiência aplicável, o registro de destinatário e propósito nem a auditoria da exportação.

#### Scenario: Condição de aceite FR-032

- **WHEN** a funcionalidade FR-032 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Oferecer exportação autorizada por caso ou período de registros, plano, pendências e relação de anexos, identificando conteúdo indisponível e preservando autoria e datas. O destinatário e o propósito devem ser registrados.

#### Scenario: Exportação em PDF mantém os mesmos controles
- **WHEN** pessoa autorizada exporta um caso ou período em PDF
- **THEN** o conteúdo respeita a audiência aplicável, preserva autoria e datas, identifica o conteúdo indisponível, e destinatário, propósito e evento de exportação são registrados como nos demais formatos

#### Scenario: Formato não amplia audiência
- **WHEN** a mesma exportação é solicitada em PDF por pessoa cuja audiência é limitada
- **THEN** o PDF contém exatamente o conteúdo da sua audiência, sem indicar o teor do que foi omitido
