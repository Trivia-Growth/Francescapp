# Tasks

Autorização de 18/11/2026: implementar localmente, validações adiadas; nenhuma checkbox será concluída só pela existência de código. Ligação: FR-055 Inicial e grupo 2.6 da change principal; 13.1 continua aberta.

**Resumo operacional — 18/11/2026:** proposta/design/delta escritos antes do código; OpenSpec apply informou `ready`. Consulta atual própria preparada pelo backend Sol na migration local `20261125130000` e módulos nativos de turno. Serviço HTTP, seção, CSS e testes novos preparados; fiação da ficha feita pela frente de integração. Identidade é fixada na instância do serviço e conferida antes/depois de cada chamada. Recuperação não reconhece recibo confirmado antes da consulta real; acesso perdido limpa a seção e aciona descarte da ficha. Nenhum teste, build, SQL ou verificação manual foi executado nesta passagem, por solicitação; hooks existentes de commit/push são preservados. Sem aplicação remota/ativação; `ffcm.turno.ativo` continua desligada. Inspeção visual, testes de interface/integração, servidor e matriz SQL/NOSUPER continuam pendentes, assim como revisão independente. Código preparado não equivale a requisitos comprovados.

## 1. Consulta própria conectada

- [ ] 1.1 Preparar contrato, handler e RPC auditada de consulta atual própria, dependente do grupo 2 existente. Aceite: testes servidor/banco positivos e negativos de sessão, caso, autoria, revogação e acesso direto; falha da auditoria aborta leitura. Migration local sem aplicação nesta passagem.
- [ ] 1.2 Implementar serviço HTTP com entrada/saída estritas, identidade estável, tamanho e prazo limitados, sem sucesso falso. Depende 1.1 para integração; aceite: testes novos de resposta malformada, 503, outro ator/caso e troca de sessão executados posteriormente.

## 2. Interação na ficha da equipe

- [ ] 2.1 Montar seção própria com consulta atual, confirmação de abertura e recuperação da barreira sem duplicação. Depende 1.2; aceite: testes dos estados carregando, vazio real, erro e sucesso, recuperação confirmada/cancelada e pendência de outro caso.
- [ ] 2.2 Integrar montagem/desmontagem na ficha da equipe e preservar encerramento clínico indisponível. Depende 2.1; aceite: prova de troca de ficha/sessão sem resposta obsoleta e navegação por teclado/celular, sem dados fictícios.
  **Fiação local em 18/11/2026:** `web/main.ts` acrescenta `meu-turno` / “Meu turno”
  somente ao perfil profissional, em Mais seções, preservando destinos primários e demais
  funcionalidades. Usa paciente atual, `criarServicoTurnoHttp(identidadeAtual)`, callback
  de acesso perdido existente e retorno de desmontagem de `montarTurnoProprio`; CSS próprio
  importado. Família/Admin não recebem seção; isso não substitui autorização servidor/banco.
  `web/ficha-integrada.test.ts` atualizado para composição por perfil e novo caso escrito
  de consulta atual vinculada ao caso/desmontagem ao navegar. **Não executado**: testes,
  navegador e provas de sessão/RLS adiados pelo solicitante. 2.2 aberta.


## 3. Integração e ativação

- [ ] 3.1 Revisar diff de padrões e aderência à spec, executar verificações afetadas quando liberadas e registrar limitações. Depende 1/2; aceite: evidências reais, sem confundir testes simulados com integração Auth/Vault. Gates 0.6.1/0.6.2 da change principal e autorização/RLS continuam obrigatórios antes de ativar.
