# Sistema de design do FFCMApp

Proposta para revisão no PR e execução depois da migração React. Base do inventário: `main@7da65b4`, por inspeção de fonte. `DESIGN.md` descreve a interface vigente. Os valores a seguir são o alvo da reforma, com fontes e marca provisórias até o material do marketing. A referência Figma exige acesso e ficou fora da análise. [Design vigente](../../DESIGN.md) · [Auditoria e plano, PR #24](https://github.com/Trivia-Growth/Francescapp/pull/24) · [Direção visual, PR #27](https://github.com/Trivia-Growth/Francescapp/pull/27)

## 1. Composição por tarefa

A família volta ao app sem treinamento. Em cada abertura, precisa reconhecer **de quem se trata, o que mudou e onde agir**. Na ficha, o nome da pessoa fica acima do título da folha. Na home, o bloco verde de Hoje fixa o dia e o contexto da pessoa. Horários e eventos abrem a sequência. Atualizações aparecem em linhas datadas com o tipo de publicação e um destino nomeado. A equipe usa a mesma gramática para pendências, turnos e decisões.

| Intenção | Ordem do conteúdo | Ação |
|---|---|---|
| **Consulta** | Contexto → título → filtros aplicados → registros ou conteúdo vigente. As linhas começam no mesmo eixo do título. | Uma ação principal de página quando necessária. Abrir item por link nomeado. Atualização manual é secundária e fica junto da lista. |
| **Cadastro ou edição** | Contexto → título com o verbo → campos em grupos → recuperação e ações. Um formulário longo abre página própria. Uma seleção breve ou confirmação usa diálogo. | Um envio por etapa. Ao salvar, voltar ao registro ou lista com confirmação e foco recuperado. |
| **Configuração** | Contexto administrativo → valor vigente e alcance → ação de alteração → histórico quando existente. | Abrir edição por intenção. Confirmações de permissão, publicação e revogação mostram alvo e efeito antes do comando. |
| **Decisão contextual** | Pessoa → item e versão → estado atual → audiência e consequência → ação. | Um avanço principal por estado. A recuperação ocupa esse lugar quando a operação estiver bloqueada. |

**Discordância com a hipótese do #27.** Em Equipe, consulta e convite disputam atenção e compartilhar a mesma página explica parte do problema. A auditoria também achou um defeito independente: a 390 px, colunas de 77 px cortam a identidade e o estado de acesso. Separar o convite deixa a conferência ilegível se a tabela continuar igual. No catálogo emocional, trazer a lista para cima resolve a ordem visual, enquanto voltar à tela ainda repete a espera. São três aceites distintos: precedência do conteúdo, legibilidade e estabilidade na volta. Aumentar caixas indiscriminadamente agravaria a leitura de instruções. A largura pertence à grade, o comprimento de linha pertence ao texto. [Evidências e medidas do PR #24](https://github.com/Trivia-Growth/Francescapp/pull/24)

Do Atendimento, usar o ritmo de 4 px, a diferença clara entre título e controle, uma ação dominante por região e feedback junto da tarefa. Conferência em `76a3ccda`, `DESIGN.md` e `packages/ui/tokens.css`. O FFCMApp adota Cormorant Garamond apenas no título da página e Raleway na leitura e operação, com corpo de 16 px para os dois públicos. A concentração do verde em Hoje dá uma referência de orientação comum à família e à equipe.

## 2. Tokens

Valores em px CSS na base de 16 px. Declarar espaço, medidas de conteúdo, fontes e áreas de toque em `rem` equivalentes para acompanhar preferências de tamanho. Usar linhas e contorno de foco em px CSS. Caminhos React e páginas públicas consomem os mesmos papéis, respeitando a CSP vigente. Componentes reutilizam o token sem repetir o hex.

| Token | Valor | Uso |
|---|---|---|
| `--espaco-1` / `--espaco-2` / `--espaco-3` | 4 / 8 / 12 px | Ajuda depois do campo / rótulo antes do campo e ícone junto do texto / células e conteúdo da linha. |
| `--espaco-4` / `--espaco-5` / `--espaco-6` | 16 / 24 / 32 px | Campos e margem móvel / grupos de campos e margem intermediária / seções e margem desktop. |
| `--espaco-7` / `--espaco-8` | 48 / 72 px | Regiões principais no desktop / espaço após o fim da página, somado à área segura inferior quando aplicável. |
| `--espessura-borda` / `--espessura-filete` | 1 / 3 px | Limite de controle ou divisor horizontal / aviso e seleção quando necessário. |
| `--raio-controle` / `--raio-superficie` / `--raio-dialogo` | 10 / 12 / 16 px | Campo e botão / cartão com função / diálogo. Avatar usa 50% e marca de estado usa 999 px. |
| `--sombra-menu` | `0 12px 28px rgb(39 49 35 / 16%)` | Menu e popover. |
| `--sombra-dialogo` | `0 18px 48px rgb(39 49 35 / 20%)` | Diálogo e gaveta. Botões, campos, linhas e cartões em repouso têm sombra zero. |
| `--largura-trabalho` / `--largura-texto` / `--largura-formulario` | 1440 px / 65 ch / 560 px | Teto da grade útil / prosa / formulário de uma coluna. Formulários de duas colunas têm teto de 880 px. |
| `--quebra-intermediaria` / `--quebra-lateral` | 640 / 1024 px | Abaixo de 640, controles empilhados. De 640 a 1023, barra com Menu e margem 24. A partir de 1024, lateral de 240 e margem 32. |
| `--quebra-tabela` / `--quebra-apoio` | 720 / 960 px | Medir a largura do contêiner, já descontados os recuos. Tabela comparativa a partir de 720, segunda coluna de página a partir de 960. |
| `--movimento-controle` / `--movimento-sobreposicao` | 120 / 180 ms | Mudança de cor por ação / abrir e fechar sobreposição. Curva `ease-out`, duração zero em movimento reduzido. |

| Token de tipo | Família | Tamanho / altura de linha | Peso |
|---|---|---|---|
| `--tipo-pagina` | Cormorant Garamond, Georgia, serif | 32/36 px até 1023, 40/44 px a partir de 1024 | 600 |
| `--tipo-secao` | Raleway, Arial, sans-serif | 20/28 px | 700 |
| `--tipo-item` | Raleway, Arial, sans-serif | 18/24 px | 700 |
| `--tipo-corpo` | Raleway, Arial, sans-serif | 16/24 px | 400 |
| `--tipo-controle` | Raleway, Arial, sans-serif | 16/24 px | 600 |
| `--tipo-meta` | Raleway, Arial, sans-serif | 14/20 px | 500 para metadados, 600 para estados |

Nome, tarefa, e-mail e estado decisivo ficam a pelo menos 16 px. Metadado serve a data complementar e ajuda curta. Horários, quantias e colunas numéricas usam algarismos tabulares onde a fonte os oferece, alinhados à direita quando comparáveis. Prosa tem alinhamento à esquerda e quebra natural. E-mails, nomes de arquivos e identificadores têm quebra de emergência, com valor integral copiável.

| Token | Hex | Aplicação |
|---|---|---|
| `--cor-fundo` / `--cor-superficie` | `#FBFCF8` / `#FFFFFF` | Fundo contínuo / área elevada, campos e lista de trabalho quando precisar de fundo. |
| `--cor-texto` / `--cor-texto-secundario` | `#273123` / `#58634F` | Conteúdo e rótulos / metadados, ajuda e placeholder complementar. |
| `--cor-acao` / `--cor-acao-hover` / `--cor-acao-pressionada` | `#475436` / `#38442A` / `#273123` | Botão principal com texto branco, link sublinhado em prosa e texto de botão discreto. |
| `--cor-hoje` / `--cor-marca` | `#EDF2E6` / `#839352` | Área de Hoje, fundo de seleção e hover discreto / filete decorativo institucional. |
| `--cor-divisor` / `--cor-contorno` | `#DFE5D4` / `#737E67` | Separação visual dispensável para compreensão / contorno essencial de campo e botão secundário. |
| `--cor-foco` | `#475436` | Contorno de 2 px, afastado 2 px com superfície clara entre controle e anel. |
| `--cor-sucesso` / `--fundo-sucesso` | `#475436` / `#EDF2E6` | Confirmação com ícone de visto e texto explícito. Reusa o oliva. |
| `--cor-aviso` / `--fundo-aviso` | `#5C431A` / `#FDF6E7` | Texto, ícone e filete de aviso. |
| `--cor-erro` / `--fundo-erro` / `--cor-perigo-hover` | `#903A30` / `#F6ECE9` / `#763027` | Erro e contorno inválido / área de erro / hover destrutivo com texto branco. Estado pressionado destrutivo usa `#5C241D` (`--cor-perigo-pressionada`). |
| `--cor-desabilitado` / `--fundo-desabilitado` | `#58634F` / `#E9EDE3` | Controle indisponível e marca neutra de andamento; motivo ao lado se útil para recuperação. |
| `--cor-sobreposicao` | `#27312366` | Fundo inerte de diálogo e gaveta. |

## 3. Componentes e celular

**Grade e superfícies.** A grade tem uma coluna até o contêiner alcançar 960 px. Seu dia usa então 12 colunas, intervalo de 24 px, Hoje em 8 e Atualizações em 4. Outras páginas dividem a grade quando as duas regiões têm tarefas independentes explicitadas no mapa. Listas, tabelas e agenda usam a grade inteira quando são o assunto principal. Formulário e prosa param no seu teto, alinhados à esquerda, em fundo contínuo. Cartão serve a um resumo autônomo ou ao bloco Hoje. Recuo 16 px no celular e 24 px no desktop, raio 12, uma borda de 1 px se o limite cumprir função. Hoje leva filete verde de 3 px no início e fundo tonal. Seções irmãs se separam por 32 px, com um divisor por registro em listas.

| Componente | Medidas, estados e comportamento | Em largura estreita |
|---|---|---|
| **Botão** | Principal com preenchimento oliva e texto branco. Secundário branco com contorno. Discreto transparente, com espaço de controle igual ao secundário. Perigo usa vermelho só na ação destrutiva explícita. Principal e perigo escurecem em hover e pressão pelos tokens. Secundário/discreto usam fundo Hoje no hover e fundo desabilitado na pressão, com texto de ação preservado. Padrão mínimo 46 px, recuo horizontal 16 e vertical 10, raio 10, corpo de controle e intervalo de 8 px entre ícone e rótulo. Compacto nos botões auxiliares de barra desktop com ponteiro preciso: altura visual 36, área acionável de 46 × 46 ou maior. Ícone isolado ocupa 46 × 46. Enquanto envia, ação conserva a largura disponível, mostra “Salvando…” ou verbo equivalente, preserva foco e bloqueia clique, Enter e reenvio do formulário. Estado indisponível tem cor própria. | Abaixo de 640, ações principais de formulário/diálogo ocupam 100%. Alternativa abaixo com 8 px de intervalo. Ações de consulta quebram para a linha seguinte, sem comprimir nomes. |
| **Campo e área de texto** | Rótulo persistente acima, 8 px até controle. Altura mínima 46, padding 12 px na horizontal, texto 16/24, borda 1 px, raio 10. Área de texto começa em 120 px e permite expansão vertical. Ajuda/erro abaixo com 4 px, associação programática e `aria-invalid` no inválido. Em envio inválido, foco no primeiro campo inválido ou resumo com links se houver mais de uma seção. Leitura de valor usa texto, “Editar” abre o campo. Guardar rascunho em falha de gravação dentro da mesma sessão e escopo autorizados. | Uma coluna abaixo de 1024 ou se o contêiner do formulário medir menos de 640 px. Duas colunas só para campos curtos relacionados. Campo longo ocupa toda a medida. |
| **Seleção** | `select` nativo para escolha única curta. Rádio para alternativas cuja explicação precise ficar visível. Checkbox para escolha múltipla, cada linha com alvo de 46 px. Busca de pessoas ou vocabulário usa a primitiva acessível existente quando a busca for necessária, com seleção atual, rótulo visível e estado local sem resultados/erro. Nome, escopo e efeito da escolha aparecem juntos em permissões. | Seleção ocupa a largura do campo. Se o menu próprio exceder a altura disponível, rola internamente e mantém foco/seleção. Filtros opcionais podem abrir sob “Filtros”, com os aplicados visíveis e “Limpar filtros”. |
| **Data e período** | Controle nativo estilizado, 46 px e 16/24 px. Rótulo explícito “Data de início”, “Data final” ou “Horário”. Renderizar datas em português brasileiro e indicar o fuso quando puder alterar a interpretação, conforme fonte aprovada. Erro de período fica junto da data final. Agenda mostra período e comandos “Anterior”, “Hoje”, “Próximo” com nomes completos para leitor de tela. | Datas de intervalo empilham, início antes de fim. Agenda vira lista agrupada por dia abaixo de 720 px de contêiner. Evento longo quebra, com hora e ação sempre legíveis. |
| **Tabela** | A partir de 720 px de contêiner, usar `table`, legenda acessível e cabeçalhos com `scope`, ordenação com botão nomeado e `aria-sort` quando suportada. Cabeçalho mínimo 44, linhas mínimas 56, células com 12 px na vertical e 16 px na horizontal, 1 px de linha entre registros. Em Equipe, Pessoa 40%, Perfil 20%, Conta 18%, Estado 22%, todos à esquerda. Quantias à direita. Ações aparecem na célula final ou na área de identidade se a tabela tiver quatro colunas fixas. A altura cresce com quebra de conteúdo. | Abaixo de 720, registros empilhados, título e ação de abrir, depois pares rótulo/valor, mantendo dados, filtros, paginação e ordenação. Se houver ordenação, oferecer controle equivalente acima da lista. Em Equipe: pessoa/e-mail → Perfil → Estado → Conta → ações. Uma matriz que exija comparação simultânea pode ter rolagem confinada em região nomeada e focável, com indicação visível de continuação. |
| **Lista e cartão** | Lista semântica para cronologia, materiais, tarefas e destinos. Linha com 12 px de recuo vertical, altura mínima 56, título 18/24 e metadados abaixo. Link explícito para navegar, sem interação duplicada com a linha. Cartão de resumo usa título e um único destino principal, sem caixa interna. | Uma coluna. Ação abaixo dos metadados quando não couber ao lado. Conteúdo de estado quebra por inteiro. Cartões evitam carrossel horizontal. |
| **Diálogo** | Para confirmação e edição breve. Teto de 560 px de largura e `min(640px, calc(100dvh - 64px))` de altura. Cabeçalho e ações visíveis, corpo rolável, recuo 24. Título identifica a operação e o registro quando permitido. Foco no título em confirmação consequente ou primeiro campo no formulário breve. Escape fecha respeitando a confirmação de descarte vigente, clique externo conserva o diálogo, fechar devolve foco à origem ou ao título da tela se a origem saiu. Fundo inerte. | Abaixo de 640, folha inferior com largura integral, altura máxima `calc(100dvh - 16px)`, recuo 16 e área segura somada ao rodapé. Ações ficam acima do teclado quando houver espaço. Em altura insuficiente, permitir rolagem interna suficiente para chegar ao campo e a ambos os botões. |
| **Aviso e vazio** | Aviso na região afetada, raio 12, filete 3, recuo 16, ícone e título 16/24 semibold, seguido de consequência e ação quando cabível. Erro de campo fica no campo. Sucesso confirmado fica na região do resultado. Vazio após resposta válida usa título 18/24, corpo 16/24 e uma ação pertinente. “Sem resultados” oferece limpar filtros. “Indisponível” oferece recuperação. | Ações abaixo da mensagem no mesmo bloco. Toast pode complementar confirmação, com mensagem persistente na região de origem. Estado essencial permanece disponível depois do tempo de leitura. |
| **Avatar** | Círculo 32 px na barra, 40 em linhas que já pedem identidade visual, 72 em Meu perfil. Reservar proporção 1:1. Fundo Hoje, texto de ação, até duas iniciais, ou ícone de pessoa se faltar nome. Imagem centralizada com `object-fit: cover`. Imagem e iniciais decorativas ao lado de nome ou comando com “Conta”. | Mesmos diâmetros. Alvo “Conta” com 46 px mínimos. Em edição futura, prévia quadrada e ações “Trocar foto” e “Remover foto” abaixo; mostrar o resultado após confirmação e conservar a última foto confirmada em falha. |
| **Ícones** | Uma família linear, grade 24 × 24, traço 2 arredondado, `currentColor`. 20 px em navegação e 16 px junto a botões. Seta volta, chevron expande ou sinaliza destino. Todo ícone de comando sem texto tem nome acessível e alvo de 46 px. | Menu e Conta têm texto visível. Ícone com texto é decorativo. Ação principal, estado e destino aparecem em palavras. |

## 4. Carregamento e atualização

O catálogo **Estado emocional observado** usa título, barra de ações e lugar da lista estáveis. As barras de esqueleto saem do catálogo em todos os acessos. Listas administrativas reservam a altura de uma linha de status acima do conteúdo para mostrar indicação textual, somente a partir de **800 ms** no primeiro carregamento. O espaço e o texto estático evitam o salto observado na auditoria.

| Situação | Regra |
|---|---|
| Leitura inicial até 500 ms (800 ms nas listas administrativas) | Mostrar a casca e o contexto já autorizados. Reservar espaço da primeira região, sem indicador visual transitório, e marcar `aria-busy` na região que carrega. Cancelar o temporizador ao resolver, sair ou trocar de escopo. |
| Leitura inicial ainda pendente após o limite | Mostrar “Carregando [conteúdo]…” uma vez na região. Estado emocional e as demais listas administrativas ficam nesse texto durante a consulta. Em Carteira, Hoje ou lista de materiais, esqueleto **estático** pode substituir a área reservada a partir de 900 ms somente quando a forma das linhas for conhecida. No máximo duas linhas, decorativas, sem shimmer. Publicar o resultado imediatamente quando chegar, inclusive se o temporizador acabou de disparar. |
| Volta, foco ou atualização no mesmo recurso | Mostrar o último resultado válido da mesma sessão, capacidade, caso/audiência, consulta e parâmetros quando houver política aprovada de validade. Preservar tamanho, foco, filtros e rolagem. Atualização manual muda o rótulo para “Atualizando…” e bloqueia reenvio. Revalidação silenciosa sinaliza após 500 ms junto do cabeçalho da região. Se falhar com resultado ainda válido, informar que a atualização falhou e manter “Tentar novamente”. |
| Mudança de filtro, data, caso, audiência ou sessão | A lista de outro recorte sai no mesmo gesto da troca. Preservar só a casca e campos que pertencem ao novo contexto. Se validade/autorização ficar indeterminada, ocultar protegidos até confirmar. Descartar respostas atrasadas, rascunhos e dados protegidos ao perder acesso ou mudar identidade. |
| Gravação, envio de arquivo ou processamento | Estado imediato no controle acionado. Para etapas conhecidas, nomear a fase real. Percentual exige progresso medido. Em resultado incerto, oferecer reconciliação do mesmo pedido conforme fluxo existente. Manter rascunho autorizado em falha. Vazio só depois de consulta bem-sucedida. |

Em espera prolongada, manter texto e caminho de recuperação quando o serviço devolver falha ou atingir seu prazo. A interface usa `role="status"` para atualizações sem mover foco e evita anúncios duplicados. Mantém conteúdo útil durante leitura em segundo plano, sem reduzir sua opacidade.

Após a migração, medir a cascata antes de mexer na aquisição de dados. Iniciar leituras independentes em paralelo após as respectivas verificações, carregar módulos exclusivos sob demanda e deduplicar leituras elegíveis em voo. Adotar reutilização apenas onde o contrato admitir, em memória e com escopo explícito, invalidação após gravação e descarte na revogação. O piloto já proposto é o catálogo administrativo. Usar as primitivas React existentes e manter um dono da árvore de campos. [Plano de evolução](PLANO-EVOLUCAO.md) · [Vercel React Best Practices, revisão consultada](https://github.com/vercel-labs/agent-skills/tree/5a37a6329fbad3666c3207392a6a7c0110e92efb/skills/react-best-practices)

## 5. Casca, navegação e perfil

Barra de altura mínima de 56 px até 1023 e 64 px a partir de 1024. Marca ocupa área reservada de 32 × 32. “Conta” e, quando autorizado, “Avisos” ficam na barra. Cada grupo tem uma navegação por vez. Desktop usa lateral de 240 px sempre com rótulos. Até 1023, a lateral cede lugar à gaveta “Menu”, com largura `min(360px, calc(100% - 32px))`, títulos de grupo e rolagem própria. Links têm altura mínima de 46 px, fundo tonal e peso 700 no atual. Gaveta fecha ao navegar e com Escape. Após fechar sem navegar, foco volta a Menu. Depois de navegar, foco vai ao título da folha. Um cabeçalho pode crescer com texto e zoom. O conteúdo recebe a largura restante em desktop, com o teto e recuos da grade. A margem extra acima do teto fica simétrica.

```text
Equipe · Menu / lateral
  Seu dia
  Pessoas acompanhadas
    Carteira → Novo paciente / ficha da pessoa
      Visão do caso → Linha do tempo
      Cuidado → Plano de cuidado / Plano de crise / Saúde / Anamnese / Rotina e recursos
      Pendências e tarefas → Pendências do caso / Tarefas do cuidado / Encaminhamentos
      Registros → Diário / Fichas de plantão / Relatórios do cuidado
      Documentos → arquivo / Exportar dados do caso
      Pessoas e acesso → Cadastro e contatos / Rede de cuidado / Orientações /
                         Equipe com acesso ao caso / Acesso da família
  Plantões → Meu turno / Escala de turnos
  Agenda → Minha agenda / compromisso / conexão de calendário
  Financeiro → Valores por turno / Despesas do caso / Apuração
  Administração
    Contas e permissões → Contas do aplicativo / Equipe / Permissão para aprovar plano
                          de crise / Acesso ao financeiro
    Modelos e vocabulário → Campos e aprovadores do plano / Modelo da ficha de plantão /
                            Papéis da rede / Estado emocional observado
    Sistema e integrações → Configuração do sistema / Credenciais / Expurgo
    Privacidade e auditoria → Histórico de auditoria / Solicitações de privacidade
  Ajuda → Como funciona o acompanhamento

Família · Menu / lateral
  Seu dia → Hoje / Atualizações
  Pessoas acompanhadas → carteira / ficha compartilhada
    Dados do paciente
    Diário da família
    Plano de cuidado compartilhado
    Materiais compartilhados → Relatórios / Documentos / Orientações
  Ajuda → conteúdo autorizado

Barra · equipe e família
  Conta → Meu perfil → Editar perfil (após aprovar o contrato) / Sair pelo menu Conta
  Avisos → leitura e destino original (quando autorizado)
```

Administração abre num índice de quatro grupos com links em coluna. A ficha tem “Seções da ficha” junto ao cabeçalho, expande por iniciativa da pessoa e lista grupos em coluna. Em link direto, mostrar pessoa, caminho do grupo e título com as seções fechadas. No celular, o caminho usa link curto para o nível anterior. Exemplo: “Pessoas acompanhadas” → “Cuidado”; nome da pessoa acima de “Plano de crise”. Listas retornam com filtros e foco preservados quando autorizados. Nenhum destino depende de fita horizontal. Grupos vazios saem do menu. A sequência acima usa Plantões antes de Agenda como proposta de validação, com Financeiro e Administração visíveis apenas a quem tem o acesso correspondente. Conta técnica mantém sua entrada excepcional.

“Equipe” é administração de concessões institucionais. **Cadastrar conta interna** continua em **Contas do aplicativo**. **Pré-conceder acesso** começa em **Equipe → Convidar alguém** e mantém a confirmação do fluxo existente. **Vincular ao caso** continua em **Pessoas e acesso → Equipe com acesso ao caso**. **Editar meu perfil** começa em Conta. **Tarefas** têm entrada no contexto da pessoa, com atalhos em Hoje apenas quando houver uma fonte autorizada e acionável. **Agenda** tem entrada operacional própria, com o estado e a conexão na página. A família encontra apenas compromissos publicados para sua audiência por Hoje, condicionados à fonte aprovada.

### Seu dia

```text
Celular, 390 × 844, recuo lateral de 16 px

 Menu                 FFCMApp                 Conta
 Seu dia
 Sexta-feira, 27 de novembro
 Lia Alves                              ← caso fictício

 ┌ Hoje ───────────────────────────────────────────┐
 │ 14h00  Encontro de acompanhamento              │
 │        Ver compromisso                         │
 └─────────────────────────────────────────────────┘

 Atualizações
 25 nov   Orientação publicada
          Abrir orientação
 ──────────────────────────────────────────────────
 21 nov   Relatório publicado
          Abrir relatório

 Pessoas acompanhadas
```

Hoje lista até três acontecimentos autorizados do dia em ordem de horário, com link ao item. No recorte interno, incluir o próximo trabalho acionável com pessoa, motivo e destino quando verificável. Atualizações lista até três itens autorizados em ordem de publicação decrescente, inclusive de dias anteriores, com data e link nomeado. Cada região pode resolver e falhar independentemente. Zero confirmado, fonte indisponível e conteúdo retirado são estados distintos. Com um vínculo, mostrar o nome direto. Com múltiplos vínculos, usar seleção explícita de pessoa e preservar a seleção ao voltar no mesmo escopo. O primeiro compromisso e o início de Atualizações cabem na primeira dobra no cenário típico sem bloqueios. Sem fonte familiar aprovada, mostrar o estado de indisponibilidade no bloco correspondente e indicar “Pessoas acompanhadas”. A visão familiar já publicada na main é a Carteira. Aprovar fonte, itens publicáveis, fuso e audiência no OpenSpec antes de ativar a home familiar. [Projeto de distribuição](../../PROJETO-DISTRIBUICAO.md)

### Meu perfil e edição

Página de consulta com avatar de 72 px, nome de exibição quando disponível, e-mail autorizado e ação “Editar perfil”. Edição abre formulário de 560 px com foto, nome e rodapé “Salvar alterações”, “Cancelar”. Foto opcional, fallback para iniciais, prévia antes de salvar e possibilidade de remoção. E-mail de autenticação, papel e vínculo são valores de leitura se já autorizados. Aviso de descarte ao sair de edição alterada. Em falha, trazer a recuperação junto da ação, manter rascunho autorizado e preservar imagem confirmada. Proposta visual e de interação. Campos editáveis, regras de validade, audiência, armazenamento, descarte e concorrência da foto/nome exigem decisão no OpenSpec. Até lá, a casca pode usar iniciais quando houver nome autorizado e o menu mantém saída.

### Links e acessos

O endereço antigo da ficha, Administração, Carteira e Ajuda segue resolvendo o conteúdo autorizado durante a transição. Adotar a tabela de aliases do projeto de distribuição, acrescentando Apuração em `#financeiro/apuracao` como endereço proposto para a aba existente. Manter contratos de endereços públicos e callbacks, confirmar emissores de links na main integrada e verificar histórico do navegador. Resolver alias pronto na mesma entrada do histórico. Uma folha retirada sem equivalente usa mensagem neutra e retorno à área autorizada. Permissão de conta, capacidade administrativa, vínculo, audiência e calendário continuam verificados separadamente no servidor e no banco. Respostas de acesso negado não revelam se um caso existe. O plano de distribuição cobre compatibilidade com `agenda` no retorno do OAuth. [Mapa legado e transição](../../PROJETO-DISTRIBUICAO.md#árvore-e-endereços)

## 6. Acessibilidade

- Texto útil tem contraste mínimo de **4,5:1**, incluindo metadados. Ícones, contornos essenciais e foco têm **3:1** sobre o fundo adjacente. Divisor claro serve à leitura, sem ser a única indicação de agrupamento. Seleção e estado combinam palavra, indicador e semântica. O oliva institucional fica em área/filete. Os fundos de botão preenchido exigem texto branco. Pares calculados: texto branco sobre ação 8,11:1, texto secundário no fundo geral 6,15:1, texto de erro no fundo de erro 6,38:1 e contorno de controle no fundo Hoje 3,76:1.
- Cada comando tem alvo de pelo menos **46 × 46 px**, inclusive ícones, com 8 px entre comandos vizinhos quando ficam na mesma linha. Há foco visível com contorno de 2 px e afastamento de 2 px em `:focus-visible`. Não cortar o anel com overflow nem ocultar o foco atrás de barra/rodapé. Usar cor do sistema em alto contraste forçado.
- Uma ordem de leitura e teclado segue o conteúdo. Pular para o conteúdo via link de atalho. Usar um `h1` por folha, níveis coerentes, nomes acessíveis em comandos, `aria-current` nos links e títulos em regiões. Abas de painéis equivalentes usam semântica de aba, seta, Home/End e foco na aba ativa. Navegação entre páginas usa links. A ordem do DOM segue a ordem visual.
- A 200% de zoom, texto e ações refluem sem perda. Checar reflow a 320 CSS px e em tela baixa com teclado aberto. Permitir espaçamento de texto do navegador. Anunciar resultado e estado da leitura no lugar da ação. Evitar que o mesmo erro seja anunciado no campo, no resumo e num alerta global.
- Autenticação permite colar, preencher com gerenciador e usar código de uso único com autocomplete. Áudio mantém alternativa equivalente de texto. Imagem de perfil com nome contíguo recebe texto alternativo vazio. Movimento reduzido usa mudanças instantâneas e indicadores estáticos. [WCAG 2.2, W3C](https://www.w3.org/TR/WCAG22/)

## 7. Mapa de aplicação

**50 telas de produto na base.** Uma tela é um painel primário com tarefa própria, endereço ou seletor de painel independente. Acessos por audiência contam separadamente quando montam folhas próprias. A Carteira familiar é variante do mesmo painel e tem contrato na linha A03. Consultas secundárias e demais estados do mesmo painel ficam com seu destino pai. A Agenda tem região com ciclo próprio. As três subáreas do Financeiro têm painéis primários próprios, com a moldura comum contada uma única vez por meio das folhas. A abertura de novo paciente é diálogo, coberto abaixo. Saída tem vista própria e entra na contagem.

| Bloco | Telas |
|---|---:|
| Entrada, casca e áreas comuns A01–A06 | 6 |
| Administração D01–D12 | 12 |
| Financeiro F01–F03 | 3 |
| Ficha da equipe I01–I21 | 21 |
| Ficha familiar C01–C06 | 6 |
| Públicas P01–P02 | 2 |
| **Total** | **50** |

Levantamento pelos registros de seis destinos familiares e 21 internos, 13 entradas de Administração (Financeiro se decompõe em três), vistas HTML, renderizadores da Agenda e Financeiro e pontos de entrada públicos. Testar cada linha com sucesso, espera, falha, vazio aplicável e acesso direto permitido/negado quando houver endereço. A coluna de composição aponta o primeiro conteúdo útil ou o comando cujo uso deve ser provado. [Registro das rotas](../../web/main.ts) · [Casca e vistas](../../web/index.html) · [Agenda](../../web/agenda-individual.tsx) · [Financeiro](../../web/financeiro.ts)

### Entrada, casca e áreas comuns

| ID · Origem | Composição e mudança observável |
|---|---|
| A01 · Entrada em `/` | Coluna de 560 px, título curto e métodos com rótulo específico “Entrar com Google”, “Conta interna” e, quando habilitada, “Acesso da família”. Método escolhido revela seu formulário por intenção. Conta técnica excepcional fica em controle secundário dedicado. Campo de senha tem “Mostrar senha”. Confirmar conta interna separa envio e verificação do código, com próximo passo junto do estado. Callback, negativa, expiração e sessão em verificação mantêm título e recuperação local. |
| A02 · Seu dia (`/`, `#home`) | Aplicar o bloco Hoje e lista Atualizações da seção 5. Linha operacional identifica pessoa, motivo e destino. Mostrar zero, falta de fonte e erro por região. Nenhuma fila de aprovação transversal sem item, versão e acesso comprovados. |
| A03 · Carteira (`#carteira`), incluindo familiar | Lista usa toda a grade. Pessoa, situação e link “Abrir ficha” no primeiro nível da linha. Busca/filtros antes das linhas e paginação depois. Família vê recorte simples, nome de referência e retorno previsível à carteira. “Novo paciente” é ação no cabeçalho autorizado. |
| A04 · Minha agenda (região da Carteira) | Folha de Agenda com período e lista diária no celular, hora e título primeiro. Desconectada oferece “Conectar agenda Google”; conectada sem itens informa vazio; erro oferece retentativa. Detalhe do compromisso mantém ver, vincular, alterar, cancelar e registrar realização conforme autorização. Desconexão e reconciliação têm estados junto do controle. |
| A05 · Como funciona (`#regras`) | Ajuda com índice por assunto e prosa de até 65 ch. Regras, diário e canais em subseções ancoradas. Link de canal usa o nome da ação e depende de canal existente. |
| A06 · Encerrar acesso (vista `logout-view`) | Mostra progresso na vista de saída e recuperação “Tentar sair novamente” quando houver falha. A transição oculta dados protegidos assim que a sessão deixa de permitir a exibição. |

### Administração

Origem dos sufixos abaixo: `#administracao/{sufixo}`. Agrupamento e rótulos da seção 5 regem índices e caminho ativo.

| ID · Sufixo | Composição e mudança observável |
|---|---|
| D01 · `acessos` | Contas do aplicativo. Lista de nome, e-mail, função, método e estado antes de “Cadastrar conta”. Cadastro em folha de formulário. Editar e desativar na conta selecionada, com consequência da mudança de método/estado junto da ação. |
| D02 · `equipe` | Lista antes de “Convidar alguém”; tabela com as quatro colunas ou lista rotulada abaixo de 720 px. Convite abre formulário próprio, motivo junto do perfil. “Pré-conceder acesso” é o verbo final. Quando reserva/reconciliação bloquear, “Conferir acesso novamente” fica no rodapé junto do motivo. |
| D03 · `plano-de-crise` | Primeiro, pessoas habilitadas e o alcance. Conceder ou retirar habilitação identifica pessoa e efeito antes de confirmar. Abrir opções sob demanda por seleção acessível. |
| D04 · `financeiro-concessao` | Lista de audiência vigente com identidade e alcance. “Conceder acesso” abre seleção e confirmação. Revogar é ação contextual distinta do lançamento financeiro. |
| D05 · `plano-cuidado` | Campos vigentes e aprovadores aparecem em grupos irmãos. Abrir “Novo campo” ou alteração de aprovador no grupo correspondente. Exibir tipo, obrigatoriedade e escopo no registro antes da edição. |
| D06 · `modelo-ficha-plantao` | Estrutura vigente por ordem e seção, com visibilidade e obrigatoriedade junto do rótulo. “Adicionar campo” em formulário separado, efeito da alteração no ponto de decisão. |
| D07 · `papel-declarado` | Lista com rótulo e situação antes de criar ou editar. Explicação de “papel da rede” junto do campo. Estados vigentes e inativos legíveis no celular. |
| D08 · `estado-emocional` | Termos e estado aparecem primeiro. “Novo termo” abre edição por intenção. “Atualizar catálogo” é secundário e muda para “Atualizando…”. Volta ao catálogo conserva leituras elegíveis pela seção 4. Todas as esperas usam texto adiado, zero barras. |
| D09 · `configuracao` | Chaves agrupadas por domínio, valor vigente e alcance primeiro. Editar uma chave ou conjunto coerente. Ajuda técnica fica sob o valor, a validação junto do campo. |
| D10 · `integracoes` | Serviço e situação da credencial vêm antes de “Alterar credencial”. Operação de expurgo ganha região própria com finalidade, escopo, bloqueios e confirmação. Exibir estado e recuperação sem valores secretos. |
| D11 · `auditoria` | Filtros limitados à barra de consulta. Data, evento e alvo abrem a tabela ou a linha móvel. Metadados detalhados expandem por registro. Ordenação e paginação sobrevivem à volta. |
| D12 · `solicitacoes` | Lista por estado e tipo visíveis. Abrir pedido mostra etapa e histórico antes do comando que altera dados. Confirmação identifica escopo e consequência. |

### Financeiro

Origem comum: `#administracao/financeiro`. Os três títulos abaixo são os controles reais de painel. Abrir apenas para a audiência financeira, com escopo de caso quando aplicável.

| ID · Painel | Composição e mudança observável |
|---|---|
| F01 · Valor por turno | Consulta com pessoa, vigência e valor em coluna numérica. “Registrar valor” abre formulário fora da lista. Explicitar valor e vigência confirmados ao voltar. |
| F02 · Despesas do caso | Caso e período antes da lista; descrição, data, valor e comprovante identificam cada linha. “Registrar despesa” abre página de formulário. Mostrar tentativa incerta e comprovante em sua operação, com recuperação do mesmo lançamento. |
| F03 · Apuração | Profissional e período acima de “Apurar período”. Total e pendências do recorte confirmado vêm antes das linhas de data, valor e situação. Repetir o período junto do resultado. Diferenciar zero confirmado de resultado indisponível. |

### Ficha da equipe

Origem dos sufixos abaixo: `#paciente/{p}/{sufixo}`. Cabeçalho da pessoa, seção ativa e ação do trabalho aparecem antes de filtros ou metadados.

| ID · Sufixo | Composição e mudança observável |
|---|---|
| I01 · `visao` | Situação, próxima revisão e pendências verificadas no primeiro bloco. Links “Ver pendências” e “Ver linha do tempo” levam ao destino original. |
| I02 · `linha-tempo` | Linhas por evento e data, agrupadas por dia. Tipo e autoria como apoio. Detalhe abre por link de evento. |
| I03 · `anamnese` | Índice de assuntos seguido de leitura por grupo. Resposta, fonte e data juntas. Campo pendente, desconhecido ou não aplicável tem texto próprio. Edição fica no grupo solicitado. |
| I04 · `saude` | Alertas pertinentes primeiro e dados atuais em grupos rotulados. “Editar” inicia formulário de um grupo, com impacto e estado preservados. |
| I05 · `plano` | Objetivos vigentes em linhas com estado, responsável e próxima revisão. Abrir versão antes de revisar. Autor, público e estado ficam junto de aprovação/publicação. Ações de criar objetivo ficam no grupo autorizado. |
| I06 · `crise` | Versão, situação vigente e disponibilidade antes do texto. Aprovar identifica versão e consequência. Versão substituída tem estado explícito, com caminho para a vigente. |
| I07 · `tarefas` | Tarefa, prazo, estado, prioridade e responsável completos. Abrir edição no item. Conclusão mantém ação realizada/justificativa na mesma etapa. Sem fila transversal implícita. |
| I08 · `meu-turno` | Pessoa e turno atual no topo. “Iniciar”, “Retomar”, “Registrar passagem” ou “Encerrar” tem precedência conforme estado. Ciência e falha de envio ficam na ação correspondente. |
| I09 · `execucao-cuidado` | Índice de Fichas de plantão, com editor e leitura identificados por turno. Estado de gravação e anexos junto do registro. Relatórios em folha de Registros, com período e estado de geração/publicação no topo; conversão no relato ou ficha de origem, com prévia revisável e link ao resultado. Preservar o alias amplo para o índice. |
| I10 · `escala-turnos` | Período seguido de dia, horário, profissional, disponibilidade e estado da agenda. Lista de dias em contêiner estreito. Seleção/alteração no turno escolhido. |
| I11 · `cadastro` | Leitura primeiro: Identificação, Contatos, Situação e Responsável em grupos irmãos. Cada edição abre seu grupo; mudança de situação e troca de responsável conservam motivo e histórico. Mostrar “A completar” nos casos existentes quando aplicável. |
| I12 · `equipe` | Identidade, vínculo e alcance em linhas com rótulos distintos. Substituir responsável, conceder e revogar identificam pessoa, escopo e efeito. Diálogo para consequência curta, folha própria para preenchimento longo. |
| I13 · `exportacao` | Escopo, disponibilidade de dados e consequência antes de “Gerar exportação”. Nomear geração e disponibilização, e oferecer retentativa na etapa que falhar. Acesso via Documentos. |
| I14 · `acesso-familia` | Lista de pessoas com etapa atual. Ações de pré-autorização, convite e revogação no contexto do registro. Gate indisponível ou etapa bloqueante aparece junto da próxima ação permitida. |
| I15 · `pendencias` | Agrupar por responsabilidade e prazo quando o dado existir. Linha mostra origem, assunto e próximo passo; destino mantém o caso. |
| I16 · `encaminhamentos` | Destino, estado e data nas linhas. Composição ou edição por intenção, com prazo/recuperação no registro. |
| I17 · `orientacoes` | Título, público e data de publicação no índice. Prosa de até 65 ch para leitura. Compor, publicar e consultar histórico em ações contextualizadas. |
| I18 · `contexto` | Rotina e recursos por assunto. Relações com objetivos explicitam o destino do vínculo. Mostrar dados confirmados primeiro e abrir edição no grupo pertinente. |
| I19 · `rede` | Pessoa ou instituição, papel declarado e contato. Rótulos separados de vínculo de acesso. “Adicionar pessoa de referência” em formulário por intenção. |
| I20 · `documentos` | Lista com nome completo, tipo, data e abrir. Enviar arquivo a partir de ação própria. Busca, erro do Drive, falha de envio e recuperação de download afetam regiões distintas. |
| I21 · `diario` | Linha cronológica com autoria autorizada e conteúdo. “Escrever relato” em primeiro plano; gravar áudio como alternativa à escrita. Transcrição revisável e conversão aparecem junto do relato, com fases reais e recuperação local. |

### Ficha familiar

Os sufixos da ficha têm renderizadores próprios para a audiência familiar. A seção abre selecionada sem expor ações internas.

| ID · Sufixo | Composição e mudança observável |
|---|---|
| C01 · `dados` | Nome e identificação autorizados como início. Dados e contatos em blocos de leitura rotulados, com Ajuda no caminho de retorno. |
| C02 · `diario` | Relatos compartilhados por data. “Escrever relato” quando autorizado abre composição de texto. Áudio opcional com alternativa textual, revisão e confirmação próprias. |
| C03 · `relatorios-turno` | Materiais → Relatórios. Filtro de período, lista com data e título da publicação. Usar “Abrir relatório” na linha e preservar seleção ao voltar. Retirada oculta o item no contexto da audiência. |
| C04 · `plano` | Resumo de objetivos vigentes compartilhados e estado legível. Ação de contribuição, onde concedida, fica dentro da seção de objetivo. |
| C05 · `documentos` | Materiais → Documentos. Nome quebra, tipo/data na segunda linha e “Abrir documento” explícito. Aviso distingue falha da abertura e indisponibilidade do item. |
| C06 · `orientacoes` | Materiais → Orientações. Lista com data e título, leitura com ação de voltar e até 65 ch. Público e estado são inferidos apenas do contrato de publicação já verificado. |

### Públicas

| ID · Caminho | Composição e mudança observável |
|---|---|
| P01 · `/convite-familiar/` | Marca, título de entrada da família, situação do link e próximo passo em coluna de 560 px. Na base, gate indisponível com retorno à entrada. Manter remoção do token da URL. Aceite ativo, expiração e definição de senha só ganham controles quando o fluxo for habilitado e confirmado. |
| P02 · `/consulta-convite/` | Título de consulta de convite distinto do de entrada da família. Na base, mensagem de indisponibilidade e retorno à entrada. Consulta de estado ou ações operacionais só entram com contrato e gate habilitados. |

### Superfícies associadas e propostas

| Superfície | Contrato de aplicação |
|---|---|
| **Novo paciente** (diálogo na Carteira) | Evoluir para folha de formulário pela quantidade de campos. Ordem: Identificação → Contatos → Situação e responsável. Seleção de responsável, validação e bloqueio de reserva ficam nos campos/rodapé. Confirmação e descarte usam diálogo. Preservar recuperação da mesma tentativa e restrições do contrato de cadastro. |
| **Avisos** (sino), alertas de sessão e rede/PWA | Avisos abre lista com motivo, data, estado lido/não lido e destino. Fechar volta ao sino. Rede indisponível aparece em faixa local quando afetar a tarefa. Revalidação de sessão preserva a estrutura e oculta conteúdo protegido se a permissão estiver em dúvida. |
| **Índices novos** (Administração, Plantões, Financeiro, Materiais e grupos da ficha) | Lista vertical, título do grupo, uma linha por destino autorizado com nome explícito. A rota de grupo restaura sua seleção. Nenhuma cópia editável de registro por atalho. Credenciais e expurgo têm consulta e ação local distintas mesmo antes de ganhar folhas separadas. |
| **Meu perfil, edição e Home familiar propostas** | Aplicar contratos da seção 5. Validar identidade de destino e acesso à conta/caso, com regras de negócio aprovadas antes da ativação. |

### Demonstrações e bancadas

A prévia de desenvolvimento `web/demonstracao.html` tem **15 painéis**. Junto à galeria e três bancadas, são **19 superfícies locais**. Aplicar os mesmos componentes a essas superfícies se seguirem sendo usadas para validar a reforma. Dados fictícios e indicação visível de prévia durante todo o fluxo. [Prévia](../../web/demonstracao.html) · [Galeria](../../web/demonstracao-componentes.html) · [Agenda Individual](../../scripts/prova-celular/agenda-individual.html) · [Financeiro](../../scripts/prova-celular/financeiro.html) · [Ficha de plantão](../../scripts/prova-celular/ficha-plantao.html)

| Superfície de prévia | Mudança verificável |
|---|---|
| Entrada e Saída | Aplicar A01/A06, preservando o aviso de demonstração. |
| Relato textual | Aplicar I21, com texto primeiro e estado de envio local. |
| Carteira, pendências e formulário de cadastro inserido | Aplicar A03/I15 e Novo paciente. Usar lista antes do formulário e rodapé de edição. |
| Anamnese | Aplicar I03, grupos com estado, fonte e data. |
| Resumo do caso e Linha do tempo nele inserida | Aplicar I01/I02, situação e cronologia em linhas. |
| Agenda geral e Agenda do paciente | Aplicar A04 às duas, com dia e hora primeiro e criar compromisso sob demanda. |
| Pessoas de referência e Evoluções | Aplicar I19 e I02, identidade e evento/data nas primeiras linhas. |
| Orientações, Encaminhamentos e Documentos | Aplicar I17, I16 e I20 a cada painel. Ler antes de editar ou anexar. |
| Tarefas e Plano de cuidado | Aplicar I07 e I05, com registros completos e edição por intenção. |
| Galeria de componentes | Mostrar variantes e estados das primitivas lado a lado e repetir tabelas/linhas em contêiner abaixo e acima de 720 px. |
| Bancadas Agenda Individual, Financeiro e Ficha de plantão | Aplicar A04, F01–F03 e I08/I09 às respectivas bancadas. Em Agenda, conferir data, vínculo, alteração e cancelamento. Nas três, conferir estados dos controles e acesso às ações com teclado em tela baixa. |

Mockups históricos, proposta comercial e templates de e-mail são referências/editoriais. Nos e-mails de convite/recuperação, verificar no aceite que o verbo do link corresponde ao estado e próximo passo na página de chegada.

## 8. Como medir o antes e o depois

Depois da migração, capturar a base integrada e a proposta com a mesma conta fictícia, mesmos dados, mesma URL de tarefa e mesmas condições. Registrar commit, navegador, viewport, zoom, perfil, amostra e horário. Usar 1440 × 900, 1920 × 1080, 390 × 844, 360 × 800 e 320 CSS px de largura. Repetir teclado e zoom 200% no desktop, movimento reduzido e teclado virtual no celular. Os números históricos orientam a comparação. A referência da reforma é a medição da base integrada. [Medições do PR #24](https://github.com/Trivia-Growth/Francescapp/pull/24)

| O que conferir | Antes documentado ou dado a coletar | Aceite observável |
|---|---|---|
| Largura e hierarquia | Equipe chega a 764 px numa grade de 1.097 px, com 333 px livres de um lado. Catálogo emocional começa em y=1.016 a 390 × 844. | Título, lista e barra de ações alinhados à esquerda. Lista ocupa 100% do contêiner útil. Em 390 × 844 sem bloqueio, primeiro registro ou vazio e ação principal ficam acima de y=844. Em 1440/1920, prosa mede até 65 ch e formulário de uma coluna até 560 px. |
| Linhas e controles | Equipe tem colunas de 77 px na auditoria a 390. Estado e e-mail cortados. | Ler “Convite pendente”, e-mail longo, Perfil e Conta completos em 390 e 360 px. Nenhuma rolagem horizontal no documento a 320 CSS px. Alternar o mesmo contêiner entre 719 e 720 px e verificar semântica, ordenação e paginação nas duas formas. Todos os controles alcançam ao menos 46 × 46 px. |
| Navegação e foco | Administração mostrou um dos 13 destinos inteiros a 390 e a ficha iniciou tarefa em y=915 num link direto. | Zero fitas horizontais. Abrir cada grupo, entrar por link antigo, usar Voltar/Avançar e conferir rótulo/clique atual. Escape devolve foco à origem. Conteúdo de folha direta começa na primeira dobra no cenário típico. |
| Carregamento inicial e retorno | Catálogo fez um GET a cada entrada e mostrou barras aos 325 ms com atraso de 650 ms. | Fazer cinco entradas frias, cinco voltas e cinco atualizações manuais em cada fixture de atraso de **100, 450, 650, 1.200 ms**. Contar GETs, indicadores, tempo até lista utilizável e capturar linha do tempo. No catálogo, zero esqueletos, nenhum aviso inicial nas condições de 100, 450 e 650 ms se o resultado chegar até 800 ms e, nas lentas, no máximo uma indicação textual por operação. Volta elegível mantém lista e foco durante revalidação. Resposta disponível aparece sem atraso artificial. |
| Estabilidade e desempenho | Repetição de consulta na volta e cascata de leituras auxiliares vistas no #24. | Registrar mediana e faixa das cinco amostras por condição. Com CPU 1× e 4× e injeção de latência igual, comparar tempo até ação utilizável, GETs em voo e módulos no caminho crítico. Uma leitura elegível simultânea por chave. Retorno mantém posição de cabeçalho e conteúdo retido. Após editar, a próxima leitura representa o dado confirmado. |
| Acessibilidade e recuperação | Registrar contraste, alvos e foco por estado na nova base. | Conferir cores com medidor, teclado com Tab/Shift+Tab/Enter/Escape e leitor de tela na entrada, tabela/linha, diálogo e atualização. Foco fica visível e conteúdo útil completo com zoom e espaçamento personalizado. Ação indisponível tem motivo/recuperação quando aplicável. |
| Limites de autorização | Registrar quais casos, áreas e publicações a fixture permite. | Repetir link direto, troca de identidade, outro caso, revogação, resposta atrasada e retirada de publicação. Em todos, a superfície perde dado, ação e rascunho protegidos quando a permissão cessa. Provar caso positivo e negativo nas fronteiras do servidor e banco na fatia pertinente. |

Para medir descoberta, pedir a **três familiares e três pessoas da equipe**, em protótipo com dados fictícios, que executem as tarefas sem indicar nomes de menu. Família a 390 px encontra o próximo compromisso, abre o relatório publicado e retorna a Lia. Equipe encontra onde convidar, consultar Agenda e abrir tarefa de Lia. Um administrador diferencia criar conta de conceder vínculo ao caso. Quando o perfil for aprovado, pedir edição do próprio nome ou foto e retorno à tela anterior. Registrar primeiro clique, número de cliques, tempo, pedido de ajuda e resultado. Alvo por tarefa e público: **ao menos duas de três pessoas acertam o primeiro clique** e **três de três concluem sem orientação** no cenário disponível. Medir variante de Plantões/Agenda e primeiro destino do administrador com essas tarefas antes de fixar a posição.

Em cada futura fatia, o PR indica as linhas deste mapa afetadas, o antes/depois dos dois tamanhos e um caminho negativo. Aprovar pelo resultado da jornada e pela evidência de permissão. Revisar o inventário na main integrada da migração antes de distribuir as frentes.
