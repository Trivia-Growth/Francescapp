# Spec Delta

## MODIFIED Requirements

### Requirement: FR-010 — Transcrever áudio em português para rascunho editável, permitir ouvir o

**Fase de origem**: Inicial.

O produto SHALL atender à condição de negócio preservada abaixo, respeitando sua fase e as decisões pendentes.

Transcrever áudio em português para rascunho editável, permitir ouvir o original e revisar texto e audiência antes de publicar. Não transcrever sessões completas por padrão. Deve haver alternativa por texto.

#### Scenario: Condição de aceite FR-010

- **WHEN** a funcionalidade FR-010 for exercida no contexto e com as autorizações descritos no requisito
- **THEN** o comportamento observado SHALL satisfazer integralmente a condição de aceite: Transcrever áudio em português para rascunho editável, permitir ouvir o original e revisar texto e audiência antes de publicar. Não transcrever sessões completas por padrão. Deve haver alternativa por texto.

#### Scenario: Rascunho automático ainda não revisado
- **WHEN** o autor autorizado gerar ou salvar uma transcrição automática ainda sem confirmação humana
- **THEN** o sistema SHALL permitir ouvir o original e editar o texto e MUST NOT tratar o rascunho como revisão concluída, publicação ou motivo de exclusão por revisão.

#### Scenario: Revisão humana confirmada
- **WHEN** o autor confirmar a revisão e o texto revisado for salvo
- **THEN** o sistema SHALL solicitar a exclusão do original sob seu controle, preservando texto revisado, autoria e evidência da revisão; a audiência continua sujeita à revisão antes da publicação no diário.

#### Scenario: Exclusão ainda não confirmada
- **WHEN** a exclusão do original após revisão não puder ser confirmada
- **THEN** o sistema SHALL preservar o texto salvo e apresentar a pendência ou falha com ação de regularização, sem informar descarte concluído.

#### Scenario: Repetição da exclusão
- **WHEN** uma exclusão já confirmada for repetida para o mesmo áudio
- **THEN** o sistema SHALL manter o resultado identificável sem apagar outro áudio, duplicar a revisão ou publicar o relato.

#### Scenario: Alternativa por texto
- **WHEN** o microfone não estiver disponível, sua permissão for negada ou a transcrição falhar
- **THEN** o sistema SHALL manter disponível a alternativa de relato por texto, sem exigir gravação.

#### Scenario: Áudio abandonado
- **WHEN** um áudio permanecer abandonado sem revisão humana
- **THEN** o sistema SHALL aplicar o prazo aprovado de 30 dias com aviso; política do processador e limites de eliminação fora do controle da aplicação continuam condicionantes antes do uso real.

#### Scenario: Autorização antes do envio ao provedor
- **WHEN** uma pessoa sem autorização vigente para o caso, inclusive após revogação, tentar transcrever ou consultar um áudio
- **THEN** o sistema SHALL negar a operação sem expor o original ou enviar áudio ao provedor externo.

#### Scenario: Original de outro autor
- **WHEN** um profissional vinculado ao caso tentar ouvir o áudio de outro autor
- **THEN** o sistema SHALL negar acesso ao original; vínculo com o caso não concede acesso à gravação alheia.
