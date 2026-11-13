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
