# Complemento de implementação — 19/11/2026

Branch: `fatia7/turno-execucao-cuidado`. PR: [18](https://github.com/Trivia-Growth/Francescapp/pull/18).
Base desta continuação: `cc10aad1aeac9ebac3e805ae44fda7cccce25726`.

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
serão registrados separadamente.

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
