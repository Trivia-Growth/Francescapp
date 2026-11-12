# Proposal

## Why

A avaliação de 11/11/2026 comparou quatro ferramentas de mercado (Cuidador Legal, Home Care Flow, ZelaApp e Clicare) com os 54 requisitos de referência do FFCMApp. Dez funcionalidades já são requisito aqui; a lacuna real é a execução do cuidado em turno: não existe no projeto nenhum conceito de plantão, escala, sinal vital estruturado ou medicação administrada. Sem isso, o acompanhamento de um caso com enfermagem contínua permanece em texto livre, sem passagem de turno verificável, sem série temporal de aferição e sem responsável identificado por ato executado.

## What Changes

- Criar a capacidade `turno-e-execucao`, com FR-055 a FR-063, fase de origem Evolução.
- Registrar turno com abertura e encerramento pelo profissional autenticado, vinculado ao caso, com instante determinado pelo servidor.
- Planejar escala de turnos, substituição e cobertura de ausência, preservando motivo, autor e turno originalmente previsto.
- Exigir síntese de passagem no encerramento do turno e apresentar a passagem pendente de ciência ao turno seguinte.
- Registrar sinais vitais como medidas estruturadas (tipo, valor, unidade, instante da aferição, autor), sem interpretação clínica automática e sem classificação de gravidade pelo sistema.
- Registrar itens de medicação prescrita e seus horários previstos, com fonte documental e autor de perfil habilitado.
- Registrar administração de medicação referenciando um item prescrito, distinguindo o **executor** — quem administrou, identificado, podendo ser profissional externo sem conta no sistema — do **registrador** — quem gravou, autenticado e de perfil habilitado, verificado no servidor e no banco. O registro guarda instante do servidor e situação (administrado, recusado, adiado, não administrado) com motivo.
- Registrar ocorrência vinculada ao turno aberto, com providência tomada, reaproveitando a conversão em ação já prevista em FR-014.
- Produzir relatório de turno e consolidado diário respeitando a audiência de FR-036 e a exportação de FR-032. A audiência familiar alcança todo o conteúdo do turno — passagem, ocorrências, sinais vitais e medicação administrada — condicionada ao fundamento de autorização registrado para o caso (FR-038) e revogável (FR-037).
- Condicionar abertura de turno e leitura de seus registros a vínculo ativo com o caso, encerrando a capacidade na revogação (FR-037) e auditando os eventos conforme FR-039.
- Ajustar `diario-e-evolucao`: FR-009 passa a admitir modelo de passagem de turno entre os modelos por área; FR-013 passa a distinguir ciência registrada de simples consulta.
- Sinalização ao familiar permanece dentro do sistema, reaproveitando pendências e sinalizações de FR-027/FR-028. Push, e-mail de notificação e WhatsApp ficam fora deste recorte.

### Exclusões deste recorte

- Prescrição, alteração de dose, suspensão de medicamento ou qualquer decisão clínica pelo sistema. O produto registra o que foi executado a partir de prescrição externa já existente; não a produz nem a modifica.
- Leitura automática de gravidade a partir de sinal vital, alerta clínico calculado e predição de risco.
- Orçamento, repasse por profissional, folha e contabilidade (permanecem fora do escopo do produto).
- Garantia de monitoramento ou resposta de emergência em tempo real.
- Notificação externa (push, e-mail, WhatsApp).

### Decisões aplicadas

Todas confirmadas pelo solicitante em 11/11/2026.

- Medicação administrada **entra** no escopo, restrita a perfil habilitado, com responsável identificado e auditoria.
- Sinalização a familiares fica somente dentro do sistema.
- A especificação é produzida agora; a implementação depende da fatia 1 (identidade, perfis e vínculo de caso) estar concluída e verificada.
- **Perfis habilitados** a registrar medicação prescrita e administrada: Administrador e o grupo de case managers da equipe da Edilaine. A habilitação é uma concessão administrada no produto, conferida no servidor e no banco.
- **Autoria da administração**: executor e registrador são campos distintos. O executor é quem administrou, identificado por nome e vínculo, e pode ser profissional externo sem conta no sistema. O registrador é quem gravou, autenticado e com a concessão acima. O relatório apresenta os dois.
- **Tipos de sinal vital**: padrões da medicina, como conjunto configurável — pressão arterial sistólica e diastólica (mmHg), frequência cardíaca (bpm), frequência respiratória (irpm), temperatura (°C), saturação de oxigênio (%), glicemia capilar (mg/dL) e dor em escala de 0 a 10. Faixa de referência é exibida como informação, sem rótulo de gravidade.
- **Parâmetros de turno** — duração padrão, tolerância de atraso na abertura e tratamento de turno não encerrado — são configuração administrada, não valor fixo em código.
- **Audiência familiar**: a família vê todo o conteúdo do turno, incluindo passagem com anotações e acontecimentos, sinais vitais e medicação administrada.
- **Evidência de habilitação profissional não é exigida**: a concessão de execução de medicação é o único controle para registrar. O produto não coleta, valida nem armazena registro de conselho profissional, e o executor informado em FR-060 permanece dado declarado, não verificado.

### Pendências que não podem ser inferidas

- A fatia 1 (identidade, perfis, concessões e vínculo de caso) permanece em desenvolvimento em 11/11/2026. Este recorte não inicia enquanto suas evidências de autorização não existirem.
- Como o executor externo é identificado e selecionado no registro — lista administrada de profissionais da enfermagem ou texto conferido — permanece em aberto (ver `design.md — Open Questions`).
- A decisão de audiência familiar ampla precisa ser exercida junto com o fundamento de autorização do caso (FR-038). Georgia é adulta: o acesso familiar ao seu conteúdo de saúde depende do fundamento registrado e permanece revogável, não decorre do parentesco.

## Capabilities

### New Capabilities

- `turno-e-execucao`: execução do cuidado em turno — abertura e encerramento de plantão, escala e substituição, passagem de turno, sinais vitais estruturados, medicação prescrita e administrada, ocorrência de turno, relatório de turno e autorização/auditoria próprias dessa execução.

### Modified Capabilities

- `diario-e-evolucao`: FR-009 admite modelo de passagem de turno entre os modelos por área; FR-013 distingue ciência registrada de consulta.

## Impact

Alterações futuras em contratos de API, autorização no servidor, esquema e políticas RLS no Supabase, e interface. Introduz dados de saúde de sensibilidade alta (aferição e medicação), o que reforça as exigências de FR-042 (proteção de dados identificáveis e de saúde) e FR-039 (auditoria de consulta, alteração e exportação).

Depende da fundação de identidade, perfis, concessões e vínculo de caso, cujas evidências devem ser verificadas no momento da implementação. Esta proposta não autoriza deploy, migração remota, concessão de acesso, uso de dados reais ou qualquer operação externa.
