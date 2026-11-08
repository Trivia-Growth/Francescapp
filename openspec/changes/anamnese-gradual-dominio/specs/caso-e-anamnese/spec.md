# Spec Delta

## ADDED Requirements

### Requirement: Identificação parcial de pendências da anamnese

Para apoiar FR-003 (fase Inicial), o domínio SHALL identificar campos esperados sem resposta ou com estado pendente, agrupados por seção fornecida. A identificação não SHALL declarar completude clínica nem substituir FR-003 integral.

#### Scenario: Campo ausente ou pendente

- **WHEN** uma seção fornecida contiver campo esperado sem resposta ou com estado pendente
- **THEN** o resultado identifica a seção e distingue os campos ausentes dos pendentes.

#### Scenario: Informação desconhecida ou não aplicável

- **WHEN** campo esperado tiver resposta desconhecida ou não aplicável
- **THEN** o resultado não o identifica como ausente ou pendente, sem inferir informação clínica.

#### Scenario: Proveniência de resposta resolvida

- **WHEN** uma resposta informada, desconhecida ou não aplicável for representada no domínio
- **THEN** sua fonte e data permanecem associadas à resposta; informação relatada não se torna diagnóstico confirmado por essa representação.

### Requirement: Acesso provisório da equipe à anamnese

Até definição da FFCM, o sistema SHALL permitir consulta e edição da anamnese a colaboradores ativos com concessão de equipe vigente, sem exigir vínculo individual por paciente. A relação familiar ou permissão de agenda não SHALL conceder acesso por inferência. A autorização SHALL ser revalidada no servidor e no banco, inclusive após revogação.

#### Scenario: Colaborador autorizado

- **WHEN** colaborador ativo com concessão e sessão vigentes consulta ou edita anamnese
- **THEN** a operação é autorizada mesmo sem vínculo individual com o paciente.

#### Scenario: Acesso negado ou revogado

- **WHEN** familiar, usuário inativo, sessão encerrada ou concessão revogada tenta consultar ou editar
- **THEN** a operação é negada também no acesso direto ao banco.

### Requirement: Consulta do histórico de anamnese

O sistema SHALL permitir a colaborador autorizado consultar versões anteriores da anamnese de um paciente, preservando a proveniência e os controles de acesso e auditoria da leitura atual.

#### Scenario: Navegação entre versões

- **WHEN** colaborador autorizado solicita histórico
- **THEN** recebe versões em ordem decrescente, uma por página, sem sobrescrever a versão atual.

#### Scenario: Acesso revogado

- **WHEN** sessão ou concessão é revogada antes de uma página
- **THEN** a consulta é negada e nenhuma versão é retornada.
