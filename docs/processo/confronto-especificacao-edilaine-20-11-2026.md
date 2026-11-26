# Confronto — especificação funcional da cliente (v1.0, nov/2026)

**Data:** 20/11/2026 · **Insumo:** documento "FRANCESCATO | FFCM — Especificação funcional
do aplicativo", versão 1.0, entregue pela Edilaine.

Este documento **confronta** o texto dela com o produto. Ele não aprova nada. As fontes de
verdade continuam sendo `openspec/specs/`, `openspec/changes/` e `docs/projeto/`; o
documento da cliente é insumo para a próxima rodada de decisão.

## Método e convenções

Cada lacuna recebe um estado:

- **(a)** não existe nem spec — ninguém escreveu o requisito;
- **(b)** existe spec e não há código;
- **(c)** existe código parcial.

Duas advertências de leitura:

1. **A existência de uma spec não comprova implementação**, e o inverso também ocorre neste
   repositório: `openspec/changes/turno-e-execucao-do-cuidado/tasks.md` marca como pendentes
   tarefas cujo código existe, e `docs/processo/estado-do-projeto.md` parou em 17/11/2026.
   Onde a diferença importou, a verificação foi feita contra migration, contrato e tela.
2. **Boa parte do que este documento classifica como (c) está na branch
   `fatia7/turno-execucao-cuidado`, PR 18 em draft, 50 commits à frente de `origin/main`** —
   financeiro, PWA/avisos, turno, relatórios e PDF. Não está ativado nem publicado. "Existe
   código" não é "está no ar".

**Recorte já coberto:** o diário de plantão do AT/enfermagem (seção 8, "relatório diário por
AT/enfermagem") está sendo transformado em mudança OpenSpec em
`openspec/changes/diario-de-plantao/`, com FR-073 a FR-081 propostos e cinco pendências (P1 a
P5) registradas lá. Este documento **não detalha esse recorte** e não o duplica; onde ele
cobre uma exigência da cliente, há remissão.

---

## 1. Objetivo

> "O aplicativo deve apoiar o trabalho profissional, sem gerar diagnósticos ou decisões
> clínicas automaticamente."

**Sim, é requisito nosso — mas disperso, nunca transversal.** O limite aparece preso a cada
fatia, não como princípio único do produto:

| Onde | O que diz |
|---|---|
| `openspec/specs/evolucoes-propostas/spec.md` (FR-044) | rascunhos assistidos "não gerar fatos, diagnóstico ou conduta" |
| `openspec/specs/agenda-e-carteira/spec.md` (FR-026, FR-028) | sinal operacional "não representar classificação clínica automática"; verde ≠ ausência de risco clínico |
| `openspec/specs/plano-e-coordenacao/spec.md` (FR-020) | "a case manager não emite conduta clínica por assumir a coordenação" |
| `openspec/changes/turno-e-execucao-do-cuidado/specs/turno-e-execucao/spec.md` (FR-058, FR-062, FR-065) | sinais vitais "sem interpretação clínica automática"; consolidado "NÃO SHALL conter conclusão clínica, tendência interpretada ou recomendação" |
| `docs/projeto/contexto-negocio.md`, "Limites da proposta" e "Fora do escopo" | diagnóstico, prescrição, alteração de medicamento, decisão clínica automática, predição de suicídio e leitura automática de gravidade estão fora |

O enunciado mais próximo do dela está em `contexto-negocio.md`, que é contexto de negócio,
não requisito com ID. Na prática o comportamento está garantido; o que falta é um lugar
único que o declare.

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Limite "sem diagnóstico/decisão clínica automática" como princípio do produto | (c) | FR-020/026/028/044/058/062/065 + `contexto-negocio.md` | pequeno | Nada técnico. É decisão de onde registrar: requisito transversal novo ou nota de escopo nas specs existentes |

---

## 2. Perfis e permissões

Ela lista seis. O banco tem **três perfis** (`public.usuario.perfil` CHECK, em
`supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql:13`): `administrador`,
`profissional`, `familia`. Sobre eles há **quatro funções de conta gerenciada**
(`identidade.acesso_gerenciado.funcao`, `20261125150000_acessos_gerenciados.sql:9`):
`administrador`, `case_manager`, `familia`, `profissional` — e `case_manager` **colapsa para
`profissional`** na hora de autorizar (`20261125160000_contexto_acessos_gerenciados.sql:63`,
`:105`, `:173`, `:192`). Nenhuma policy lê `acesso_gerenciado.funcao`.

| Perfil que ela lista | Existe? | O que há hoje |
|---|---|---|
| **Administrador institucional**, "sem acesso clínico irrestrito por padrão" | **Aproximado, com o limite invertido** | `perfil = 'administrador'` existe. O limite **não existe**: hoje o administrador lê diário, plano de cuidado, saúde, encaminhamento, orientação, contexto/rede, documento do caso e plano de crise **sem exigir vínculo com o caso**. Só anamnese (`20261125010000_anamnese_vinculo_caso.sql`) e tarefa de cuidado exigem vínculo. Único recorte real: aprovar plano de crise exige `habilitado_plano_crise` **e** liderança atual do caso (`20261125040000_plano_crise_case_manager_atual.sql:115`) |
| **Gestor de caso** | **Aproximado** | Não é perfil. É responsabilidade por caso: `cadastro.acompanhamento_caso.responsavel_usuario_id` (`20261113100000:13`) e `cadastro.case_manager_atual(uuid)` com `papel ∈ {titular, substituto}` (`20261126100000_substituicao_case_manager.sql:113`). O próprio código avisa que "ser responsavel nao concede acesso: nenhuma regra de acesso le esta coluna" (`20261113100000:300`). DF-021 e DF-023 definiram o case manager como líder do caso com alçada de aprovação **naquele caso** |
| **Profissional assistencial** | **Existe** | `perfil = 'profissional'`, com concessão de equipe e vínculo por caso (`cadastro.acesso_paciente`) |
| **AT/enfermagem** | **Não existe** | Zero ocorrências de especialidade, cargo, categoria profissional, conselho de classe, enfermagem ou acompanhante terapêutico em migrations, contratos e specs. `profissional` é indivisível. A decisão de 20/11 em `diario-de-plantao` (FR-079) cria **papel declarado com catálogo administrado, explicitamente sem efeito de autorização**, e não altera `usuario.perfil` |
| **Paciente/responsável** | **Metade existe** | O **responsável familiar** existe: `perfil = 'familia'`, conta criada por convite administrado (`20261119250000_convite_familiar.sql`), FR-051 a FR-054. O **paciente** não: `cadastro.paciente` não tem `usuario_id` nem FK para `auth.users`; é objeto de dado, não sujeito de autenticação. FR-048 (participação direta do paciente) é fase **Evolução**, sem uma linha de código, e está explicitamente fora do recorte em `openspec/changes/fundar-identidade-e-seguranca-backend/design.md:229` |
| **Sponsor/financeiro** | **Não existe como perfil** | A audiência financeira é **marca booleana sobre concessão de `profissional`**: `identidade.concessao_equipe.habilitado_financeiro`, com CHECK que só admite `perfil = 'profissional'` (`20261126200000_financeiro_concessao.sql:27`); o administrador tem audiência pelo próprio perfil. `familia` **nunca** recebe, porque não tem concessão de equipe. O isolamento é provado por privilégio ausente: `ffcmapp_financeiro_audiencia_owner` não recebe nenhum grant em `cadastro.*` (`20261126200100_financeiro_audiencia.sql:36`) |

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Administrador sem acesso clínico irrestrito | (a) | Hoje o contrário é verdade, em 8 fatias | **grande** | Decisão dela + rever RLS e RPC de diário, plano, saúde, encaminhamento, orientação, contexto/rede, documento e plano de crise, com provas negativas novas. Pode quebrar a operação da própria Edilaine |
| Gestor de caso como perfil próprio | (c) | Função de conta `case_manager`, colapsada para `profissional`; alçada por caso | pequeno/médio | Confirmar se ela quer perfil de autorização ou a alçada por caso que DF-021/DF-023 já definiram |
| AT/enfermagem como perfil | (b) parcial | `diario-de-plantao` FR-079 propõe papel **declarado**, sem autorização | médio | P1 daquela change (lista do catálogo de papéis) + decisão sobre ser rótulo ou permissão |
| Paciente com acesso próprio | (b) | FR-048, fase Evolução, sem código | **grande** | Modelo de idade/representação, audiências próprias, e a pergunta de `contexto-negocio.md` ("O próprio paciente deve usar o sistema desde o começo?") continua sem resposta |
| Sponsor/financeiro com conta | (a) | Audiência financeira existe só para equipe | médio | Decidir se é pessoa externa com conta ou profissional habilitado. Hoje família nunca alcança o financeiro, por desenho |

**Conflito com decisão vigente:** DF-016 fixou "um perfil por usuário" entre Administrador,
Profissional e Família; DF-023 acrescentou as quatro funções de conta mantendo perfil-base
clínico. Seis perfis de autorização contrariam as duas decisões.

---

## 3. Jornada de atendimento

O documento enumera **seis** passos, não sete. Confronto com as 12 jornadas preservadas em
`openspec/specs/` (User Story 1 a 12) e `docs/processo/rastreabilidade.md`:

| Passo dela | Estado | Onde está hoje |
|---|---|---|
| 1. Cadastro e identificação do paciente; vinculação de responsáveis e **consentimentos/autorizações** | (c) | Cadastro FR-001 e mapa de vínculos FR-002 implementados (`openspec/changes/ficha-do-paciente/`, DF-019). Consentimento/autorização é a parte fraca: ver seção 9 |
| 2. Envio de link seguro para pré-anamnese | **(a)** | Não existe. Ver seção 4 |
| 3. Revisão profissional dos relatos + Anamnese 360° | (c) | Relato familiar FR-008 (`packages/contracts/src/relato-textual.ts`) e anamnese FR-003 existem. **Não existe fluxo que leve o relato para dentro da anamnese**: a conversão implementada leva relato em tarefa (FR-014, `openspec/changes/conversao-diario-tarefa-atomica/`), não em resposta de anamnese |
| 4. Avaliação integrada e definição de prioridades | (c) parcial | Resumo do caso FR-006 e linha do tempo FR-007 (12 fontes agregadas, `packages/contracts/src/linha-tempo.ts`) dão a visão. **Não existe artefato "avaliação integrada" nem priorização registrada** |
| 5. Elaboração e **aprovação profissional** do PTI e do PFI | (c) para PTI, (a) para PFI | Ver seção 8 |
| 6. Registro de atividades, evolução, documentos, reavaliações e relatórios autorizados | (c) | É a área mais implementada do produto |

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Relato familiar revisado vira insumo da anamnese | (a) | Conversão existe só para tarefa | médio | Decidir se o relato entra como resposta com `fonte`, ou só fica referenciado |
| "Avaliação integrada" e prioridades como artefato | (a) | Resumo FR-006 e linha do tempo FR-007 | médio | Saber o que ela entende por prioridade: lista ordenada de necessidades? Isso aproxima da "Síntese e prioridades" da seção 5 |

---

## 4. Pré-anamnese — formulário externo

> **DECISÃO DO SOLICITANTE — 20/11/2026.** Não haverá formulário externo nem link aberto.
> **A Edilaine cria o acesso da família, e a família preenche a pré-anamnese logada na
> plataforma.** Isso reduz muito o recorte e melhora a segurança: reusa o convite familiar e
> o login que já existem, o conteúdo nasce autenticado e auditado, e desaparece o problema
> de token de formulário trafegando por e-mail. Também resolve de graça a exigência da
> cliente de "registrar informante, data e versão" — o informante passa a ser a identidade
> da sessão, não um campo declarado que qualquer um preenche.
>
> O que **permanece** a implementar, mesmo com a decisão: o roteiro de perguntas da
> pré-anamnese, a separação entre o que a família declara e o que vira fato clínico (a
> cliente é explícita: "não incorporar automaticamente declarações familiares como fatos
> clínicos"), e a revisão profissional antes de qualquer incorporação. Não foi aberto como
> frente em 20/11/2026: a prioridade do solicitante é deixar o que já existe testável na
> versão publicada.

**Não existia, em nenhum estado: (a).** Zero ocorrências de "pré-anamnese" no repositório.

Três coisas existentes são **parecidas e não são isso**:

- **Convite familiar (FR-051 a FR-054, DF-011):** o link é de **ativação de conta** —
  `netlify/functions/_shared/auth-nativo/enviar-convite-familiar.ts:51` redireciona para
  `/convite-familiar?convite=<id>`, a pessoa define senha e passa a entrar autenticada. Não
  coleta informação.
- **Pré-autorização familiar:** `web/preautorizacoes-familiares.ts`,
  `20261120440000_listar_preautorizacoes_familiares.sql`. É controle de acesso, não captação.
- **Relato familiar (FR-008):** acontece **dentro do app autenticado**. O banco impede
  qualquer outra coisa: `20261118210000_diario_operacoes_privadas.sql:311` recusa quando
  `papel = 'familia'` e o tipo não é `relato_familiar` com audiência `equipe`.

A família **nunca escreve na anamnese** — a spec de `anamnese-gradual-dominio` exige
colaborador ativo com concessão e vínculo, e diz que "a relação familiar ou permissão de
agenda não SHALL conceder acesso por inferência". Hoje a captação é **mediada**: a case
manager digita e preenche o campo `fonte` com quem informou.

Sobre as duas exigências que ela destaca:

| Exigência dela | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Formulário externo por link seguro, antes do atendimento | **(a)** | Nada | **grande** | Decidir quem recebe o link — familiar já convidado (reaproveita o modelo de conta) ou link anônimo (superfície pública nova, com modelagem de ameaças própria). São produtos diferentes |
| "Cada resposta deve registrar **informante**, data e versão" | (c) parcial | `packages/contracts/src/anamnese.ts:6-9`: cada resposta carrega `fonte` (**texto livre obrigatório**) e `data` validada. `versao` é do **documento inteiro**, não da resposta (`anamnese.ts:98-106`) | médio | `fonte` não aponta para a pessoa da rede de cuidado nem para um usuário. Se "informante" tem de ser identidade, é mudança de contrato e de tela |
| "Não incorporar automaticamente declarações familiares como fatos clínicos" | (c) **só fora da anamnese** | Forte no histórico de saúde: `packages/contracts/src/saude.ts:16-28` tem `natureza: 'profissional' \| 'relato_leigo' \| 'documento'` e `situacao: 'confirmado' \| 'hipotese'`. Forte no diário: `diario.ts:16`, `relato_familiar` vs `evolucao_profissional`, com o banco impedindo família de gravar outro tipo. **Ausente na anamnese**: `RespostaAnamnese` só tem `fonte` e `estado` | pequeno | Nada. É acrescentar `natureza`/`situacao` à resposta de anamnese. Hoje "Diagnósticos e hipóteses já levantados" é texto livre: se alguém digitar um diagnóstico relatado pela mãe, nada o marca como relato leigo não confirmado |

---

## 5. Anamnese 360°

A anamnese do produto **não tem seções fixas em código**. Desde 13/11/2026 o roteiro mora
numa linha de configuração no banco — chave `ffcm.anamnese.roteiro`, formato `Seção ::
Pergunta` (`supabase/migrations/20261123100000_configuracao_anamnese.sql:30`), editável pelo
Administrador. São hoje **6 seções e 17 campos**, e a tela ainda oferece "Outra seção" e
"Outro campo" livres (`web/anamnese.ts:260-261`).

| Seção dela | Estado | O que cobre hoje |
|---|---|---|
| 1. Identificação e contexto | (c) | Cadastro FR-001, rede de cuidado FR-002 (7 vínculos, `packages/contracts/src/rede-cuidado.ts:10-17`) e a seção "Motivo e expectativa" do roteiro |
| 2. História clínica | (c) | Seções "História e marcos" e "Saúde e cuidados contínuos" do roteiro, **mais** a tabela própria de histórico de saúde FR-004 (`packages/contracts/src/saude.ts`), que é mais rica que a anamnese. Documentos em fatia separada |
| 3. **Emocional e comportamental** | **(a)** | **Nada.** Zero ocorrências de "humor" ou "emocional" em contratos e migrations. O `diario-de-plantao` propõe "estado emocional observado" (FR-076) **apenas no plantão**, como observação declarada |
| 4. Funcionalidade | (c) parcial | "Rotina e autonomia" no roteiro + contexto de cuidado FR-005 com 6 categorias (`contexto-cuidado.ts:8-15`: rotina, recursos, barreiras, preferências, pontos fortes, importante para o paciente). **Sem nível de apoio** — ver seção 7 |
| 5. Família e ambiente | (c) parcial | "Comunicação e relações" + rede de cuidado. Conflito, responsabilidades e **sobrecarga** não têm campo |
| 6. Rede de cuidado | (c) | `rede-cuidado.ts` cobre profissionais, serviços e papéis. **"Autorizações de comunicação" não existe** |
| 7. Síntese e prioridades | (c) parcial | Resumo do caso FR-006; "hipóteses a verificar" tem lugar canônico em `saude.ts` (`situacao = 'hipotese'`). **Priorização e "próximos passos" não têm campo próprio** |

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Seção emocional/comportamental na anamnese | (a) | — | **pequeno se texto livre** (é editar `ffcm.anamnese.roteiro`), **médio se estruturado** | Se ela quiser risco, fatores de proteção e impulsividade como campos tipados, é código — e colide com o limite da seção 1 dela, que proíbe derivar gravidade |
| Sobrecarga familiar, conflito, responsabilidades | (a) | — | pequeno (roteiro) | Nada |
| Autorizações de comunicação na rede de cuidado | (a) | — | médio | Decidir se é informação ou controle de acesso. Se for controle, encosta em FR-038 |
| Priorização e próximos passos | (a) | — | médio | O mesmo item da jornada, passo 4 |

**Nota de esforço:** acrescentar *perguntas* à anamnese é configuração, não desenvolvimento.
Acrescentar *campos estruturados* (com enum, validação e consulta) é desenvolvimento.

---

## 6. Adaptação por faixa etária

**(a) — não existe nem spec.** Zero ocorrências de "faixa etária", "infantil", "adolescente"
ou "pediátrico" em contratos, migrations, telas ou OpenSpec. As únicas menções a crianças e
adolescentes estão em `docs/projeto/contexto-negocio.md:128`, sobre LGPD e audiências —
"idade, representação e participação **serão consideradas**", no futuro, e sobre acesso, não
sobre campos.

O dado de entrada existe e está ocioso: **data de nascimento está no cadastro, cifrada**
(`packages/contracts/src/cadastro.ts:24` e `:129`, AAD por campo em
`packages/cadastro/src/preparar-paciente.ts:36`). Ninguém a consome para adaptar formulário.

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Campos específicos por faixa (0–11 / 12–17 / 18+), mudando automaticamente | **(a)** | `data_nascimento` existe e não é usada | **médio** | O roteiro `ffcm.anamnese.roteiro` é **lista única e global, sem dimensão condicional**. Adaptar por faixa exige mudar o modelo de configuração, não só o conteúdo. E exige decidir o que acontece quando o paciente muda de faixa durante o acompanhamento — as respostas antigas ficam, mas o formulário muda |

**Este é o item (a) dos critérios de aceite dela.** Hoje não é demonstrável.

---

## 7. Avaliação funcional

**(a) — não existe nem spec.** Zero ocorrências de `nivel_apoio`, "nível de apoio",
"avaliação funcional" ou "grau de autonomia". Nada com independente / parcial / intensivo /
não avaliado.

Dois vizinhos que **não** resolvem:

- **FR-045 (medidas de progresso e instrumentos)** — `openspec/specs/evolucoes-propostas/spec.md:39`,
  fase **Evolução**. Estado **(b): spec sem código** (`grep instrumento` em `netlify/`,
  `web/`, `packages/`, `supabase/` devolve zero; fora do recorte em
  `fundar-identidade-e-seguranca-backend/design.md:229`). E é sobre *instrumentos escolhidos
  pelos profissionais, com versão e aplicador* — outra coisa que nível de apoio por domínio.
- **Plano de cuidado** — o objetivo tem `observacaoProgresso`, **texto livre**
  (`packages/contracts/src/plano-cuidado.ts:19-29`). Não há indicador, meta ou prazo
  estruturados.

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Nível de apoio por domínio (4 valores) + descrição observável, contexto, fonte, data, responsável, meta, prazo, reavaliação | **(a)** | Nada equivalente | **grande** | Definir a lista de domínios (é regra de negócio dela, não inferível) e confirmar que "não interpretar níveis como escala clínica validada" significa que o produto **só guarda e exibe**, sem derivar indicador. Ela mesma escreve "definir critérios operacionais antes de calcular indicadores" — então o cálculo depende de critério que ainda não existe |

---

## 8. Documentos, planos e relatórios

### 8.1 Upload categorizado

**(c).** `supabase/migrations/20261120110000_documento_caso_privado.sql` guarda em claro
`categoria`, `origem`, `data_documento`, `audiencia`, `estado` e versão (para permitir busca
por audiência), e cifra nome do arquivo, descrição e `drive_file_id`. Contrato em
`packages/contracts/src/documento-caso.ts:23-27`: `audiencia ∈ {equipe, equipe_e_familia}`,
`estado ∈ {disponivel, indisponivel, removido}`. Armazenamento é **Google Drive institucional**
(DF-005), implementado em `netlify/functions/_shared/google-drive.ts` — service account, upload
na pasta do caso, nunca `permissions.create`. UI em `web/documentos-caso.ts`.

Ressalvas: o contrato aceita `categoria` como **string livre** (`documento-caso.ts:55`), mas
existe uma lista configurável pelo Administrador em `ffcm.documentos.categorias` — vale
conferir se a tela obriga a escolher da lista ou aceita texto novo, porque disso depende a
busca por categoria que FR-029 exige. E a porta do Drive depende do segredo
`ffcmapp.integracao.google_drive` no Vault, que continua bloqueado por ação do solicitante.

### 8.2 PTI e PFI

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| PTI com objetivos, responsáveis, revisão | (c) | `packages/contracts/src/plano-cuidado.ts:19-29`: `descricao`, `area`, `responsavel`, `situacaoInicial`, `observacaoProgresso`, `dataRevisao`, `estado` (6 valores de FR-016), `camposExtras`. Revisão versionada com motivo e data (`:46-62`, `20261107150000_plano_cuidado_historico_privado.sql`) | — | — |
| PTI com **frequência, indicadores, meta e prazo** | (a) | Só via `camposExtras` genéricos (`20261116130000_campo_extra_plano_catalogo.sql`), sem semântica | médio | Decidir se indicador é texto ou medida consultável. Medida consultável puxa a seção 7 junto |
| **Intervenções** dentro do plano | (c) deslocado | São tarefas separadas (`packages/contracts/src/tarefa-cuidado.ts`, FR-017), ligadas ao caso, não ao objetivo | pequeno/médio | Decidir se tarefa passa a referenciar objetivo |
| **Aprovação** do plano | (c) **carimbo, não portão** | `20261116150000_aprovador_plano_catalogo.sql:1-6` diz em letra: "carimbo, não portão — decisão do solicitante de 10/11/2026". Tabelas `identidade.aprovador_plano_cuidado` e `cadastro.objetivo_cuidado_aprovacao`, insert-only, presa a uma versão. Um objetivo publicado **não exige** aprovação para valer | médio | Se ela quiser portão, é decisão que reverte a de 10/11/2026 |
| **PFI — plano funcional separado** | **(a)** | Existe **um** plano (objetivos com `area` texto livre) e o plano de crise FR-020, que é outra coisa | **grande** | FR-015 registra que "o nome PTS só será usado se corresponder à prática validada da equipe" — o projeto evitou de propósito multiplicar planos. Dois documentos com aprovação separada contraria esse desenho |

### 8.3 Relatórios

| O que ela pede | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| Relatório diário por AT/enfermagem | — | **Coberto por `openspec/changes/diario-de-plantao/`** (FR-073 a FR-081). Não detalhado aqui | — | As pendências P1 a P5 daquela change |
| Relatório semanal | (c) | FR-065 implementado: `20261125210000_turno_rotina_relatorios.sql:22` (`tipo ∈ {turno, diario, semanal, caso}`, `:133` valida 7 dias), `netlify/functions/_shared/turno-execucao-nativo.ts:496-660`, `web/turno-execucao-relatorios.ts:48`. Em branch, não ativado | — | Gates de ativação da fatia 7 |
| Relatório **mensal** | **(a)** | O enum fecha em quatro tipos; zero ocorrências de "mensal" | pequeno | Decidir se mensal é tipo novo ou período livre |
| Relatório de **evolução** (progresso, dificuldades, metas, condutas, próximos passos) | **(a) como relatório** | Os *campos* existem no registro individual: `packages/contracts/src/diario.ts:49-52` (`progresso`, `orientacao`, `proximoPasso`, `objetivoRelacionado`) e o formulário de síntese FR-009 em `web/modelo-sintese.ts`. Não há "dificuldades" nem agregação por período | médio | **Tensão real:** FR-065 proíbe "conclusão clínica, tendência interpretada ou recomendação" no consolidado. "Progresso e dificuldades" num relatório de período é exatamente o que essa proibição alcança — a menos que o relatório só *reúna* o que o profissional escreveu |
| Exportação PDF com **identidade visual, data, autor, versão e marcação de confidencialidade** | (c) parcial | PDF existe e é bom: `netlify/functions/_shared/turno-execucao-pdf.ts` com pdf-lib, gerado **no servidor**, sem HTML, sem fetch de fonte, falha explícita em glifo sem WinAnsi (`:30`), limites de 500 KB e 200 páginas; metadados de criação/modificação presos ao instante de corte (`:18-22`); seção "Período e emissão" com caso, período e corte. Emissão auditada em `cadastro.turno_exportacao_pdf` com destinatário e propósito cifrados e `digest_pdf` | pequeno | **Faltam três coisas que ela pede nominalmente:** identidade visual (só Helvetica, cor única, sem logo, sem Cormorant/Raleway), **marcação de confidencialidade** (zero ocorrências de "confidencial" em `netlify/`, `web/`, `packages/`) e selo de versão do relatório |

**Atenção a uma divergência de formato:** o que ela chama de exportação PDF existe em dois
caminhos diferentes. FR-066 produz **PDF no servidor** (turno/diário/semanal/caso). FR-032, o
pacote de exportação do caso, produz **ZIP montado no navegador** com `resumo.html` +
`dados.json` + `anexos/` (`web/pacote-exportacao.ts:3-6`, `:327`). Não é PDF.

---

## 9. Requisitos técnicos e de segurança

Item a item, sem suavizar.

| Item dela | Estado | Onde está hoje | Esforço | O que bloquearia |
|---|---|---|---|---|
| **Acesso por função e por caso** | (c) forte, **desigual** | Cada fatia tem seu `ffcmapp_<fatia>_owner`, RLS própria e bloco de autorização dentro da RPC `SECURITY DEFINER`. Vínculo em `cadastro.acesso_paciente`. 250 arquivos de teste SQL em `supabase/tests/`, com provas positivas e negativas | médio | O buraco é o administrador (seção 2). Além disso **não há função central de autorização**: a checagem é repetida inline por fatia, o que torna uma mudança de política cara e arriscada |
| **Segregação interno/compartilhável** | (c) | `audienciaDiarioSchema = z.enum(['equipe', 'equipe_e_familia'])` (`packages/contracts/src/diario.ts:25`); rascunho privado; objetivo com visibilidade `interna`/`publica` (`20261124100000_objetivo_cuidado_visibilidade.sql`) | pequeno | FR-036 prevê **três** níveis (coordenação compartilhável / disponibilizado à família / profissional restrito). Só dois existem |
| **Autenticação** | (c) para "quem é", **(a) para "forte"** | Google Workspace para equipe (DF-007), e-mail e senha para família (DF-011), conta interna criada pela administração (DF-023), tudo em `netlify/functions/auth.ts:16-29`. Bloqueio anti-força-bruta em `20261106180000_bloqueios_auth.sql`. Sessão com fencing e atestado | médio | **Zero ocorrências de MFA, 2FA, TOTP, WebAuthn ou passkey** em migrations, functions, contratos e specs — não é exclusão registrada, é silêncio. O OTP de `confirmar-email-interno.ts` é prova de posse do e-mail no cadastro, **não** segundo fator de login (`administrar-acessos-sistema/design.md:25`). **E a ativação do convite familiar está travada em código:** `netlify/functions/auth.ts:40`, `const ativacaoFamiliarComprovada = false`, com comentário mandando remover só após provar contrato SQL e callback — ou seja, FR-052 ainda não roda ponta a ponta |
| **Cifra em trânsito** | (c) parcial | TLS navegador→app é da plataforma, nada versionado. `netlify.toml` traz `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e `Cache-Control: no-store` em `/api/*`. TLS app→banco **é verificado em código**: `supabase/functions/_shared/pool-cofre.ts` recusa `sslmode=disable` e exige certificado verificável | pequeno | **Não há HSTS em lugar nenhum** do repositório, e não há CSP global — só `frame-ancestors 'none'` em `/convite-familiar/*`. **Achado colateral:** o `Permissions-Policy` global traz `geolocation=()`, que desliga a API de geolocalização — e FR-067 (check-in/check-out com localização) depende dela. Conferir antes de ativar a fatia 7 |
| **Cifra em repouso** | (c) forte | AES-256-GCM, nonce de 96 bits, tag de 128 bits, **AAD canônico por `tabela`/`registro_id`/`campo`/`formato`**, envelope validado por CHECK no próprio banco, chaves no Vault sob `ffcmapp.cifra.`, rotação manual versionada, falha fechada sem fallback em texto claro (`docs/desenvolvimento/cifra-autenticada.md`). Não usa `pgsodium`: é Vault + cifra na aplicação | — | Há uma disciplina visível de registrar no cabeçalho da migration o racional de cada coluna deixada em claro (audiência, estado, etapa, área, categoria — todas precisam ser filtráveis sem decifrar). **Exceção:** o valor do sinal vital (FR-058) fica em claro e o racional está no desenho da change ("cifrar o valor obrigaria a decifrar a série inteira"), **não no cabeçalho da migration** `20261125200000_turno_execucao_clinica.sql`. Vale alinhar antes da revisão. Latitude e longitude também ficam em claro |
| **Logs de leitura/alteração/exportação** | (c) forte | `auditoria.evento` (`20261017113000:320-336`), append-only por trigger, com CHECK que exige ator identificado e **sem conteúdo clínico** — só identidade, ação, tipo de objeto, id, resultado e `request_id`. Cobre **consulta** (`api.ler_*`, ~30 `api.consultar_*`, ~15 `api.listar_*`), não só escrita, e cobre **exportação** (`api.registrar_exportacao`, `api.registrar_exportacao_turno`, `api.confirmar_entrega_exportacao`). É **transacionalmente obrigatória**: há testes provando que auditoria suprimida não devolve carteira nem sessão. Consulta restrita a autorizado. Em 13/11 havia 25 registros reais em produção | — | As tarefas de auditoria do módulo de **turno** continuam abertas (`turno-e-execucao-do-cuidado/tasks.md:162, 181, 204`) |
| **Backups e recuperação** | **(a)/(b) — a pior lacuna do documento** | FR-042 **exige** a prova: "antes do uso real, a operação deve demonstrar restauração autorizada e conferência de integridade após perda simulada". A realidade está registrada em `docs/processo/continuidade-13-11-2026.md:88`: **"O Supabase não tem backup configurado ('No backups' no painel)"**. E `:35-40` registra que a prova de FR-042 foi **adiada por decisão do solicitante de 13/11/2026**, "porque os dados são fictícios", com a própria nota dizendo: "precisa mudar antes do primeiro dado real, não depois: é o único item cuja falha não tem conserto". Não há script de backup ou restore, procedimento de PITR, configuração de retenção de backup, plano de recuperação, RPO/RTO, teste de restauração nem evidência de perda simulada em `docs/`, `openspec/`, `scripts/`, `netlify/` ou `supabase/`; `supabase/config.toml` não configura backup. As únicas menções são em prosa, sempre como pendência: `fundar-identidade-e-seguranca-backend/proposal.md:53` ("gates de operação"), `design.md:164` ("cofre não é promessa de portabilidade de chaves em restore") e `configurar-lote-teste.md` ("conferir previamente backup e recuperação aplicáveis", sem dizer qual) | **médio** (configurar) + **médio** (provar) | Plano Supabase vigente e autorização para operação remota. **Nada bloqueia tecnicamente** — é decisão e execução. Atenção a um detalhe que `docs/desenvolvimento/cifra-autenticada.md` já registra: **restaurar o banco não basta**, porque o conteúdo é cifrado e só volta a ser legível se o material de chave compatível ainda existir no Vault. A prova de FR-042 tem de cobrir banco **e** chaves |
| **Histórico imutável de versões** | (c) forte | Anamnese append-only com trigger que recusa UPDATE/DELETE (`20261106220000_anamnese_versoes_privadas.sql:38-46`), cadeia `anterior = versao - 1` com FK; diário com rascunho/publicação/retificação (FR-012); turno com retificação versionada; financeiro append-only por `(despesa_id, versao)` | — | Na anamnese **não existe retificação por resposta**: editar grava versão inteira nova, sem diff nem motivo |
| **Base legal, autorizações e compartilhamentos (FR-038)** | (c) **estreito** | Existe, e mais do que `continuidade-13-11-2026.md:35` registrava ("não existe tabela" ficou desatualizado). Três mecanismos: `cadastro.turno_fundamento_familiar_versao` (`20261125210000_turno_rotina_relatorios.sql:10`), versionada, com `vigencia_inicio`/`vigencia_fim` e `estado ∈ {vigente, revogado}`, cujo cabeçalho diz "foundation is distinct from case link"; `cadastro.turno_consentimento_localizacao` (`20261125220000:10-16`), com `concedido`, `finalidade`, `audiencia` e `retencao_dias` — o melhor exemplo de consentimento específico do repositório; e `cadastro.acesso_paciente`, com motivo de concessão e de revogação cifrados e responsável por cada ato. Cada exportação guarda destinatário e propósito | **grande** | **Não existe registro de versão dos termos nem de aceite por pessoa** — FR-038 cita "versão dos termos" literalmente. As regras de funcionamento de FR-041 vivem em `ffcm.regras.*` na configuração do sistema, **não versionadas e sem aceite**. E não há base legal genérica por finalidade: o fundamento só cobre turno/família e localização. A decisão de qual base legal se aplica a dados de saúde continua dependendo de validação jurídica (`contexto-negocio.md`) |
| **Retenção e exclusão** | (c) **pontual, com cron real** | Dois mecanismos implementados e agendados: áudio original apagado após revisão confirmada (DF-020, `20261119120000_audio_transcricao_privado.sql:82-109`) **mais expurgo de áudio abandonado a cada 15 minutos** (`cron.schedule('ffcm-audio-abandonado','*/15 * * * *')`, `20261125030100_audio_expurgo_cron.sql:10`, com aviso ao administrador); e localização de turno com **retenção de 90 dias forçada no CHECK** (`20261125220000:12`), negada na leitura após o prazo (`:124`) e **expurgo diário agendado** (`cron.schedule('ffcm-turno-localizacao-90-dias','17 3 * * *')`, `:189`) — com chave de desligamento `ffcm.turno.expurgo_localizacao_ativo`, hoje em `false` até validação. FR-040 está implementado como **livro de registro** de pedidos de acesso/correção/portabilidade/exclusão (`packages/contracts/src/solicitacao-titular.ts`), e o próprio contrato diz que "não é um motor de eliminação" | médio | Não existe política geral de retenção por tipo de dado: prontuário, diário, anamnese, documentos e turnos não têm prazo de guarda. **A própria `auditoria.evento` é append-only e nunca expurgada.** `fundar-identidade-e-seguranca-backend/proposal.md:53` declara retenção como "gate de operação", isto é, adiada |
| **Resposta a incidentes** | **(a)** | **Nada.** A tarefa existe e está aberta desde sempre: `fundar-identidade-e-seguranca-backend/tasks.md:370`, item 3.5, "registrar contrato real de sessão/entrada e **runbook restrito**", com destino previsto em `docs/desenvolvimento/`. Nunca foi escrito. O que existe é prevenção, não resposta: modelo de ameaça em `administrar-acessos-sistema/design.md:34-38`, threat model de fatia em `conversao-diario-tarefa-atomica/`, e controles de não vazar segredo em log e erro (`netlify/functions/_shared/log-seguro.ts`, `falha-publica.ts`) | médio | Só decisão e escrita. Não existe cadeia de escalonamento, critério e prazo de notificação à ANPD e aos titulares, responsável nomeado nem registro de incidentes |
| **Ambiente de teste com dados sintéticos** | (c), **com uma contradição** | DF-014 e DF-022 fixam ambiente único com dados fictícios antes do go-live; 250 arquivos de teste SQL em PostgreSQL descartável; lote de teste com proveniência (`20261109120000_preparar_proveniencia_teste`, `scripts/configurar-lote-teste.sql`, `docs/projeto/configurar-lote-teste.md`, que exige "usar exclusivamente dados fictícios"); DF-015 prevê limpeza seletiva antes do uso real — **e essa limpeza continua pendente** | — | **Não existe ambiente de staging separado**, por decisão explícita (`roteiro-especificacoes.md:48`). As fixtures de Auth e Vault são fictícias e o próprio projeto registra que "não comprovam o executor nem a atomicidade remotos" (`fundar-identidade-e-seguranca-backend/tasks.md:232`). **Contradição a levar para ela:** em 13/11/2026 o repositório `Trivia-Growth/Francescapp` foi tornado **público**, por decisão do solicitante, para contornar o limite do plano Free do Netlify, "ciente de que 39 arquivos nomeiam pessoas reais" (`continuidade-13-11-2026.md:84-87`). O documento dela é marcado CONFIDENCIAL e pede evitar dados reais em protótipos |
| **Formulários configuráveis por administrador, sem apagar respostas antigas** | (c) parcial | A diretriz do projeto (`20261119110000_configuracao_sistema_opcoes.sql:5-8`) é que **o catálogo vem por migration e a tela edita só o valor** — o owner administrativo não tem `UPDATE` em `opcoes`. Sobre isso: roteiro da anamnese (`ffcm.anamnese.roteiro`), áreas de síntese do diário, **categorias de documento** (`ffcm.documentos.categorias`), área de passagem do turno, regras de funcionamento e modelo de transcrição por lista fechada. O único item **criável em runtime pelo Administrador** são os campos extras do plano, com tipo texto/número/data/lista (`20261116130000_campo_extra_plano_catalogo.sql`, decisão de 10/11/2026). Escrita restrita a administrador vinculado (`20261117410000:46-75`). **A garantia que ela pede está atendida na anamnese**: o conteúdo vai em envelope cifrado livre, não em colunas derivadas do roteiro, e as versões são imutáveis — mudar o roteiro não pode apagar resposta alguma | médio | **O Administrador não pode criar um tipo novo de sinal vital pela plataforma**: `cadastro.turno_catalogo_medida` tem CHECK fixo de 12 valores e `api.configurar_catalogo_turno` só deixa alterar `ativo` e `referencia_informativa` (`20261125200000:264-267`). Faltam ordem, obrigatoriedade e a leitura que identifica a resposta como "de campo desativado". `diario-de-plantao` FR-078 generaliza isso para a ficha, com "escrita nova sob modelo mudado recusada com conflito" — mas aquela change **ainda não tem `tasks.md`**, não foi decomposta nem implementada, e tem a pendência P2 (quais campos nascem obrigatórios) |

---

## 10. Entrega por fases

### MVP dela

| Item do MVP | Estado | Observação |
|---|---|---|
| Cadastro | (c) | FR-001, DF-019; cadastro completo exigido para casos novos desde a entrega 2 |
| Perfis de acesso | (c) | Três perfis + quatro funções de conta. Não são os seis dela |
| **Pré-anamnese** | **(a)** | Não existe |
| Anamnese profissional | (c) | 6 seções configuráveis, fonte e data por resposta, histórico imutável |
| Anexos | (c) | Drive institucional implementado; bloqueado pelo segredo no Vault |
| **Avaliação funcional** | **(a)** | Não existe |
| Histórico | (c) | Append-only + linha do tempo FR-007 com 12 fontes |
| Exportação PDF | (c) parcial | Existe; sem identidade visual nem marcação de confidencialidade |

**Dois dos oito itens do MVP dela não existem em nenhum estado** — e um deles (avaliação
funcional) é grande.

### Fase 2 dela

PTI parcial; **PFI não existe**; relatório diário está em `diario-de-plantao`; relatório de
evolução por período não existe; notificações existem **só dentro do app** (FR-072, avisos com
indicador de não lido, derivados de quatro eventos) e o envio externo é **ativamente proibido
e testado**: `supabase/tests/avisos_no_app_local.sql:289` prova que nenhuma função casa
`http|pg_net|smtp|webhook|push|whatsapp|sms|device_token`. FR-046 (WhatsApp) é fase Evolução,
(b), sem código. Fluxo de aprovação existe como carimbo.

### Fase 3 dela

**Painéis longitudinais e indicadores: (a)**, nem spec — não há gráfico, série agregada ou
dashboard. O único eixo longitudinal é a linha do tempo FR-007, que é cronologia, não
medição. **Integração de agenda: (c)** — Google Calendar com consulta, criação, alteração e
cancelamento (DF-006), migration promovida (`20261125050000_agenda_google_conexao.sql`), e
situação de realização em tabela local (decisão de 19/11, FR-024). **Automações sob revisão
humana:** FR-044 é (b) e o projeto proíbe promovê-lo silenciosamente.

---

## 11. Decisões pendentes para reunião técnica

Esta seção é a mais útil para a reunião: **quatro das seis já estão decididas, no todo ou em
parte, e estão registradas.**

| Pergunta dela | Situação | Onde está registrado |
|---|---|---|
| **1. Plataformas: web responsiva, iOS e Android?** | **Parcialmente decidida.** Web responsiva é o produto; o conforto no celular é verificado em navegador real (`pnpm run verificar:celular`). **PWA instalável com casca offline** está implementado (FR-071, `openspec/changes/pwa-e-avisos-no-app/`, service worker com `Cache-Control: no-cache` em `netlify.toml`). **App nativo iOS/Android nunca foi decidido nem proposto** | `openspec/changes/pwa-e-avisos-no-app/`, `netlify.toml` |
| **2. Hospedagem, localização dos dados, fornecedores e contrato de tratamento** | **Fornecedores decididos; localização e contrato ABERTOS.** Supabase (DF-002, projeto `drdpuxcllpymtoskmuqv`), Netlify (DF-003), OpenRouter para IA e transcrição (DF-004), Google Drive (DF-005) e Google Calendar (DF-006). A **região efetiva**, a recuperação, a retenção e os responsáveis continuam listados como pendência em `fundacao.md`, linha "Dados e operação". **Não há contrato de tratamento de dados com nenhum fornecedor no repositório** | `docs/projeto/fundacao.md`, DF-002 a DF-006 e "Decisões a esclarecer" |
| **3. Quem pode editar, validar, assinar e compartilhar cada documento?** | **Editar e validar: decidido. Assinar: ABERTO.** DF-021 (17/11): o case manager designado é o líder do caso e tem a alçada de aprovação **dentro daquele caso**, incluindo o plano de crise de FR-020. DF-023 (18/11): Case Manager é função de conta, mantendo perfil-base clínico. Aprovação de objetivo é carimbo (10/11). Compartilhar = audiência + exportação FR-032/FR-066 com destinatário e propósito registrados. **Assinatura eletrônica: zero ocorrências no repositório** | `fundacao.md` DF-021 e DF-023; `20261116150000_aprovador_plano_catalogo.sql` |
| **4. Quais documentos a família pode visualizar e em quais condições?** | **Modelo decidido; a lista por tipo, ABERTA.** O mecanismo existe e é checado no banco: `audiencia ∈ {equipe, equipe_e_familia}` por registro e por documento, pré-autorização familiar com cancelamento que revoga acesso (`20261120420000`), e, para o turno, **fundamento de autorização vigente e revogável** (`cadastro.turno_fundamento_familiar_versao`) — "parentesco nunca supre fundamento". Decisão de 20/11 em `diario-de-plantao`: nenhuma regra nova de audiência. **O que não está decidido é a lista: quais categorias de documento nascem visíveis à família** | `openspec/specs/sigilo-e-governanca/spec.md` FR-036/FR-037/FR-038; `20261125210000_turno_rotina_relatorios.sql` |
| **5. Assinatura eletrônica e integração com sistemas existentes** | **ABERTA, inteiramente.** Nada no repositório sobre assinatura, ICP-Brasil ou integração com prontuário de terceiros | — |
| **6. Prazo, orçamento, critérios de aceite e suporte pós-entrega** | **Critérios de aceite: decididos e documentados.** SC-001 a SC-012 em `docs/projeto/contexto-negocio.md` (com a ressalva de que são metas de piloto a validar, não garantia contratual), mais critérios por mudança OpenSpec e a política de verificação de `AGENTS.md` — inclusive a regra de que testes de autorização e RLS na ativação nunca podem ser pulados. **Prazo, orçamento e suporte estão fora do repositório e não serão estimados aqui** | `contexto-negocio.md`, seção Success Criteria; `AGENTS.md`, "Execução enxuta" |

---

## 12. Critérios iniciais de aceite

| Critério | Demonstrável hoje? | Evidência / o que falta |
|---|---|---|
| **(a)** mudança automática de campos por perfil etário | **Não** | Não existe. `data_nascimento` existe e está ociosa. Ver seção 6 |
| **(b)** registro da fonte da informação | **Sim** | Anamnese: `fonte` + `data` **por resposta** (`packages/contracts/src/anamnese.ts:6-9`), com a tela desabilitando os campos quando o estado é `pendente` (`web/anamnese.ts:163-182`). Histórico de saúde: `origem` + `natureza` (`profissional`/`relato_leigo`/`documento`) + `situacao` (`confirmado`/`hipotese`) (`saude.ts:16-28`). **Ressalva:** `fonte` é texto livre, não aponta para pessoa |
| **(c)** restrição efetiva de acesso entre perfis | **Sim, com uma exceção que é justamente o perfil 1 dela** | 250 arquivos de teste SQL com provas positivas e negativas; RLS forçada por fatia; revogação com efeito imediato; família barrada no banco, não na tela (`20261118210000:311`). **Mas o administrador lê conteúdo clínico sem vínculo de caso** em 8 fatias — exatamente o que "sem acesso clínico irrestrito por padrão" proíbe |
| **(d)** salvamento e recuperação de rascunhos | **Parcialmente** | **Diário: sim** — `cadastro.diario_rascunho_textual` (`20261108120000_diario_rascunho_privado.sql`), estado `rascunho`/`publicado`/`retificado`. **Anamnese: não** — o comportamento é o oposto: ao sair da tela, as alterações são **descartadas** (`web/main.ts:472`), e em conflito de versão o app manda a pessoa copiar o rascunho à mão (`web/anamnese.ts:364`). **Ficha de plantão:** FR-074 proposto em `diario-de-plantao`, sem código |
| **(e)** histórico de edição | **Sim** | Anamnese: tabela imutável com trigger (`20261106220000:38-46`) e tela "Histórico de versões" paginada (`20261112340000_historico_anamnese_privado.sql`, `web/anamnese.ts:281-300`). Diário: retificação justificada (FR-012). Turno e financeiro: append-only versionado |
| **(f)** anexo e exportação de PDF | **Parcialmente** | Anexo: sim (`web/documentos-caso.ts`, Drive), **bloqueado pelo segredo no Vault**. PDF: sim, gerado no servidor com auditoria de emissão. **Faltam identidade visual, marcação de confidencialidade e selo de versão.** E o pacote FR-032 é ZIP, não PDF |
| **(g)** separação entre registro interno e relatório compartilhado | **Sim** | `audiencia ∈ {equipe, equipe_e_familia}` no diário e no documento; visibilidade `interna`/`publica` no objetivo; rascunho privado; relatório de turno respeitando a audiência; provas negativas em `supabase/tests/` |

**Placar honesto: 4 dos 7 demonstráveis hoje, 2 parciais, 1 ausente** — e o item (c), que
passa, passa com a ressalva mais importante deste documento.

---

## Tarefas a incluir, por valor para a operação

1. **Configurar backup e provar restauração autorizada (FR-042).** É o único item cuja falha
   não tem conserto depois, e hoje o projeto está sem backup configurado, com a prova adiada
   por decisão de 13/11/2026 que valia enquanto os dados eram fictícios.
2. **Decidir e implementar o limite do Administrador institucional.** É o primeiro perfil do
   documento dela e hoje o produto faz o contrário em oito fatias; quanto mais código
   depender do comportamento atual, mais caro fica mudar.
3. **Pré-anamnese por link para a família.** É o passo 2 da jornada dela e o único mecanismo
   que tira a digitação do caminho crítico da Edilaine — hoje toda informação familiar passa
   pelas mãos dela ou vem como relato dentro do app.
4. **Rascunho recuperável da anamnese.** É o critério (d) dela, é barato perto do resto, e
   hoje a anamnese descarta trabalho ao sair da tela — o que machuca justamente a tarefa mais
   longa do produto.
5. **Adaptação de campos por faixa etária.** É o critério (a) dela, o primeiro que ela
   escolheu listar, e exige mudar o modelo de configuração do roteiro, não só o conteúdo.
6. **Registro geral de base legal, finalidade, audiência e versão dos termos (FR-038).** Hoje
   só existe para a audiência familiar do turno; sem isso não há como sustentar o
   enquadramento LGPD que ela mesma exige antes de dados reais.
7. **Identidade visual, marcação de confidencialidade e selo de versão no PDF.** É o artefato
   que sai da casa e chega a terceiros; é o critério (f); e é trabalho pequeno sobre um
   gerador que já está correto e auditado.
8. **Avaliação funcional por domínio com nível de apoio.** É o conteúdo inteiro do PFI; sem
   ela, "plano funcional" não tem o que preencher.
9. **Plano de resposta a incidentes.** Exigência explícita da seção 9 dela, inexistente, e
   não depende de código — depende de responsável, canal e prazo definidos. Já existe tarefa
   aberta para isso desde a fundação (`fundar-identidade-e-seguranca-backend/tasks.md:370`).
10. **Seções emocional/comportamental e sobrecarga familiar na anamnese.** Como perguntas de
    texto é só configuração do roteiro; entrega valor imediato sem abrir frente de código.
11. **Relatório de evolução por período e consolidado mensal.** Completa a família de
    relatórios da seção 8 dela, reusando o mecanismo de FR-062/FR-065 que já existe.
12. **Frequência, indicador, meta e prazo no objetivo do plano.** Hoje só há texto livre;
    sem campo estruturado, nenhuma medida de progresso é consultável depois.
13. **HSTS e CSP global, e o conflito de `Permissions-Policy` com FR-067.** Trabalho de
    minutos em `netlify.toml`, debaixo da exigência de "criptografia em trânsito" dela — e o
    `geolocation=()` atual pode derrubar o check-in do turno antes mesmo de ser testado.

---

## Perguntas materiais para a Edilaine

Só as que mudam o produto conforme a resposta.

1. **O Administrador deve perder acesso ao conteúdo clínico de casos em que não tem
   vínculo?** Hoje tem acesso em diário, plano, saúde, encaminhamento, orientação,
   contexto/rede, documento e plano de crise. Se a resposta for sim, muda RLS de oito fatias
   — e muda a rotina da própria Edilaine, que é Administrador e case manager.
2. **"AT/enfermagem" é perfil de autorização ou rótulo do registro?** A decisão de 20/11
   tratou papel declarado como rótulo sem efeito de permissão. Se ela quiser permissões
   próprias para AT e enfermagem, o enum de perfil muda e todas as provas de autorização são
   refeitas.
3. **"Paciente/responsável" é o responsável familiar que já existe, ou o paciente com conta
   própria?** São dois produtos. O responsável familiar está pronto; o paciente como sujeito
   de autenticação não existe, é fase Evolução (FR-048) e abre questões de idade,
   representação e audiência.
4. **"Sponsor/financeiro" é pessoa externa com conta própria?** Hoje a audiência financeira é
   marca sobre profissional, e família nunca a alcança — por desenho, para que pagar não dê
   acesso à saúde. Um sponsor com login é um caminho de autorização novo.
5. **A pré-anamnese é enviada a um familiar já cadastrado, ou é link aberto para quem a
   pessoa encaminhar?** Reaproveitar a conta familiar é incremental; link anônimo é superfície
   pública nova, com modelagem de ameaças própria.
6. **PTI e PFI são dois documentos com aprovação separada, ou um plano com duas visões?** O
   produto tem um plano só, de propósito. Dois documentos dobram aprovação, revisão,
   versionamento e exportação.
7. **A aprovação do plano é portão ou carimbo?** Hoje é carimbo, por decisão de 10/11/2026: o
   objetivo vale sem aprovação. Virar portão muda o fluxo de trabalho da equipe.
8. **No "relatório de evolução semanal/mensal", quem escreve o progresso e as dificuldades?**
   Se o sistema deve resumir, isso colide com o limite da seção 1 dela e com FR-065, que
   proíbe tendência interpretada. Se o profissional escreve e o sistema só reúne, é direto.
9. **A avaliação funcional serve para calcular indicador, ou só para registrar e exibir?** Ela
   escreve "definir critérios operacionais antes de calcular indicadores" e "não interpretar
   níveis como escala clínica validada" — as duas frases juntas pedem uma decisão explícita.
10. **Assinatura eletrônica: há exigência real, em qual documento e com qual padrão?** Nada
    existe hoje, e a resposta define se é integração com terceiro ou recurso próprio.
11. **Quais categorias de documento a família vê por padrão?** O mecanismo de audiência está
    pronto; a lista é regra de negócio dela.
12. **A adaptação por faixa etária entra no MVP?** É o critério de aceite (a) dela e hoje não
    é demonstrável; se entra, precisa vir antes da pré-anamnese, porque o formulário externo
    herdaria a mesma lógica de campos.

---

## Contradições com decisões já tomadas

Registradas aqui para a reunião, sem serem resolvidas neste documento.

1. **Administrador sem acesso clínico irrestrito** × comportamento atual em oito fatias, e ×
   DF-021, que trata a liderança da Edilaine sobre as case managers como o perfil
   Administrador.
2. **Seis perfis** × DF-016 ("um perfil por usuário", entre Administrador, Profissional e
   Família) e DF-023 (quatro funções de conta sobre perfil-base clínico).
3. **AT/enfermagem como perfil** × decisão de 20/11/2026 em `diario-de-plantao`: papel
   declarado, catálogo administrado, **sem efeito de autorização**, enum `usuario.perfil`
   inalterado.
4. **Sponsor/financeiro como perfil** × desenho da audiência financeira como marca sobre
   `profissional`, com família estruturalmente fora.
5. **PTI e PFI como documentos separados** × FR-015, que evita multiplicar nomes de plano sem
   prática validada da equipe.
6. **"Ambiente de testes apenas com dados sintéticos; evitar dados reais em protótipos"** e o
   cabeçalho CONFIDENCIAL do documento dela × a decisão do solicitante de 13/11/2026 de tornar
   o repositório **público**, ciente de que 39 arquivos nomeiam pessoas reais.
7. **"Relatório de evolução com progresso e dificuldades"** × FR-065, que proíbe conclusão
   clínica, tendência interpretada ou recomendação no consolidado — e × a seção 1 do próprio
   documento dela.
