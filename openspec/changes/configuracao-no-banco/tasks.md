# Tarefas

## 1. Persistência

- [x] 1.1 Tabela `identidade.configuracao_sistema` com uuid como identidade da linha, `chave` única como endereço legível, CHECK cruzando `tipo` e `jsonb_typeof(valor)`, RLS ligada e `revoke all from public, anon, authenticated, service_role`.
  Evidência: `supabase/migrations/20261117400000_configuracao_sistema.sql`. Semeadas duas chaves (`ffcm.contato.ativo`, `ffcm.campo_extra_plano.ativo`) com o mesmo valor que a variável de ambiente já tinha, para a troca de leitura não mudar comportamento. `atualizado_por_usuario_id` nasce nulo: ninguém editou ainda, e atribuir autoria a quem não agiu falsearia a trilha.
- [x] 1.2 Operação privada Administrador-only com atestado, auditoria em todo caminho, idempotência e owner dedicado.
  Evidência: `supabase/migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql`. O bloco de autorização é o mesmo de `campo_extra_plano`, sem alteração de lógica. A trava da linha (`for update`) acontece ANTES do recibo de idempotência, porque o recibo precisa do uuid da linha e porque o replay tem de ser reconhecido antes da checagem de versão — senão o segundo envio da mesma chave bateria em `conflito` em vez de devolver o resultado anterior.
  Limitação: `grant select, update (…)` só nas colunas de valor. `chave`, `tipo`, `rotulo`, `descricao` e `exposicao` ficam fora do alcance do owner, então nem um defeito na função renomearia chave ou mudaria tipo.
- [x] 1.3 Leitor do servidor com cadeia de papéis própria.
  Evidência: `supabase/migrations/20261117420000_configuracao_sistema_leitor_servidor.sql`. `ffcmapp_configuracao_leitor_owner` (NOBYPASSRLS) tem policy `using (exposicao = 'servidor')` e grant de coluna só no que a consulta usa; `ffcmapp_configuracao_leitor_executor` só tem EXECUTE.
  Pendência operacional: a membership do papel LOGIN no executor é passo fora de migration (igual ao Vault), documentado no fim do arquivo.
- [x] 1.4 Migration de ativação no padrão `SET ROLE <owner>`, com verificação prévia do wrapper e da ACL.
  Evidência: `supabase/migrations/20261117430000_grant_configuracao_sistema_teste.sql`. O leitor do servidor NÃO é liberado por ela.

## 2. Contratos e servidor

- [x] 2.1 `packages/contracts/src/configuracao-sistema.ts` e as rotas `listarConfiguracaoSistema`/`gravarConfiguracaoSistema` em `rotas.ts`.
- [x] 2.2 Camada HTTP em quatro arquivos, espelhando o conjunto de `campo-extra-plano`: `netlify/functions/configuracao-sistema.ts` e `_shared/{entrada,compor,executor}-configuracao-sistema-nativ*.ts` mais o núcleo `configuracao-sistema-nativo.ts`.
- [x] 2.3 Leitor com janela curta de cache em `netlify/functions/_shared/configuracao-servidor.ts`: uma leitura em voo por processo, 30s de janela, e o padrão do ambiente vencendo sempre que o banco não responde ou não traz a chave no tipo certo.

## 3. Interface

- [x] 3.1 Tela de administração em `web/configuracao-sistema.ts` com editor por tipo (interruptor, texto, número, lista uma-por-linha), estados de carregando/vazio/erro/sucesso, `role="status"` com `aria-live`, rótulo ligado por `for`/`id`, ajuda por `aria-describedby`, e a autoria da última alteração ("Última alteração por … em …" ou "Ainda no valor original").
  Estilos em `web/styles.css` usando os tokens existentes, com ajuste para telas estreitas.
- [ ] 3.2 Fiação na navegação (`web/index.html` e `web/main.ts`) — NÃO feita nesta passagem por decisão de coordenação: quatro frentes mexeriam no mesmo arquivo em paralelo. O trecho exato a colar foi entregue no relatório da frente.

## 4. Migração de rotas

- [x] 4.1 `netlify/functions/contato.ts` e `netlify/functions/campo-extra-plano.ts` leem o interruptor pelo banco (`ffcm.contato.ativo`, `ffcm.campo_extra_plano.ativo`), com a variável de ambiente como padrão.
- [x] 4.2 Os interruptores `= false` em código seguem existindo e continuam vindo PRIMEIRO. `documentos.ts`, `linha-tempo.ts` e `exportacoes.ts` passaram a ler também a chave do banco, mas o `const` fixo é avaliado antes: ligar a chave na tela não abre nenhuma das três enquanto a prova de ponta a ponta não existir. O comentário de cada uma diz isso, para ninguém "simplificar" a ordem depois.
- [x] 4.3 Migração das rotas restantes (13/11/2026). Passaram a ler o interruptor do banco, com a variável de ambiente como padrão: `pacientes`, `edicao-paciente`, `acesso-paciente`, `barreira-acesso`, `barreira-contato`, `barreira-equipe`, `barreira-tarefa`, `anamnese`, `saude`, `plano`, `aprovador-plano`, `aprovar-objetivo`, `plano-crise`, `habilitacao-plano-crise`, `tarefas-cuidado`, `pendencias`, `encaminhamento`, `orientacao`, `contexto-cuidado`, `rede-cuidado`, `concessoes-equipe`, `auditoria`, `solicitacoes-titular`, `regras-atendimento`, `documentos`, `linha-tempo`, `exportacoes`. Vinte e oito chaves novas em `supabase/migrations/20261121100000_configuracao_servicos.sql`, semeadas com o estado exato de produção em 13/11/2026 — aplicar a migration não liga nem desliga nada.

  **Três exceções deliberadas, com o motivo comentado no próprio arquivo:**
  - `auth.ts`: um valor errado trancaria todo mundo para fora, e corrigi-lo na tela exige a sessão que deixou de ser possível.
  - `configuracao-sistema.ts`: é a tela que edita os outros valores; governá-la pelo próprio banco cria o mesmo impasse.
  - `vinculos-profissionais.ts`: não usa o pool do banco (fala só com o Auth). Abrir uma conexão exclusivamente para ler um interruptor acrescentaria latência e uma conexão a uma rota que hoje não toca no PostgreSQL. Segue em variável de ambiente.

  Também seguem em ambiente, por não terem o que ligar: `agenda-google`, `convites-familiares`, `consulta-convite-familiar`, `cancelar-convite-familiar` e `preautorizacoes-familiares` têm `integracaoComprovada = false` no código; e os dois caminhos da família em `pacientes.ts` pertencem à mesma jornada cuja entrada (`auth.ts`) é exceção. Dar à administração um interruptor que não liga nada seria pior que não ter.

  **Mudança de comportamento registrada:** as rotas agora montam as dependências ANTES de decidir a disponibilidade, porque é preciso o pool para ler a chave. Nas rotas com endpoint de disponibilidade isso faria a consulta responder erro quando a configuração do banco é ilegível; para não esconder a aba de quem tem o serviço ligado por ambiente, esse caminho devolve a resposta do ambiente em vez de erro. `edicao-paciente` mantém a falha fechada que já tinha, de propósito.

  **Risco que fica aberto e precisa de um passo operacional:** a variável de ambiente é o padrão quando a leitura falha, então enquanto o Netlify disser `true` e o banco disser `false`, uma falha de leitura em processo frio reabre o serviço. O cache protege o processo que já leu uma vez (provado em 5.6), mas não um processo novo. O passo recomendado, DEPOIS de aplicar a migration, é zerar essas variáveis no Netlify: aí o ambiente deixa de ser mais permissivo que o banco e a falha passa a fechar em vez de abrir. Não executado nesta passagem — inverter a ordem desligaria tudo.

## 5. Provas

- [x] 5.1 Teste SQL local: `supabase/tests/configuracao_sistema_local.sql`, executado por `scripts/testar-configuracao-sistema-local.sh` (porta 55447, banco `ffcm_cadeia_local`). Passou.
  Cobre: execução direta negada a `anon`/`authenticated`/`service_role` nas três funções; listagem; gravação com autoria e auditoria `permitido`; replay idempotente sem incrementar versão; mesma chave com digest diferente dando `conflito_idempotencia`; versão desatualizada dando `conflito` sem alterar valor e sem deixar recibo; chave inexistente dando `conflito` sem criar linha; valor de tipo errado e texto vazio dando `ENTRADA_INVALIDA`; `versao_esperada = 0` recusada; campo fora da lista branca dando `SEM_PERMISSAO`; profissional e família negados na leitura e na escrita, com auditoria `negado`; sessão encerrada negada mesmo com atestado válido; leitor do servidor enxergando só `exposicao = 'servidor'` e não conseguindo ler a tabela direto; e a migration de ativação abrindo o wrapper só para `authenticated`.
- [x] 5.2 Teste integrado handler + executor + atestado + PostgreSQL descartável: `netlify/functions/_shared/configuracao-sistema-postgres-local.test.ts`, por `scripts/testar-configuracao-sistema-integrada-local.sh` (porta 55448). Passou (1/1).
  Cobre também a semântica do leitor: banco vence o ambiente depois da gravação; chave ausente cai no padrão do ambiente nos dois sentidos; e pool inalcançável devolve o padrão do ambiente — nunca liga um serviço que estava desligado.
- [x] 5.3 `pnpm run verificar:rapido`: typecheck passou inteiro.
  Limitação registrada: o `lint` do repositório falha em dois arquivos de OUTRAS frentes em andamento (`netlify/functions/_shared/encaminhamento-postgres-local.test.ts`, formatação; `netlify/functions/_shared/entrada-documento-paciente-nativa.ts`, `lint/style/useImportType`). Todos os arquivos desta frente passam no Biome.
- [ ] 5.4 Revisão independente de dois eixos (padrões do projeto e aderência à especificação) — pendente.
- [x] 5.5 Passo operacional da membership do leitor: EXECUTADO pelo solicitante em 13/11/2026 (`grant ffcmapp_configuracao_leitor_executor to ffcmapp_vault_login with inherit false, set true`). Prova observável em produção: `/api/diario/disponibilidade` passou de `disponivel: true` para `disponivel: false` sem nenhum deploy, porque o banco tem `ffcm.diario.ativo = false` e passou a vencer o `FFCM_DIARIO_ATIVADO=true` do Netlify. É a demonstração de que a leitura do banco entrou em vigor e de que o banco manda.
  Pendente ainda: provas positivas e negativas de autorização em ambiente real para as rotas migradas em 4.3, e a aplicação remota de `20261121100000`.
- [x] 5.6 Teste SQL da semente dos interruptores: `supabase/tests/configuracao_servicos_local.sql`, por `scripts/testar-configuracao-servicos-local.sh` (porta 55463). Passou (`CONFIGURACAO_SERVICOS_OK`).
  Cobre: cada uma das 28 chaves com o valor, o tipo e a exposição esperados; rótulo e descrição presentes (sem eles a tela mostra interruptor sem nome); linha do tempo e exportação nascendo desligadas; o leitor do servidor enxergando os interruptores e NÃO enxergando uma chave de exposição `administracao` inserida no próprio teste; toda chave devolvida ao servidor sendo de fato `exposicao = 'servidor'`; e o papel leitor sem INSERT, UPDATE ou DELETE na tabela.
- [x] 5.7 Teste unitário do comportamento com o banco fora: `netlify/functions/_shared/configuracao-servidor-falha.test.ts`. Passou (4/4).
  Cobre: processo frio com o banco fora caindo no padrão do ambiente nos dois sentidos; **banco fora depois de uma leitura boa mantendo o que a tela mandou, sem reabrir o serviço** (é o caso que mais importa, e o que o cache garante); chave ausente, tipo errado e resposta ilegível caindo no padrão; e o banco vencendo o ambiente quando responde.
- [x] 5.8 `pnpm run verificar:ativacao` terminou com código 0 depois da migração: 128, 137, 257, 387 e 368 testes nas cinco suítes, mais `build:web` e a validação de configuração local.
  Defeito real encontrado por esse gate e corrigido antes de fechar: montar as dependências antes da checagem fez o endpoint de disponibilidade da anamnese responder erro em vez de `disponivel`, quebrando 4 casos de `anamnese-funcao.test.ts`. A correção foi devolver a resposta do ambiente nesse caminho, e não enfraquecer a asserção.

## 6. Correções do smoke em produção — 13/11/2026

Smoke feito pela coordenação em `https://ffcmapp.netlify.app`, logado como administrador,
percorrendo as 17 abas da ficha e a área de Administração. O que segue corrige o que ele achou.

- [x] 6.1 **Defeito sistêmico: processo frio desligava serviço.** Reproduzido em produção, dez
  requisições seguidas às mesmas rotas: `rede-cuidado` devolveu `503` na PRIMEIRA e `401` nas
  nove seguintes; `contexto-cuidado` idem em medição anterior. Causa: na primeira requisição a
  um processo novo a leitura da configuração não conclui, `servicoAtivo` cai no padrão de
  ambiente — que virou `false` quando as variáveis duplicadas saíram do Netlify — e a rota
  responde "serviço indisponível". Antes da remoção das variáveis o padrão era `true` e a falha
  era invisível. Não era defeito de duas telas: **qualquer rota podia mostrar "indisponível" no
  primeiro acesso**.
  Correção em `configuracao-servidor.ts`: uma segunda tentativa de leitura **no processo frio e
  só nele** (`ESPERA_RETENTATIVA_MS`). Havendo cache, nada muda — o valor conhecido continua
  valendo e não se gasta uma segunda conexão.
  Provas novas em `configuracao-servidor-falha.test.ts` (7/7): uma falha passageira no frio não
  desliga o serviço; duas falhas seguidas ainda caem no padrão do ambiente; e a retentativa
  **não reabre** serviço que a tela desligou. As quatro asserções anteriores seguem intactas.
- [x] 6.2 **Aba Cadastro parecia travada em "Carregando cadastro…".** Não estava carregando
  nada: `montarEdicaoPaciente` abre sem consultar, esperando a conferência do botão "Conferir o
  que foi salvo", porque pode haver edição anterior sem resposta. O texto inicial mentia sobre o
  estado. Agora diz o que a pessoa precisa fazer; "Carregando cadastro…" ficou só onde há
  leitura em curso. 13/13 em `editar-paciente.test.ts`.
- [x] 6.3 **Aba Pendências presa no esqueleto.** A lista da equipe era aguardada ANTES da
  pendência, em série; equipe lenta deixava a tela sem nada para mostrar. As duas consultas
  passam a sair juntas, e a equipe — que só enriquece a atribuição — nunca atrasa a pendência.
  A regra de acesso perdido continua: `exigeNovoAcesso` na equipe ainda interrompe tudo. 7/7 em
  `pendencias-caso.test.ts`.
- [x] 6.4 **Formulário de acesso familiar oferecido com a rota desligada.** `POST
  /api/auth/familiar` devolve `503` (jornada familiar desligada), mas o bloco aparecia com
  e-mail e senha e `web/main.ts` habilitava o fieldset incondicionalmente no carregamento. Quem
  tentava digitava a senha e levava erro genérico — foi o que travou a primeira tentativa de
  login do smoke. O bloco passa a nascer `hidden` no HTML, com o fieldset `disabled`.
  **Limitação assumida, e o motivo:** cheguei a implementar `GET /api/auth/disponibilidade` para
  a tela perguntar ao servidor quais portas estão abertas, mas **revertei**. Três testes de
  fluxo Google (`google-fluxo.test.ts`, `acesso.test.ts`) garantem que uma aba sem acesso
  estabelecido **não faz requisição nenhuma** — garantia deliberada contra dar sequência a uma
  tentativa que não é daquela aba. Qualquer consulta nova na tela de acesso a viola. Preferi
  manter a garantia e resolver no HTML a enfraquecer a asserção. **Consequência:** ao ligar a
  jornada familiar é preciso remover o `hidden` do `<details id="acesso-familiar">` e o
  `disabled` do fieldset — está comentado no próprio `index.html`.
- [x] 6.5 **Falha de login deixava marcas de fluxo órfãs.** `web/api.ts` gravava
  `modo-acesso = 'bloqueada'` e não limpava os fluxos da tentativa. `bloqueada` **continua**,
  porque sem entrada concluída não há sessão e afrouxar isso deixaria sessão ambígua passar por
  válida; o que sai agora são `fluxo-tecnico`, `fluxo-familiar`, `sessao-tecnica` e
  `sessao-familiar`. A entrada pelo Google já se recuperava sozinha (o envio do formulário grava
  um fluxo novo); o que sobrava era lixo que confundia a tentativa seguinte.
- [x] 6.6 **Diário, linha do tempo e exportação ligados**, por decisão do solicitante.
  Interruptores fixos derrubados em `linha-tempo.ts` e `exportacoes.ts`, e
  `20261122100000_ligar_diario_linha_tempo_exportacao.sql` põe as três chaves em `true`.
  A migration **atualiza** valor e não insere: o catálogo é definido por migration e `chave` é
  única. Guarda `CHAVES_DE_SERVICO_INESPERADAS` falha fechada se alguma chave sumir ou trocar de
  tipo — e ela pegou, no primeiro teste, que a fixture local não carregava a semente do diário.
  Prova em `configuracao_servicos_local.sql` (`LIGAR_SERVICOS_OK`): as três ligadas, sem
  duplicar chave e sem alterar exposição nem tipo.
  **Exercitado antes de ligar:** as cadeias SQL em PostgreSQL descartável, com positivos e
  negativos de audiência e autorização. **NÃO exercitado:** a tela autenticada em produção — a
  entrada depende do Google e não é executada por agente. **Documentos continua desligado**: o
  segredo `ffcmapp.integracao.google_drive` não está no Vault, e ligar só trocaria
  "indisponível" por erro de integração.
- [ ] 6.7 **Configuração do sistema continua quebrada — NÃO corrigida.** A tela mostra "Não foi
  possível carregar os ajustes". O que ficou estabelecido: com `x-sessao` inválido a rota
  devolve `401` de forma consistente em dez tentativas, logo `FFCM_CONFIGURACAO_SISTEMA_ATIVO`
  está correta e as dependências são construídas; com sessão **válida** devolve
  `503 servico_indisponivel`, que em `compor-configuracao-sistema-nativo.ts` só sai de erro de
  RPC ou do `catch` externo. A auditoria, que usa a mesma `consultar_sessao_nativa` **e também
  carrega o cofre**, lista 25 registros reais em produção — então nem a sessão compartilhada nem
  o cofre explicam sozinhos.
  **Hipótese mais forte, à luz de 6.1:** o `catch` externo engole qualquer falha, e o cofre é
  carregado pelo mesmo pool cuja conexão fria se provou falhar. A auditoria pode ter respondido
  num processo quente. Se for isso, a correção é a mesma retentativa de 6.1 aplicada a
  `carregarCofreNativo`. **Alternativa a descartar antes:** grant ou dono de
  `api.configuracao_sistema_privado` divergente no projeto remoto.
  **Por que não corrigi:** confirmar exige uma sessão autenticada em produção (entrada pelo
  Google, que não executo) ou leitura direta do banco remoto. Não troquei código crítico com
  base em palpite.

## 13/11/2026 — instrumentação das falhas, e três hipóteses derrubadas com evidência

Medição nova do coordenador: `/api/pacientes/<id>/pendencias` devolvia `200` antes do deploy
`f6b60be` e passou a devolver `503 servico_indisponivel` em quatro chamadas seguidas. Junto com
`configuracao-sistema` e `solicitacoes-titular`, são três rotas com o mesmo código público.

**Hipóteses levantadas e DERRUBADAS, cada uma com evidência:**

1. *Grant que não pegou.* Refutada. As migrations de grant são idênticas em lógica às que
   funcionam, e suas guardas (`WRAPPER_INESPERADO`, `ACL_INICIAL_INESPERADA`) **levantam
   exceção** — não existe caminho de pulo silencioso: se tivessem disparado, a migration teria
   falhado. Mais: `supabase/tests/grants_governanca_local.sql` (novo) exercita
   `20261119310000`, `20261119330000` e `20261119360000` em PostgreSQL descartável e afirma
   `GRANTS_GOVERNANCA_OK` — `authenticated` alcança os três wrappers, `anon` e `service_role`
   não, e as operações internas seguem fora do alcance.
2. *Exposição errada da chave.* Refutada: as 28 chaves de `20261121100000` estão todas em
   `exposicao = 'servidor'`, que é o que o leitor do servidor enxerga.
3. *Cofre, idempotência ou nome de RPC divergente.* Refutadas: `habilitacao-plano-crise`
   funciona em produção e usa **o mesmo** `carregarCofreNativo`, o mesmo
   `criarIdempotenciaNativa(cofre.cifra)` e o mesmo formato de nome. Os nomes de RPC conferem
   com as assinaturas concedidas.

**Achado colateral, e é o que permitiu o defeito passar:** das 25 migrations
`grant_*_teste.sql`, **dez nunca eram exercitadas por teste algum** — inclusive as da
auditoria, das regras e das solicitações do titular. Cobertura, porém, não explica este caso:
auditoria funciona em produção *sem* teste, e pendências falha *com* teste. O novo
`grants_governanca_local.sql` fecha três dessas dez; as outras sete seguem descobertas.

**O que foi corrigido: os três pontos cegos.** O diagnóstico levou cerca de uma hora porque
nada registrava a causa. Agora registra:

- `netlify/functions/_shared/falha-operacional.ts` (novo) reduz um erro a um identificador
  curto e seguro (`banco_42501`, `banco_PGRST202`, `cancelado`, `excecao_TypeError`).
- O `catch` das três composições e os dois retornos `servico_indisponivel` da autorização
  passam a registrar `{ evento, rota, etapa, causa, request_id }`, seguindo a forma já usada
  em `auth-nativo/google.ts`. O `request_id` registrado é **o mesmo** que a resposta devolve.
- `configuracao-servidor.ts`: o `.catch()` que devolvia mapa vazio em silêncio passa a
  registrar. Este era o ponto cego que explica `pendencias` — o 503 dela nasce no portão
  `servicoAtivo`, **antes** da composição, e nenhuma instrumentação de composição o alcançaria.

**O que NUNCA entra no registro**, com teste que falha se entrar
(`falha-operacional.test.ts`): mensagem do banco, `details`, `hint`, pilha, conteúdo de
paciente, identificador de sessão ou de usuário. Mensagem de PostgreSQL carrega nome de tabela
e de coluna; `code` diagnostica sem descrever o esquema. Código malformado é recusado em vez de
repassado.

**Causa raiz: ainda não estabelecida, e não inventei uma.** O que ficou provado é onde ela
*não* está. A próxima requisição em produção a qualquer das três rotas passa a deixar no log do
Netlify a linha `falha_operacional` com a causa reduzida — é o que fecha o diagnóstico, e custa
um acesso à tela em vez de outra hora de investigação.

**Não exercitado:** nenhuma das três rotas foi chamada em produção depois desta mudança; o
valor da instrumentação é previsto, não medido. `verificar:ativacao` termina com código 0
(80 arquivos de teste). Nada aplicado no remoto, nada commitado.

## Causa raiz do 503 da tela de Configuração — estabelecida em 13/11/2026

**Era contrato, não permissão.** A listagem devolve **todas** as linhas do catálogo e a entrada
faz `z.array(configuracaoSistemaSchema).parse(...)` de uma vez. Uma linha fora do contrato
derruba a resposta inteira.

A linha: `ffcm.documentos.drive_pasta_raiz`, semeada `'""'::jsonb` em
`20261120110000_documento_caso_privado.sql`. O contrato exigia `z.string().min(1)` para texto,
então a string vazia não casava com **nenhum** ramo de `valorConfiguracaoSchema` — nem texto,
nem booleano, nem número, nem lista. `parse` lançava, o `catch` da entrada devolvia
`servico_indisponivel`, e o 503 não dizia nada.

Provado isolando o schema contra a linha real: `Too small: expected string to have >=1
characters`. Varredura das 43 seeds do catálogo achou **essa única** linha ofensora — as demais
chaves de texto têm conteúdo.

**Conserto:** texto passa a aceitar vazio. Em branco é estado legítimo do catálogo, não ausência
de valor — a própria descrição da chave diz que enquanto estiver em branco o envio de anexos
fica indisponível, que é falha fechada por desenho. Qual chave pode ficar vazia é regra de
negócio por chave, decidida no banco, não um piso global de comprimento no contrato de
transporte. Os demais limites continuam de pé (teto de 600, lista não vazia, item não vazio).

**Por que a instrumentação anterior não pegou:** ela cobria autorização, cofre e operação — e a
falha acontece **depois**, montando a resposta. A composição tinha funcionado.

### Achado sistêmico: 26 `catch` cegos em 24 entradas

O padrão `const dados = <schema>.parse(resultado.dados); ... } catch { return
erro('servico_indisponivel') }` se repete em **todas** as entradas nativas. Qualquer divergência
entre o que o banco devolve e o que o contrato aceita vira 503 mudo, em qualquer rota. Era
sorte que só uma tivesse disparado.

Todos passam a chamar `registrarFalhaDeResposta(rota, erro)`, que registra `etapa: 'resposta'` e
devolve o `request_id` que a resposta carrega — ligando o que a pessoa viu ao que o servidor
soube. Teste novo falha se a mensagem do `ZodError` vazar: ela lista caminho e valor recusado de
cada item, ou seja, o catálogo inteiro.

### Guarda de regressão

`packages/contracts/test/configuracao-sistema-catalogo.test.ts` lê as **seeds reais** das
migrations e afirma que todo valor semeado passa no contrato e corresponde ao tipo declarado na
mesma linha. Lê das migrations em vez de repetir uma amostra à mão, porque amostra copiada
envelhece junto com o engano. Verificado que **detecta** o defeito: restaurando o `min(1)`, dois
casos falham nomeando a chave e o arquivo.

**Limitação:** o conserto não foi exercitado em produção — exige sessão autenticada, que é do
solicitante. `verificar:ativacao` termina com código 0.
