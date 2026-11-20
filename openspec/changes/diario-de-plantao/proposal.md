# Proposal

## Why

A cliente entregou, em 20/11/2026, um documento de especificação funcional e a **ficha
de papel que a equipe usa hoje**: o *Diário de acompanhamento* preenchido pelo
Acompanhante Terapêutico (AT) ou pela enfermeira ao fim do plantão, com os campos
Paciente, Data, Profissional (papel), Plantão (diurno/noturno), Estado emocional,
Rotina, Atividades, Alimentação, Medicação, Intercorrências, Observações e Pendências.
A seção 8 do documento pede exatamente isso: "relatório diário por AT/enfermagem:
rotina, atividades, observações objetivas, intercorrências e encaminhamentos".

O confronto com o produto mostrou que **a maior parte do conteúdo já tem lugar
canônico**, e que a lacuna não é de armazenamento, e sim de **superfície de trabalho**:

| Campo da ficha | Onde já vive |
|---|---|
| Paciente | `cadastro.turno.paciente_id`, `cadastro.turno_execucao_registro.paciente_id` |
| Data | `turno_medida_versao.instante_ocorrencia`, `turno_ocorrencia_versao.instante_ocorrencia`, `turno.aberto_em` |
| Rotina | `turno_medida_versao` com `classe = 'rotina'` (FR-064) |
| Alimentação | `turno_medida_versao` `tipo = 'refeicao'` e `tipo = 'hidratacao'` (FR-064) |
| Medicação | `turno_prescricao_versao` (FR-059) e `turno_administracao_versao` (FR-060) |
| Intercorrências | `turno_ocorrencia_versao` (FR-061) |

Três campos existem **parcialmente, em outro artefato**: o papel do profissional (a
identidade está em toda tabela, mas papel não existe — `usuario.perfil` só conhece
`administrador`, `profissional` e `familia`, e o único texto de papel é
`turno_administracao_versao.executor_vinculo`, cifrado, livre e exclusivo de medicação);
*Atividades* (existe `conteudoEvolucaoDiarioSchema.atividade` em
`packages/contracts/src/diario.ts`, que é a evolução profissional, não o plantão); e
*Observações* (existe `turno_medida_versao.observacao`, que é observação **de um registro
de rotina**, não do plantão).

Três campos **não existem**: Plantão diurno/noturno (não há rótulo de período;
`turno.parametros` é `.strict()` com duração e tolerância; `turno_escala_versao.tipo` é
previsto/substituição/cobertura, que é cobertura e não período do dia), Estado emocional
(zero ocorrências de "emocional" ou "humor" no repositório) e Pendências escritas (a
carteira de pendências tem quatro tipos **derivados** — `revisao_proxima`,
`atualizacao_ausente`, `encaminhamento_sem_retorno`, `tarefa_atrasada` — ninguém digita
uma).

Há ainda uma **diferença estrutural** que esta mudança resolve sem destruir nenhum dos
dois lados: o produto modela a execução **evento a evento** (cada refeição, cada
administração e cada ocorrência é uma linha própria, com instante e autor individuais e
retificação versionada) e já reúne tudo num **Consolidado diário**
(`web/turno-execucao-relatorios.ts`, PDF no servidor por
`netlify/functions/_shared/turno-execucao-pdf.ts`). A ficha da cliente é **um formulário
por plantão**. Evento a evento é a forma correta de guardar; formulário por plantão é a
forma correta de preencher e de ler.

Finalmente, a seção 9 do documento pede "formulários configuráveis por administrador
autorizado, **sem apagar respostas antigas quando o modelo mudar**". Esse mecanismo já
existe e já tem essa garantia provada — `cadastro.campo_extra_plano_catalogo`, a RPC
`operacao.campo_extra_plano_operacao_privada`, o wrapper
`api.campo_extra_plano_privado`, o papel `ffcmapp_campo_extra_plano_owner` e a tela
`web/campo-extra-plano-administracao.ts` — mas está **costurado ao Plano de cuidado** e
não tem ordem, obrigatoriedade nem tipo booleano/texto longo.

## What Changes

- Adicionar FR-073 a FR-081 à capacidade `turno-e-execucao`.
- **Ficha de plantão como superfície única de registro** do AT/enfermagem (FR-073):
  uma tela, uma submissão, gravando em cada tabela canônica já existente. Alimentação,
  medicação e intercorrência **não** passam a existir em dois lugares.
- **Rascunho recuperável e histórico de edição** (FR-074), critérios de aceite da
  seção 12 do documento da cliente.
- **Período do plantão** diurno/noturno (FR-075) como rótulo declarado do turno.
- **Estado emocional observado, atividades e observações do plantão** (FR-076) como
  registro declarado do plantão, com quem observou.
- **Pendências escritas do plantão** (FR-077), distintas e não misturadas com as quatro
  pendências derivadas da carteira.
- **Modelo administrado da ficha** (FR-078): campos de fábrica, acréscimo, ordem,
  obrigatoriedade e desativação, inclusive dos campos de fábrica; nada é apagado;
  escrita nova sob modelo mudado é recusada com `conflito`.
- **Papel declarado do profissional** com catálogo administrado — AT, enfermeira, fono,
  TO (FR-079) —, gravado no registro e impresso na ficha, **sem efeito de autorização**.
- **Consolidado diário apresentado no formato da ficha** (FR-080), inclusive em PDF,
  respeitando a audiência já definida em FR-062.
- **Limites declarados** (FR-081): fonte da informação em cada resposta, segregação
  entre nota interna e conteúdo compartilhável, e proibição de derivar diagnóstico,
  gravidade, risco ou alerta de qualquer campo.

### Decisões do solicitante — 20/11/2026

Confirmadas nesta data. Não reabrir.

1. **A ficha é a tela de entrada, não um armazenamento novo.** Cada campo grava onde já
   existe; só o que falta ganha lugar novo. Uma fonte de verdade. O Consolidado diário
   passa a sair no formato da ficha.
2. **Papel declarado com catálogo do Administrador** (AT, enfermeira, fono, TO…),
   gravado no registro e impresso na ficha. **Não muda autorização nenhuma**: continuam
   valendo o perfil e o vínculo com o caso. O enum `usuario.perfil` **não** é alterado.
3. **Customização: acrescentar, reordenar, marcar obrigatório e desativar**, inclusive
   os campos que nascem de fábrica. Nada é apagado; desativar mantém a resposta antiga
   legível, e escrita nova sob modelo mudado é recusada com conflito.
4. **Audiência igual à do relatório de turno (FR-062)**: equipe com vínculo ativo vê;
   família só com fundamento de autorização vigente registrado no caso. **Nenhuma regra
   nova de audiência.**

### Limites que o próprio documento da cliente impõe

- Seção 1: "o aplicativo deve apoiar o trabalho profissional, **sem gerar diagnósticos
  ou decisões clínicas automaticamente**". É o mesmo limite que FR-064 e FR-028 já
  impõem; esta mudança o repete e o prende em cenário.
- "Estado emocional" é **observação declarada**, não medida clínica nem escala validada.
  Registra quem observou.
- Seção 12: registro da fonte da informação; restrição efetiva de acesso entre perfis;
  salvamento e recuperação de rascunhos; histórico de edição; separação entre registro
  interno e relatório compartilhado.
- Seção 9: histórico imutável de versões relevantes, autoria e trilha de auditoria;
  nenhuma resposta antiga apagada ou reinterpretada quando o modelo mudar.

### Exclusões deste recorte

- **Nenhuma alteração de audiência.** FR-062 permanece como está; a ficha é uma
  apresentação sob a mesma regra.
- **Nenhuma alteração do enum `usuario.perfil`** nem de qualquer caminho de
  autorização. O papel declarado é rótulo de registro, nunca permissão.
- **Nenhuma duplicação de alimentação, medicação ou intercorrência.** Se um campo já tem
  tabela, a ficha escreve nela.
- Escala validada de humor, instrumento psicométrico, pontuação ou classificação de
  gravidade emocional. Fora do produto por decisão e por limite da seção 1.
- Migração do catálogo de campos extras do Plano de cuidado para outro modelo de
  autorização. Se houver generalização, ela é aditiva e preserva o comportamento provado
  do Plano.
- Notificação externa, push, e-mail ou WhatsApp a partir de pendência escrita.
- Ativação remota: nenhuma migração aplicada, nenhuma flag ligada, nada comitado por
  esta proposta.

### Pendências que não podem ser inferidas

Estas bloqueiam a tarefa correspondente em `tasks.md`; não são supostas.

- **P1 — Lista inicial do catálogo de papéis.** "AT, enfermeira, fono, TO…" é exemplo do
  solicitante, não lista fechada. Quem semeia e com quais termos exatos precisa de
  confirmação. Bloqueia 6.1.
- **P2 — Conjunto de fábrica do modelo da ficha.** Os doze campos da ficha de papel são
  o ponto de partida óbvio, mas marcar quais nascem **obrigatórios** é regra de negócio
  da cliente. Bloqueia 5.2.
- **P3 — Destino da pendência escrita.** Se a pendência escrita do plantão deve ou não
  aparecer na carteira de pendências ao lado das quatro derivadas, e com qual
  prioridade. Bloqueia 4.3.
- **P4 — Visibilidade padrão de cada campo.** Quais campos de fábrica nascem como nota
  interna e quais nascem compartilháveis. O padrão conservador adotado é **interno**;
  confirmar inverte o padrão de alguns campos. Bloqueia 7.2.
- **P5 — Ficha sem turno aberto.** O comportamento escolhido é recusar a submissão e
  oferecer abrir o turno com janela declarada. Se a cliente exigir ficha retroativa sem
  turno, o recorte muda. Bloqueia 3.4.

## Capabilities

### Modified Capabilities

- `turno-e-execucao`: ganha a ficha de plantão como superfície única de registro do
  AT/enfermagem (FR-073), rascunho e histórico de edição (FR-074), período do plantão
  (FR-075), estado emocional/atividades/observações do plantão (FR-076), pendência
  escrita (FR-077), modelo administrado da ficha (FR-078), papel declarado (FR-079),
  consolidado diário no formato da ficha (FR-080) e os limites declarados (FR-081).

## Impact

Alterações futuras em contratos, autorização no servidor, esquema e políticas RLS no
Supabase, geração de PDF e interface. O conteúdo tocado é de saúde e de alta
sensibilidade, o que mantém as exigências de FR-042 e a auditoria de FR-039.

Esta mudança **não** altera a audiência de FR-062, **não** altera `usuario.perfil` e
**não** cria caminho de autorização novo. Depende da entrega de `turno-e-execucao`
(FR-055 a FR-067) estar disponível localmente, e reaproveita o mecanismo provado de
`cadastro.campo_extra_plano_catalogo`.

Esta proposta não autoriza deploy, migração remota, concessão de acesso, uso de dados
reais ou qualquer operação externa.
