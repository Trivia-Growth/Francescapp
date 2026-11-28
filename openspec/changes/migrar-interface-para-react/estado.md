# Estado — migrar-interface-para-react

**Atualizado em:** 28/11/2026 · **Branch:** `codex/casca-finalizacao-react` · **Por:** Codex

## Fatia 8z do plano visual — tarefa 7.2 concluída

A aplicação tem uma raiz React para entrada, navegação, Carteira, ficha e Administração.
O roteador por hash preserva os endereços antigos. A demonstração e a vitrine, em páginas
separadas, têm uma raiz cada. A ficha compõe suas seções por React e a ponte
`web/ponte/ilha.ts` foi removida. Nenhuma função `montar*` escreve DOM.

- `rg -n '^export function montar' web` encontra apenas seis geradores puros em
  `web/pacote-exportacao.ts`: `montarResumoHtml`, `montarDadosJson`, `montarBytesZip`,
  `montarZip`, `montarBytesPacoteExportacao` e `montarPacoteExportacao`. Eles produzem
  texto, bytes ou `Blob`. A busca que inclui funções assíncronas também encontra
  `montarCascaParaTeste`, que importa a entrada só para testes. Os nomes internos
  `montarConteudo`, `montarEntradaPorAudio`, `montarNomeador` e `montarVista`
  correspondem a composição React ou construção de valores.
- `pnpm run verificar:ativacao` passou com 84 cenários Chromium e a bancada de
  Trusted Types do build. A prova de autorização local, positiva e negativa,
  passou no PostgreSQL 17 com dados fictícios. Na revisão, 36 testes Vitest focados
  passaram após a retirada de `linha-lista-imperativa` e da sonda de resolução.
- O Chromium verificou links antigos, Voltar/Avançar, retorno de foco ao fechar
  a gaveta e Administração bloqueada para Família por link direto. O axe passou
  em 36 páginas sem violações. `capturas-casca.mjs` verificou a folha
  `index-B4TJL7Mf.css` antes de capturar Seu dia, Pessoas acompanhadas e Administração a
  390 e 1440 px. As seis telas e a gaveta também passaram no axe do build.
  As sete capturas da 8z foram pixel a pixel idênticas às de `c5e4472`.
  As comparações antes/depois da reforma estão em `docs/auditoria-visual-2026-11/`
  (`fatia-8b-*` e `fatia-8-base-carteira-390.png`).
- Ao retirar a guarda de geração da ficha, uma importação antiga de Anamnese
  substituiu Plano. O Chromium falhou esperando `data-secao="plano"`. Com a guarda
  restaurada, o cenário passou.
- No mesmo build e com a mesma medição gzip dos scripts do HTML inicial, a 8z
  passou de 248.016 bytes em `c5e4472` para 247.865 bytes no head rebaseado
  (−151 bytes, sete arquivos nos dois builds). Ao longo de toda a reforma da casca,
  a medida passou de 242.878 bytes em `23d0daa` para 247.865 bytes (+4.987 bytes).
  Login e restauração da sessão compartilham a entrada e os contratos de validação.
- Nas confirmações, o #79 verificou que sair da ficha pelo histórico encerra a pergunta
  de revogação, devolve o foco à linha e não envia a revogação.
- `openspec validate migrar-interface-para-react` passou. O modo `--strict`
  acusa o aviso preexistente de comprimento do requisito VIS-018.
- Próximas tarefas da fase 7: 7.1 (CSS legado), 7.3 (textos das regras) e 7.4
  (avaliação final contra D8, documentação, sincronização e arquivamento).

## Fatia 7.2 — Financeiro em React

O Financeiro (`web/financeiro.tsx`) deixa de montar DOM e vira `TelaFinanceiro`, desenhada pela
raiz da casca como os 13 painéis do #54: portal, fronteira de erro por área, guarda do destino
em `main.ts` e desmontagem na revogação da audiência. Sem mudança de servidor, contrato ou
autorização. `montarFinanceiro` deixa de existir; a bancada `financeiro.html` renderiza o componente.

- Decisão: sem TanStack Query. As leituras são por identificador digitado, sob demanda e de dado
  financeiro; reter em cache ampliaria o descarte sem ganho medido. Cada aba desmonta ao sair e
  leva o que leu. A resposta atrasada é descartada por geração (`useCiclo`) e por desmontagem.
- Detalhe corrigido ao portar: a gravação de despesa lê todos os campos antes da primeira espera,
  então editar o caso durante o envio não muda para onde o comprovante vai.
- Aparência: mesmas classes `.financeiro__*`; abas passam ao `Abas` do sistema (Radix) com os estilos
  legados da faixa (`tabIndex={-1}` na faixa, senão o Chromium para o foco numa `div` sem anel). O
  respiro entre abas e painel passou a ser `padding-top` de `.financeiro__painel`. Capturas a 390 e
  1440 px, bancada com CSS real, antes/depois: cinco das seis idênticas byte a byte na área; na
  sexta (Despesas) só difere uma faixa de 3 px da aba sob o cursor, transição de hover.
  Duas primeiras tentativas regrediram (aba virando botão cinza; 16 px de respiro perdidos) e foram corrigidas.
- Prova: `financeiro.test.tsx` (20 testes), `administracao-carregamento.pw.ts`,
  `financeiro-controles-proprios.pw.ts` e `conforto-celular.pw.ts` (axe sem violação, 360 e 390 px)
  em Chromium: 16 cenários, incluindo audiência revogada durante o carregamento (volta à Carteira,
  `aria-busy` limpo) e resposta atrasada do Financeiro que não pinta Equipe. `verificar:rapido` verde.
- Contraprovas (revertidas): sem a guarda de geração, uma consulta antiga sobrescreveu a lista nova
  (`financeiro.test.tsx`); sem a saída da área desautorizada, a URL ficou em `#administracao/financeiro`
  (`toHaveURL(/#carteira$/)`).
- Revisão do PR #57: (1) com gravação em curso as outras abas ficam desabilitadas, então seta do
  teclado não desmonta o painel nem gera novo `despesa_id`/chave; em Chromium a repetição após falha
  reenviou o mesmo `despesa_id`. Sem o `disabled`, a aba Apuração ficou habilitada. (2) Audiência
  revogada com o Financeiro já montado: a revalidação repergunta a audiência (`sondar(..., renovar)`,
  só com o Financeiro aberto) e `aoMudar` desmonta e volta à `#carteira`; antes só a navegação era
  atualizada e a audiência nunca era repetida na mesma sessão. Sem o descarte no `aoMudar`, a URL
  ficou em `#administracao/financeiro`. (3) `useCiclo` reativa no efeito, e sem isso o modo estrito
  deixava a consulta inerte (teste falhou). Apuração com falha após sucesso não mantém o total
  anterior (defeito antigo da auditoria), com teste. 25 testes e 23 cenários Chromium passaram.
- O #57 foi integrado. A retirada da ponte e do adaptador da ficha foi concluída na 8z.
  As regras `.financeiro__aba` mortas no CSS ficam para a tarefa 7.1.

## Fatia 8y do plano visual — confirmações da página

A raiz da casca e a raiz da demonstração hospedam suas confirmações. O
Radix devolve o foco ao fechar, e desmontar a raiz resolve pedidos pendentes
como cancelados. A tarefa 7.2 permanece aberta.

- Passaram 132 testes Vitest e três cenários Chromium. O navegador verificou
  o cancelamento na Gestão do Turno, a confirmação da Agenda e o descarte do
  Relato na demonstração a 390 px.
- Sem resolver na desmontagem, a prova recebeu uma promessa pendente no
  lugar de cancelamento. Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8x do plano visual — busca, resumo e linha do tempo da demonstração

A raiz da demonstração compõe busca, resumo e linha do tempo. A prova dos
indicadores usa diretamente o componente da Carteira. A tarefa 7.2 está aberta.

- Passaram 44 testes Vitest e lint/typecheck. Chromium a 390 px filtrou pelo
  nome preferido sem acento, limpou a busca e abriu o resumo e a linha do tempo.
- Ao retirar o evento de entrada da busca, a prova deixou de receber o texto
  digitado e sua limpeza. Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8w do plano visual — relato de texto e pendências da demonstração

A raiz da demonstração compõe o Relato e os estados de carregamento, erro e
resultado das Pendências. Ela desmonta o Relato ao confirmar o descarte.
A tarefa 7.2 permanece aberta.

- Passaram 37 testes Vitest. Chromium a 390 px manteve o rascunho ao cancelar,
  esvaziou o painel ao confirmar, devolveu o foco e não enviou o texto ao servidor.
- Sem desmontar o Relato, a prova de descarte encontrou um filho no painel.
  Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8v do plano visual — editores da demonstração local

Documentos, Encaminhamentos, Orientações, Evoluções e Pessoas de referência
são portais da mesma raiz da demonstração. Abrir outro caso cria o painel
com os dados daquele caso. A tarefa 7.2 permanece aberta.

- Passaram 43 testes Vitest e lint/typecheck. Chromium a 390 px abriu dois
  casos fictícios, conferiu o foco de cada painel e viu a evolução só no
  primeiro caso.
- Sem trocar a chave do painel, a evolução do primeiro caso apareceu no
  segundo e o teste de demonstração falhou. Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8u do plano visual — campos de Novo paciente

A casca compõe data de nascimento, situação, responsável e contatos. O
formulário lê os valores nativos, e sair da sessão invalida a consulta de equipe.
As classes dos controles foram preservadas. A tarefa 7.2 permanece aberta.

- Passaram 39 testes Vitest e oito cenários Chromium. Cadastro conservou
  o foco, a validação e o payload de criação. O diálogo permaneceu fechado
  sem permissão. Axe passou no diálogo com a folha de estilo carregada.
- Ao retirar o foco após adicionar contato, Chromium encontrou o novo campo
  sem foco e falhou em `toBeFocused`. Alteração revertida.
- Chromium injetou uma falha de desenho e recuperou os campos pelo botão
  dentro do diálogo. O foco voltou ao título e a sessão sem acesso ao catálogo
  manteve a explicação ao lado do responsável. Antes do portal, Chromium
  deixou de encontrar um botão acessível no diálogo.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8t do plano visual — leitura de registros e consolidado

A bancada renderiza Ficha de plantão e Consolidado na mesma raiz. As provas
de leitura renderizam o histórico e o consolidado diretamente. Saiu o
adaptador de clonagem de nós do React. A tarefa 7.2 permanece aberta.

- Passaram 17 testes Vitest e cinco cenários Chromium. O navegador verificou
  axe, largura, alvos e foco a 360 e 390 px e após recarregar a ficha.
- Ao omitir o componente do portal, o Chromium falhou esperando o título do
  consolidado. Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8s do plano visual — adaptadores de execução usados em testes

Oito montagens do bloco Meu turno e Execução saíram. As provas usam os
componentes ou, para coleta de localização, o controlador já usado pela ficha.
A tarefa 7.2 permanece aberta.

- Passaram 34 testes Vitest em sete arquivos. As provas de coordenação
  verificaram a recusa sem `pode_gerir` e o esvaziamento após revogação.
- Ao exibir a localização sem a permissão de gestão, a prova encontrou o corpo
  visível e falhou. Alteração revertida.
- Chromium confirmou que sair de Execução aborta no mesmo evento e que o
  401 tardio deixa a ficha aberta. Sem `flushSync` na troca de painel, o
  cancelamento só ocorreu depois do evento e a prova falhou.
- Nos relatórios da Família, a chave acompanha o componente que cria o
  serviço. Com a chave apenas no painel, a contraprova em Chromium registrou
  o serviço do paciente anterior na segunda montagem. Com a chave no dono
  do serviço, cada montagem recebeu o próprio paciente.
- O Vitest compara qual serviço cada painel recebe na primeira montagem.
  A implementação de `744cbee` entregou o serviço anterior ao novo painel.
  Com a chave na criação do serviço, a prova passou.
- A seção descarta avisos de acesso perdido após desmonte. Em Chromium, um
  aviso tardio fictício vindo de um filho desmontado preservou a ficha.
  Sem essa guarda, a ficha fechou. A contraprova foi revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8r do plano visual — Meu turno e Execução do cuidado

A ficha compõe Meu turno e Execução e relatórios. Sair da seção invalida a
identidade usada pelas requisições da seção e cancela o transporte da execução.
A tarefa 7.2 permanece aberta.

- Passaram 22 testes Vitest e dois cenários Chromium. O navegador conferiu o
  rascunho da gestão, a ausência de reconciliação antes de abrir Execução e o
  cancelamento da consulta pendente ao voltar para Visão do caso.
- Ao retirar a limpeza do transporte, a prova falhou ao esperar seu sinal de
  cancelamento. Alteração revertida.
- O componente de relatórios da Família inicia uma tela nova na troca de
  paciente. O Vitest conferiu que a opção de exportar o caso não aparece,
  os dados anteriores saem e a leitura pendente é cancelada ao desmontar.
  Sem a chave, o relatório anterior permaneceu. Sem a limpeza, o sinal
  continuou ativo. As duas alterações foram revertidas.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8q do plano visual — relatórios do cuidado para a Família

A ficha compõe a consulta familiar e cancela o serviço ao sair da seção.
Reabrir a seção cria um serviço novo. A tarefa 7.2 permanece aberta.

- Passaram quatro testes Vitest e um cenário Chromium. A Família consultou
  o diário sem opção de exportação de caso. Sair cancelou a leitura pendente e
  reabrir permitiu consultar novamente.
- Sem a limpeza do serviço, o sinal da consulta ficou ativo depois da troca
  de seção e a prova de cancelamento falhou. Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8p do plano visual — bancadas de Plantão e Passagem

Os testes e a bancada de plantão renderizam os mesmos componentes usados pela
ficha. O React controla `aria-busy` da Passagem no próprio painel. A tarefa 7.2
permanece aberta.

- Passaram 17 testes Vitest e cinco cenários Chromium, com axe na Ficha e no
  Consolidado a 360 e 390 px e após recarregar a Ficha.
- Ao retirar `aria-busy`, a prova de consulta recebeu `null` no lugar de `true`.
  Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8o do plano visual — disponibilidade de áudio no Diário

A ficha oferece gravação com sessão Google ou interna da equipe depois de uma
resposta positiva de `/api/transcricao/disponibilidade`, conforme DF-023. O
formulário de texto continua disponível durante a consulta e diante de uma
resposta negativa ou falha. A consulta é cancelada na saída do Diário. A tarefa
7.2 permanece aberta.

- Passaram os cinco cenários Chromium de disponibilidade positiva e negativa
  para cada método, sessão técnica sem consulta e preservação do texto digitado.
- A restrição a Google impediu a gravação quando a sessão interna era elegível.
  Ignorar a negativa fez o gravador aparecer. As duas alterações foram revertidas.
- Capturas do Diário com sessão interna e resposta negativa em 390 e 1440 px
  confirmaram a folha compilada carregada e zero violações de axe nos quatro
  estados de comparação.
- Próximo passo: concluir a validação de 8n/8o no PR #67 sobre a main.

## Fatia 8n do plano visual — conversão do Diário

A conversão de registro em tarefa e evolução interna nasce na árvore da
ficha. A versão anterior mantém o rascunho para conferência e bloqueia envio
até a pessoa pedir a versão atual. A tarefa 7.2 permanece aberta.

- Passaram 25 testes Vitest, um cenário Chromium e lint/typecheck. O cenário
  mostrou a conversão no registro publicado e preservou o rascunho no Diário.
- Sem invalidar a origem, o teste da troca de versão não recebeu o comando
  que bloqueia envio da versão antiga. Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8m do plano visual — filtros da Carteira

A raiz da casca compõe os filtros da Carteira. Retirar a barra invalida a
consulta de responsáveis e desmonta seus controles. Os testes renderizam o
sinal operacional diretamente. A tarefa 7.2 permanece aberta.

- Passaram oito testes Vitest, dois cenários Chromium e lint/typecheck.
  O filtro de revisão foi enviado ao servidor fictício. Com a equipe ainda
  em consulta, sair da conta esvaziou o contêiner.
- Sem desmontar os filtros, o contêiner ficou oculto e com os controles no
  DOM. O cenário falhou em `toBeEmpty`. Alteração revertida.
- A fronteira dos filtros preservou as linhas e o foco do Menu quando o
  componente lançou erro. Sem a fronteira, Chromium perdeu as linhas da
  Carteira. Alteração revertida.
- Receber os responsáveis mantém o painel aberto, o valor de Revisão e o
  foco no controle. Selecionar uma opção nova envia o filtro Responsável.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8l do plano visual — entrada interna e aviso de rede

Os formulários internos e o aviso de conectividade são compostos na raiz da
casca. A montagem do formulário preserva o resumo de entrada no HTML e
registra o comando de limpeza pelo React. A tarefa 7.2 permanece aberta.

- Passaram 16 testes Vitest, três cenários Chromium e lint/typecheck. O aviso
  sem rede coube a 360 e 390 px. Com recusa fictícia, Chromium viu a senha
  apagada antes da resposta, os controles ocupados e Administração oculta.
- Sem apagar a senha no envio, o Chromium encontrou o valor no controle e
  falhou em `toHaveValue`. Alteração revertida.
- Navegação, Carteira, Seu dia, Como funciona e aviso de rede têm fronteiras
  próprias. Após um erro fictício na navegação e a expiração da sessão,
  Chromium entrou com a conta interna fictícia e confirmou a nova sessão.
- Pendência anterior: a limpeza invalida o retorno na tela. Uma requisição
  de entrada já enviada ainda pode terminar no servidor.
- Próximo passo: rebase depois do squash da fatia anterior e ativação.

## Fatia 8k do plano visual — adaptadores sem uso no aplicativo

Saíram sete montagens de Avisos, Seu dia, Como funciona, Lista de pacientes,
Revogação, Síntese e Transcrição. As provas passam a renderizar os componentes
diretamente. A tarefa 7.2 permanece aberta.

- Passaram 35 testes Vitest, cinco cenários Chromium e lint/typecheck.
- Sem iniciar a consulta ao abrir o sino, o teste de Avisos falhou esperando
  o texto de carregamento. Alteração revertida.
- Próximo passo: rebase após o squash da fatia anterior e ativação.

## Fatia 8j do plano visual — Tarefas

A disponibilidade e a tela de tarefas são compostas na ficha. A autorização
para exibir a escrita continua limitada ao caso e à sessão consultados. A
tarefa 7.2 permanece aberta.

- Passaram 11 testes Vitest, o cenário Chromium de leitura quando a escrita
  é recusada e lint/typecheck. Chromium conferiu que a lista ainda abre e que
  o formulário Nova tarefa permanece ausente.
- Forçar a leitura de disponibilidade para `true` fez Chromium falhar ao
  esperar o aviso de escrita indisponível. Alteração revertida.
- A revisão confirmou em teste que o painel está vazio no instante do aviso
  de perda de acesso. A consulta inicial confere o contexto fora do efeito
  de renderização, e a nova tentativa bem-sucedida devolve foco ao painel.
- Próximo passo: rebase depois do squash da fatia anterior e ativação.

## Fatia 8i do plano visual — Minha agenda

A agenda do profissional com Google é composta na raiz React da casca. A
revalidação remove a agenda ao perder o perfil. A bancada Chromium renderiza
o mesmo componente em sua própria página. A tarefa 7.2 segue aberta.

- Passaram oito testes Vitest, dois cenários Chromium e lint/typecheck. A
  mudança fictícia de perfil ocultou e esvaziou o contêiner da agenda.
- Ao só ocultar a agenda, a prova falhou em `toBeEmpty` com o conteúdo ainda
  no DOM. Alteração revertida.
- Próximo passo: rebase depois do squash da fatia anterior e ativação.

## Fatia 8h do plano visual — Cadastro na ficha

A ficha compõe edição cadastral, contatos e substituição temporária. A
conferência de contatos começa depois que a seção é montada. A tarefa 7.2
permanece aberta.

- Passaram 27 testes Vitest, dois cenários Chromium e lint/typecheck. Com
  `administrar_cadastro`, o link direto mostrou edição e contatos. Sem a
  capacidade, a ficha abriu Visão do caso e não consultou a barreira de contatos.
- Sem conferir a capacidade, a prova negativa encontrou `data-secao="cadastro"`
  no painel. Alteração revertida.
- Rebase sobre `aa0e12e`, com as provas de download e recuperação da ficha
  preservadas. Próximo passo: ativação e revisão independente.

## Fatia 8g do plano visual — Plano, Documentos e Escala de turnos

Plano de cuidado, Documentos e Escala de turnos renderizam no painel React da
ficha. O Plano da equipe acompanha a revalidação enquanto a seção está montada.
Documentos encerra o download pendente ao desmontar a seção. A tarefa 7.2 segue
aberta.

- Passaram 41 testes Vitest, oito cenários Chromium e lint/typecheck. Após sair
  de Documentos antes do carregamento do módulo, nenhum GET da seção saiu.
- Sem a guarda do botão Baixar arquivo, a resposta tardia criou um Blob URL
  após a desmontagem e falhou em `not.toHaveBeenCalled`. Alteração revertida.
- Rebase sobre `9d7c3c6`. Foram removidos cinco imports sem uso da ponte e
  atualizados os comentários das seções que já compõem a ficha. Próximo passo:
  ativação e revisão independente.
- A ativação inicial passou com 933 testes web, 61 cenários Chromium e um
  cenário preexistente pulado. A autorização de pacientes passou em
  PostgreSQL 17 descartável.
- Revisão do #59: o estado do download acompanha a seção e preserva o
  andamento quando chega outro anexo. A saída só repassa recusa de sessão à
  mesma sessão que iniciou a operação. Passaram 16 Vitest e cinco cenários
  Chromium. Com a guarda antiga, o botão voltou a habilitar durante o
  download e a prova falhou em `toBeDisabled`. Sem repassar a recusa 401
  tardia, o teste encontrou zero chamadas ao tratamento de sessão. As duas
  alterações foram revertidas.
- O PR #59 foi rebaseado sobre `dda7b07` após a entrada do Financeiro.

## Fatia 8f do plano visual — seções operacionais da ficha

Diário, Pendências, Exportação, Equipe com acesso, Rotina e recursos e Rede de
cuidado passam a renderizar no painel React. As integrações de áudio e conversão
de relato ainda são legadas. A tarefa 7.2 permanece aberta.

- Passaram 52 testes Vitest, cinco cenários Chromium e lint/typecheck. O roteiro
  de Diário confirmou que uma importação atrasada não monta a seção nem consulta
  o diário. Sem conferir a geração, Diário substituiu Plano e falhou em
  `toHaveAttribute`. A contraprova foi revertida.
- Fatia rebaseada sobre `5131029`, com a prova de recuperação da ficha
  preservada. Próximo passo: ativação e revisão independente.

## Fatia 8e do plano visual — primeiras seções da ficha

Visão do caso, Linha do tempo, Dados do paciente, Orientações, Encaminhamentos,
Acesso da família, Saúde, Plano de crise e Anamnese passam a renderizar no painel
React da ficha. Os leitores e formulários preservam a montagem sob demanda.
A tarefa 7.2 permanece aberta.

- A coordenação confirmou que o aceite é eliminar as montagens que escrevem
  no DOM e remover `web/ponte/ilha.ts`. Os seis geradores puros de
  HTML, JSON e ZIP em `web/pacote-exportacao.ts` preservam seus nomes.
- 68 testes das nove telas, 12 cenários Chromium e lint/typecheck passaram.
- Após a troca para Plano, liberar a importação de Anamnese manteve Plano como
  única seção e não emitiu GET do registro de Anamnese. Sem a guarda de geração,
  o painel ativo passou a exibir `data-secao="anamnese"`. Alteração revertida.
- Com a seção em erro, a fronteira invalida a pendência e aceita nova tentativa.
  Os 22 testes da ficha passaram. Sem a invalidação, o teste encontrou a pendência
  de Anamnese após a falha. Alteração revertida.
- Após rebase sobre `305c60e`, passou a prova SQL de autorização de pacientes em
  PostgreSQL 17 descartável. Próximo passo: ativação e revisão do PR #56.

## Fatia 8d do plano visual — moldura da ficha

Cabeçalho, abas, atalhos e painel da ficha passam para a raiz da casca. A ficha
mantém as confirmações de descarte e a invalidação de seção durante a revalidação.
Nas seções que ainda usam `montar*`, a moldura cria o contêiner e a integração
legada cria e desmonta seus filhos. Tarefa 7.2 aberta.

- Chromium a 390 px chegou por link antigo de Anamnese, reteve o módulo e abriu
  Plano. Após liberar a importação antiga, Plano permaneceu como a única seção
  e a navegação continuou viva. Sem a guarda de geração, a contraprova encontrou
  `data-secao="anamnese"` no painel de Plano. A guarda foi restaurada.
- Passaram 37 testes da ficha, da integração e da gaveta, e seis cenários
  Chromium de ficha e da casca. A ativação inicial de `04360b9` confirmou
  929 testes web e 58 cenários Chromium, com um cenário preexistente pulado.
  A prova SQL de autorização passou em PostgreSQL 17 descartável.
- Revisão do PR #55: a primeira falha da ficha pode ser recuperada no mesmo
  link, a navegação por seta seguida de clique conserva uma só aba tabulável,
  e desmontar a moldura invalida a pendência e libera a seção legada. Passaram
  39 testes locais e sete cenários Chromium. Sem encerrar a vista quando o
  controlador ainda é nulo, a contraprova ficou no fallback de erro.
- Próximo passo: rebase depois do squash de #54 e ativação da fatia.

## Fatia 8c do plano visual — painéis administrativos

Treze painéis administrativos passam para a raiz da casca, preservando links
antigos, divisão do bundle por destino e autorização do servidor. Financeiro
ainda usa sua implementação DOM. A tarefa 7.2 permanece aberta.

- Chromium reteve a importação de Configuração, navegou à Equipe e liberou a
  importação antiga. Equipe continuou visível e nenhum GET de Configuração saiu.
  Sem a guarda do destino, a contraprova exibiu Configuração na área da Equipe e
  falhou em `toContainText`. A guarda foi restaurada.
- Ao retirar a capacidade de concessões da sessão fictícia durante revalidação,
  Equipe foi desmontada e o endereço voltou à Carteira. Os demais destinos do
  Administrador continuaram disponíveis. Os 85 testes locais das telas passaram.
- A prova `scripts/testar-acesso-paciente-autorizacao-local.sh` passou novamente
  em PostgreSQL 17 descartável sem rede. A ativação de `f6ba726` passou com 929
  testes web, 55 cenários Chromium aprovados e um preexistente pulado.
- Revisão do PR #54: erro de renderização deixou a navegação viva e a nova tentativa
  recuperou o painel. Perda simulada de audiência durante a importação voltou à
  Carteira e limpou `aria-busy`. As quatro provas passaram. Sem a fronteira de erro,
  a navegação desapareceu. Sem a saída da área desautorizada, a URL ficou no Financeiro.
- Próximo passo: CI e portabilidade da ficha, do Financeiro e dos módulos de entrada
  ainda imperativos.

## Fatia 8b do plano visual — lateral, gaveta, barra e linhas da Carteira

Sobre `b5db640`, a raiz da casca desenha a navegação responsiva, barra, Avisos,
Seu dia, Como funciona e linhas da Carteira. A revalidação continua ocultando o
conteúdo protegido. Os painéis e seções com montagem imperativa ainda precisam
ser migrados para cumprir a tarefa 7.2.

- Chromium, build de produção: 240 px de lateral em 1440 px, gaveta de 358 px em
  390 px, barra sticky de no mínimo 72/64 px e um título principal nas seis capturas.
  As folhas carregadas foram `index-X-zgnAef.css` na base e `index-B-X97JSR.css`
  na fatia. O JavaScript inicial passou de 242.878 a 245.239 bytes gzip em seis arquivos.
- Axe integral sem violações nas seis vistas e na gaveta. Na base, os cinco botões
  da Carteira tinham nome incompatível com o texto visível, e o corpo do diálogo
  de cadastro era rolável sem foco. Reintroduzir o rótulo anterior nos botões
  reproduziu a violação a 390 e 1440 px. Alteração temporária revertida.
- Ativação inicial de `50e4880`: 929 testes web e 52 cenários Chromium aprovados
  (um cenário preexistente pulado), build e Trusted Types aprovados. A prova SQL
  de concessão e recusa passou em PostgreSQL 17 descartável sem rede.
- Revisão do PR #53: título visível e foco preservado ao cruzar 1024 px, rótulo
  do trilho reaparece com hover e foco, e a seta da Carteira usa um único desenho.
  Os cinco cenários da casca passaram; sem a transferência de foco, o Chromium
  falhou em `toBeFocused` para Menu. A prova do catálogo confirmou um GET inicial,
  cinco voltas sem GET e descarte após 403. Capturas refeitas com CSS aplicado.
- A CI do primeiro ajuste encontrou um clique no fundo antes da instalação do
  ouvinte do Radix. O próprio fundo passou a fechar a gaveta. O cenário que
  falhou passou cinco vezes seguidas em Chromium.
- Próximo passo: CI e aprovação das capturas. A tarefa 7.2 segue com os painéis
  restantes, e o corte preexistente do sinal operacional fica no PR #51.

## Fatia 8a do plano visual — roteador por fragmento

Sobre `23d0daa`, a raiz da casca React controla o histórico e desenha Seu dia e
Como funciona. Carteira, Administração e ficha usam os destinos existentes durante
a transição. A tarefa 7.2 permanece aberta.

- A prova `roteamento-casca.pw.ts` confirmou link antigo de Configuração, preservação
  de `?agenda=conectada`, Voltar/Avançar e foco a 390 px. Família chegou à Carteira
  via link administrativo sem montar Administração nem disparar chamadas a `/api/admin/`.
  A contraprova removeu o foco no título da Carteira e falhou em `toBeFocused`.
- A base compilada referenciava 242.878 bytes gzip de JavaScript inicial (seis arquivos).
  A captura da Carteira a 390 px documenta recorte preexistente dos motivos FR-028.
  A folha de produção estava aplicada. A correção da linha é de outra frente.
- Revisão independente em `23d0daa...4833381`: a volta à Carteira preserva o
  foco na linha da ficha anterior e Seu dia permanece como única vista durante
  a consulta da ficha fora da primeira página. As contraprovas reproduziram a
  perda do foco e a Carteira visível; as quatro provas passaram com a correção.
- Ativação local de `4833381`: 930 testes web, 50 cenários Chromium aprovados,
  um cenário previamente pulado, build e Trusted Types aprovados. A revisão
  também executou `scripts/testar-acesso-paciente-autorizacao-local.sh` em
  PostgreSQL 17 descartável, sem rede, com saídas de concessão e recusa verificadas.
- Próximo passo: CI de 8a e portar lateral, gaveta, barra e destinos restantes.
  As pendências de axe da base na Carteira e no corpo rolável de diálogo continuam
  registradas para a etapa visual.

## Fatia 4 do plano visual — primitivas e ícones

Na branch `codex/primitivas-sistema`, sobre `12bfb81`, Botão, Campo e
MarcaEstado usam cva e os tokens do SISTEMA §§2, 3 e 6. Configuração do
sistema faz uso do estado “Salvando…”. A casca mantém a navegação existente
com ícones Lucide e o sino apresenta o texto visível no nome acessível.

- Chromium 159 validou pílula de 999 px, tamanho 16/24 e alvo mínimo de
  46 px nos controles a 390 e 1440 px. Cliques repetidos, Enter e
  `requestSubmit()` não admitiram outro envio pendente na galeria.
- Ao remover a guarda de `aria-disabled`, o teste contou três ativações
  em vez de uma. Restaurar o nome anterior do sino reproduziu
  `label-content-name-mismatch` em Auditoria. Ambas as contraprovas
  foram revertidas.
- O axe da galeria mede os três componentes. Em varredura integral,
  as linhas acionáveis da Lista apresentaram divergência entre nome
  acessível e texto visível. O achado pertence à fatia 5.
- A primeira tentativa com `aria-label` ainda falhou em seis páginas.
  O nome nativo do botão passou nas seis em Chromium após o rebase.
  O relatório de 30 varreduras ficou com zero violações e zero exceções.
- O teste da ponte imperativa passou ao conferir o mesmo contrato do Botão.
  Build, Trusted Types e o caso positivo e negativo de acesso a paciente
  em PostgreSQL 17 descartável passaram. A prova SQL simula Auth e Vault.
- Próximo passo: CI de ativação no PR #47 e aprovação das capturas pelo dono.

Leituras do catálogo Estado emocional via TanStack Query (#48): QueryClient único, chave por conta+sessão, clear() na revogação/novo acesso/saída, retenção de 5 min.

## Fatia 3 do plano visual — tokens do SISTEMA

Na branch `codex/tokens-sistema`, sobre `a8a3f8a`, o `@theme` expõe os
tokens do SISTEMA (§2). As utilitárias existentes ainda renderizam a galeria
da base. A prova cobre VIS-017 e os quatro pares de contraste do §6.

- Chromium 159, galeria local com dados fictícios, 390 × 844 e 1440 × 900.
  Os pares antes/depois são idênticos byte a byte. Uma amostra temporária
  confirmou as novas utilitárias de cor, raio, espaço e tipografia, inclusive
  o breakpoint de viewport e a variante por contêiner.
- Contraprovas revertidas. Com o texto secundário em `#c0c0c0`, o contrato
  mediu 1,66:1 contra 4,5:1. Retirar `1` do grupo tipográfico de `juntar`
  descartou `text-1` ao lado da cor. O Vitest falhou nos dois casos.
- `pnpm exec vitest run web/contrato-visual.test.ts web/componentes/ui/juntar.test.ts
  --reporter=minimal` passou em Node 22 com 27 testes após restaurar os valores.
  `acesso_paciente_autorizacao_local.sql` passou em PostgreSQL 17 descartável
  com Auth e Vault simulados. Verificou concessão, acesso direto, outro caso e revogação.
- Próximo passo da fatia: CI de ativação no PR #45 e aprovação do dono pelas capturas.
  A adoção das utilitárias nas primitivas começa na fatia 4.

## Retirada do observador de controles

As quatro regiões com seleção e data já montam os próprios controles. Durante a
migração o nativo nascia no invólucro com `data-aprimorada`, que o observador pulava.
Depois das provas de convivência, as seis inscrições de `main.ts` foram retiradas.
Regras e Início não renderizavam os tipos de controle observados.

- `pnpm run verificar:celular agenda-individual-controles.pw.ts` passou em Chromium a
  390 × 844 com o tema real e dublês HTTP. O observador processou um select legado de
  prova. Motivo entrou e saiu três vezes, seus valores chegaram ao FormData, e a
  recusa simulada da gravação (403) apareceu no formulário. Início e Fim da operação
  permaneceram `datetime-local` sem invólucro.
- Contraprovas revertidas: a regra de opacidade alterada para `1` falhou em
  `#realizacao-situacao` com esperado `0` e recebido `1`. Sem `data-aprimorada`,
  o observador gerou dois invólucros e a prova esperava um. Nenhuma falha foi por
  tempo esgotado.
- A ativação da agenda em Node 22 passou localmente e na CI do PR #30. A prova
  SQL de realização (FR-024) passou em PostgreSQL 17 descartável com casos
  positivos e negativos e acesso direto.
- Administração: seleção React aplicada às áreas com controles. As datas da
  Auditoria notificam o ISO por callback explícito, preservando os GETs corrigidos
  no PR #33. O Financeiro monta e desmonta as ilhas das quatro datas nas trocas
  de aba. A prova da casca de Administração usa um select legado para confirmar
  o observador ativo e verifica um único invólucro nos componentes migrados.
- `pnpm run verificar:rapido` e
  `pnpm run verificar:celular filtros-data.pw.ts financeiro-controles-proprios.pw.ts`
  passaram em Node 22. Na contraprova da Administração, mudar apenas a regra de
  opacidade das datas para `1` falhou em `#auditoria-de` com recebido `1` e
  esperado `0`. Revertida a alteração, a prova passou.
- Ficha: `pnpm run verificar:rapido` e `pnpm run verificar:celular filtros-data.pw.ts
  ficha-plantao-celular.pw.ts` passaram em Node 22 e Chromium (9 cenários). Na casca,
  a sentinela comprovou o observador ativo e a seleção de profissionais foi
  remontada ao avançar a página. A Linha do tempo preservou a data nos GETs e
  as seleções da ficha de plantão mantiveram a interação no celular.
- Orientações e Encaminhamentos optam pelo aprimoramento na Ficha. Os 37 testes
  das duas seções e da demonstração passaram no #39. A comparação em Chromium
  na `main` em `99fd4a1` confirmou três divergências de preenchimento
  programático: datas vazias e audiência Interna em Orientações, etapa
  sugerido em Encaminhamentos e o familiar errado ao manter o rascunho na
  Gestão do Turno. Os valores nativos estavam corretos.
- O preenchimento programático agora notifica os controles aprimorados pelo
  mesmo evento local. `pnpm run verificar:celular preenchimento-controles.pw.ts`
  passou nos três cenários. Remover apenas o envio desse evento reproduziu
  as três divergências na comparação imediata, com opacidade calculada zero.
  Restaurado o evento, os três cenários passaram. As provas SQL
  `orientacao_operacoes_local`, `orientacao_familia_local`,
  `encaminhamento_operacoes_local` e `turno_execucao_clinica_local` passaram
  em PostgreSQL 17 descartável. Próxima fatia: Cadastro.
- Reprodução anterior à migração da ficha: com a chave no invólucro antigo,
  Equipe com acesso abriu e avançou à página 2. Mover somente a mesma chave
  para o select nativo lançou `NotFoundError` em `removeChild` na montagem.
  A alteração temporária foi revertida. A chave agora pertence ao componente React.
- Contraprova da ficha: alterar somente a opacidade de `select` para `1` fez
  falhar a medição de `#profissional-selecionado` (esperado `0`). Depois de
  restaurar a regra, o cenário voltou a passar.
- Cadastro: Nascimento, Situação, responsável e o tipo dos contatos recebem
  ilhas React. A equipe muda por props e o hospedeiro lê os nativos do
  formulário. Correção em commit próprio: a saída limpava as marcações de
  nome, preferência e nascimento e esquecia Situação e responsável. A prova
  no Vitest falhou com as duas seleções ainda inválidas e passou após a limpeza.
- `pnpm run verificar:rapido` e os 38 cenários de `campos-caso-novo.test.ts` e
  `fluxo-caso-novo.test.ts` passaram. Chromium na casca do cadastro verificou
  o observador ativo pela sentinela legada, a equipe chegando depois da
  abertura, a montagem/desmontagem de contato, o foco de erro, o POST com os
  valores corretos e o reset. Ao alterar só a regra CSS para opacidade `1`,
  a prova falhou em `#birth-date`, esperado `0` e recebido `1`. Restaurado e
  verde.
- A primeira CI do #41 registrou trabalho React após o teardown do jsdom. O
  desmonte do Cadastro retira as ilhas e os eventos dos botões e invalida a
  consulta de equipe pendente. A casca usa esse desmonte na saída definitiva
  da página, e as provas o chamam antes de descartar o DOM. O teste de
  regressão cobre reset, contato extra e resposta de equipe após o desmonte.
  Os 42 testes de campos, fluxo e integração de edição passaram em conjunto.
  Os nove testes de retorno Google passaram com o mesmo desmonte entre as
  recargas simuladas e no fim de cada teste.
- A retirada removeu o instalador global e as ligações das bancadas. As provas
  direcionadas em Chromium passaram (25 cenários), com o tema real e as três
  regressões de preenchimento. Em cada uma das seis regiões da casca, um
  select e uma data inseridos após a carga permaneceram no mesmo pai, com
  opacidade `1`. Religar o observador original fez as seis provas falharem
  pela troca do pai. Restaurada a retirada, as seis voltaram a passar.
  `pnpm run build:web` e as provas de vínculo e de execução do cuidado
  pela casca de produção local também passaram.
- A bancada do painel #31 monta os campos reais. Ao bloquear Tab na captura
  somente para a contraprova, Tab nº 11 levou o foco para `body#` e a asserção
  falhou. Com o bloqueio revertido, os quatro cenários do painel passaram.
  As provas SQL de Agenda, Auditoria, Linha do tempo, Ficha e Cadastro passaram
  em instâncias descartáveis de PostgreSQL 17.
- A primeira CI do #42 encontrou trabalho React durante o teardown de
  `login-aba-oculta.test.ts`. `teste-casca.ts` registra o desmonte real do
  Cadastro no fim de cada caso para as provas que importavam `main.ts`
  diretamente. As provas com recargas simuladas mantêm o desmonte entre
  as montagens da casca. Passaram os 122 testes nos 29 arquivos atualizados.
- A auditoria de imports e referências a recursos em `web` e `scripts`
  encontrou zero importadores externos de `web/ui/`. A casca usa as pontes
  imperativas de botão e linha de lista. `estilos/tema.css` importa a folha
  movida para `web/estilos/ui.css` na mesma camada `legado`, com os mesmos
  bytes.
- Sobre `8f03652`, a remoção dos oito arquivos órfãos encerrou a parte de
  `web/ui/` da tarefa 7.1. O comentário da Carteira aponta para o painel de
  cadastro. Os 25 cenários Chromium passaram com a pasta removida. Na
  contraprova, mudar só a opacidade do select nativo fez `#realizacao-situacao`
  receber `1` em vez de `0`. O cenário voltou a passar após restaurar a regra.

## Histórico da integração do turno e plantão

O PR #22 integrou o bloco turno/plantão (tarefa 5.2, leva 2), com um commit por
módulo. A sequência de blocos tem por alvo retirar os importadores de `web/ui/`.

## Última tarefa concluída

- **`web/painel-cadastro.ts` sem `web/ui/`** (branch `migracao/painel-cadastro`, 27/11):
  continua `.ts` carregado por `<script>` (A6) — não desenha nada; o `<dialog>` e o
  formulário são de `index.html`/`main.ts` e migram com a casca. `focaveis`/`prenderFoco`
  passaram para `web/ponte/foco-preso.ts`; `web/ui/dialogo.ts` importa de lá (uma cópia
  só). Provas novas, que não existiam: `web/painel-cadastro.test.ts` (jsdom, 4) e
  `scripts/prova-celular/painel-cadastro.pw.ts` (Chromium, marcação lida de `index.html`,
  `aplicarControlesProprios` ativo em `#cadastro`, 4). Contraprovas: sem `prenderFoco`, o
  Tab nº 10 leva o foco ao `body`; sem a guarda do `hidden`, o diálogo abre sem permissão.
  `main.ts` e `index.html` intocados. Importadores de `web/ui/` (grep do #26): 6 → 5.
- **Bloco turno/plantão fechado** (PR #22, `ec879a2`): 7 módulos imperativos migrados,
  fábricas imperativas retiradas, costuras da síntese e de `turno-proprio.tsx` desarmadas.
- Evidência: `pnpm run verificar:ativacao` local em `ec879a2` saiu 0 (3m16s; web 905,
  proxy 742, funções 324, contratos 207, cadastro 137, celular 14; 30 pulados, os mesmos da
  `main`). CI `verificar-ativacao` do PR #22 verde (4m15s), com o PR fora de draft.
  Peso do JS na primeira visita: 224.425 B = 219,2 KiB (main `80f7583`: 222.914 B =
  217,7 KiB; +1,5 KiB), gzip -9 do `index.html` e tudo que ele puxa, inclusive
  `modulepreload`. Aviso do build mantido: `turno-execucao-relatorios` preso por import
  estático, agora de `turno-execucao.tsx`.

- Prova de navegador pela casca real (`scripts/prova-celular/turno-casca-producao.mjs`,
  build de produção, Chromium, dublê HTTP): exercita os `<select>` e datas do turno com o
  observador `aplicarControlesProprios` de `main.ts` ATIVO. Código real: passou (e passou
  também na `main` `80f7583`, linha de base). Contraprova: com o seletor de turno dos
  relatórios trocado por `<select>` cru condicional, falhou com `NotFoundError: Failed to
  execute 'removeChild'`; revertido e repassou.

- Ficha do plantão (`ficha-plantao-celular.pw.ts`, teste novo de interação): com a bancada
  honesta do #25 (que instala `aplicarControlesProprios` e carrega `tema.css`), código real
  5/5; contraprova (seletor "Plantão" trocado por `<select>` cru que some com "Sim") falhou
  com `NotFoundError` em `removeChild`, pego na conferência de erros; revertido, 5/5. Na
  bancada antiga, sem observador, a mesma mutação PASSA — a bancada mentia. Até o #25
  entrar, o teste roda no caminho nativo nesta branch.
- Conflito previsto com o #25: os dois mudam a linha do import de
  `scripts/prova-celular/ficha-plantao.ts` (aqui para `.js`, porque o módulo virou `.tsx`).

## Próximo passo

- Bloco agenda (4 módulos), avulsos, `confirmacao.ts`, `main.ts`.
- Costuras `.tsx → montar*` fora do bloco turno, a reportar antes de resolver:
  `editar-paciente.tsx:440` (`montarSubstituicaoCaseManager`), `selecao-profissional.tsx:409`
  (`montarRevogacaoVinculo`) e `diario.tsx` (`montarEntradaPorAudio` via `AudioOuAtalho`).

## Bloqueadores

- A7 fica com a frente que já o conduz (branches locais `LmAzevedo94/validar-a7-vault` e
  `LmAzevedo94/inventario-ffcm`); pendências dele são do dono.
- Roteiro de navegador com backend REAL para a tela do turno não executado; a prova de
  navegador desta fatia usa dublê HTTP (ver abaixo).

## Decisões vigentes nesta mudança

- 27/11/2026, coordenação: migrar até `web/ui/` ficar sem importador; um PR por bloco
  (turno → agenda → avulsos → `confirmacao.ts` → `main.ts`), sem merge pela frente.
- `web/confirmacao.ts` entra como item próprio depois da agenda. Verificado: o diálogo é
  anexado a `document.body` (`web/ui/dialogo.ts:176`), fora de qualquer raiz React.
- Peso de referência: 179,1 KiB antes do React (`fa72f8d`), 217,7 KiB em `80f7583`
  (gzip -9 do JS do `index.html`, inclusive `modulepreload`). Saldo +38,6 KiB.

## Pendente de confirmação do solicitante

- Os 3 módulos só da demonstração (`evolucoes-locais`, `painel-pendencias-local`,
  `relacoes-locais`) importam `web/ui/`: migrar ou apagar a demonstração.
