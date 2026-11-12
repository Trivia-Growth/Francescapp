# Plano de crise aprovado pelo profissional habilitado (FR-020)

## Por quê

FR-020 estava bloqueado por falta de decisão de negócio, não por falta de código: o
requisito exige "plano de crise aprovado pelo profissional habilitado" e não existia
conceito de habilitação no sistema (ver `openspec/changes/historico-de-saude/design.md`,
seção "Bloqueio de negócio: FR-020"). Em 11/11/2026 o solicitante escolheu a opção 2 —
**marca de habilitação na concessão de equipe, preenchida na tela de administração e
guardada no banco** —, coerente com a diretriz do mesmo dia: o que é variável se
preenche no front e fica no banco, não em constante de código nem em variável de
ambiente.

Sem esta fatia, não há onde registrar quem responde numa crise, em qual contato, até
onde vai o serviço e quando o combinado precisa ser revisto — e as duas afirmações que o
requisito manda mostrar (o diário não garante resposta imediata; a case manager não
emite conduta clínica por assumir a coordenação) não apareciam em lugar nenhum.

## O que muda

- Novas colunas em `identidade.concessao_equipe`: `habilitado_plano_crise`,
  `habilitacao_versao`, `habilitacao_por_usuario_id` e `habilitacao_em`, com CHECK que
  impede marcar concessão de administrador.
- Nova operação administrativa `api.habilitacao_plano_crise_privado(jsonb)` sob owner
  dedicado `ffcmapp_habilitacao_crise_owner`, que lista a equipe e grava a marca. Só
  administrador passa, pelo mesmo bloco de autorização já usado em
  `operacao.aprovador_plano_operacao_privada`.
- Nova tabela imutável versionada `cadastro.plano_crise_versao` e carimbo insert-only
  `cadastro.plano_crise_aprovacao`, preso à versão aprovada e à concessão habilitada que
  autorizou.
- Nova operação `api.plano_crise_operacao_privada(jsonb)` sob owner dedicado
  `ffcmapp_plano_crise_owner`, com três ações: ler, gravar e aprovar. Aprovar exige
  perfil `profissional` **e** a marca na concessão, lida sob trava na mesma transação.
- Rotas HTTP `GET`/`PATCH /api/pacientes/:paciente_id/plano-crise`,
  `POST /api/pacientes/:paciente_id/plano-crise/aprovacao` e
  `GET`/`POST /api/admin/habilitacao-plano-crise`, todas atrás da flag
  `FFCM_PLANO_CRISE_ATIVO`, desligada por padrão.
- Nova seção da ficha com os dois avisos obrigatórios sempre visíveis, e nova tela de
  administração para registrar quem aprova.

## Fora de escopo

- Histórico paginado de versões anteriores do plano (o modelo já é versionado; falta a
  consulta). Não é exigido pelo FR-020.
- Exigência de mais de um aprovador, ou de aprovação com prazo de validade. O carimbo
  registra quem aprovou e quando; o requisito não pede mais do que isso.
- Qualquer notificação ou lembrete na data de revisão. A tela mostra a data e avisa
  quando está vencida; agenda e notificação são outras fatias.
- Ativação remota: migrations não aplicadas, flag não ligada, nada comitado.
