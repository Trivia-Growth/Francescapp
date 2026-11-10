# Design

## Context

Ver proposal.md para motivação e escopo. Estado observado em 08/11/2026:

- A interface é TypeScript sem framework. `web/main.ts` (cerca de 1.000 linhas) abre cada função em um painel próprio e usa uma trava única (`atendimentoJaAberto`) para impedir dois painéis ao mesmo tempo. Cada painel é um módulo `montar*(raiz, pacienteId, serviço, acessoPerdido, pendente)` que devolve a função de desmontagem; barreiras de gravação, guarda de alteração pendente e revalidação de acesso vivem nesses módulos.
- `web/styles.css` declara Cormorant Garamond e Raleway, mas não há `@font-face`: a prévia renderiza Georgia e Arial. Os arquivos das fontes e suas licenças OFL existem em `assets/fonts/` e no arquivo do mock.
- A lista devolve nome, preferência e versão, com cursor. Nome, preferência e nascimento são cifrados no banco, então o servidor não filtra por nome.
- O resumo conectado (objetivos e tarefas) só é montado para o perfil profissional; plano, anamnese, edição, contato e equipe com acesso seguem as regras atuais do código. A autorização real é do servidor e do banco.
- Relações de pessoas têm tabelas e contrato de rotas, sem handler. Não há situação do caso nem case manager no modelo.

## Goals / Non-Goals

**Goals:**

- Trocar a tabela de botões por lista de pessoas e ficha com seções, usando o mock como base, sem reescrever os módulos de painel existentes.
- Manter intactas barreiras, guarda de alteração pendente e revalidação de acesso, que são controles de segurança já provados.
- Deixar a entrega 2 desenhada o bastante para a ficha já ter o lugar de situação, case manager e rede de cuidado.

**Non-Goals:**

- Busca global por nome (exige índice cego, decisão de segurança própria), novo framework, rota de servidor para a visão do caso, "Meu dia" e "Próximos passos" (sem fonte), alteração de identidade ou de concessões.

## Decisions

**1. Ficha como casca fina sobre os módulos atuais.** A ficha monta e desmonta os `montar*` existentes como conteúdo das seções, com uma ficha aberta por vez. Reescrever os painéis traria risco em fluxos de barreira que já têm prova; manter todas as seções montadas ao mesmo tempo multiplicaria estados pendentes e dados velhos por paciente. A troca de seção com alteração pendente reaproveita a confirmação de descarte existente.

**2. Navegação por abas (padrão ARIA tablist, setas e foco).** O conteúdo troca no mesmo lugar, o que é o caso de uso de abas. Alternativa, botões com `aria-current`, é mais simples mas perde a convenção de teclado que o solicitante já vê no mock. A faixa de abas rola dentro do próprio contêiner no celular; a página não rola na horizontal.

**3. Posição na URL por fragmento (`#paciente/<id>/<seção>`).** Permite recarregar na mesma seção e usa o botão voltar do celular para fechar a ficha. O identificador é opaco e o fragmento não é enviado ao servidor nem ao `Referer`; mesmo assim a revisão de segurança deve confirmar. Alternativa, estado só em memória, é o comportamento atual e perde a posição ao recarregar. Recarregar sempre revalida a sessão antes de mostrar dados.

**4. Seções da entrega 1.** Com fonte conectada: Visão do caso, Plano de cuidado, Anamnese, Cadastro (edição e contatos) e Equipe com acesso. Indicadas como "em breve": Diário e Rede de cuidado, por serem as próximas entregas. Agenda, Documentos e Orientações ficam fora da faixa até terem mudança própria, para não prometer o que não está planejado. "Equipe com acesso" (autorização, já existente) e "Rede de cuidado" (mapa de pessoas, informação) têm nomes distintos porque o mapa nunca concede acesso.

**5. Visão do caso composta no cliente, sem endpoint novo.** Um módulo de composição consulta os serviços que já existem (cadastro, anamnese, objetivos, tarefas) em paralelo e renderiza cada bloco com estado próprio (carregando, dados, vazio, erro com nova tentativa, sem acesso). Cada serviço continua autorizando e auditando a própria leitura. Alternativa, um endpoint agregado, obrigaria nova autorização, auditoria e prova, sem lacuna que a justifique. Se o profissional ou o administrador não lê um bloco, o servidor decide; a interface mostra "sem acesso", sem contagens nem títulos do bloco.

**6. Lista sem N+1.** Linhas mostram avatar com iniciais, nome e preferência, como o mock. Idade, equipe e revisão do mock dependem de dados que a lista não traz; buscá-los por paciente seria N+1. A situação vigente entra na lista na entrega 2, no mesmo contrato paginado. A busca por nome filtra os carregados e avisa o limite.

**7. Identidade visual: mock como base, tokens trocáveis.** Os tokens do `DESIGN.md` viram variáveis CSS; paleta, títulos editoriais, linhas planas com divisórias e cabeçalho de ficha seguem o mock. Adaptações: uma coluna abaixo de 760px, texto mínimo de 12px e chips sempre com texto, contraste 4,5:1 para texto (o oliva do logo com branco dá 3,35:1 e não serve para texto pequeno), e etiqueta discreta "Ambiente de teste · dados fictícios" como o chip do mock, a remover na transição para dados reais. Cormorant Garamond e Raleway passam a ser carregadas de verdade, em woff2 reduzido a latim, gerado uma vez com fonttools fora do projeto, com `font-display: swap` e licenças OFL junto. Alternativa, dependência `@fontsource`, acrescenta pacote sem necessidade. São fontes provisórias do mock; a troca pelas definitivas da marca é só trocar os arquivos e as variáveis. Medir o peso final antes de aceitar.

**8. Cadastro completo (entrega 2), proposta a confirmar na modelagem de ameaças.**

- **Quem altera:** somente o Administrador altera situação e case manager, e cadastra casos novos (decisão de 08/11/2026). O servidor e o banco recusam outro perfil, inclusive Profissional com acesso ao caso; ocultar o controle na interface não é autorização. O case manager é escolhido entre usuários ativos com perfil Administrador ou Profissional, validado na gravação; se a pessoa perder o acesso, a ficha mostra o responsável como inativo e pede nova indicação.
- **Modelo:** situação e case manager em uma tabela de histórico só de inserção (`cadastro.acompanhamento_caso`: situação, case manager, evento de auditoria com o motivo cifrado, versão, ator e data do servidor); cada linha é o retrato completo do estado após a mudança, e o vigente é a última versão. Situação fica em coluna aberta com restrição de valores, para o filtro de FR-026 não exigir decifrar; o motivo é cifrado com AAD. Alternativa, colunas em `cadastro.paciente`, perderia o histórico consultável que FR-001 pede.
- **Recorte 2A (situação e responsável de pacientes existentes):** reaproveita a operação de edição de paciente (`api.editar_paciente`), que já é só de Administrador e traz atestado, barreira, idempotência, versão esperada em `cadastro.paciente.versao` e auditoria com motivo cifrado; situação e responsável entram como campos opcionais da mesma gravação, e cada mudança incrementa a versão do paciente, que é a "versão do caso" do cenário de concorrência. Alternativa, operação e barreira próprias, repetiria cerca de oito migrations sem lacuna que a justifique. A leitura sai da consulta de edição, portanto só do Administrador; leitura por Profissional (com a prova de S-02) e a situação na lista são fatias seguintes. Ver `ameacas-entrega-2.md`.
- **Recorte 2B (cadastro novo atômico):** só depois da 2A, estendendo a criação de paciente; o mapa de pessoas só depois da decisão sobre paciente e profissional como vínculo. A modelagem de ameaças da 2B está em `ameacas-entrega-2b.md` (T15 a T25). Decisões do solicitante de 09/11/2026: a situação inicial não leva motivo, quem tem `administrar_cadastro` escolhe o responsável e as cinco situações valem na criação, sem valor padrão. A escolha do responsável usa o catálogo existente: no banco todo Administrador tem `administrar_cadastro` e `administrar_concessoes`, então não se cria leitura nova (reabrir se as capacidades se separarem). A 2B é uma só fatia de código, a criação atômica. A criação atômica substitui a operação atual em vez de coexistir com o formato mínimo, para que a exigência de todos os campos não possa ser contornada por chamada direta; cada operação do repositório tem seu papel dono, e o papel da criação atômica recebe só os privilégios necessários.
- **Criação atômica:** o cadastro de caso novo cria paciente, contato inicial e primeira linha de acompanhamento em uma única operação dentro da barreira de cadastro já existente (`reservar` e `encerrar`), sem paciente parcial. Alternativa, três operações encadeadas, deixaria cadastros incompletos em caso de falha e triplicaria barreiras. Antes de criar mecanismo novo, avaliar a composição de barreiras que já existe para o contato.
- **Casos anteriores:** pacientes criados com o cadastro mínimo não têm esses campos. A ficha indica cada ausência como "a completar" e o Administrador completa pela seção Cadastro; nada é preenchido por inferência nem por valor padrão.
- **Mapa de pessoas:** usa `pessoa_relacionada` e `relacao_paciente` existentes, com uma linha por vínculo e coluna de tipo com o conjunto fechado de FR-002; nenhuma regra de acesso lê essa coluna. Gravações seguem o padrão de barreira, chave idempotente e auditoria do contato.
- **Leitura:** o acesso a cada seção continua definido pelas concessões que o Administrador configura (equipe e por paciente); a ficha só reflete as respostas dos serviços. Não há matriz fixa nem editor de permissão por seção neste recorte.

A implementação da 2A segue `ameacas-entrega-2.md` e depende de o solicitante confirmar as hipóteses H1 a H3 daquele documento; as demais partes só depois das decisões abertas.

**9. Relatórios em mudanças próprias.** O pedido cobre três coisas distintas: síntese e evolução profissional (FR-009/012), exportação por caso ou período (FR-032) e resumo para reunião (FR-006 revisado e US1). Cada uma tem decisões abertas diferentes; juntas virariam uma mudança grande demais para uma revisão. A ficha já deixa o lugar de Diário.

## Risks / Trade-offs

- Mudança em `main.ts` quebrar barreira ou guarda de alteração → manter os contratos dos `montar*`, migrar um painel por vez, manter os testes atuais verdes e acrescentar teste de troca de seção, de paciente e de acesso perdido.
- Ficha mostrar bloco que o servidor nega, ou o contrário → a interface apenas reflete a resposta; as regras de visibilidade por perfil do código atual não mudam, e a matriz da ficha é pendência de 2.1.
- Fontes pesadas no celular → subconjunto latim em woff2, `swap` e medição registrada.
- Visual provisório virar definitivo → tokens e fontes isolados em variáveis; `DESIGN.md` continua dizendo que são provisórios.
- Busca parcial ser lida como busca completa → aviso explícito e cenário de teste.
- Prova pela interface publicada depende de acesso Netlify da conta `agenda-francescato`, que este ambiente não tem → publicar a prévia exige login ou token do solicitante; sem isso a prova fica no teste local e é registrada como limitação.
- Entrega 2 depende de S-02 para provar perfil profissional e revogação → sem ativação nem dados reais antes disso.
- Obrigar preferência, nascimento e contato pode induzir dado inventado quando a informação é desconhecida; a regra dos estados "desconhecido" vale para a anamnese, não para o cadastro → é decisão do solicitante de 08/11/2026; revisar após o uso na demonstração e, se preciso, propor um valor explícito de "não informado".
- A obrigatoriedade total contradiz DF-019, o requisito "Cadastro mínimo do paciente sem CPF obrigatório" da change `fundar-identidade-e-seguranca-backend`, `PRODUCT.md` e o contexto de `openspec/config.yaml` → reconciliar esses textos antes de implementar a entrega 2 (tarefa 2.4); o cadastro mínimo atual segue válido até lá.

## Migration Plan

Entrega 1 é só interface: sem migration nem rota nova, e reversão por revert do commit. A prévia segue publicada manualmente, com build automático desligado. Entrega 2 prepara migrations aditivas e testes locais em PostgreSQL descartável; nenhuma operação remota sem autorização explícita, e a reversão não apaga registros sem procedimento aprovado.

## Open Questions

- Rótulos finais das abas e do texto "em breve", a validar com Edilaine na demonstração.
- Mostrar idade na lista exige ampliar o contrato da lista com dado pessoal; decidir junto da entrega 2.
- Índice cego para busca global por nome: decisão de segurança futura, fora desta mudança.
