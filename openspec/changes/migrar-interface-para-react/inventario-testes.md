# Inventário dos testes de `web/` para a migração para React

Base: `find web -name '*.test.ts'` em 25/11/2026 — **119 arquivos, 20.108 linhas**.

Este documento existe para que nenhum teste seja removido em silêncio. Cada arquivo recebe
exatamente uma categoria, e cada reescrita é nomeada e justificada.

- **A — Comportamento, rede de segurança.** Afirma o que a pessoa observa ou o que o servidor
  recebe. Deve permanecer verde após a migração, no máximo com troca de seletor.
  Todo teste de autorização é A, sem exceção, mesmo quando hoje alcança o elemento por classe CSS.
- **B — Estrutura, vai precisar de reescrita.** O que o teste afirma *é* o jeito de construir o DOM
  (nome de classe como contrato, ordem de filhos, componente imperativo que React substitui).
- **C — Agnóstico.** Serviço HTTP, ciclo/barreira, contrato, lógica pura. Não toca `document`.

## 1. Contagem por categoria

| Categoria | Arquivos | Linhas | % das linhas |
|---|---:|---:|---:|
| A — comportamento (rede de segurança) | 91 | 16.601 | 82,6% |
| B — estrutura (reescrita necessária) | 8 | 988 | 4,9% |
| C — agnóstico (não afetado) | 20 | 2.519 | 12,5% |
| **Total** | **119** | **20.108** | **100%** |

A leitura importante: **95% das linhas de teste não dependem de como o DOM é construído**. A
migração não precisa reescrever a suíte; precisa trocar seletores em um punhado de pontos e
reescrever oito arquivos. O risco real da migração não está nos testes que vão quebrar — está nos
módulos listados na seção 5, que não têm teste nenhum.

## 2. Tabela completa

### Categoria A — comportamento

| Arquivo | Cat. | Linhas | O que garante |
|---|:--:|---:|---|
| `web/acesso.test.ts` | A | 228 | Login não revela conta em limite (`:38`), falha tardia não rouba foco (`:65`, `:105`) e recusa de permissão numa seção não derruba a sessão (`:214`). |
| `web/acessos-administracao.test.ts` | A | 304 | Senha é limpa antes da chamada, resposta perdida não repete escrita (`:62`); lista indisponível não aceita cadastro e só libera após consulta autorizada (`:163`). |
| `web/acompanhamento-caso.test.ts` | A | 66 | Só concessão vinculada a usuário entra na equipe, inativo é marcado (`:13`) e equipe que não termina de paginar é recusada em vez de virar lista parcial (`:46`). |
| `web/agenda-consentimento.test.ts` | A | 75 | Consentimento incompleto da agenda Google mantém a orientação após consultar estado (`:41`) e parâmetro desconhecido não inventa resultado (`:66`). |
| `web/agenda-operacoes-isolamento.test.ts` | A | 73 | Reconciliação de outra conta não apaga envio incerto (`:10`); marcador antigo sem autor identificável continua bloqueado (`:56`). |
| `web/anamnese.test.ts` | A | 431 | Rascunho sobrevive a conflito de versão e bloqueia envio obsoleto (`:166`); disponibilidade tardia após troca de paciente é ignorada (`:349`). |
| `web/atualizar-lista-foco.test.ts` | A | 78 | Atualizar a carteira não duplica pedido, mantém `aria-disabled` e preserva `document.activeElement` no botão (`:28`). |
| `web/aviso-saida-cadastro.test.ts` | A | 200 | Sair durante cadastro sem confirmação avisa e não persiste nome em `localStorage`/`sessionStorage` (`:113`); reconhecimento explícito é o que libera novo envio. |
| `web/busca-pacientes-local.test.ts` | A | 25 | Busca ignora acento e caixa (`:5`) e o campo é rotulado e comunica limpeza (`:13`). |
| `web/callback-erro.test.ts` | A | 54 | Retorno não autorizado mostra falha genérica e remove só o marcador (`:19`); sessão anterior válida é preservada (`:33`). |
| `web/campo-extra-plano-administracao.test.ts` | A | 129 | Falha de autorização limpa conteúdo administrativo e comunica perda de acesso (`:59`); timeout repete o mesmo campo e chave, sem criar outro (`:87`). |
| `web/campos-caso-novo.test.ts` | A | 337 | Contatos param em 10 com rótulos ligados (`:75`), `cancelarCarga` invalida a equipe já carregada como no fim de sessão (`:303`). |
| `web/casca-offline.test.ts` | A | 433 | Service worker não intercepta rota de API (`:113`), não guarda conteúdo de caso (`:310`), revogação não é contornada pelo aparelho (`:373`) e segunda pessoa não encontra a sessão anterior (`:405`). |
| `web/ciclo-tela.test.ts` | A | 144 | Liberar exige confirmação e a reserva vai vinculada à criação (`:31`); revogação na consulta da barreira remove dados protegidos (`:91`). |
| `web/concessao-equipe.test.ts` | A | 131 | Resultado confirmado é recuperado após recarga antes de permitir nova solicitação (`:13`) e resultado não identificado não é reconhecido (`:53`). |
| `web/configuracao-sistema.test.ts` | A | 47 | Raiz Drive aceita texto livre vazio sem inventar obrigatoriedade global (`:6`). |
| `web/confirmacao.test.ts` | A | 72 | Confirmação aparece no documento com foco na ação segura (`:15`), Esc cancela (`:42`) e Tab não sai do diálogo (`:55`). |
| `web/consolidado-ficha-plantao.test.ts` | A | 167 | Agrupa por plantão com período e papel declarado (`:86`), não emite vocabulário clínico (`:149`) e dia sem plantão mostra vazio sem dado de exemplo (`:152`). |
| `web/contatos-paciente.test.ts` | A | 80 | Reserva aberta não é encerrada sem confirmação (`:30`) e resultado de outro paciente não é reconhecido (`:41`). |
| `web/contexto-objetivos-paginados.test.ts` | A | 148 | Perda de acesso na consulta encerra o editor sem preservar escolhas de outro acesso (`:139`); falha preserva rascunho e vínculos (`:83`). |
| `web/contexto-rede-cuidado.test.ts` | A | 190 | FR-005 salva vínculo com objetivo (`:14`), conflito de versão não perde rascunho (`:105`) e FR-002 avisa que o vínculo não dá acesso (`:139`). |
| `web/conversao-diario.test.ts` | A | 336 | Conversão chama só a porta atômica, sem prioridade/área padrão (`:173`); troca de conta descarta resposta tardia (`:252`); recarga sem ledger cerca a reserva anterior (`:301`). |
| `web/demonstracao.test.ts` | A | 1365 | Página oculta fora de localhost (`:192`), sessão expirada oculta dados preservando rascunho (`:667`), repetição bloqueada após resposta perdida (`:899`) e reconciliação após recarga sem guardar texto no navegador (`:950`). |
| `web/diario-conversao-elegibilidade.test.ts` | A | 129 | Família nunca recebe conversão, mesmo com a porta fornecida por engano (`:62`); rascunho nunca é convertido (`:31`). |
| `web/diario.test.ts` | A | 451 | Relato da família grava `relato_familiar` com audiência equipe (`:68`), família não vê "Responder" em evolução profissional (`:106`) e reconsulta negada encerra o acesso e remove conteúdo (`:346`). |
| `web/documentos-caso-edicao.test.ts` | A | 178 | Família não recebe controles de edição de metadados (`:79`); negativa do servidor descarta acesso e dados da tela (`:106`); upload acima de 4 MiB é recusado antes do serviço (`:166`). |
| `web/documentos-download.test.ts` | A | 176 | Troca de identidade durante download descarta os bytes (`:54`); família baixa só via Blob local e a desmontagem revoga a capacidade (`:126`). |
| `web/documentos-locais.test.ts` | A | 53 | Metadados fictícios são listados como texto, sem interpretar HTML (`:5`); rascunho preservado após falha (`:37`). |
| `web/editar-paciente.test.ts` | A | 455 | Edição reconcilia após recarga antes de novo envio, sem persistir rascunho (`:19`); resultado de outro paciente não é reconhecido (`:148`); reserva em outra aba não é encerrada sem confirmação (`:217`). |
| `web/encaminhamentos-local.test.ts` | A | 153 | Só atualiza após gravação e preserva rascunho na falha (`:6`); filtro e edição ficam bloqueados enquanto salva (`:123`). |
| `web/encaminhamentos.test.ts` | A | 94 | Revisão usa a versão vigente (`:16`), criação parte de versão esperada zero (`:53`) e falha de carregamento não derruba o acesso (`:77`). |
| `web/escala-turno.test.ts` | A | 224 | Recusa definitiva exige consulta antes do descarte e preserva o motivo (`:119`); criação incerta mantém a mesma operação e não libera nova chave (`:190`). |
| `web/evolucoes-locais.test.ts` | A | 33 | Entrada preservada após falha e publicação simulada não interpreta texto como HTML (`:5`). |
| `web/exportacao.test.ts` | A | 125 | Avisa que quem recebe não confirma nada no sistema (`:38`) e nenhum estado de entrega promete recebimento (`:46`). |
| `web/ficha-familia-diario.test.ts` | A | 67 | Família abre o Diário na própria ficha com seis seções e sem "Mais seções" (`:23`) — recorte de audiência. |
| `web/ficha-integrada.test.ts` | A | 402 | Profissional fora da página não dispara o endpoint de paciente (`:137`); família vê só o paciente vinculado (`:266`); situação e responsável só ao Administrador (`:321`, `:357`); recarga revalida a sessão antes de mostrar dados (`:120`). |
| `web/ficha-paciente.test.ts` | A | 359 | Sair de seção com alteração pendente pede confirmação e respeita a recusa (`:158`, `:176`); troca de paciente não deixa resíduo nem herda pendência (`:193`). |
| `web/ficha-plantao.test.ts` | A | 312 | Sem turno aberto a ficha não é oferecida (`:130`), o rascunho fica no servidor e nunca no navegador (`:165`) e acesso perdido limpa a tela (`:257`). |
| `web/financeiro-concessao-administracao.test.ts` | A | 132 | Lista a equipe sem revelar conteúdo financeiro (`:52`), a recusa de autoconcessão vem do servidor (`:99`) e quem não é Administrador vê a negativa sem lista nenhuma (`:122`). |
| `web/financeiro.test.ts` | A | 301 | Familiar nunca é permitido (`:221`), profissional sem concessão não libera a área (`:230`), falha da sondagem mantém a área escondida (`:249`) e sair esquece a audiência (`:261`). |
| `web/fluxo-cadastro.test.ts` | A | 202 | Pedido incerto não repete antes do reconhecimento (`:110`); 401/403 ocultam o acesso e exigem consulta ao retornar (`:139`); revalidação indisponível não restaura dados (`:185`). |
| `web/fluxo-caso-novo.test.ts` | A | 439 | Sem `administrar_concessoes` a rota da equipe não é chamada e o cadastro não pode ser enviado (`:293`); revalidar o mesmo usuário não reconsulta a equipe (`:313`); sair apaga os dados digitados (`:406`). |
| `web/google-fluxo.test.ts` | A | 174 | Cada tentativa Google é vinculada à aba (`:12`), retorno divergente não restaura sessão após recarga (`:63`) e a sessão de outra aba que trocou o cookie é recusada (`:151`). |
| `web/home-profissional.test.ts` | A | 204 | Perder o acesso entrega a tela ao tratamento de sessão em vez de desenhar erro (`:171`); uma fonte que falha derruba só o próprio bloco (`:128`); desmontar não deixa resto no DOM (`:191`). |
| `web/home-sessao-familia.test.ts` | A | 101 | Rascunho familiar sobrevive à validação do vínculo e é descartado após revogação (`:18`). |
| `web/home-sessao-troca-perfil.test.ts` | A | 87 | Perfil trocado na revalidação remonta "Seu dia" em vez de manter o caso da sessão anterior (`:28`). |
| `web/indicadores-carteira-local.test.ts` | A | 30 | Conta situações registradas e permite filtrar inclusive "não informada" (`:5`); sem filtro disponível mostra contagens sem botões (`:25`). |
| `web/integracao-anamnese.test.ts` | A | 158 | Edição não salva é protegida ao trocar de seção, fechar, sair ou recarregar (`:75`). |
| `web/integracao-edicao-paciente.test.ts` | A | 96 | Edição não é oferecida enquanto as rotas de paciente não estão disponíveis (`:14`). |
| `web/integracao-plano.test.ts` | A | 136 | Plano abre pela rota HTTP e dispatcher inativo não simula sucesso (`:15`); revogação após retorno à aba encerra o acesso e limpa o plano (`:64`). |
| `web/integracao-resumo-sessao.test.ts` | A | 87 | Trocar de profissional durante a revalidação descarta a visão do caso (`:17`). |
| `web/integracao-tarefas-disponibilidade.test.ts` | A | 119 | Começa fechado e só monta leitura com `false` do servidor (`:34`); resposta antiga não libera escrita após troca de caso ou sessão (`:75`). |
| `web/integracao-tarefas-leitura.test.ts` | A | 70 | Tarefas da carteira abrem em modo somente leitura (`:15`). |
| `web/linha-tempo-local.test.ts` | A | 59 | Ordena e distingue acontecimento, prazo e compromisso sem interpretar HTML (`:5`); inclui evoluções e identifica rascunhos (`:30`). |
| `web/lista-pacientes.test.ts` | A | 107 | Lista vazia real não inventa pacientes (`:57`); falha não mostra nomes nem dados de exemplo (`:66`); busca não declara que não existem outros (`:76`). |
| `web/login-aba-oculta.test.ts` | A | 83 | Carteira fica oculta até a revalidação e, se negada, nenhuma listagem é feita (`:19`). |
| `web/login-interno.test.ts` | A | 87 | Senha é descartada antes do envio (`:35`); o ack OTP limpa o código antes da chamada e não declara e-mail confirmado (`:58`). |
| `web/modelo-sintese.test.ts` | A | 59 | Campos FR009 compartilhados sem colidir IDs (`:6`); Diário mantém rascunho, publicação e entrada por áudio após a extração (`:23`). |
| `web/orientacoes-local.test.ts` | A | 35 | Versões e rascunho preservados quando a gravação falha (`:5`). |
| `web/orientacoes.test.ts` | A | 91 | Substituir grava a superação da anterior e a criação da nova (`:26`); a superada não é oferecida de novo (`:61`). |
| `web/paginacao-pacientes.test.ts` | A | 189 | Recuperação continua acessível quando voltar à primeira página falha (`:147`). |
| `web/paginacao-plano.test.ts` | A | 115 | Revogação remove os dados ao paginar (`:6`); não navega com rascunho aberto (`:58`); resposta tardia de paciente anterior é ignorada (`:73`). |
| `web/painel-pendencias-local.test.ts` | A | 47 | Mostra tarefas abertas por paciente e marca prazo vencido sem interpretar texto como HTML (`:5`). |
| `web/passagem-turno.test.ts` | A | 327 | Consultar não registra ciência (`:55`); sem publicação confirmada não há encerramento (`:95`); republicação incerta preserva dados, versão e chave (`:162`). |
| `web/pendencias-caso.test.ts` | A | 272 | Quem não pode acordar a periodicidade não recebe o formulário (`:130`); responsável fica escondido fora do Administrador (`:169`); envios concorrentes são impedidos (`:218`). |
| `web/plano-crise.test.ts` | A | 121 | Os dois avisos obrigatórios aparecem sempre (`:22`); aprovar usa a versão lida e explica a recusa de quem não tem habilitação (`:37`). |
| `web/plano-cuidado.test.ts` | A | 629 | Revogação remove os dados (`:94`, `:286`); resultado de criação de outro paciente não é reconhecido (`:200`); barreira falhada mantém criação bloqueada após recarga sem persistir rascunho (`:321`); família consulta objetivo público sem acessar catálogo administrativo (`:599`). |
| `web/realizacao-compromisso.test.ts` | A | 197 | Exige motivo na falta e destino na remarcação antes de enviar (`:82`); conflito de versão e recusa de permissão não perdem o preenchido (`:161`). |
| `web/regras-sessao-familia.test.ts` | A | 56 | Família com "Como funciona" aberto não perde a tela ao revalidar sem troca de sessão (`:21`). |
| `web/relacoes-locais.test.ts` | A | 100 | Só guarda após persistência e preserva rascunho na falha (`:6`); descarte recusado mantém o rascunho (`:44`). |
| `web/relato-textual.test.ts` | A | 62 | Campos obrigatórios validados e conteúdo fictício revisado como texto, sem envio (`:6`). |
| `web/resumo-caso-local.test.ts` | A | 139 | Apresenta como texto e distingue "informação insuficiente" de valor residual (`:5`, `:29`); lista vazia não se confunde com dados não carregados (`:101`). |
| `web/revalidacao-cadastro.test.ts` | A | 112 | Retornar à aba durante cadastro em andamento revalida o acesso (`:18`). |
| `web/revalidacao-diario-familiar.test.ts` | A | 74 | Rascunho familiar é descartado quando o perfil muda durante a revalidação (`:18`). |
| `web/revalidacao-leitura-familiar.test.ts` | A | 92 | Leitura familiar é removida ao ocultar a aba e a audiência atual é consultada no retorno (`:19`). |
| `web/revogacao-vinculo.test.ts` | A | 62 | Revogar exige confirmação, envia a versão e reconsulta após resposta incerta sem repetir (`:6`); após atualização exige nova seleção (`:38`). |
| `web/saida-renovacao.test.ts` | A | 40 | Falha de rede permite repetir a saída sem afirmar revogação (`:18`). |
| `web/saude.test.ts` | A | 79 | Escrita com resposta perdida é confirmada e o novo comando não duplica versão (`:13`). |
| `web/segredos-integracoes-navegacao.test.ts` | A | 112 | Navegar até credenciais desmonta o valor digitado e relê só metadados (`:62`); rota forçada do profissional não monta credenciais nem consulta metadados administrativos (`:103`). |
| `web/segredos-integracoes.test.ts` | A | 158 | Envia uma vez e limpa o campo imediatamente (`:5`); resposta incerta bloqueia recarga e novas escritas até conferir metadados (`:59`). |
| `web/selecao-profissional.test.ts` | A | 508 | Identificador não é exposto para profissional fora da página consultada (`:47`); concessão revogada não é oferecida (`:71`); envio sem resposta bloqueia nova tentativa (`:99`); erro de autorização é encaminhado (`:406`). |
| `web/tarefas-cuidado.test.ts` | A | 156 | Escrita fica bloqueada até reconhecer resultado pendente de outra sessão (`:30`) e o reconhecimento não se repete (`:72`). |
| `web/transcricao-audio.test.ts` | A | 331 | Sair do caso encerra a gravação sem enviar o áudio (`:98`, `:120`); original pendente só libera nova gravação após regularizar o descarte (`:139`); transcrição automática não é revisão concluída (`:234`). |
| `web/turno-execucao-abertura.test.ts` | A | 123 | Permissão de localização pendente não impede abertura confirmada (`:69`); consentimento sem resposta não impede encerramento com passagem confirmada (`:100`). |
| `web/turno-execucao-gestao.test.ts` | A | 61 | Sem capacidade de gestão não consulta familiares nem oferece concessão (`:6`); case manager autorizado escolhe por nome, sem digitar identificador (`:28`). |
| `web/turno-execucao-localizacao.test.ts` | A | 91 | Sem consentimento ou com revogação não solicita coordenadas (`:17`); callback tardio não muda a declaração de ausência (`:41`). |
| `web/turno-execucao-relatorios.test.ts` | A | 126 | Família não recebe exportação de caso nem localização (`:16`); fundamento revogado limpa o relatório na negativa de acesso (`:77`). |
| `web/turno-execucao.test.ts` | A | 326 | Resposta perdida exige reconciliação (`:92`); reload preserva barreira durável de outro caso e só o reconhecimento explícito libera (`:123`); revogação na consulta limpa o conteúdo sem confundir falha com vazio (`:250`). |
| `web/turno-proprio.test.ts` | A | 236 | Perda de acesso limpa a seção e chama o descarte da ficha (`:114`); resultado confirmado não é reconhecido antes de consulta real (`:122`); pendência de outro caso não consulta conteúdo (`:133`). |
| `web/validacao-cadastro.test.ts` | A | 87 | Erros de preferência e nascimento são identificados e limpos sem enviar o cadastro (`:17`). |
| `web/visao-caso.test.ts` | A | 392 | Bloco que o perfil não lê não mostra título nem contagem (`:203`); perda de acesso remove o conteúdo e aciona nova entrada (`:234`); leitura negada da situação limpa o bloco (`:376`). |

### Categoria B — estrutura

| Arquivo | Cat. | Linhas | O que garante |
|---|:--:|---:|---|
| `web/ui/controles.test.ts` | B | 43 | Que `aplicarControlesProprios` observa a raiz com `MutationObserver` e marca `<select>`/`input[type=date]` nativos com `aria-hidden` (`:20`, `:28`, `:37`). |
| `web/ui/data.test.ts` | B | 107 | Que o calendário próprio existe como `.ui-data__calendario` e responde a teclado e Esc (`:78`, `:93`, `:98`). |
| `web/ui/dialogo.test.ts` | B | 82 | Que o diálogo existe como `.ui-dialogo` no documento, prende foco e some ao fechar (`:36`, `:60`, `:81`), e que a medida pedida vai para o elemento que a folha de estilo lê (`:65`). |
| `web/ui/selecao.test.ts` | B | 92 | Que a lista própria é `.ui-selecao__lista` e que o `<select>` nativo continua dono do valor fora da ordem de tabulação (`:38`, `:71`). |
| `web/avisos.test.ts` | B | 147 | Conta elementos `.avisos-item` e localiza o botão por `.avisos-item-lido` (`:62`, `:83`, `:118`, `:131`). |
| `web/esqueleto.test.ts` | B | 16 | Que `iniciarAcao` injeta exatamente um `.loading-indicator` dentro do botão (`:12`). |
| `web/gaveta-lateral.test.ts` | B | 216 | Estado da gaveta por classe: `gaveta.classList.contains('open')` e `body.classList.contains('sidebar-open'/'sidebar-collapsed')` (`:53`–`:126`, `:181`, `:208`). |
| `web/substituicao-case-manager.test.ts` | B | 285 | 22 alcances por classe `.substituicao-cm__*` para ler estado, vazio, aviso, motivo e encerramento (`:73`–`:282`). |

### Categoria C — agnóstico

| Arquivo | Cat. | Linhas | O que garante |
|---|:--:|---:|---|
| `web/anexos-exportacao.test.ts` | C | 246 | Montagem do ZIP: bytes íntegros, anexo falho vira indisponível com motivo, teto de fatia e de pacote, desduplicação e revogação durante a montagem (`:62`–`:220`). |
| `web/api.test.ts` | C | 512 | Cliente HTTP e barreira: sessão só por cookie same-origin (`:89`), recusa de troca de cookie entre entrada técnica e confirmação (`:146`), revalidação exigida para sessão inválida e permissão revogada (`:423`). |
| `web/cadastro.test.ts` | C | 124 | Contrato de caso novo: trim, limites de nome, data inexistente/futura, 1 a 10 contatos, situação fora da lista (`:32`–`:120`). |
| `web/ciclo-acesso.test.ts` | C | 129 | Nova concessão fica bloqueada após recarga e resposta incerta até reconciliar (`:4`); revogação bloqueia até encerramento e reconhecimento (`:69`). |
| `web/ciclo-cadastro.test.ts` | C | 168 | Cerca a época antes de criar (`:14`), resposta perdida não libera (`:51`) e troca de identidade invalida o ciclo (`:120`, `:150`). |
| `web/ciclo-concessao-equipe.test.ts` | C | 34 | Falha de transporte recusa nova criação até cercar e consultar de novo (`:13`). |
| `web/ciclo-plano.test.ts` | C | 52 | Reserva vinculada ao paciente e bloqueio mantido após resposta perdida, inclusive em novo ciclo (`:16`). |
| `web/ciclo-tarefa-cuidado.test.ts` | C | 73 | Após resposta perdida e recarga exige cerca, reconhecimento e consulta antes de nova escrita (`:4`). |
| `web/pacote-exportacao.test.ts` | C | 124 | CRC32 conforme referência (`:51`), nome de anexo não escapa da pasta (`:56`), conteúdo escapado no resumo (`:63`) e ZIP que o descompactador do sistema abre (`:85`). |
| `web/prova-sessao.test.ts` | C | 81 | Recusa antiga não apaga login posterior (`:37`). |
| `web/servico-acessos-http.test.ts` | C | 80 | Sessão interna não envia metadados com senha (`:13`); OTP não envia cookie nem senha e só aceita resposta genérica (`:32`). |
| `web/servico-conversao-diario-http.test.ts` | C | 124 | Uma única escrita atômica com reserva/chave e sem origem clínica (`:46`); recibo de outro caso é rejeitado (`:75`). |
| `web/servico-plano-http.test.ts` | C | 102 | Consulta vinculada à sessão rejeita resposta tardia após troca de identidade (`:8`); cursor e limite em cada página (`:37`). |
| `web/servico-segredos-integracoes-http.test.ts` | C | 99 | Metadados acima do teto são recusados e a leitura é cancelada (`:20`); escrita inválida vira pendência sem devolver valor (`:60`). |
| `web/servico-tarefas-disponibilidade.test.ts` | C | 74 | Capability de identidade antiga é descartada (`:43`); acesso negado continua erro, sem capability positiva inventada (`:66`). |
| `web/servico-tarefas-reserva.test.ts` | C | 42 | Reserva e geração são enviadas na criação e na atualização (`:5`). |
| `web/servico-turno-execucao-http.test.ts` | C | 111 | Troca de ator descarta resposta tardia e nenhuma chamada nova usa a sessão anterior (`:40`); relatório com coordenada fora do DTO público é rejeitado inteiro (`:84`). |
| `web/servico-turno-http.test.ts` | C | 200 | 503 válido não vira lista vazia (`:57`); troca de identidade descarta conteúdo (`:84`); 202 não confirma persistência (`:131`). |
| `web/sessao-abas.test.ts` | C | 48 | Outra aba com login recusado não impede a saída da sessão original (`:6`). |
| `web/textos-obrigatorios-nao-configuraveis.test.ts` | C | 96 | Lê o código-fonte e exige que ressalva clínica, aviso de audiência e texto de consentimento sejam literais, nunca configuração (`:76`, `:83`). |

> Nota sobre `web/acompanhamento-caso.test.ts` e `web/consolidado-ficha-plantao.test.ts`: ambos
> estão contados em **A**. O primeiro não toca `document` mas afirma o texto apresentado ao usuário
> ("descreve o responsável sem afirmar atividade que o servidor não confirmou", `:52`); o segundo
> monta uma seção jsdom e afirma `textContent` (`:133`–`:166`), com um único alcance estrutural em
> `:156` (`:scope > article`) que vira troca de seletor.

## 3. Rede de segurança da migração

Estes são os testes de categoria A que cobrem **autorização, barreira de gravação, guarda de
alteração pendente ou revalidação de acesso**. Devem estar verdes a cada módulo migrado — não ao
final da migração. Se um deles ficar vermelho, a migração parou, não o teste.

### Sessão, login e saída
- `web/api.test.ts:13,64,89,146,423` — as quatro rotas de barreira, falha fechada, sessão só por
  cookie same-origin, recusa de troca de cookie, revalidação por sessão inválida **e** por permissão
  revogada.
- `web/acesso.test.ts:214` — recusa de permissão numa seção não derruba a sessão inteira.
- `web/prova-sessao.test.ts:37` e `web/sessao-abas.test.ts:6` — recusa antiga não apaga login
  posterior; aba com login recusado não impede a saída da original.
- `web/google-fluxo.test.ts:23,63,151` — retorno de outra tentativa, retorno divergente após recarga
  e cookie substituído por outra aba.
- `web/login-aba-oculta.test.ts:19` — carteira oculta até a revalidação; negada, nenhuma listagem.
- `web/login-interno.test.ts:35,58` — senha descartada antes do envio; OTP não declara e-mail confirmado.
- `web/callback-erro.test.ts:19` e `web/saida-renovacao.test.ts:18` — retorno não autorizado e
  repetição de saída sem afirmar revogação.
- `web/casca-offline.test.ts:310,373,405` — armazenamento sem resposta autenticada, revogação não
  contornada pelo aparelho, segunda pessoa não encontra a sessão anterior.

### Cadastro de caso novo (barreira + guarda de pendência)
- `web/fluxo-caso-novo.test.ts:293,313,406` — sem `administrar_concessoes` a rota da equipe não é
  chamada; revalidar o mesmo usuário não reconsulta; sair apaga o digitado.
- `web/fluxo-cadastro.test.ts:110,139,185` — pedido incerto não repete; 401/403 ocultam e exigem
  consulta; revalidação indisponível não restaura dados.
- `web/aviso-saida-cadastro.test.ts:113` — aviso antes de sair com cadastro sem confirmação, sem
  persistir dados pessoais no navegador.
- `web/revalidacao-cadastro.test.ts:18` — revalidação ao retornar à aba.
- `web/ciclo-tela.test.ts:31,91` — confirmação para liberar; revogação remove dados protegidos.
- `web/ciclo-cadastro.test.ts:120,150` — troca de identidade invalida o ciclo.
- `web/campos-caso-novo.test.ts:303` — `cancelarCarga` invalida a equipe carregada, como no fim de sessão.

### Ficha do paciente e visão do caso
- `web/ficha-integrada.test.ts:120,137,266,321,357` — revalidação antes de mostrar dados; profissional
  fora da página não dispara o endpoint; família só vê o vinculado; situação/responsável só ao Administrador.
- `web/ficha-paciente.test.ts:158,176,193` — guarda de alteração pendente ao trocar de seção e ao
  voltar; troca de paciente não herda pendência.
- `web/visao-caso.test.ts:203,234,376` — bloco não lido pelo perfil não aparece; perda de acesso
  remove conteúdo e aciona nova entrada; leitura negada limpa o bloco.
- `web/integracao-resumo-sessao.test.ts:17` e `web/home-sessao-troca-perfil.test.ts:28` — troca de
  profissional/perfil durante a revalidação descarta a tela anterior.

### Edição de paciente
- `web/editar-paciente.test.ts:19,148,181,217` — reconciliação após recarga; resultado de outro
  paciente não reconhecido; falha da consulta de conferência impede reconhecer; reserva em outra aba
  exige confirmação.
- `web/integracao-edicao-paciente.test.ts:14` — edição não é oferecida sem as rotas disponíveis.
- `web/contatos-paciente.test.ts:30,41,59` — reserva aberta e conferência do contato correspondente.

### Plano de cuidado e plano de crise
- `web/plano-cuidado.test.ts:94,200,286,321,599` — revogação remove dados; criação de outro paciente
  não é reconhecida; barreira falhada mantém bloqueio após recarga; família não acessa o catálogo
  administrativo.
- `web/ciclo-plano.test.ts:16` e `web/paginacao-plano.test.ts:6,58` — reserva vinculada ao paciente;
  revogação ao paginar; não navega com rascunho aberto.
- `web/integracao-plano.test.ts:64` — revogação após retorno à aba encerra o acesso.
- `web/plano-crise.test.ts:37` e `web/campo-extra-plano-administracao.test.ts:59` — recusa de quem
  não tem habilitação; falha de autorização limpa conteúdo administrativo.
- `web/contexto-objetivos-paginados.test.ts:139` — perda de acesso encerra o editor sem preservar
  escolhas de outro acesso.

### Diário, relato e conversão
- `web/diario.test.ts:68,106,346` — audiência do relato familiar; família não vê "Responder";
  reconsulta negada encerra o acesso.
- `web/diario-conversao-elegibilidade.test.ts:62` — família nunca recebe conversão, nem com a porta
  fornecida por engano.
- `web/conversao-diario.test.ts:252,301,321` — troca de conta descarta resposta tardia; recarga cerca
  a reserva; formulário sujo exige confirmação.
- `web/revalidacao-diario-familiar.test.ts:18` e `web/revalidacao-leitura-familiar.test.ts:19` —
  perfil mudado na revalidação descarta rascunho; aba oculta remove leitura e reconsulta audiência.
- `web/transcricao-audio.test.ts:98,120,139` — sair do caso não envia áudio; descarte pendente bloqueia
  nova gravação.

### Turno, plantão e passagem
- `web/turno-execucao.test.ts:92,123,250` — reconciliação obrigatória; barreira durável sobrevive ao
  reload; revogação limpa o conteúdo.
- `web/turno-proprio.test.ts:114,122,133` — perda de acesso limpa a seção; confirmação exige consulta
  real; pendência de outro caso não consulta conteúdo.
- `web/turno-execucao-gestao.test.ts:6` — sem capacidade de gestão não consulta familiares.
- `web/turno-execucao-localizacao.test.ts:17` — sem consentimento ou com revogação não pede coordenadas.
- `web/turno-execucao-relatorios.test.ts:16,77` — família sem exportação de caso nem localização;
  fundamento revogado limpa o relatório.
- `web/passagem-turno.test.ts:55,95,162` — consultar não registra ciência; sem publicação confirmada
  não há encerramento; republicação incerta preserva chave.
- `web/ficha-plantao.test.ts:130,165,257` — sem turno aberto a ficha não é oferecida; rascunho no
  servidor; acesso perdido limpa a tela.
- `web/escala-turno.test.ts:119,190` — recusa definitiva exige consulta; criação incerta não libera nova chave.
- `web/ciclo-tarefa-cuidado.test.ts:4` e `web/tarefas-cuidado.test.ts:30,72` — escrita bloqueada até
  reconhecer resultado pendente de outra sessão.
- `web/integracao-tarefas-disponibilidade.test.ts:34,75` — só `true` do mesmo caso e sessão habilita
  escrita; resposta antiga não libera.
- `web/integracao-tarefas-leitura.test.ts:15` — tarefas da carteira em somente leitura.

### Concessões, acessos e equipe
- `web/acessos-administracao.test.ts:62,154,163` — senha limpa antes da chamada; lista indisponível
  não aceita cadastro; só libera após consulta autorizada.
- `web/concessao-equipe.test.ts:13,53` e `web/ciclo-concessao-equipe.test.ts:13` — resultado
  confirmado recuperado antes de nova solicitação; resultado não identificado não é reconhecido.
- `web/selecao-profissional.test.ts:47,71,99,406` — identificador não exposto fora da página;
  concessão revogada não oferecida; envio sem resposta bloqueia; erro de autorização encaminhado.
- `web/revogacao-vinculo.test.ts:6,38` — confirmação, versão e reconsulta após resposta incerta.
- `web/ciclo-acesso.test.ts:4,69` — concessão e revogação bloqueadas até reconciliar.
- `web/financeiro-concessao-administracao.test.ts:99,122` — recusa de autoconcessão vem do servidor;
  não-Administrador vê a negativa sem lista.
- `web/acompanhamento-caso.test.ts:13,46` — só concessão vinculada a usuário; paginação incompleta é
  recusada em vez de virar lista parcial.

### Área financeira (audiência)
- `web/financeiro.test.ts:221,230,239,249,261` — familiar nunca é permitido; profissional sem
  concessão não libera; concessão vale só para a própria sessão; falha da sondagem mantém escondido;
  sair esquece a audiência.

### Família
- `web/home-sessao-familia.test.ts:18` — rascunho familiar descartado após revogação.
- `web/regras-sessao-familia.test.ts:21` — revalidação sem troca de sessão não derruba a tela.
- `web/ficha-familia-diario.test.ts:23` — recorte de seções da ficha familiar.

### Documentos, anexos e exportação
- `web/documentos-caso-edicao.test.ts:79,106` — família não recebe edição de metadados; negativa
  descarta acesso e dados.
- `web/documentos-download.test.ts:54,126` — troca de identidade descarta bytes; capacidade temporária
  revogada na desmontagem.
- `web/anexos-exportacao.test.ts:158` — revogação durante a montagem não entrega bytes.

### Segredos e integrações
- `web/segredos-integracoes-navegacao.test.ts:103` — rota forçada do profissional não monta
  credenciais nem consulta metadados administrativos.
- `web/segredos-integracoes.test.ts:59,110` — resposta incerta bloqueia recarga e novas escritas até
  conferir metadados.

### Pendências e agenda
- `web/pendencias-caso.test.ts:130,169` — quem não pode acordar periodicidade não recebe o formulário;
  responsável escondido fora do Administrador.
- `web/agenda-operacoes-isolamento.test.ts:10,56` — reconciliação de outra conta não apaga envio
  incerto; marcador sem autor continua bloqueado.
- `web/realizacao-compromisso.test.ts:161` — recusa de permissão não perde o preenchido.

### Demonstração
- `web/demonstracao.test.ts:192,667,899,950` — página oculta fora de localhost; sessão expirada oculta
  dados preservando rascunho; repetição bloqueada após resposta perdida; reconciliação sem guardar
  texto no navegador.

## 4. Reescrita necessária

Oito arquivos, 988 linhas (4,9% da suíte). Nenhum some: cada um é substituído por um teste que
afirma o comportamento no lugar da forma.

| Arquivo | Hoje afirma | O teste reescrito deve afirmar |
|---|---|---|
| `web/ui/dialogo.test.ts` | `document.querySelector('.ui-dialogo')` existe/some (`:36`, `:60`, `:81`) e a medida vai para o elemento que o CSS lê (`:65`). | Que, com o diálogo aberto, existe um elemento com `role="dialog"` acessível pelo nome que o abriu, que o foco está dentro dele e não escapa por Tab, e que ao fechar o foco volta a quem o abriu — sem nomear classe nem nó. |
| `web/ui/selecao.test.ts` | A lista própria é `.ui-selecao__lista` (`:71`). | Que o controle expõe `role="combobox"`/`listbox` com o valor escolhido refletido no campo que o formulário envia, que o teclado escolhe e avisa quem escuta, e que Esc fecha sem mudar o valor nem alcançar o diálogo em volta. |
| `web/ui/data.test.ts` | O calendário é `.ui-data__calendario` com `hidden` (`:78`, `:93`, `:98`). | Que digitar `dd/mm/aaaa` grava a data em ISO no campo enviado, que data impossível não escolhe data nenhuma, que o calendário é alcançável e navegável por teclado e que Esc o fecha sem fechar o diálogo em volta. |
| `web/ui/controles.test.ts` | Que um `MutationObserver` aprimora `<select>` e `input[type=date]` que chegam depois da consulta (`:20`, `:28`, `:37`). | Em React não existe o aprimoramento tardio: o teste vira "um campo de seleção e um campo de data renderizados após a consulta chegam já com o controle próprio, acessível por `role`, e o campo nativo não fica duplicado na árvore de acessibilidade". |
| `web/esqueleto.test.ts` | `iniciarAcao` injeta exatamente um `.loading-indicator` no botão (`:12`). | Que, com duas operações sobrepostas, o botão continua anunciando `aria-busy="true"` até a última terminar, e então volta ao rótulo original — a contagem de indicadores é detalhe. |
| `web/gaveta-lateral.test.ts` | Estado por `classList`: `open`, `sidebar-open`, `sidebar-collapsed` (`:53`–`:126`, `:181`, `:208`). | Que a gaveta é alcançável e anuncia-se aberta/fechada por `aria-expanded`/`aria-hidden`, que Escape e a navegação a fecham, que o estado recolhido persiste na carga seguinte, e — já coberto em `:130` — que cancelar o descarte mantém ficha, rascunho e gaveta. Preservar `:130` como caso de guarda de pendência. |
| `web/avisos.test.ts` | Conta `.avisos-item` e alcança o botão por `.avisos-item-lido` (`:62`, `:83`, `:118`, `:131`). | Que os quatro estados (carregando, vazio, erro, com dados) são distinguíveis pelo texto anunciado, que a origem do aviso aparece e o teor nunca, que "lido" e "ciência" são ações separadas e que nada sai do aplicativo nem registra token (`:135` já é comportamento e permanece). |
| `web/substituicao-case-manager.test.ts` | 22 alcances por `.substituicao-cm__*` para estado, vazio, aviso, motivo e encerramento (`:73`–`:282`). | Que a seção mostra carregamento (`aria-busy`), depois vazio **sem esconder o formulário**, que titular/substituto/prazo aparecem em texto, que período sobreposto é explicado em vez de erro genérico, que registrar e encerrar exigem motivo, e que com a fatia desligada a indisponibilidade é honesta — tudo por texto visível e `role`. |

### Pontos de troca de seletor dentro de testes que permanecem em A

Estes **não** são reescrita: são um seletor a trocar, mantendo a asserção.

- `web/ficha-integrada.test.ts:128,230,253,298,378,383,396` — `.ficha-mais`, `.ficha-aba-secundaria`,
  `.turno-proprio`, `.pessoa-situacao`.
- `web/ficha-paciente.test.ts:118,245,266,284` — `.ficha-secao`, `.ficha-mais`.
- `web/ficha-familia-diario.test.ts:63` — `.ficha-mais`.
- `web/financeiro.test.ts:65,71,85,86,284,285` — `.list-loading`, `.financeiro__vazio`,
  `.financeiro__linha`, `.financeiro__aba`, `.financeiro__campo`.
- `web/pendencias-caso.test.ts:97,98,143,155,156,173,241` — `.pendencia-atribuir select`,
  `.pendencia-acordo form`, `details.filtros-carteira-painel`.
- `web/home-profissional.test.ts:50,59,77,93,94,95,98,143,148,149` — `.home-saudacao`, `.home-caso`,
  `.home-sereno`, `.home-apoio`, `.home-falha`.
- `web/concessao-equipe.test.ts:104,109,114,128` — `.lista-registros` com
  `firstElementChild`/`lastElementChild`; trocar por "a linha do convite pendente diz 'Convite pendente'".
- `web/turno-execucao.test.ts:108,120` — `.turno-execucao__editor`.
- `web/editar-paciente.test.ts:290,446` — `.caso-resumo`, `.caso-resumo ol li`.
- `web/encaminhamentos.test.ts:50` — `raiz.childNodes` com comprimento zero; trocar por "a seção não
  apresenta nenhum encaminhamento".
- `web/fluxo-caso-novo.test.ts:367,419` — `#contacts-list .contact-row`.
- `web/consolidado-ficha-plantao.test.ts:156` — `:scope > article`.
- `web/avisos.test.ts` e demais já listados na tabela acima.

### Acoplamento a `web/index.html` e `web/main.js`

Trinta arquivos de teste carregam `document.documentElement.innerHTML = readFileSync('web/index.html')`
e importam `./main.js`, alcançando elementos por `getElementById` (`login-fields`, `patients-view`,
`create-feedback`, `create-submit`, `list-status`, `logout`…). Isso **não** os torna categoria B — o
que afirmam é comportamento (revalidação, bloqueio de reenvio, foco, contagem de chamadas). Mas é o
maior ponto único de atrito da migração: o shell React precisa manter esses identificadores, ou os
trinta arquivos trocam de ponto de montagem na mesma leva. Lista:
`acesso`, `atualizar-lista-foco`, `aviso-saida-cadastro`, `callback-erro`, `campos-caso-novo`,
`ciclo-tela`, `ficha-familia-diario`, `ficha-integrada`, `fluxo-cadastro`, `fluxo-caso-novo`,
`gaveta-lateral`, `google-fluxo`, `home-sessao-familia`, `home-sessao-troca-perfil`,
`integracao-anamnese`, `integracao-edicao-paciente`, `integracao-plano`, `integracao-resumo-sessao`,
`integracao-tarefas-leitura`, `lista-pacientes`, `login-aba-oculta`, `login-interno`,
`paginacao-pacientes`, `regras-sessao-familia`, `revalidacao-cadastro`, `revalidacao-diario-familiar`,
`revalidacao-leitura-familiar`, `saida-renovacao`, `segredos-integracoes-navegacao`, `validacao-cadastro`.

## 5. Lacunas — onde a migração não tem rede

Este é o achado mais caro do inventário. `web/` tem **137 módulos de produção** (`web/*.ts` +
`web/ui/*.ts`, sem testes). Os módulos abaixo **não são importados por nenhum arquivo de teste**, nem
diretamente nem por meio de um módulo testado. Migrá-los é migrar sem rede: nenhum teste ficará
vermelho se o comportamento regredir.

### 5.1 Telas de administração sem teste nenhum

| Módulo | Por que importa |
|---|---|
| `web/auditoria.ts` | Superfície de auditoria. Sem teste de audiência: nada impede que a migração exponha registro de auditoria a quem não deve ler. Não há sequer prova de que a tela filtra por perfil. |
| `web/preautorizacoes-familiares.ts` | Pré-autorização de familiar é concessão de acesso a dado clínico. É a lacuna mais grave da lista: concessão sem um único teste positivo ou negativo de autorização na interface. |
| `web/solicitacoes-titular.ts` | Solicitação do titular toca direito sobre dado pessoal. Sem teste de quem pode abrir, ver e responder. |
| `web/regras-atendimento.ts` | Regras do Atendimento — o padrão que o `AGENTS.md` manda preservar. Nenhum teste prova que a tela as apresenta ou que respeita quem pode editá-las. |
| `web/secao-dados-familiar.ts` | Seção de dados exibida à família. Recorte de audiência sem prova. Contraste: `diario.test.ts` e `ficha-familia-diario.test.ts` provam a audiência do Diário familiar; esta seção não tem equivalente. |
| `web/estado-emocional-administracao.ts` | Catálogo administrado de estado emocional — conteúdo clínico-adjacente, sem teste de quem administra. |
| `web/papel-declarado-administracao.ts` | Catálogo de papel declarado, usado em `ficha-plantao` e `consolidado-ficha-plantao`; os consumidores têm teste, o administrador não. |
| `web/modelo-ficha-plantao-administracao.ts` | Modelo da ficha de plantão. Mudar o modelo muda o que é publicado em FR-080; sem teste de autorização nem de efeito. |
| `web/painel-cadastro.ts` | Não é importado por nenhum módulo nem por nenhum teste — possível código morto. **Conferir antes de migrar**; se estiver morto, apagar é mais barato que portar. |
| `web/linha-tempo.ts` | Linha do tempo servida por HTTP. Só `linha-tempo-local.ts` tem teste (`linha-tempo-local.test.ts`); a versão conectada não. |

### 5.2 Serviços HTTP sem teste próprio

Vinte serviços `servico-*-http.ts` não têm arquivo de teste: `servico-auditoria-http`,
`servico-avisos-http`, `servico-catalogo-administrado-http`, `servico-configuracao-sistema-http`,
`servico-diario-http`, `servico-documento-paciente-http`, `servico-edicao-paciente-http`,
`servico-encaminhamentos-http`, `servico-exportacao-http`, `servico-ficha-plantao-http`,
`servico-habilitacao-plano-crise-http`, `servico-linha-tempo-http`, `servico-orientacoes-http`,
`servico-pendencias-http`, `servico-plano-crise-http`, `servico-preautorizacoes-http`,
`servico-regras-atendimento-http`, `servico-solicitacao-titular-http`, `servico-substituicao-cm-http`,
`servico-transcricao-http`.

Isso é menos grave para a migração — serviço HTTP é categoria C e não é tocado por React. Mas os oito
serviços que **têm** teste (`servico-turno-http`, `servico-turno-execucao-http`, `servico-plano-http`,
`servico-conversao-diario-http`, `servico-segredos-integracoes-http`, `servico-acessos-http`,
`servico-tarefas-disponibilidade`, `servico-tarefas-reserva`) são exatamente os que provam
descarte de resposta tardia após troca de identidade. Os vinte acima não provam isso para ninguém:
`servico-diario-http` e `servico-documento-paciente-http` carregam conteúdo clínico e não têm prova de
que uma resposta tardia de outra sessão é descartada.

### 5.3 Peças do turno cobertas só de raspão

`turno-execucao-arquivos.ts`, `turno-execucao-campos.ts`, `turno-execucao-conversao.ts`,
`turno-execucao-integracao.ts` e `turno-execucao-localizacao-coordenacao.ts` não têm teste próprio;
são exercitadas indiretamente por `turno-execucao.test.ts`, `turno-execucao-relatorios.test.ts` e
`ficha-plantao.test.ts`. `turno-execucao-integracao.ts` só é importado por `main.ts` e, portanto, não
é exercitado por nenhum teste de módulo — é o ponto de montagem do turno na ficha, e migrá-lo não
quebra nada automaticamente.

### 5.4 Comportamentos sensíveis sem teste de categoria A

Independente de módulo, estes comportamentos não aparecem em nenhuma asserção que eu tenha encontrado:

1. **Guarda de alteração pendente fora da ficha e do cadastro.** `ficha-paciente.test.ts:158,176`,
   `integracao-anamnese.test.ts:75` e `aviso-saida-cadastro.test.ts:113` cobrem ficha, anamnese e
   cadastro. Agenda (`agenda-individual.ts`, `agenda-operacoes.ts`), auditoria e as telas de
   administração não têm nenhuma prova de que uma edição não salva é protegida ao sair.
2. **Audiência da seção de dados familiar.** Ver 5.1 — é o único recorte familiar sem prova negativa.
3. **Pré-autorização familiar, ponta a ponta.** Não há teste que prove que um familiar
   pré-autorizado vê exatamente o que a pré-autorização concede, nem que revogá-la remove o acesso. Os
   testes de revogação existentes (`revogacao-vinculo.test.ts`, `ciclo-acesso.test.ts`) cobrem vínculo
   e concessão de equipe, não pré-autorização.
4. **Reescrita do estado da gaveta.** Hoje a única prova de navegação móvel é `gaveta-lateral.test.ts`,
   categoria B. Enquanto a reescrita da seção 4 não acontecer, a migração do shell não tem rede
   nenhuma para navegação no celular — e `AGENTS.md` exige que a aplicação funcione confortavelmente
   no celular.
5. **Foco e teclado fora de `ficha-paciente`, `confirmacao`, `ui/*` e `acesso`.** As provas de foco
   visível, retorno de foco e navegação por teclado estão concentradas nesses arquivos. Como quatro
   dos cinco (`ui/dialogo`, `ui/selecao`, `ui/data`, `ui/controles`) estão em B, a migração dos
   componentes de formulário acontece com a rede de acessibilidade justamente desligada. **Reescrever
   os quatro antes de migrar qualquer formulário**, não depois.
6. **`web/main.ts` só é exercitado por integração.** Não há teste unitário do roteamento/montagem;
   toda a prova vem dos trinta arquivos que carregam `index.html`. Se o shell React trocar os
   identificadores do HTML, esses trinta ficam vermelhos de uma vez e deixa de ser possível distinguir
   "seletor mudou" de "comportamento regrediu". Migrar o shell em uma fatia isolada, com os seletores
   atualizados no mesmo commit.

### 5.5 Recomendação de ordem

1. Reescrever `ui/dialogo`, `ui/selecao`, `ui/data`, `ui/controles` **antes** de migrar formulários.
2. Reescrever `gaveta-lateral` **antes** de migrar o shell.
3. Escrever teste de autorização para `preautorizacoes-familiares.ts`, `secao-dados-familiar.ts`,
   `auditoria.ts` e `solicitacoes-titular.ts` **antes** de migrá-los — não depois, e não como parte da
   migração deles.
4. Conferir se `painel-cadastro.ts` está morto antes de portá-lo.
5. Os 91 arquivos de categoria A são a condição de parada: a cada módulo migrado, os de A que tocam
   aquele módulo rodam e ficam verdes. Um vermelho é a migração, não o teste.

---

### Nota de fechamento

Contagem feita em 25/11/2026 sobre os 119 arquivos que `find web -name '*.test.ts'` retornava
naquele momento. Durante a redação deste inventário apareceu no diretório de trabalho um 120º
arquivo não versionado, `web/contrato-visual.test.ts` (139 linhas), escrito para VIS-017 desta mesma
mudança: lê `web/styles.css` e afirma que cada cor é um token do `:root` com contraste verificado.
Ele é **categoria C** — não toca `document` e não depende de como o DOM é construído —, mas depende
do caminho `web/styles.css`, que a migração vai mover. Fora do escopo das contagens acima.

`web/textos-obrigatorios-nao-configuraveis.test.ts` tem a mesma dependência e merece a mesma
atenção: é C, mas carrega uma lista de caminhos (`web/plano-crise.ts`, `web/turno-execucao-editor.ts`
e outros) que precisa ser atualizada no mesmo commit em que cada módulo se mover, ou ele passa a
provar a presença de um literal num arquivo que já não é o que roda.

