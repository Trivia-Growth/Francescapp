# Decisões técnicas — customização pelo Administrador (FR-082 a FR-088)

## Contexto

O repositório já tem **três** mecanismos de customização, com semânticas diferentes, e o
primeiro objetivo deste desenho é não criar um quarto.

- **M1 — `identidade.configuracao_sistema`**
  (`supabase/migrations/20261117400000_configuracao_sistema.sql:21-41`). Chave→valor, com
  `tipo`, `rotulo`, `descricao`, `exposicao`, `opcoes` e versão otimista. O catálogo vem por
  migration; a tela edita **valor**. A operação administrativa só faz `UPDATE`, e o grant de
  coluna do owner cobre apenas `valor`, `versao`, `atualizado_por_usuario_id` e
  `atualizado_em`. **Não guarda o valor anterior.**
- **M2 — catálogo de campos extras generalizado**
  (`20261127100000_campo_extra_catalogo_generalizado.sql`). Linhas criadas **em runtime**
  pelo Administrador, com `escopo`, `ordem`, `obrigatorio`, `de_fabrica`, `visibilidade` e
  seis tipos. Sem grant de `DELETE`: remover é `ativo=false`. O valor correspondente vive em
  envelope cifrado append-only, e a escrita sob catálogo mudado é recusada com `conflito`
  (`supabase/tests/plano_campos_extras_local.sql:64-76`).
- **M3 — `cadastro.turno_catalogo_medida`**
  (`20261125200000_turno_execucao_clinica.sql:29-37`). Conjunto **fechado por CHECK**; o
  Administrador só altera `ativo` e `referencia_informativa`.

A distinção que organiza tudo o que segue: **M2 deixa o cliente inventar um termo novo; M3
não.** M1 não é catálogo de termos — é parâmetro do sistema.

## D1 — Qual mecanismo serve a cada classe de achado

| classe de achado | mecanismo | por quê |
|---|---|---|
| Interruptor de disponibilidade de fatia | **M1** booleano | Já é o padrão de ~40 chaves, com `servicoAtivo` e falha-fechada provados em `netlify/functions/_shared/configuracao-servidor-falha.test.ts` |
| Limite operacional numérico | **M1** numérico **+ faixa** (D2) | É parâmetro do sistema, não termo de vocabulário. Precisa de mínimo e máximo, que M1 hoje não tem |
| Texto institucional de marca | **M1** texto, `exposicao='publica'` | O mecanismo já existe e já funciona para as quatro chaves `ffcm.regras.*` de FR-041 |
| Vocabulário cujo significado é clínico ou estruturalmente acoplado a um CHECK | **M3** | O cliente pode desativar e anotar referência; não pode inventar o termo |
| Vocabulário puramente descritivo, que a operação pode legitimamente inventar | **M2**, com escopo novo | É exatamente o que M2 foi generalizado para fazer em FR-078 |

Concretamente, dos achados do inventário:

- `momento`/`aceitacao`/`qualidade`/`eliminacao` da rotina do turno → **M3**. Parecem
  descritivos, mas cada um está casado a um CHECK de `turno_medida_versao`
  (`20261125200000_turno_execucao_clinica.sql`) que liga o termo às colunas que ele exige —
  `eliminacao` exige `contagem`, `sono` exige `inicio`/`fim`. Um termo inventado pela tela
  chegaria sem essa forma. M3 permite desativar e anotar, que é o que a operação pede.
- `CATEGORIAS_CONTEXTO` (`packages/contracts/src/contexto-cuidado.ts:8`) e `VINCULOS_REDE`
  (`rede-cuidado.ts:9`) → **M2**, escopo novo. São listas descritivas sem CHECK que as
  acople a colunas, verificadas sem nenhum `if` por valor, e `VINCULOS_REDE` já é declarado
  inócuo na própria tela (`web/rede-cuidado.ts:112`: "marcar aqui não dá acesso à ficha").
- Período do plantão, tipo de escala, motivo de barreira, momento e motivo de ausência da
  localização → **M3**. São pequenos, fechados, e FR-075 já pede "conjunto administrado".

**Alternativa descartada:** usar M2 para tudo, por ser o mecanismo mais rico. Descartada
porque M2 deixa o Administrador **criar** termo, e criar um tipo de medida ou um estado de
turno pela tela produz registro que nenhum CHECK sustenta e nenhuma projeção sabe ler — o
risco que `turno_catalogo_medida` foi desenhado para evitar. Riqueza de mecanismo não é
argumento contra um conjunto deliberadamente fechado.

**Alternativa descartada:** criar uma tabela genérica de "catálogos administráveis" que
unificasse M2 e M3. Descartada por KISS e por ameaça concreta: unificar significaria um
único grant cobrindo tanto o catálogo que aceita termo novo quanto o que não aceita, e a
diferença entre os dois voltaria a ser uma coluna de configuração — isto é, exatamente o
tipo de distinção que não deve ser editável.

## D2 — A faixa: o limite do limite

**Decisão.** `identidade.configuracao_sistema` ganha `minimo` e `maximo`, aditivos e
anuláveis, tratados **exatamente como `opcoes`** já é tratada em
`20261119110000_configuracao_sistema_opcoes.sql`:

1. Definidos na semente, por migration.
2. **Fora do grant de coluna** do owner administrativo, que hoje cobre só `valor`, `versao`,
   `atualizado_por_usuario_id` e `atualizado_em`. Nem um defeito na função administrativa
   conseguiria alargar a faixa.
3. CHECK na tabela recusando `valor` fora de `[minimo, maximo]` quando `tipo='numero'` —
   pelo mesmo motivo registrado em `20261119110000:9-12`: a restrição vale para **qualquer**
   caminho de escrita, não só para o caminho feliz da função.

O problema que isso corrige é concreto e está no código hoje: `numeroConfigurado`
(`netlify/functions/_shared/configuracao-servidor.ts:149-166`) recebe a faixa **como
argumento em TypeScript** e, fora dela, devolve silenciosamente o padrão. O valor absurdo
**é aceito e gravado**; o Administrador vê o número que digitou, acredita que ele vale, e o
servidor usa outro. Hoje `ffcm.turno.tolerancia_atraso_minutos` aceita até 999.999.999
minutos (`20261125130000_turno_consulta_atual.sql:132`).

Esta não é invenção nova. `cadastro.acordo_acompanhamento`
(`20261118300000_sinal_operacional_caso.sql:35-37`) já prende cada periodicidade com
`check (… between 1 and 365)` e `between 1 and 180`. **A faixa é o padrão da casa para valor
operacional; a configuração global é que deixou de segui-lo.**

**Quem pode mudar.** Continua sendo só o Administrador. Não criamos papel novo nem segundo
nível de aprovação: não há requisito para isso, e inventá-lo seria arquitetura não aprovada.
A proteção é a **faixa ser estreita o bastante para que qualquer valor dentro dela seja
aceitável**. Para limite que protege um controle, vale a regra já escrita em
`packages/contracts/src/transcricao.ts:31` — "a configuração do sistema pode baixar, nunca
subir": o `maximo` do catálogo nunca excede o teto definido em código.

**Alternativa descartada:** validar a faixa só no servidor, onde `numeroConfigurado` já a
conhece. Descartada porque é o comportamento de hoje, e ele é a origem do defeito: a
gravação é aceita e o efeito é silenciosamente outro. Validação que não recusa não é
validação, é um `catch` com cara de regra.

**Alternativa descartada:** faixa editável pela tela, "para o Administrador ajustar o
intervalo quando a operação mudar". Descartada porque anula o controle: quem pode alargar a
faixa pode gravar qualquer valor, e a faixa deixa de existir como limite.

## D3 — Histórico quando o significado muda depois de já ter sido usado

Três comportamentos distintos, que não devem ser confundidos. Nenhum deles é inventado aqui
— os dois primeiros já existem no repositório.

**Limite → carimbo no registro.** O padrão provado é `cadastro.turno.parametros`: a abertura
do turno lê as três chaves sob `for share` e **congela** os valores vigentes dentro do
próprio turno (`20261125130000_turno_consulta_atual.sql:128-134`). O registro antigo
continua julgado pela regra da sua época, sem recálculo e sem ficar irregular quando o
limite muda. Todo limite que virar configuração carimba assim (FR-085, último cenário).

**Vocabulário → sem `DELETE`, com conflito.** M2 já resolve, e as provas existem: sem grant
de `DELETE`, "remover" é `ativo=false`; o valor vive em envelope append-only, então mudar o
catálogo não toca resposta antiga; a escrita sob catálogo mudado manda o retrato
`id→versão` e o banco **recusa com `conflito`**, nunca ajusta em silêncio
(`supabase/tests/plano_campos_extras_local.sql:64-76`); e a interface mantém visível o valor
de campo inativo (`web/plano-cuidado.test.ts:498-595`). FR-079 já exige que a ficha antiga
continue exibindo o papel declarado à época. M3 tem a mesma propriedade por construção: o
termo nunca sai do CHECK, só perde `ativo`.

**Texto institucional em documento emitido → não resolvido, e por isso fora de escopo.**
M1 **não guarda o valor anterior** (`20261117400000:21-41` tem só `atualizado_por_usuario_id`
e `atualizado_em`). Reemitir um relatório de período passado imprimiria a ressalva de hoje
sobre conteúdo de ontem. Por isso esta proposta torna configuráveis **apenas os textos de
marca** — assinatura da casa e cabeçalho da tela de regras —, que não vão dentro de pacote
entregue a terceiro. Os textos de `web/pacote-exportacao.ts` e
`_shared/turno-execucao-caso-pdf.ts` ficam fixos até que exista histórico de versão de
texto. É a pendência P3, e ela **bloqueia** a tarefa 5.4.

**Alternativa descartada:** acrescentar versionamento de texto a M1 agora, junto do resto.
Descartada por recorte: é uma fatia própria, com decisão de retenção e de qual documento
aponta para qual versão, e misturá-la aqui atrasaria as correções de defeito que têm valor
imediato e risco quase nulo. Registrada como pendência, não como suposição.

## D4 — Por que a configuração não vira caminho de ampliação de acesso

A invariante já está escrita na decisão 3 de
`openspec/changes/configuracao-no-banco/proposal.md` e no comentário de
`20261117400000:16-18`: **configuração decide disponibilidade do serviço, não permissão de
quem chama.** FR-087 a promove a requisito verificável, com quatro garantias:

1. **Ligar não autoriza.** A rota ligada continua validando sessão, concessão e atestado no
   banco. O cenário negativo de FR-087 exige a prova: fatia ligada, ator sem vínculo, negado
   no servidor **e** no banco, auditado.
2. **Nenhuma chave decide audiência.** O conjunto administrável exclui, por construção,
   `audienciaDiarioSchema`, `audienciaDocumentoSchema`, `visibilidade*` e os perfis — todos
   classificados como categoria C no inventário, com o `if` localizado. O caso mais
   instrutivo é `tipoRegistroDiarioSchema`: parece vocabulário, e
   `20261118210000_diario_operacoes_privadas.sql:314` faz
   `if papel='colaborador' and tipo<>'evolucao_profissional'` — um tipo novo criado pela tela
   não casaria com a condição e abriria ao colaborador um caminho de escrita que a regra
   pretende negar.
3. **A administração não se tranca por fora.** Já é decisão registrada
   (`configuracao-no-banco/proposal.md`, decisão 4): a rota de configuração não lê a si
   mesma, senão um valor errado gravado pela tela trancaria a própria tela que o corrigiria.
   Pelo mesmo motivo, `JANELA_MS` e `ESPERA_RETENTATIVA_MS`
   (`configuracao-servidor.ts:23,30`) — a janela de cache **da própria configuração** —
   permanecem em código: um valor errado se auto-perpetuaria por esse tempo.
4. **Nada de cifra, AAD ou esquema.** Os enums de `tabela` e `campo`
   (`packages/contracts/src/turno-execucao.ts:113,126`, `rpc.ts`) entram no dado adicional
   autenticado. Editáveis pela tela, quebrariam a decifragem de conteúdo clínico já gravado
   — perda de dado, não falha de tela.

**Alternativa descartada:** permitir que a configuração desligue uma barreira de
autorização "para destravar operação urgente". Descartada sem contrapartida: as chaves
`*.barreira_ativa` que existem hoje desligam a **conferência prévia** de uma fatia, não a
autorização, e essa distinção precisa continuar explícita. Nenhuma chave nova desta proposta
toca caminho de autorização.

## D5 — Relatório e exportação já emitidos

FR-088 fixa o que D3 implica: documento entregue **não** é reescrito por mudança posterior.
Duas consequências de desenho:

- **Consulta de período passado** apresenta o termo declarado à época, não o vigente. Isso
  vem de graça do envelope append-only de M2 e do `ativo=false` de M3 — o termo antigo
  continua lá. O que precisa de cuidado é a **apresentação**: a interface já sabe mostrar
  valor de campo inativo (`web/plano-cuidado.test.ts:498-595`), e o mesmo comportamento vale
  para termo desativado.
- **Pacote já exportado** é imutável por construção: `web/pacote-exportacao.ts` monta o ZIP
  a partir do manifesto persistido, e o registro de exportação aponta o que foi entregue. A
  mudança de vocabulário não o alcança. FR-088 escreve isso como cenário para que uma
  implementação futura não introduza resolução de rótulo em tempo de leitura do manifesto.

## Suposições conservadoras — resumo

Marcadas porque o solicitante não decidiu. As que mudariam o recorte viraram pendência
bloqueante em `tasks.md`.

- **S1 — SUPOSIÇÃO CONSERVADORA.** Limite de segurança continua sendo alterável só por
  Administrador, sem papel novo e sem segundo nível de aprovação. A proteção é a faixa
  estreita. (Ver P1 em `proposal.md`.)
- **S2 — SUPOSIÇÃO CONSERVADORA.** `maximo` de limite de proteção nunca excede o teto
  definido em código, seguindo `transcricao.ts:31`. A configuração só restringe.
- **S3 — SUPOSIÇÃO CONSERVADORA.** Textos que vão dentro de pacote entregue a terceiro
  permanecem fixos nesta fatia, até existir histórico de versão de texto. (P3.)
- **S4 — SUPOSIÇÃO CONSERVADORA.** Parâmetros de turno permanecem **globais**, como hoje,
  e não passam a ser por caso. (P5.)
- **S5 — SUPOSIÇÃO CONSERVADORA.** Nenhum teto de tamanho de arquivo vira configuração
  **antes** de FR-085 estar entregue e provado. Eles são maduros, mas dependem da faixa.
- **S6 — SUPOSIÇÃO CONSERVADORA.** `ffcm.equipe.vinculos_ativa` não é removida por conta
  própria: migrar o leitor ou remover a chave é decisão do solicitante. (P2.)

## Achados de defeito que esta mudança corrige

Verificados linha a linha no inventário, e registrados aqui porque mudam o que a tela de
Administração significa hoje:

1. `ffcm.financeiro.ativo` e `ffcm.avisos.ativos` nasceram `exposicao='administracao'`
   (`20261127300000_configuracao_financeiro_avisos.sql:16-23`) e são lidas por `servicoAtivo`,
   cujo leitor expõe **somente** `exposicao='servidor'`
   (`20261117420000_configuracao_sistema_leitor_servidor.sql:19,25`). Ligar na tela não tem
   efeito, e não há erro.
2. `ffcm.papel_declarado.ativo` e `ffcm.substituicao_cm.ativo` são lidas
   (`papel-declarado.ts:25`, `substituicao-case-manager.ts:38`) e nunca foram semeadas.
3. `ffcm.equipe.vinculos_ativa` está semeada (`20261121100000:224`) e ninguém a lê —
   `vinculos-profissionais.ts:35` usa `process.env.FFCM_CONSULTA_VINCULOS_ATIVA`.
4. `api.configurar_catalogo_turno` (`packages/contracts/src/turno-execucao.ts:148-149`) não
   tem rota nem tela.

Os três primeiros são o conteúdo de FR-086; o quarto é FR-083.
