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
- Registrar administração de medicação referenciando um item prescrito, distinguindo o **executor** — quem administrou, identificado, podendo ser profissional externo sem conta no sistema — do **registrador** — quem gravou, autenticado, profissional com vínculo ativo no caso, verificado no servidor e no banco (decisão de 17/11/2026, que substitui a restrição a Administrador e case managers). O registro guarda instante do servidor e situação (administrado, recusado, adiado, não administrado) com motivo.
- Registrar ocorrência vinculada ao turno aberto, com providência tomada, reaproveitando a conversão em ação já prevista em FR-014.
- Anexar foto à ocorrência de turno, armazenada em repositório privado do Supabase com a mesma autorização do caso, enquanto a raiz do Google Drive institucional de FR-030 não estiver definida.
- Registrar a rotina do turno em campos estruturados de alimentação, hidratação, sono e eliminações (FR-064), separados do texto livre da passagem, para que o acompanhamento diário deixe de depender de leitura de prosa.
- Produzir consolidado semanal por caso (FR-065), além do relatório de turno e do consolidado diário.
- Emitir relatório de turno, consolidado diário, consolidado semanal e exportação de caso em PDF gerado no servidor (FR-066), com a mesma autorização da consulta e evento de exportação auditado.
- Registrar localização na abertura e no encerramento do turno (FR-067), como dado declarado pelo aparelho, sob consentimento prévio e revogável do profissional, visível apenas a Administrador e case manager, sem impedir o turno quando ausente.
- Produzir relatório de turno e consolidado diário respeitando a audiência de FR-036 e a exportação de FR-032. A audiência familiar alcança todo o conteúdo do turno — passagem, ocorrências, sinais vitais e medicação administrada — condicionada ao fundamento de autorização registrado para o caso (FR-038) e revogável (FR-037).
- Condicionar abertura de turno e leitura de seus registros a vínculo ativo com o caso, encerrando a capacidade na revogação (FR-037) e auditando os eventos conforme FR-039.
- Ajustar `diario-e-evolucao`: FR-009 passa a admitir modelo de passagem de turno entre os modelos por área; FR-013 passa a distinguir ciência registrada de simples consulta.
- Sinalização ao familiar permanece dentro do sistema, reaproveitando pendências e sinalizações de FR-027/FR-028. Push, e-mail de notificação e WhatsApp ficam fora deste recorte.

### Exclusões deste recorte

- Prescrição, alteração de dose, suspensão de medicamento ou qualquer decisão clínica pelo sistema. O produto registra o que foi executado a partir de prescrição externa já existente; não a produz nem a modifica.
- Leitura automática de gravidade a partir de sinal vital, alerta clínico calculado e predição de risco.
- Orçamento, repasse por profissional, despesa e comprovante. Entraram no produto por decisão de 17/11/2026, mas em mudança irmã (`financeiro-despesa-e-repasse`), que consome o turno encerrado deste recorte. Folha e contabilidade seguem fora.
- Garantia de monitoramento ou resposta de emergência em tempo real.
- Notificação externa (push, e-mail, WhatsApp). O aviso dentro do aplicativo, com indicador de não lido, é tratado na mudança irmã `pwa-e-avisos-no-app`.

### Decisões aplicadas

Confirmadas pelo solicitante em 11/11/2026, exceto onde a revisão de 17/11/2026 indicada abaixo as substitui.

- Medicação administrada **entra** no escopo, com responsável identificado e auditoria.
- Sinalização a familiares fica somente dentro do sistema.
- A especificação é produzida agora; a implementação depende da fatia 1 (identidade, perfis e vínculo de caso) estar concluída e verificada.
- ~~**Perfis habilitados** a registrar medicação prescrita e administrada: Administrador e o grupo de case managers da equipe da Edilaine.~~ **Substituído em 17/11/2026** — ver "Decisões de 17/11/2026" abaixo.
- **Autoria da administração**: executor e registrador são campos distintos. O executor é quem administrou, identificado por nome e vínculo, e pode ser profissional externo sem conta no sistema. O registrador é quem gravou, autenticado e com a concessão acima. O relatório apresenta os dois.
- **Tipos de sinal vital**: padrões da medicina, como conjunto configurável — pressão arterial sistólica e diastólica (mmHg), frequência cardíaca (bpm), frequência respiratória (irpm), temperatura (°C), saturação de oxigênio (%), glicemia capilar (mg/dL) e dor em escala de 0 a 10. Faixa de referência é exibida como informação, sem rótulo de gravidade.
- **Parâmetros de turno** — duração padrão, tolerância de atraso na abertura e tratamento de turno não encerrado — são configuração administrada, não valor fixo em código.
- **Audiência familiar**: a família vê todo o conteúdo do turno, incluindo passagem com anotações e acontecimentos, sinais vitais e medicação administrada.
- **Evidência de habilitação profissional não é exigida**: o produto não coleta, valida nem armazena registro de conselho profissional, e o executor informado em FR-060 permanece dado declarado, não verificado.

### Decisões de 17/11/2026

Confirmadas pelo solicitante nesta data. Onde conflitam com 11/11/2026, prevalecem.

- **Quem registra medicação**: qualquer profissional autenticado com vínculo ativo no caso, prescrita e administrada. Substitui a restrição a Administrador e case managers. A separação executor/registrador, a auditoria obrigatória e a negativa para perfil familiar permanecem inalteradas.

  *Consequência de segurança registrada, não um bloqueio*: o controle que restava sobre o registro de dado de saúde de alta sensibilidade passa a ser o vínculo com o caso. A verificação continua no servidor **e** no banco, e o modelo mantém a concessão como ponto de aperto — restringir de novo depois é mudar a regra da barreira, não refazer o esquema.
- **Rotina do turno em campos estruturados** (FR-064): alimentação, hidratação, sono e eliminações deixam de ser prosa dentro da passagem e viram medidas do turno, consultáveis por período como os sinais vitais.
- **Consolidado semanal** (FR-065): além do relatório de turno e do consolidado diário, o produto gera o fechamento de sete dias por caso.
- **PDF gerado no servidor** (FR-066): relatório e exportação em PDF produzidos na fronteira autorizada, com a mesma audiência da consulta e evento de exportação auditado. Não é geração no navegador nem impressão de página.
- **Foto de ocorrência em repositório privado do Supabase**, com a mesma autorização do caso, em vez de esperar a definição da raiz do Google Drive institucional (FR-030). Migrar para o Drive depois é cópia de arquivo, não troca de modelo de autorização.
- **Ciência registrada basta** como confirmação do destinatário. Não haverá assinatura com valor probatório em registro de turno ou de passagem.
- **Sem notificação externa**: o aviso vive dentro do aplicativo. Tratado na mudança irmã `pwa-e-avisos-no-app`.
- **Financeiro entra no produto**, inclusive repasse por profissional calculado a partir do turno encerrado, em mudança irmã (`financeiro-despesa-e-repasse`).
- **Check-in e check-out com localização** (FR-067): a localização é coletada na abertura e no encerramento do turno. Três condições confirmadas na mesma data:
  - permissão negada, recurso indisponível ou consentimento ausente **não impedem** o turno — registra-se a ausência com motivo;
  - a localização é visível somente a Administrador e case manager; perfil familiar não a vê em nenhuma superfície;
  - o profissional consente antes do primeiro check-in, com finalidade, audiência e data registradas, e pode revogar.

  *Consequência registrada*: coordenada de navegador é declarada, não comprovada — pode ser imprecisa, negada ou falsificada. A spec proíbe apresentá-la como prova de presença e proíbe derivar atraso ou falta dela. O dado também revela o endereço residencial da pessoa acompanhada, o que o coloca sob FR-042 junto do conteúdo de saúde.
- **Base de implementação**: a fatia 1 não será concluída antes deste recorte. A implementação parte dos mecanismos de identidade, sessão, vínculo e concessão já existentes e verificados no repositório, abrindo tarefa somente para a lacuna que o turno exigir. Isso substitui a condição de 11/11/2026 de aguardar a fatia 1 inteira.

### Pendências que não podem ser inferidas

- ~~A fatia 1 precisa estar concluída antes deste recorte.~~ **Resolvido em 17/11/2026**: parte-se do que já existe e está verificado, com tarefa própria de auditoria da base de autorização antes da primeira escrita de turno.
- A implementação está **suspensa por decisão do solicitante** até o encerramento de uma frente de ajuste de frontend em andamento. Este pacote é planejamento; nenhuma tarefa executa antes da liberação explícita.
- Os campos exatos de FR-064 — quais refeições, qual escala de aceitação, se eliminações entram como contagem ou descrição — são proposta deste pacote e precisam de confirmação antes da tarefa de contrato.
- **Por quanto tempo a localização de FR-067 fica guardada** não foi definido. Dado pessoal do profissional sem prazo de retenção declarado contraria FR-040 e FR-042. Precisa de resposta antes da tarefa de persistência da localização; o restante de FR-067 não depende disso.
- Se a localização passa a ser exigida pela Francescato como condição de trabalho, isso é decisão trabalhista do solicitante, não do produto. A spec mantém o turno funcionando sem ela.
- Como o executor externo é identificado e selecionado no registro — lista administrada de profissionais da enfermagem ou texto conferido — permanece em aberto (ver `design.md — Open Questions`).
- A decisão de audiência familiar ampla precisa ser exercida junto com o fundamento de autorização do caso (FR-038). Georgia é adulta: o acesso familiar ao seu conteúdo de saúde depende do fundamento registrado e permanece revogável, não decorre do parentesco.

## Capabilities

### New Capabilities

- `turno-e-execucao`: execução do cuidado em turno — abertura e encerramento de plantão, escala e substituição, passagem de turno, sinais vitais estruturados, medicação prescrita e administrada, ocorrência de turno, relatório de turno e autorização/auditoria próprias dessa execução.

### Modified Capabilities

- `diario-e-evolucao`: FR-009 admite modelo de passagem de turno entre os modelos por área; FR-013 distingue ciência registrada de consulta.
- `documentos-institucionais`: FR-030 passa a admitir repositório privado do Supabase como destino dos anexos de execução de turno enquanto a raiz do Drive institucional não estiver definida, sem alterar o destino dos demais anexos; FR-032 passa a admitir PDF como formato de exportação autorizada.

## Impact

Alterações futuras em contratos de API, autorização no servidor, esquema e políticas RLS no Supabase, e interface. Introduz dados de saúde de sensibilidade alta (aferição e medicação), o que reforça as exigências de FR-042 (proteção de dados identificáveis e de saúde) e FR-039 (auditoria de consulta, alteração e exportação).

Depende da fundação de identidade, perfis, concessões e vínculo de caso, cujas evidências devem ser verificadas no momento da implementação. Esta proposta não autoriza deploy, migração remota, concessão de acesso, uso de dados reais ou qualquer operação externa.
