# Complemento de implementação — 19/11/2026

Branch: `fatia7/turno-execucao-cuidado`. PR: [18](https://github.com/Trivia-Growth/Francescapp/pull/18).
Base desta continuação: `cc10aad1aeac9ebac3e805ae44fda7cccce25726`.

## Retomada das validações após “Siga” — 19/11/2026

Base fixa desta retomada: `0174144cfb686f4702bbc11e7bc354677e33c384`.
O pedido posterior “Siga” retomou as verificações antes adiadas. O registro abaixo
de implementação e hooks descreve a entrega até essa base; suas indicações de
“não executado” são históricas. Resultados atuais ficam nesta seção, sem converter
prova local em ativação remota. PR 18 continua draft.

**Estado atual:** correções de execução implementadas, gate completo local com
saída 0 e seis runners SQL novos de Turno com saída 0. Entrada publicada, 503,
Auth/Vault reais, migrations remotas, integrações externas e publicação continuam
sem aceite; objetivo de entrar na aplicação publicada ainda não está entregue.

**SUPOSIÇÃO CONSERVADORA — ambiente:** validar somente instâncias PostgreSQL
locais descartáveis e identidades/conteúdos fictícios. Nenhuma credencial foi
solicitada, impressa, gravada ou copiada da conversa. `SUPABASE_ACCESS_TOKEN` e
`NETLIFY_AUTH_TOKEN` estavam ausentes; nenhum valor foi inspecionado.

Resultados confirmados até este registro:

- Anamnese: `testar-anamnese-vinculo-caso-local.sh`, saída 0, matriz completa
  posterior à migration 250100, incluindo outro caso, vínculo, concessão,
  perfil/sessão, leitura/histórico/escrita, revogação e concorrência real entre
  duas conexões. Evidência da regra antiga não foi reutilizada como prova da nova.
- Anamnese integrada: `testar-anamnese-integrada-local.sh`, saída 0, um teste
  HTTP/PostgreSQL posterior à 250100. Inclui escrita/leitura/replay e negativas de
  outro caso, vínculo revogado e sessão encerrada apesar do adapter permissivo.
- Segredos: `testar-segredos-integracoes-local.sh`, saída 0, SQL/ACL/transação
  com adapter local fictício de Vault. Não comprova a extensão Vault remota.
- Configuração integrada: `testar-configuracao-sistema-integrada-local.sh`, saída
  0, um teste HTTP/PostgreSQL. Não comprova autenticação DF-023 nem o 503 publicado.
- Turno predecessor: `testar-turno-execucao-local.sh`, saída 0, autorização,
  negações auditadas, revogação e concorrência. Matrizes novas continuam separadas.
- UI/Plano e serviços: 21 arquivos distintos / 131 testes finais verdes. Corrigido
  descarte de comando pendente no timeout da Administração do Plano; mantém chave,
  consulta de recuperação e repetição exata. Revisão independente do diff não
  encontrou P1/P2 confirmados; limites de adapters fictícios permanecem.
- BFF/Documentos/Drive/AAD: alvos específicos executados; correção de fixture do
  Plano nativo foi reexecutada com 15/15 verdes. Entrega de documento: mais um
  arquivo específico com 5/5 verdes. Contagem consolidada e gates SQL serão
  registrados ao concluir as frentes, sem somar reexecuções como testes distintos.
- PDF: medição local aquecida com Node 24, somente dados fictícios: 25/100/500
  seções em 25/33/153 ms, 2.455/6.729/29.842 bytes. Não mede cold start, pacote
  final, Node 22 canônico ou runtime Netlify e **não fecha a tarefa 10.4**.
- Primeira chamada de `pnpm run verificar:ativacao`, Node 22.23.2: saída 1 no lint
  por formatação de três arquivos alterados. As etapas seguintes não rodaram
  nessa chamada. Execução separada após corrigir o formato registrada abaixo,
  sem apresentar essa primeira chamada como aprovada.
- Continuação das etapas sem repetir a chamada completa: `typecheck`,
  `typecheck:deno`, `build:web` e `validar:configuracao` saíram 0. Build produziu
  JavaScript de 598,94 kB (154,11 kB gzip), com aviso de chunk acima de 500 kB;
  isso não comprova experiência de celular nem cold start da função PDF.
- Suítes gerais, primeira execução: contratos 155/156 (1 falha), cadastro 137
  aprovados/9 pulados, compartilhadas 274 aprovados/6 pulados, BFF 628
  aprovados/3 falhas/15 pulados, web 575/589 (14 falhas). Os 30 pulados dependem
  de ambiente PostgreSQL e **não foram contados como autorização aprovada**.
  Após correções, somente os arquivos afetados foram reexecutados: todos os
  alvos de contratos/BFF/web que falharam têm resultado final verde. Não se
  apresenta a primeira suíte como aprovação integral.
- Corrigidos 12 endpoints preparados órfãos no catálogo D-09; mantidos contratos
  e compositores HTTP nativos efetivamente usados. Nenhuma RPC fictícia nem nova
  exceção à allowlist. Prova do parser real fica no BFF, preservando o pacote de
  contratos sem dependência do backend; typecheck do pacote saiu 0 após esse ajuste.
- `testar-acessos-gerenciados-local.sh`, saída 0: matriz local de quatro funções,
  Google/interno, admissão, caso, perfil, revogação, acesso direto e auditoria.
  Auth é fixture local, sem conta real nem prova de OAuth externo.
- `testar-documentos-preautorizacao-concorrencia-local.sh`, saída 0: matrizes
  1800/1850 e concorrência entre duas conexões, incluindo validade após espera.
- `testar-plano-campos-extras-local.sh false` e `true`, saídas 0 em clusters
  diferentes: migration 1900, privilégios mínimos, versões, campos e aprovadores.
- Plano de crise DF-021: `testar-plano-crise-case-manager-local.sh`, saída 0.
  Case manager atual e habilitado aprova; outro responsável, familiar, habilitação,
  concessão/sessão revogadas e replay após troca são negados. RLS direta e
  preservação de memberships temporários também exercitadas.
- Runners HTTP/PostgreSQL dedicados de cofre, Plano de cuidado, Orientações,
  Encaminhamentos, edição de paciente e acompanhamento do caso: seis saídas 0,
  cada qual com um arquivo/um teste realmente executado, sem skip. São recortes
  locais dos respectivos runners, não prova do ambiente publicado.
- Mais sete runners dedicados HTTP/PostgreSQL, Node 22.23.2, saíram 0 sem skip:
  aprovação de objetivo, catálogo de campo extra, composição/barreira do Plano,
  catálogo de aprovadores, Plano HTTP, Plano de crise e pacientes nativos. Cada
  runner executou um arquivo/um teste. São protocolos locais herdados, sem
  declaração de DF-023 universal nem homologação Google/SMTP.
- Após mudanças efetivas de contrato, permissão e migrations, uma segunda chamada
  completa de `verificar:ativacao` saiu **0**: **1.787 testes passaram**, 30 ficaram
  condicionados ao ambiente; lint, todos os tipos, Deno, build e configuração local
  passaram. Repetição justificada pela exceção de contrato/permissão/migration do
  `AGENTS.md`, não por rotina a cada edição. Dos 30 condicionados, 13 testes BFF,
  três de cadastro e dois compartilhados passaram nos runners dedicados; os 12
  restantes de protocolos experimentais herdados não têm aprovação nesta retomada. Eles permanecem
  explicitamente sem evidência nova, sem infraestrutura experimental adicional.
  Build final: 597,75 kB de JavaScript / 153,78 kB gzip, mantendo o aviso de chunk.
- Runners existentes de carteira/cadastro com os dois executores ativados para a
  fixture e de autorização curta também saíram 0: três testes PostgreSQL reais,
  sem skip. Instâncias locais exclusivas, dados fictícios; sem alegar homologação
  do protocolo experimental como Auth nativo atual.
- Conversão Diário→Tarefa e escala/passagem de turno: runners integrais saíram 0,
  incluindo positivas, negativas e concorrência. Encontrado e corrigido **P1 de
  CAS da origem**: variável PL/pgSQL `versao` era escolhida em vez da coluna no
  SELECT/ORDER BY; versão antiga podia ser convertida após retificação concorrente.
  Colunas agora qualificadas; as três corridas reais do runner passaram.
- Matriz clínica completa de 2000–2500 saiu 0: aferições, rotina,
  retificação, prescrição/administração, concessão, fundamento familiar,
  consentimento/localização, anexos, relatório e exportação paginada.
- **Seis runners SQL de Turno, todos saída 0:** clínico; clínico-concorrência;
  reconciliação `false`/`true`; reconciliação-concorrência `false`/`true`.
  Instalação NOSUPER, papéis/métodos distintos, outro caso, revogação, caminhos
  diretos/privilegiados, audiência, histórico, epoch/recibo e duas conexões reais.
  Expiração durante espera de auditoria (21 segundos) aborta transação. Preservados
  owner/configurações, corpos e ACLs fora dos deltas explícitos (seis helpers e
  um wrapper). As duas últimas variantes carregaram a fonte clínica final inteira.
  Logs fictícios: `/tmp/turno-*-validacao.log`. Auth/Vault/Storage continuam adapters.
- OpenSpec `validate --strict`: acessos, documentos, segredos e Plano de cuidado
  saíram 0. Dois resultados não foram mascarados: configuração saiu 1 por pacote
  histórico sem delta spec; Turno saiu 1 pelos avisos de texto normativo com mais
  de 500 caracteres em FR-064/067. Os arquivos de requisitos de Turno não têm diff
  contra `0174144`. Não se ativou `skip_specs`, não se removeu cenário/FR nem se
  refez o planejamento para contornar os validadores. Pendências documentais
  preservadas, sem apresentá-las como verificação aprovada.
- Conferência visual com Chrome isolado, componentes/CSS reais e portas fictícias:
  390×844 e 1440×1000, seis componentes e quatro estados (48 combinações iniciais).
  Corrigido checkbox Turno, antes 356/639 px de largura, para 24×24. Tab preserva
  foco de 3 px; Espaço marca e habilita abertura nos dois tamanhos.
  A métrica inicial usava `innerWidth` e mascarou overflow de margem de 8 px em
  quatro estados da Execução a 390. Evidência foi corrigida sem apagar o histórico;
  seletor mobile resolve a margem herdada. Reteste dirigido da Execução passou:
  `clientWidth`, viewport visual, `innerWidth` e `scrollWidth` iguais a 390,
  sem controles cortados e com foco preservado. Não se repetiram 48 combinações
  nem suíte inteira por alteração CSS. Build afetado final saiu 0.
  [Métricas](evidencias-noturnas-19-11-2026/viewport-componentes-reais.json),
  [Turno mobile](evidencias-noturnas-19-11-2026/turno-real-390.png),
  [Turno desktop](evidencias-noturnas-19-11-2026/turno-real-1440.png),
  [Execução antes](evidencias-noturnas-19-11-2026/execucao-390-antes.png) e
  [depois](evidencias-noturnas-19-11-2026/execucao-390-depois.png).
  Limites: emulação Chrome, percurso inicial de seis Tab, sem Safari/dispositivo
  físico, auditoria WCAG integral ou Auth real. Harness temporário preservado em
  `/tmp/ffcm-viewport-sol`; Vite/Chrome isolados encerrados.

Revisão final do delta: base fixa `0174144`, `git diff 0174144 --` e arquivos
novos 2450/runner/artefatos, sem `.impeccable/` preexistente. As frentes Sol foram
reutilizadas em revisão cruzada, sem aceitar a própria implementação crítica.
**Padrões:** Plano revisou o delta Core 2000/2200 e nova 2450; Documentos revisou
2600 (autoria anterior de Plano), predecessores e controles das fixtures.
**Especificação:** Documentos conferiu CAS 1200, JSON 1400, hashes 1700/2600,
autoridade 2000/2200 e grant único 2450; UI Administração do Plano e contratos
nativos também receberam leitura independente. Nenhum P1/P2 confirmado restante
nos recortes relidos. Essa conclusão é de fonte; seis SQL vieram da execução Core,
sem repetição pelo revisor, e integração externa permanece sem comprovação.
Coordenação conferiu o diff CSS dirigido e as métricas/captura de interface;
nenhum gate adicional por função ou repetição de teste verde foi criado.

Os 12 testes condicionados sem prova nova são destes oito arquivos, explicitamente:
`packages/cadastro/test/{contato-postgres-experimental,contrato-postgres-experimental}.test.ts`;
`supabase/functions/_shared/identidade/{desafio-postgres-integracao,admissao-postgres-integracao,admissao-google-postgres-integracao,google-vinculo-concorrencia}.test.ts`;
`netlify/functions/_shared/sessao/{google-http-postgres-integracao,tecnica-http-postgres-integracao}.test.ts`.
Exigem configuração do cluster/protocolo experimental próprio; não foram habilitados
por apontamento genérico ao banco, nem houve teste de autorização removido/desativado.

Falhas reais encontradas e corrigidas, com as provas acima:

- Migration 1200 consultava `exposicao` após assumir owner sem permissão dessa
  coluna. A guarda passa a executar antes do `SET ROLE`, sem ampliar grants.
- Migration 1600: variáveis PL/pgSQL `perfil`/`metodo` colidiam com colunas no
  helper `contexto_acesso_vigente`. Métodos e negativas foram preservados e
  reexecutados; conexão nova com método interno como primeira chamada passou.
- A execução exigiu SELECT de `email_hmac` exclusivamente ao owner privado de
  acessos para a verificação de unicidade. Nenhum grant à aplicação. Variável
  escalar Google permite conta interna como primeira chamada de uma conexão,
  sem acessar record Google não inicializado e sem relaxar a validação Google.
- Documentos 1850: quantificador regex inválido no PostgreSQL foi substituído por
  validação explícita de comprimento e mesmo charset, sem mudar a faixa 1–256.
- Turno 2000/2200: colisões de variáveis com tabelas/aliases e precedência incorreta
  em subtrações JSON interrompiam caminhos reais. Matrizes novas passaram; guards
  de transformação conferem exatamente o corpo corrigido antes e depois do patch.
- Exportação: na ordem real, 203500 concedia EXECUTE do wrapper público e 203900
  o retirava. Fixture antiga reaplicava o grant depois, ocultando o defeito. Nova
  migration **aditiva 2450** restaura somente EXECUTE não delegável de
  `api.exportacao_operacao_privada(jsonb)` para `authenticated`, sob owner
  conferido; não altera função histórica, corpo, grants de tabela ou permissão
  anônima/service-role. Matriz usa ordem cronológica real, migrador NOSUPER,
  deltas exatos de ACL e preservação de memberships/owners/configurações.
- Runners novos precisavam inicializar `pg_cron` localmente, com execução de jobs
  desativada. Fixtures tinham ciclo de memberships, tentativa de conceder papel
  implícito `pg_database_owner`, comparação de ACL incompatível com dois grants
  explícitos de migrations anteriores e condição que testava existência em vez
  de valor do parâmetro. Corrigir fixtures não autoriza relaxar os privilégios
  esperados; delta de ACL fica restrito aos dois EXECUTE previstos em 1500/1600.

**SUPOSIÇÃO CONSERVADORA — migrations locais:** os arquivos 1200–2600 alterados
são tratados como pendentes conforme o último histórico disponível. O estado
remoto não foi consultado agora. Se algum já tiver sido aplicado fora desta
sessão, conferir estado e preparar correção aditiva; não resetar banco, reaplicar
à força nem reescrever histórico remoto.

A entrega anterior tinha dez migrations novas (1800–2600). A adição de
`20261125245000_exportacao_wrapper_autenticado.sql` eleva esse conjunto para
**onze**, aplicadas somente em clusters de teste locais nesta retomada. As dez
migrations anteriores 0800–1700 continuam como pendência do último histórico;
estado remoto atual desconhecido, sem supor aplicação nem ausência de aplicação.

**Bloqueios externos atuais:** tentativa de leitura dos logs de
`configuracao-sistema` pela CLI Netlify retornou **401**; nenhum evento sanitizado
de etapa/causa/request_id foi obtido. Não foi feita correção especulativa do 503.
Sem variável Supabase, não houve inspeção/aplicação remota. Não houve deploy,
login real, credencial cadastrada, flag ligada ou integração Google/OpenRouter
executada. Gate local aprovado não substitui roteiro publicado nem autorização
positiva/negativa no ambiente remoto; 0.6.1 e medição PDF 10.4 permanecem abertos.

**Não realizado nesta retomada:** produção, migration/deploy remoto, limpeza ou
expurgo, revogação/concessão real, geração de credencial, consentimento OAuth,
alteração de permissão Drive, evento Calendar real, chamada OpenRouter real,
homologação SMTP, testes experimentais herdados indicados acima, sincronização/
arquivamento OpenSpec, merge ou retirada do PR de draft. Financeiro/PWA/Edge não
foram iniciados. `.impeccable/` preexistente permanece fora da entrega.

**Git desta retomada:** fonte e evidências em `47f6e39`, enviada para
`origin/fatia7/turno-execucao-cuidado`; push saiu 0. Revisão final equivalente a
`git diff 0174144...47f6e39`, incluindo runner/migration/artefatos novos; relatório
final atualizado no commit documental posterior. Pre-commit normal saiu 0,
Biome conferiu 21 arquivos e formatou um. Pre-push normal saiu 0: lint em 829
arquivos e todos os typechecks, 8,39 s no hook de tipos. Hooks não foram
desabilitados/alterados. Push não comprova deploy; publicação permanece sem
validação. Os registros abaixo preservam a entrega anterior até `0174144`.

## Escopo e estado

O pedido “Caso falte algo a desenvolver desenvolva” autoriza implementar as
lacunas da [revisão adversarial](revisao-adversarial-19-11-2026.md), incluindo
execução clínica, relatórios, anexos e check-in/check-out do turno. Planejamento
existente permanece no OpenSpec; não se abriu outro tracker.

**Fonte complementar integrada para revisão no PR em draft; ativação não aprovada.**
Fonte preparada e provas escritas não significam funcionalidade ativada nem
matriz de autorização aprovada. A ordem posterior de adiar validações permanece
vigente. Nenhuma verificação manual de teste, lint, typecheck, build, Deno, SQL, navegador
ou benchmark, nem operação remota de Supabase/Netlify, foi executada nesta
continuação. Hooks Git existentes foram preservados; resultados de commit/push
estão registrados separadamente abaixo.

Três frentes Sol: documentos/BFF, plano/interface e persistência/contratos de
turno. Coordenação faz integração, rastreabilidade e revisão de fronteiras.
Revisão cruzada de padrões e especificação realizada por leitura; recortes e
limites registrados abaixo. Autores não aprovaram a própria implementação crítica.

## Reconciliação dos achados

| Achado original | Fonte preparada nesta continuação | Aceite |
| --- | --- | --- |
| PAD-01 / ESP-01, autorização após upload | RPC de pré-autorização auditada, exigência de vínculo profissional no servidor/banco, reautorização final e negativas sem chamada Drive | Provas escritas; não executadas |
| ESP-02, pasta global | Reserva privada única por paciente e raiz, ID Drive pré-gerado, conferência de parent/marcador/tipo após criação ou 409 | Concorrência/Google reais pendentes |
| ESP-03, edição de audiência/estado | Edição de metadados na lista, versão esperada, conferência e comando idempotente; ID Drive preservado da versão autorizada | Provas UI/servidor/SQL não executadas |
| ESP-04, turno grupos 4–13 | Contratos, SQL privado, BFF e interfaces de execução, relatórios, fotos e localização preparados e conectados na fonte | Provas escritas; execução e ativação pendentes |
| ESP-05, catálogo/aprovadores do plano | Administração de catálogo e aprovadores por nomes, campos tipados, carimbo persistido por versão e snapshots do catálogo sob locks | Provas UI/HTTP/servidor/SQL escritas; não executadas |
| ESP-06, perda de extras ao revisar | Valores apresentados/preservados; incompatibilidade ou campo inativo bloqueia revisão em vez de descartá-los | Provas escritas; não executadas |
| Adicional desta implementação: ZIP legado continha somente índice | Rótulo corrigido para índice; PDF de caso adicional busca conteúdo persistido no servidor, manifesto completo e versões históricas exatas | Provas escritas; sem execução |

## Revisão cruzada da fonte desta continuação

Base fixa `cc10aad1aeac9ebac3e805ae44fda7cccce25726`; alvo: diff local contra
essa base e todos os arquivos novos desta entrega, excluindo `.impeccable/`
preexistente. Changes: Documentos, Plano e Turno. Revisão estática dirigida, sem
execução, amostragem de segurança e contratos; não certifica todo o repositório.
Limite de threads impediu novos revisores. Frentes Sol existentes fizeram revisão
cruzada de código alheio: persistência revisou Documentos/Plano/BFF e 2600;
Documentos/BFF revisou SQL 2000–2600. Coordenação conferiu integração e fronteiras.

**Padrões:** encontrados gates de validade antes de esperas/auditoria e ACL após
transferência de owner executada sem SET ROLE. Fonte foi ajustada para revalidar
após o último ponto de espera e conceder como owner, restaurando somente privilégios
temporários próprios. Provas de timeout sob duas conexões, rollback e instalação
NOSUPER escritas; não executadas. Releitura independente afetada sem novo P1/P2
confirmado no recorte observado.

**Especificação:** encontrados categoria livre fora do catálogo, perda de campos
na projeção PDF (extras, Tarefa, assinatura/destinatários de Orientação), leitura
Diário latest em vez de histórica e ausência de rótulos de autoria de revisores.
Fonte preparada usa catálogo, apresentadores por domínio, seletor privado exato e
identidades da versão. Provas específicas escritas; não executadas.

**Integração:** corrigidos na fonte contrato de digest PDF (Base64URL de SHA-256),
resposta da barreira com `repeticao`, operação nula negada, recuperação persistente
após recarga, distinção entre versão retificada e versão substituída, prescrição
revisável por outro profissional autorizado, consulta falha sem exibir período
anterior e fotos permitidas no relatório familiar. Última integração corrige MIME
do download binário conforme contrato do cliente. Sem êxito de runtime presumido.

Migrations novas preparadas (**dez**, nenhuma aplicada nesta continuação): `20261125180000_documentos_preautorizacao.sql`,
`20261125185000_documentos_pastas.sql`, `20261125190000_plano_campos_extras.sql`,
`20261125200000_turno_execucao_clinica.sql`,
`20261125210000_turno_rotina_relatorios.sql`,
`20261125220000_turno_localizacao.sql`, `20261125230000_turno_anexos.sql`,
`20261125240000_exportacao_metadata_manifesto.sql`,
`20261125250000_exportacao_leitura_versionada.sql` e
`20261125260000_turno_execucao_reconciliacao.sql` (fonte preparada).
Nenhuma aplicada nesta continuação. A contagem anterior de dez migrations locais
pendentes, 0800–1700, é histórico do relatório anterior; o estado remoto não foi
consultado agora.

## Mapa de código preparado e evidência disponível

- **Execução clínica, FR-058–061/064:** migrations 2000/2100, contratos
  `packages/contracts/src/turno-execucao{,-http}.ts`, função
  `netlify/functions/turno-execucao.ts`, composição/operação/projeção em
  `netlify/functions/_shared/turno-execucao-*.ts`, interface
  `web/turno-execucao*.ts` e serviço HTTP. Aferições estruturadas, prescrições
  externas, administrações com executor e registrador distintos, ocorrências,
  conversão atômica em Tarefa/Diário e rotina. Séries paginadas, versões anteriores,
  motivo de retificação e referência prescrita original preservada.
- **Autoridade, FR-062/063:** vínculo ativo, concessão própria de medicação,
  fundamento familiar versionado e responsabilidade atual do caso são controles
  distintos. Consulta com corte de versões tem validade de 15 minutos e continua
  vinculada à autoridade atual. Não congela permissão revogada.
- **Relatórios e PDF, FR-062/065/066:** turno, dia, sete dias e caso; conteúdo
  persistido, lacunas sem interpretação clínica, auditoria e digest dos bytes.
  Migrations 2400/2500 ampliam manifesto paginado e leitura histórica exata de nove
  domínios; Anamnese reutiliza histórico. Owner e autorização de cada domínio são
  preservados; não há owner novo de leitura clínica global. PDF adicional ao ZIP
  de índice, sem substituir o formato legado.
- **Fotos privadas, FR-061/030:** migration 2300, bucket privado
  `turno-ocorrencias`, reserva antes dos bytes, JWT do solicitante, políticas
  restritivas, nenhuma URL pública ou de longa duração. Audiência e vínculo são
  conferidos a cada leitura; retry de objeto existente compara bytes. Nenhum
  apagamento automático de objeto pendente.
- **Check-in/check-out, FR-067:** migration 2200 e
  `web/turno-execucao-localizacao*.ts`; consentimento prévio próprio versionado,
  coleta pontual complementar depois da confirmação clínica e prazo JavaScript
  independente da espera de permissão. Abertura/encerramento registram ausência
  mesmo se a coleta falhar. Coordenadas têm consulta/PDF próprios, restritos à
  coordenação atual, e ficam fora de todas as superfícies familiares.
- **Recuperação de lançamento:** migration 2600 e contrato
  `turno-execucao-barreira.ts`; reconciliação, época e recibo duráveis só de
  metadados. Recarga não autoriza duplicar silenciosamente lançamento incerto.

Provas preparadas incluem contratos, servidor/HTTP, projeção/cifra/AAD, PDF,
interface, SQL direto e duas conexões. Arquivos principais:
`packages/contracts/test/turno-execucao-clinica.test.ts`,
`netlify/functions/_shared/turno-execucao-*.test.ts`,
`supabase/functions/_shared/cifra-turno-execucao.test.ts`,
`web/turno-execucao*.test.ts`, `web/servico-turno-execucao-http.test.ts`,
`supabase/tests/{documentos_preautorizacao,plano_campos_extras,turno_execucao_clinica,turno_execucao_clinica_concorrencia}_local.sql`
e runners correspondentes em `scripts/`. A matriz escrita inclui positivos e
negativos de perfil, método, caso B, revogação, concessão, fundamento, acesso direto,
NOSUPER e caminhos privilegiados. **Nenhum desses arquivos foi executado nesta
continuação; sua existência não prova que passam.** Apoio de medição local em
`scripts/medir-turno-execucao-pdf.ts`, sem benchmark executado. Esse script mede
renderização com a biblioteca já carregada; não comprova tempo frio Netlify nem
tamanho do pacote final exigidos em 10.4.

## Lista exata das chaves e caminho na aplicação

Após resolver entrada/publicação, entrar como Administrador em
**Administração > Credenciais das integrações** (`#administracao/integracoes`):

| Nome exato | O que o solicitante cadastrará pela interface |
| --- | --- |
| `ffcmapp.integracao.google_drive` | JSON da conta de serviço do Drive institucional |
| `ffcmapp.integracao.openrouter` | Chave da API OpenRouter |
| `ffcmapp.integracao.google_calendar_client_id` | Client ID OAuth do Google Calendar |
| `ffcmapp.integracao.google_calendar_client_secret` | Client secret OAuth do Google Calendar |

Somente escrita; valores não são devolvidos. Substituição cria versão. Nenhum valor
foi criado, recebido pela aplicação, lido do Vault ou cadastrado nesta continuação.
Nenhum token do chat foi usado. Não cadastrar valores no terminal, SQL, PR ou relatório.

Em **Administração > Configuração** (`#administracao/configuracao`):

- Drive: `ffcm.documentos.drive_pasta_raiz` e `ffcm.documentos.ativo`.
- OpenRouter: `ffcm.transcricao.ativa`, modelo/duração no catálogo existente.
- Agenda: `ffcm.agenda_google.dominio_workspace` e `ffcm.agenda_google.ativa`.
- Turno: `ffcm.turno.ativo`, `ffcm.turno.duracao_padrao_minutos`,
  `ffcm.turno.tolerancia_atraso_minutos`, `ffcm.turno.tratamento_nao_encerrado` e
  `ffcm.turno.area_passagem`; área precisa existir no catálogo do Diário.
- Descarte permanece desligado: `ffcm.transcricao.expurgo_ativo` e
  `ffcm.turno.expurgo_localizacao_ativo`. Nenhuma limpeza autorizada/executada agora.

Drive usa raiz de Drive compartilhado institucional acessível à conta de serviço.
FR-031 sinaliza divergência/revisão; não altera permissões. Agenda limita-se a evento
único na agenda individual. Callback da origem publicada prevista:
`https://ffcmapp.netlify.app/api/agenda/google/callback`; mudança de origem exige
callback correspondente no provedor. Consentimento OAuth real permanece pendente.

## Suposições e limites destacados

- **SUPOSIÇÃO CONSERVADORA — escopo:** financeiro, PWA e migração Edge continuam
  excluídos. Tarefas de planejamento histórico, homologação ou operação não foram
  tratadas como código ausente a implementar cegamente.
- **SUPOSIÇÃO CONSERVADORA — documento pendente:** falha após efeito externo pode
  deixar upload sem commit. Nenhum arquivo é apagado automaticamente. Replay com
  commit confirmado evita novo upload; isso não prova reconciliação integral de
  upload cujo resultado se perdeu antes do commit.
- **SUPOSIÇÃO CONSERVADORA — plano:** catálogo global opcional; aprovação é carimbo,
  sem criar bloqueio clínico novo. Campo antigo incompatível/inativo impede revisão
  até tratamento explícito, preservando o valor e o histórico.
- **SUPOSIÇÃO CONSERVADORA — turno:** executor externo é nome/vínculo declarado,
  separado de registrador autenticado. Nenhuma habilitação clínica é inferida.
  Referências não confirmadas ficam ausentes; não há interpretação automática.
- **SUPOSIÇÃO CONSERVADORA — retificação:** administração conserva a referência à
  versão prescrita original, sem trocá-la automaticamente por uma prescrição nova.
  Prescrição pode ser revisada por outro profissional com vínculo/concessão ativos,
  mantendo autor inicial e autor da nova versão distintos. Retificações de filhos de
  execução exigem autor original e turno ainda aberto; correção após encerramento
  permanece limitada, sem inferir autorização nova.
- **SUPOSIÇÃO CONSERVADORA — recuperação:** perda da memória do navegador não
  permite presumir que um lançamento clínico falhou. Barreira persistente por ator,
  época e recibo somente de metadados impede nova intenção enquanto houver
  confirmação pendente; recarga invalida comandos antigos ainda não confirmados.
  Não há conteúdo clínico em armazenamento persistente do navegador.
- **SUPOSIÇÃO CONSERVADORA — coordenação:** Administrador também exige vínculo
  ativo para acessar execução/relatórios/coordenadas do caso. Perfil isolado não
  concede acesso clínico global; papel Case Manager não atribui responsabilidade
  automaticamente.
- **SUPOSIÇÃO CONSERVADORA — família:** fundamento próprio vigente, versionado e
  revogável, além do vínculo; parentesco/motivo genérico não autorizam conteúdo.
- **SUPOSIÇÃO CONSERVADORA — localização:** consentimento próprio; coleta pontual
  opcional, dado declarado e sem prova de presença. Ausência não impede cuidado.
  Coordenadas ficam fora das respostas, relatórios e PDFs clínicos/familiares.
- **SUPOSIÇÃO CONSERVADORA — arquivos:** novos anexos de turno terão limite de
  3 MiB e PDFs de 4 MiB; exceder falha explicitamente, sem exportação parcial. A
  documentação da [Netlify](https://docs.netlify.com/build/functions/configuration/)
  informa limite de payload e expansão de binário, motivando margem conservadora.
  Isso não é medição do runtime nem autorização para contratar capacidade.
- **SUPOSIÇÃO CONSERVADORA — PDF:** biblioteca provisória `pdf-lib@1.17.1`, sujeita ao gate 10.4; geração no
  servidor. Glifo não suportado falha explicitamente, sem substituir texto clínico.
  O caso é identificado por identificador opaco rotulado; nenhum nome é inventado.
  Metadados de autoria atuais não certificam nomes na data histórica. PDF adicional
  não incorpora binários; ZIP legado foi renomeado para índice de registros.
- **SUPOSIÇÃO CONSERVADORA — capacidade:** limites efetivos de Storage/runtime e
  consumo do projeto não foram consultados. Nenhum plano, add-on, excedente ou
  serviço pago foi contratado. Medição de PDF 10.4 permanece gate aberto.

## Bloqueios preservados e trabalho não realizado

- Configuração 6.7: continua sem rastro atual de etapa/causa/request_id que prove
  diagnóstico e correção do 503. Não se aplicou correção especulativa.
- Login 400 e entrada publicada: causa e funcionamento atuais não comprovados.
- Netlify: último estado registrado era créditos esgotados, publicação pausada e
  deploy anterior bloqueado para substituição. Não foi reconsultado nesta continuação.
- Não houve migration remota, deploy, ativação de flags, conta/convite real,
  consentimento Google, uso de credencial, dado real, limpeza ou revogação de acesso.
- Matriz inteira de autorização/RLS, incluindo instalação NOSUPER, revogação,
  concorrência, caminhos privilegiados e audiência em cinco superfícies, permanece
  obrigatória e não executada. Fixtures e adapters fictícios não provam integração.
- Não foram marcadas como aprovadas tarefas cujo aceite exige execução. Mudanças
  não foram sincronizadas/arquivadas e PR não foi retirado de draft.

## Como testar após liberar os gates

Roteiro preparado, **não executado**; somente pessoas e casos fictícios:

1. Confirmar migrations, contexto publicado e login. Entrar como Administrador.
2. Abrir Credenciais das integrações, cadastrar cada um dos quatro nomes acima;
   conferir somente metadados/versão, nunca retorno do valor.
3. Editar configuração, ligar uma integração por vez; desligar e conferir recusa.
   Provar negativas Profissional/Família no servidor e acesso direto ao banco.
4. Em Administração > Acessos, conferir Google da organização e conta interna com
   confirmação nativa. Provar as quatro funções e as negativas entre métodos/casos.
5. Em Administração > Plano de cuidado, criar campo opcional e indicar aprovador
   por nome. Preencher/revisar objetivo; conferir preservação de extras e carimbo.
6. Em Documentos do caso, anexar arquivo fictício, editar audiência/estado e baixar.
   Provar outro caso, revogação, ID Drive adulterado e zero upload na negativa.
7. Em Meu turno, abrir caso fictício, conferir consentimento opcional e abrir turno.
   Registrar aferição, prescrição, administração com executor distinto, ocorrência e
   rotina; anexar foto e converter ocorrência em ação. Publicar passagem e encerrar.
   Conferir check-out, versões/retificações, ciência, relatório diário/semanal/PDF e
   recuperação após recarga. Provar audiência familiar e negativas diretas;
   localização nunca entra na audiência familiar. Executar matriz SQL/servidor/UI
   descrita no OpenSpec, incluindo duas conexões e instalação NOSUPER.
8. Executar uma vez `pnpm run verificar:ativacao` na ativação, além do roteiro real.
   Gate indisponível mantém a fatia sem aceite; CI/draft não substituem a prova.


## Registro Git e hooks preservados

Fonte consolidada no commit `8d077ae`, com correções de integração em
`217bea1`, `27ccc07`, `b4b78ec` e `f009026`, enviada à branch
`fatia7/turno-execucao-cuidado`. Último push de código observado saiu **0**,
`cc10aad..f009026`. O PR 18 permanece draft. Este fechamento documental é o
último commit da entrega, sem reescrita de histórico.

- **Pre-commit normal:** formatação dos arquivos staged e regras Biome. Bloqueios
  de assertions não nulas, declarações e template literal foram corrigidos;
  commits subsequentes saíram 0. Nenhum hook foi desligado ou alterado.
- **Pre-push normal, saída 0:** lint sobre **829 arquivos**, sem correções;
  typechecks de contratos, cadastro, funções compartilhadas, web e proxy
  concluídos. Duração observada do hook de tipos: 8,60 s.
- O compilador apontou casts inline inválidos após formatação, fluxo de foco,
  seletores no helper de escrita em vez do operador de leitura, inferência
  incidental do tipo UUID e fixtures. Correções foram feitas por Sol. Seletores
  de Diário/Tarefa foram relidos independentemente e receberam prova nova
  `turno-execucao-seletores-operadores.test.ts`, que chama os operadores e confere
  transporte assinado; **essa prova não foi executada**.
- **Não executados:** testes de comportamento/Vitest, SQL/RLS, concorrência,
  build, verificação Deno, browser/celular/teclado, benchmark e roteiro conectado.
  Sucesso de lint/tipos não comprova autorização, runtime, fornecedor ou aceite.
- Nenhuma migration remota, deploy explícito, ativação de flag, limpeza,
  concessão/revogação real ou credencial foi operada nesta continuação.
  `.impeccable/` preexistente permaneceu fora dos commits.
