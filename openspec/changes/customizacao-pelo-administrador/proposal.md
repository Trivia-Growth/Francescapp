# Proposal

## Why

O solicitante quer **reduzir dependência de deploy**: o que a operação precisa mudar no
dia a dia — vocabulário, rótulo, limite, texto institucional, interruptor de fatia — não
deveria exigir alteração de código.

O inventário de 20/11/2026 (`docs/processo/inventario-customizacao-ui-20-11-2026.md`)
varreu os conjuntos fechados de `packages/contracts/src/`, as 57 chaves `ffcm.*` semeadas
em migrations com seus leitores em TypeScript **e** em SQL, os textos institucionais de
`web/` e dos geradores de PDF, e as constantes de limite. Ele mostrou três coisas.

**Primeiro: o mecanismo existe e está subaproveitado.** `identidade.configuracao_sistema`
já tem 57 chaves, tela genérica que lista tudo sem filtro
(`20261117410000_configuracao_sistema_operacoes_privadas.sql:102-106`), e leitores prontos
(`textoConfigurado`, `numeroConfigurado`, `listaConfigurada`, `servicoAtivo` em
`netlify/functions/_shared/configuracao-servidor.ts`). Mas `numeroConfigurado` tem **um
único** ponto de uso em todo o repositório.

**Segundo: há quatro defeitos que fazem a tela mentir para quem administra.**

- `ffcm.financeiro.ativo` e `ffcm.avisos.ativos` foram semeadas com
  `exposicao='administracao'` (`20261127300000_configuracao_financeiro_avisos.sql:16-23`),
  mas são lidas por `servicoAtivo`, e o leitor do servidor expõe **somente**
  `exposicao='servidor'` (`20261117420000_configuracao_sistema_leitor_servidor.sql:19,25`).
  O Administrador liga o Financeiro na tela, a gravação é aceita, e o servidor continua
  usando a variável de ambiente. Sem erro nenhum.
- `ffcm.papel_declarado.ativo` e `ffcm.substituicao_cm.ativo` são lidas pelo código
  (`netlify/functions/papel-declarado.ts:25`,
  `netlify/functions/substituicao-case-manager.ts:38`) e **nunca foram semeadas**. Não há o
  que ligar na tela: só por deploy.
- `ffcm.equipe.vinculos_ativa` está semeada (`20261121100000_configuracao_servicos.sql:224`)
  e **ninguém a lê** — `netlify/functions/vinculos-profissionais.ts:35` ainda usa
  `process.env.FFCM_CONSULTA_VINCULOS_ATIVA`. Interruptor que não liga nada.
- `api.configurar_catalogo_turno` e `api.consultar_catalogo_turno` existem no banco e no
  contrato (`packages/contracts/src/turno-execucao.ts:148-149`), mas **não têm rota** em
  `rotas.ts` nem tela em `web/`. A capacidade administrativa está pronta e inalcançável.

**Terceiro: falta a faixa.** `numeroConfigurado`
(`netlify/functions/_shared/configuracao-servidor.ts:149-166`) recebe `minimo` e `maximo`
**como argumentos em código** e, fora da faixa, devolve silenciosamente o padrão. A tabela
não tem coluna de mínimo nem de máximo, então **nenhum CHECK recusa a gravação**: o valor
absurdo é aceito, o Administrador vê o número que digitou, e o servidor usa outro. Hoje
`ffcm.turno.tolerancia_atraso_minutos` aceita até 999.999.999 minutos
(`20261125130000_turno_consulta_atual.sql:132`) — cerca de 1.900 anos de tolerância de
atraso, pela tela.

Enquanto a faixa não existir no banco, **nenhum teto de arquivo e nenhum prazo devem virar
chave de configuração**, porque isso transferiria para a tela a capacidade de enfraquecer
um controle sem nada que a contenha.

## What Changes

- **Faixa no catálogo de configuração.** Colunas `minimo`/`maximo` em
  `identidade.configuracao_sistema`, definidas por migration e **sem `UPDATE` para o owner
  administrativo**, exatamente como `opcoes` já é tratada em
  `20261119110000_configuracao_sistema_opcoes.sql`. CHECK recusa gravação fora da faixa, em
  vez de aceitar e ignorar.
- **Correção dos quatro defeitos** listados acima: `exposicao` certa para as duas chaves de
  interruptor, semente para as duas chaves órfãs, e decisão registrada sobre
  `ffcm.equipe.vinculos_ativa`.
- **Rota e tela para o catálogo de medidas do turno**, reusando
  `web/servico-catalogo-administrado-http.ts`, que já serve o modelo da ficha e o catálogo
  de papéis.
- **Vocabulário de registro administrado** para os conjuntos verificados como vocabulário
  puro: `momento`/`aceitacao`/`qualidade`/`eliminacao` da rotina do turno, `momento` e
  `motivo_ausencia` da localização, tipo de escala, período do plantão, motivo de barreira,
  `CATEGORIAS_CONTEXTO` e `VINCULOS_REDE`.
- **Textos institucionais de marca** por chave `exposicao='publica'`: assinatura da casa
  (`web/index.html:221`, `netlify/functions/_shared/turno-execucao-nativo.ts:569`,
  `web/documentos-caso.ts:488`) e cabeçalho da tela de regras (`web/index.html:206`).
- **`<textarea>` para `tipo='texto'`** em `web/configuracao-sistema.ts:135-139`, hoje um
  `<input>` de uma linha — o que torna desconfortável escrever as regras de atendimento
  que já são configuráveis.
- **Duas invariantes negativas** escritas como requisito: configuração nunca amplia acesso,
  e vocabulário mudado nunca reescreve registro, relatório ou exportação já emitidos.

## Decisões registradas

1. **Nenhum quarto mecanismo.** Tudo usa os três que já existem:
   `identidade.configuracao_sistema` (M1), o catálogo de campos extras generalizado (M2) e
   `cadastro.turno_catalogo_medida` (M3). A escolha de cada classe está no `design.md`.
2. **Continua valendo que o catálogo vem por migration e a tela edita valor.** `minimo` e
   `maximo` entram como `opcoes` entrou: definidos na semente, fora do grant de coluna do
   owner administrativo.
3. **O limite do limite é a faixa, não um papel novo.** Não há requisito para um segundo
   nível de aprovação, e inventar um seria arquitetura não aprovada. A proteção é a faixa
   ser estreita o bastante para que qualquer valor dentro dela seja aceitável — o padrão que
   `packages/contracts/src/transcricao.ts:31` já estabelece: "a configuração pode baixar,
   nunca subir".
4. **Registro antigo é julgado pela regra da sua época.** O padrão já existe:
   `cadastro.turno.parametros` congela no turno os parâmetros vigentes na abertura
   (`20261125130000_turno_consulta_atual.sql:134`). Todo limite que virar configuração
   carimba assim.

## Fora de escopo

Entram no inventário como categoria C, e **esta proposta não os torna configuráveis**:

- Tetos de áudio (`AUDIO_BYTES_MAXIMO`, `AUDIO_PARTES_MAXIMO`, `AUDIO_SEGUNDOS_MAXIMO`,
  `packages/contracts/src/transcricao.ts:25,29,31`): subi-los estoura o atestado de 1 MiB
  que sustenta a autorização, não só o banco.
- Retenção de 90 dias da localização
  (`20261125220000_turno_localizacao.sql:12`): é a promessa escrita no consentimento que a
  pessoa aceitou (`web/turno-execucao-localizacao.ts:121`).
- Avisos obrigatórios de FR-020 (`web/plano-crise.ts:22,24`), ressalvas de "sem
  interpretação clínica automática", e textos que descrevem o controle de acesso.
- Todo conjunto que decide autorização, audiência, forma de payload, AAD de cifra ou
  código de erro.
- Tetos de tamanho de arquivo (`TAMANHO_MAXIMO_DOCUMENTO`, `TAMANHO_MAXIMO_ANEXO_TURNO`,
  `TAMANHO_MAXIMO_COMPROVANTE_BYTES`): **só depois** de FR-085 estar entregue e provado.
  São classificados como maduros no inventário, mas dependem da faixa existir primeiro.
- O modelo de síntese por área de FR-009 (`web/modelo-sintese.ts:31-39`): promessa de spec
  ainda não cumprida, sobre conteúdo clínico cifrado, com esforço grande. Precisa de
  confirmação antes de virar tarefa.
- Textos dentro de pacote entregue a terceiro (`web/pacote-exportacao.ts`,
  `_shared/turno-execucao-caso-pdf.ts`): dependem do histórico de versão de texto, que M1
  não tem hoje. Ver pendência P3.
- Templates de e-mail do Supabase Auth: **não estão neste repositório**.

## Pendências que não podem ser inferidas

Bloqueiam a tarefa indicada em `tasks.md`; não são supostas pelo executor.

- **P1 — Faixa aceita de cada limite.** Qual o mínimo e o máximo de
  `ffcm.turno.tolerancia_atraso_minutos` e `ffcm.turno.duracao_padrao_minutos`. É regra de
  negócio da casa. Bloqueia 3.2.
- **P2 — `ffcm.equipe.vinculos_ativa`: migrar o leitor ou remover a chave?** Bloqueia 2.4.
- **P3 — Texto institucional dentro de pacote entregue a terceiro pode mudar?** Se sim,
  exige histórico de versão de texto em M1, que hoje não existe. Bloqueia qualquer extensão
  de FR-084 além dos textos de marca. Bloqueia 5.4.
- **P4 — Acrescentar vocabulário é necessidade real ou possibilidade teórica?** Mecanismo de
  catálogo tem custo; se a operação nunca vai acrescentar um sexto momento de refeição, o
  trabalho não tem destino. Bloqueia 4.1.
- **P5 — Tolerância e duração de turno devem ser globais ou por caso?** Hoje são globais e
  nenhuma spec as descreve, enquanto a periodicidade vizinha é por caso
  (`cadastro.acordo_acompanhamento`). **Suposição conservadora: manter globais.** Bloqueia
  apenas a escolha de um desenho diferente deste.

## Capabilities

### Added Capabilities

- `configuracao-e-customizacao`: reúne o que o Administrador pode mudar pela plataforma sem
  deploy — faixa de limite operacional (FR-085), vocabulário de registro administrado
  (FR-082), alcance pela interface do que já existe no banco (FR-083), textos
  institucionais (FR-084), integridade do catálogo de chaves (FR-086), e as duas
  invariantes que impedem a configuração de virar caminho de acesso (FR-087) ou de
  reescrever o passado (FR-088).

## Impact

Contratos (`packages/contracts/src/configuracao-sistema.ts`, rotas novas em `rotas.ts`),
servidor (`netlify/functions/_shared/configuracao-servidor.ts` e as rotas tocadas),
persistência (migrations novas sobre `identidade.configuracao_sistema`,
`cadastro.turno_catalogo_medida` e `cadastro.campo_extra_plano_catalogo`) e interface
(`web/configuracao-sistema.ts`, `web/servico-catalogo-administrado-http.ts`, telas novas de
catálogo).

Esta mudança **não** altera `usuario.perfil`, **não** altera a audiência de FR-062, **não**
cria caminho de autorização novo e **não** toca cifra, AAD ou esquema de conteúdo clínico.
Corrige quatro defeitos de configuração já existentes e acrescenta a faixa que hoje falta.

Esta proposta não autoriza deploy, migração remota, concessão de acesso, uso de dados
reais ou qualquer operação externa.
