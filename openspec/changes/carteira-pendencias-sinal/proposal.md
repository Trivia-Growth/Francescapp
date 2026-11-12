# Carteira filtrável, pendências e sinal operacional (FR-026, FR-027, FR-028, FR-006)

## Por quê

Quatro requisitos sobre a visão do coordenador estavam ausentes ou pela metade:

- **FR-026** pedia carteira filtrável por responsável, situação, revisão e pendências. O
  que existia era uma busca por nome feita no cliente, dentro da página já carregada — a
  própria tela avisava ao usuário que "a busca vale só para os pacientes desta página".
  Isso nunca foi um filtro de carteira: quem tem 80 casos não encontra o caso parado.
- **FR-027** pedia pendências por atraso, ausência de atualização e revisão próxima, com
  periodicidades acordadas por caso, e a possibilidade de reconhecer, atribuir e resolver
  sem apagar a origem. Não existia uma linha disso.
- **FR-028** pedia que situação operacional não se confundisse com sinalização clínica.
  Existia só no mockup, como cor.
- **FR-006** pedia resumo do caso com pendências, próxima revisão e mudanças recentes. A
  tela tinha uma seção inteira dizendo ao usuário que essas três coisas estavam
  "indisponíveis nesta versão".

## O que muda

- Duas tabelas novas: `cadastro.acordo_acompanhamento` (a periodicidade acordada caso a
  caso, imutável e versionada) e `cadastro.pendencia_tratativa` (reconhecer, atribuir,
  resolver e reabrir, append-only).
- Um derivador único, `cadastro.sinal_operacional_caso(uuid)`, sob owner dedicado
  `ffcmapp_sinal_operacional_owner`. Pendência não é linha gravada por um gerador: é
  derivada da origem a cada leitura, o que elimina a classe inteira de bugs de
  sincronização entre o alerta e o fato que o causou.
- Nova operação `api.pendencia_operacao_privada(jsonb)` sob `ffcmapp_pendencia_owner`,
  com atestado HMAC, revalidação sob trava, idempotência e auditoria obrigatória.
- `identidade.listar_carteira_privada` passa a aceitar `filtros` e a devolver `sinal` por
  item, sempre com motivo visível.
- Rotas `GET/PUT/POST /api/pacientes/:paciente_id/pendencias[...]` atrás da flag
  `FFCM_PENDENCIAS_ATIVADAS`, desligada por padrão.
- Barra de filtros da carteira, tela de pendências do caso e o bloco de FR-006 na visão do
  caso, agora com fonte real.

## Fora de escopo

- **Atraso de tarefa derivado no banco.** O prazo da tarefa vive dentro do envelope
  cifrado e o banco não o vê. Pôr o prazo em claro só para alimentar o cálculo ampliaria
  o que o banco conhece sobre o caso, e isso é decisão de produto, não de implementação.
  A detecção fica onde o texto claro já existe (o cliente da ficha); o tipo
  `tarefa_atrasada` já existe no modelo e aceita tratativa normalmente.
- **FR-007 (linha do tempo pesquisável)** não entrou. Ver `design.md`.
- Agenda e "atenção sinalizada por profissional", de FR-006, continuam sem fonte. Não
  aparecem na tela — e também não aparece mais nenhum texto se desculpando por isso.
