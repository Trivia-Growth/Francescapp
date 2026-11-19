# Revisão adversarial de completude — 19/11/2026

**Conclusão: não, todas as specs e tarefas não estão desenvolvidas.** Há features
ausentes, jornadas apenas parcialmente conectadas e defeitos concretos. Validações
adiadas explicam parte das tarefas abertas, mas não explicam todas as lacunas.

**Revisão histórica fixada no commit abaixo.** O pedido posterior autorizou
corrigir as lacunas; estado da implementação, novas descobertas e limites estão
na [entrega complementar de 19/11](entrega-complementar-19-11-2026.md). Este relatório
preserva os achados da base, sem reaproveitá-los como prova do código alterado.

## Escopo e método

- Branch: `fatia7/turno-execucao-cuidado`.
- Fonte fixada: `cc10aad1aeac9ebac3e805ae44fda7cccce25726`.
- Base local `main`: `549f98b222a122b1fafc905884c1540154772180`.
  Comparação: `git diff 549f98b222a122b1fafc905884c1540154772180...cc10aad1aeac9ebac3e805ae44fda7cccce25726`;
  histórico `git log main..HEAD --oneline`. Sem atualizar refs remotas.
- Inventário de todos os `openspec/changes/*/tasks.md`: 30 mudanças, 549 tarefas,
  274 marcadas e 275 abertas. Há ainda `registrar-fundacao-real`, com proposta e
  quatro deltas, sem `tasks.md`, e oito specs-base. **Contagem não mede completude:**
  mistura planejamento, código, teste, operação, tarefas antigas e escopo excluído.
- Três revisores Sol independentes: padrões/segurança, specs de integrações/seis
  fatias, specs de turno/acessos/conversão/plano. Coordenação conferiu pontos
  críticos e rastreou alegações contra fonte. Skills `code-review` e referências
  pertinentes de segurança/PostgreSQL usadas pelos revisores.
- Leitura estática dirigida, não prova exaustiva das funções e migrations. Relatório
  anterior e checkboxes tratados como alegações, não evidência suficiente.
- Nenhum teste, lint, typecheck, build, SQL, navegador, chamada Google/Auth ou operação
  remota executado nesta revisão. Adiamento anterior preservado. Nenhuma credencial
  ou dado real acessado; nenhum código alterado. Não certifica segurança ou ativação.

## Padrões

### PAD-01 — P2: upload externo antecede autorização do caso

Fonte: [envio ao Drive](../../netlify/functions/_shared/documento-caso-nativo.ts#L152),
[composição](../../netlify/functions/_shared/compor-documento-caso-nativo.ts#L75),
[execução SQL posterior](../../netlify/functions/_shared/documento-caso-nativo.ts#L223).

Com documentos ligados e Drive configurado, profissional com sessão válida envia
multipart para paciente sem vínculo, inclusive UUID inexistente. A composição
confere identidade/sessão, não autorização para gravar naquele paciente. O upload
pela conta de serviço ocorre antes de a RPC conferir perfil/vínculo. Negativa SQL
tenta desfazer o envio, mas isso não desfaz consumo/chamada externa; falha de remoção
é ignorada em `documento-caso-nativo.ts:310`, podendo deixar órfão sem reconciliação
durável. Não foi demonstrada leitura clínica ou gravação SQL indevida.

Viola `AGENTS.md`: identidade e vínculo são controles distintos; autorização deve
existir no servidor e banco. Autorizar operação/paciente antes do primeiro efeito
externo e preservar reautorização transacional final. Revisão SPEC também identificou
o mesmo problema, classificado P1 naquele eixo; não são dois defeitos diferentes.

Administração de acessos: nenhum outro P1/P2 confirmado no recorte examinado.
Foram lidos contratos, provisionamento, admissão, confirmação, UI, migrations
1500/1600 e partes do mecanismo/consumidores/policies da 1700. Fonte mostra
reautorização, senha fora de SQL/recibos, UUID/marcador confiáveis, métodos separados,
RLS e owners/ACL guardados. Isso não prova bootstrap ou toda a matriz transversal.

**Total deste eixo: 1 achado confirmado, maior prioridade P2.**

## Especificação

### ESP-01 — P1: autorização de documentos ocorre depois do upload

Mesmo defeito de PAD-01. A tarefa [Documentos 1.2](../../openspec/changes/documentos-institucionais-integracao/tasks.md#L18)
está marcada concluída e exige cenários de outro paciente/perfil/revogação.
Provas SQL posteriores não comprovam autorização antes da escrita no fornecedor.
Falta cenário que demonstre zero chamadas de upload para ator sem permissão no caso.

### ESP-02 — P2: organização de pastas por paciente não implementada

O [delta de Documentos](../../openspec/changes/documentos-institucionais-integracao/specs/documentos-institucionais/spec.md#L7)
exige “organizar pastas por paciente”. O [adapter](../../netlify/functions/_shared/google-drive.ts#L189)
sempre envia `parents: [pastaRaiz]`; [composição](../../netlify/functions/_shared/compor-documento-caso-nativo.ts#L125)
fornece raiz global e envio não recebe paciente. Todos os casos usam a mesma pasta.
Lacuna de implementação da tarefa 1.2, independente de cadastrar credencial.

### ESP-03 — P2: audiência de documento existente sem edição pela interface

A [decisão registrada](../../openspec/changes/documentos-institucionais-integracao/tasks.md#L64)
permite alterar marcação pública em qualquer arquivo e descreve gravação de
metadados de documento existente. A [tela](../../web/documentos-caso.ts#L66) cria
somente novo anexo; a [lista](../../web/documentos-caso.ts#L216) oferece download,
sem edição de audiência/estado. Administrador não consegue tornar público anexo
interno existente ou retirar sua audiência familiar pela aplicação. Operação SQL
de metadados existente não entrega essa jornada web.

### ESP-04 — P1 de completude: execução clínica do turno e check-in ausentes

As specs FR-058–062/064–067 e [grupos 4–12](../../openspec/changes/turno-e-execucao-do-cuidado/tasks.md#L108)
pedem aferições, medicação prescrita/administrada, ocorrências, relatório de turno,
rotina, consolidado semanal/PDF, anexos e check-in/check-out com consentimento,
localização e descarte após 90 dias. Há contratos iniciais de parte desses domínios,
mas não suas trilhas completas UI/handler/persistência. [Rotas atuais](../../netlify/functions/turnos.ts#L11)
oferecem abertura, encerramento, consulta, escala, passagem, ciência e barreira.

Pendentes de código: 4.1–4.6, 5.1–5.4, 6.1–6.7, 7.1–7.3, 8.1–8.5, 9.1–9.7,
10.1–10.8, 11.1–11.4, 12.1–12.7/12.2.1; interface 13.1 parcial, 13.4/13.5 ausentes.
**Abrir/encerrar turno não equivale a check-in/check-out de FR-067.**

É lacuna de completude da spec, não incidente de segurança demonstrado. Esses
grupos excediam o recorte inicial do bloco opcional noturno; sua ausência impede
afirmar “todas as specs desenvolvidas”, sem transformar exclusão original em
regressão. Grupos 1–3 têm código preparado; ativação e gates permanecem pendentes.

### ESP-05 — P2: campos extras/aprovação do plano sem jornada web

[Decisão da equipe](../../openspec/changes/plano-cuidado-objetivos/design.md#L30)
prevê catálogo gerido pela plataforma e aprovadores/carimbo. SQL/HTTP existem,
mas [serviço da tela](../../web/plano-cuidado.ts#L23) e [cliente](../../web/servico-plano-http.ts#L153)
não oferecem catálogo, indicação de aprovadores ou aprovação; formulário contém
somente campos fixos e visibilidade. Faltam telas e integração dos valores extras.

Não classificar 7/7 tarefas originais como fraude de conclusão: eram preparação e
planejamento. O próprio design registra UI pendente. Falta tarefa executável que
represente a entrega restante, além de código. O catálogo não estar na UI é lacuna
real, mesmo com testes SQL antigos passando.

### ESP-06 — P2: revisão pela tela remove campos extras da versão vigente

O [contrato](../../packages/contracts/src/plano-cuidado.ts#L16) aceita `camposExtras`.
Ao revisar objetivo previamente gravado com extras pelo HTTP, a [tela](../../web/plano-cuidado.ts#L317)
reconstrói objeto apenas com campos fixos e envia-o como nova versão. Valores
extras desaparecem da versão atual, sem serem mostrados ou confirmados pelo usuário.
Versão anterior permanece no histórico: não é exclusão desse histórico, mas perda
silenciosa no estado vigente. Preservar valores suportados ou bloquear revisão
até poder tratá-los explicitamente.

**Total deste eixo: 6 achados; maior prioridade P1 no upload e na completude do turno.**

## Matriz de todas as mudanças com tarefas

“Presente” abaixo significa fonte encontrada no recorte dirigido, não aceite integral
ou execução comprovada. Linhas históricas não foram auditadas função por função.
Contagens reproduzem os checkboxes, sem promovê-los a prova.

| Mudança | Marcadas/total | Estado e pendência observados |
| --- | ---: | --- |
| abertura-consulta-turno-interface | 0/5 | UI/HTTP/RPC presentes no recorte; aceite/provas 1.1/1.2/2.1/2.2/3.1 abertos. |
| administrar-acessos-sistema | 7/9 | Quatro funções e dois métodos com UI/Auth/RPC presentes; 4.2 matriz e 4.3 aplicação/publicação pendentes. |
| agenda-google-integracao | 2/7 | V1 individual presente; OAuth/renovação/Vault/Google e gates operacionais sem comprovação. |
| anamnese-gradual-dominio | 11/14 | Migration de vínculo/histórico presente; tarefas históricas de planejamento/prova e ativação abertas. |
| cadastro-segredos-integracoes | 4/7 | UI/HTTP/Vault preparados; 2.2/2.5 têm código, 2.4 e provas publicadas pendentes. |
| carteira-pendencias-sinal | 17/17 | Fonte de carteira/home/sinal presente; conclusão histórica não revalidada em execução. |
| configuracao-no-banco | 26/27 | Conectada; 6.7 explicitamente sem diagnóstico atual/conserto comprovado do 503. |
| contexto-e-rede-de-cuidado | 11/11 | Fiação e objetivos paginados presentes; aceite completo não reexecutado nesta revisão. |
| conversao-diario-tarefa-atomica | 1/9 | UI/HTTP/RPC atômica presentes; 1.*–3.* misturam código e aceite adiado; 4.1/4.2 pendentes. |
| diario-conectado | 17/18 | Fluxos texto/família/áudio presentes; 4.3 visual/teclado real e ativação pendentes. |
| diario-textual-privado | 3/3 | Preparação privada histórica, coberta por mudanças posteriores; não aceite do diário completo. |
| documentos-institucionais-integracao | 2/4 | Parcial: ESP-01/02/03; entrega de bytes escrita, provas reais/gates pendentes. |
| executar-funcoes-no-supabase | 9/18 | Arquitetura/preparação parcial; 1.*, extrações 2.1/2.2 e planejamento 3.2–3.4 abertos. Não migração concluída. |
| experiencia-minima-do-mock | 3/11 | Home/navegação/resumo parcialmente preparados; inventário/paridade e aceite por perfil/celular abertos. |
| ficha-do-paciente | 28/29 | Fiações presentes; 1.8 publicação/roteiro/S-02/gates pendentes. |
| financeiro-despesa-e-repasse | 7/38 | Planejamento; implementação excluída expressamente da noite, não entregue. |
| fundar-identidade-e-seguranca-backend | 8/28 | Fundação histórica parcialmente implementada/substituída por D-14 e changes posteriores; matriz/S-02/integração abertas. Não “28 tarefas faltando código”. |
| historico-de-saude | 13/15 | UI/HTTP/SQL presentes; 4.3/5.1 operacionais pendentes. |
| login-local-feedback-ficticio | 4/4 | Feedback fictício local, não prova do login real de negócio. |
| migrar-rotas-para-edge-functions | 0/48 | Não executada; excluída da noite e dependente de pré-condições próprias. |
| orientacoes-visibilidade-familiar | 6/6 | Fonte de visibilidade familiar presente; não reexecutada integralmente. |
| plano-cuidado-objetivos | 7/7 | Núcleo presente; extras/aprovação parciais e perda de extras na revisão, ESP-05/06. |
| plano-de-crise | 20/21 | Fiação/migration DF-021 presentes; 7.1/7.2 ainda exigem operação/habilitação real. |
| preparar-base-ffcmapp | 11/11 | Preparação local histórica; não representa funcionalidades conectadas. |
| pwa-e-avisos-no-app | 6/31 | Planejamento; instalação/service worker/avisos não entregues, exclusão expressa da noite. |
| redesenhar-interface-ffcmapp | 14/18 | UI preparada; 4.1 e 6.* reprodução/aceite conectado pendentes. |
| regras-locais-tarefas | 6/7 | UI/HTTP/RPC de tarefas presentes; integração/ativação pendentes. |
| relato-textual-inicial | 2/2 | Recorte inicial histórico; não prova toda a jornada FR-008/013/014. |
| transcricao-audio-relato | 15/25 | Transcrição/revisão/expurgo preparados, incluindo 4.3/6.1 em código; segredos/provedor/ativação sem comprovação. |
| turno-e-execucao-do-cuidado | 14/99 | Grupos 1–3 preparados; execução clínica, relatórios, rotina/anexos/localização ausentes; gates 0.6/14.* pendentes. |

## Bloqueios e limites que continuam válidos

- [Configuração 6.7](../../openspec/changes/configuracao-no-banco/tasks.md#L132)
  continua aberta: não há rastro atual etapa/causa/request_id que comprove causa e
  correção do 503. Corrigir contrato histórico de 13/11 não prova o erro atual.
- Dez migrations locais desta continuação (0800–1700 de 25/11) constam pendentes
  no relatório anterior; estado remoto não foi consultado nesta revisão.
- Login publicado, cadastro de segredo, efeito das flags e integrações externas
  não foram comprovados aqui. Credenciais ausentes e publicação bloqueada não
  justificam as lacunas de código ESP-02/03/05/06.
- Testes positivos/negativos de autorização/RLS permanecem obrigatórios antes da
  ativação. Hooks lint/typecheck passados anteriormente não substituem esses gates.
- A migration 1700 altera dezenas de consumidores: revisão amostral e hashes não
  demonstram preservação comportamental de toda a cadeia. Harness de acessos
  também precisa executar, inclusive conferir owners e herança dos grants da fixture.
  Essa última observação é hipótese de validação, não bug confirmado neste relatório.

## Ordem recomendada para retomada

1. Corrigir autorização anterior ao upload e provar ausência de chamada externa
   nas negativas; manter autorização transacional e reconciliação não destrutiva.
2. Corrigir perda silenciosa de extras e entregar edição de audiência de documento.
3. Completar organização de pastas e jornadas de campos extras/aprovadores, com
   rastreabilidade nas tarefas já existentes ou recorte explícito aprovado.
4. Diagnosticar a porta de entrada com rastro atual, executar gates adiados e só
   então aplicar/publicar o que estiver demonstrado, com dados fictícios.
5. Se a meta passar a incluir toda a spec de turno, implementar grupos restantes;
   não chamar abertura/encerramento de check-in/check-out nem declarar execução
   clínica pronta por existência de contratos.

Nenhuma correção, ativação, mudança de checkbox, commit ou push foi feita como
efeito desta revisão. Os achados não foram apagados por coincidirem com uma limitação
previamente documentada. O objetivo noturno publicado permanece não comprovado.
