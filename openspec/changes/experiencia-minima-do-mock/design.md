# Design

## Context

Ver [proposta](proposal.md). Em 13/11/2026, a sessão de Administrador no site publicado mostrou carteira e ficha com 17 abas, Diário conectado e Documentos com “Serviço temporariamente indisponível”. O mock mostrou “Meu dia”, resumo narrativo, registros e ações em uma composição única. A base `origin/main` já contém `web/home-profissional.ts`, `web/diario.ts`, `web/rede-cuidado.ts`, `web/documentos-caso.ts` e `web/linha-tempo.ts`; a branch de trabalho anterior estava 36 commits atrás dessa base. O produto publicado e a árvore local não devem ser presumidos idênticos sem conferir revisão e configuração.

Em 16/11/2026 o solicitante confirmou o mock como piso visual e de jornadas, preservando acréscimos úteis. O roteiro e os limites das simulações constam em `docs/legacy/mockup/source/README.md`; o site publicado deve ser comparado à fonte arquivada antes do aceite. A referência visual orienta a implementação sem tornar dados fictícios, provedores de exemplo ou identidade de demonstração decisões de produção.

## Goals / Non-Goals

**Goals:** tornar a jornada conectada compreensível e demonstrável com dados fictícios reais da aplicação; reutilizar serviços autorizados; reduzir o esforço para encontrar a informação e a próxima ação; preservar acesso por perfil, caso e audiência.

**Non-Goals:** inventar narrativa clínica por IA, copiar textos ou personagens do mock, criar integração Google nesta mudança, ampliar leitura por perfil, substituir as mudanças funcionais de Diário/Agenda/Documentos ou declarar seus gates concluídos.

## Decisions

1. **Conferir o estado antes de editar.** Comparar o commit publicado, `origin/main`, flags e a sessão de Administrador. Se “Seu dia” já estiver no código e ausente só por deploy/configuração, corrigir a causa existente; não criar segunda home. Alternativa rejeitada: implementar a partir da branch antiga, que reintroduziria trabalho já feito.
2. **Entrada com fontes autorizadas.** Reaproveitar a carteira e seu sinal operacional para Administrador e Profissional; consultar somente serviços que o perfil já pode ler. Cada bloco carregará e falhará isoladamente. A paridade exige também relatos e agenda do mock: usar integrações existentes após suas provas; se agregação ou rota nova for necessária, revisar seu contrato e autorização nas changes próprias antes de implementá-la. Não substituir essa dependência por dados locais apresentados como reais.
3. **Navegação em dois níveis.** Manter na primeira faixa as tarefas frequentes do perfil e oferecer um controle “Mais seções” com os demais destinos permitidos, grupo e indicação da seção atual. A ordem inicial proposta é Visão do caso, Diário ou Linha do tempo quando disponível, Plano de cuidado e Pendências; informações de cadastro, saúde, rede, documentos e governança ficam acessíveis no segundo nível. A seção ativa deve estar visível mesmo quando vier do segundo nível. Reutilizar hashes e montagem/desmontagem da ficha; não alterar contratos dos serviços. Alternativa rejeitada: 17 abas roláveis como única forma de descoberta.
4. **Resumo com origem identificável.** Cada bloco de FR-006 usa a leitura que já possui e oferece acesso à seção de origem. A interface distingue registro revisado por pessoa de composição automática. Quando não houver dado ou serviço, apresenta estado verdadeiro; não escreve uma síntese livre a partir de fragmentos. Alternativa rejeitada: gerar texto de “o que importa neste momento” sem revisão humana ou fonte autorizada.
5. **Prova visual com dois casos fictícios.** Um caso deve ser preenchido por operações conectadas permitidas, outro permanecer vazio. A comparação com o mock verifica hierarquia, localização das ações e legibilidade em desktop e celular; a prova de segurança cobre perfis autorizados, perfil sem vínculo, revogação e acesso direto quando alguma rota ou contrato for alterado. Não usar dados reais nem tomar mock como evidência de integração.
6. **Paridade por jornada, com acréscimos preservados.** Mapear tela, ação e perfil do mock para requisito existente, implementação, dependência e prova; preservar funcionalidades úteis além dele. Conferir Meu dia, carteira, ficha, diário, plano, próximos passos, agenda, equipe, documentos e orientações. Áudio, síntese e arquivos do mock são simulações: conclusão exige implementação e prova das respectivas changes. Participação direta do paciente segue proposta de Evolução, sem inferir autorização.

## Risks / Trade-offs

- **Site e base divergem:** registrar SHA de cada um e corrigir a causa observada antes de atribuir ausência de recurso ao produto.
- **Uma home pode revelar existência de caso:** só compor o que a carteira autorizada devolve; nenhum contador global ou cache compartilhado entre sessões.
- **Resumo parece conclusão clínica:** rotular sinais como operacionais, preservar origem e data, e não converter texto livre em avaliação automática.
- **Agrupamento dificulta achar uma seção rara:** manter busca visual por grupo, seção ativa aparente, link direto e teste de tarefa com usuário em celular/teclado.
- **Dados de demonstração pobres:** semear somente casos fictícios identificados por operações normais e registrar limpeza seletiva futura; não esconder estados vazios legítimos.

## Migration Plan

Mudança em fatias: reconciliar deploy, entrada, navegação e resumo; depois integrar e comprovar as jornadas nas changes de domínio. Nenhuma migration é pressuposta para a fatia de interface; integrações podem exigir alterações próprias previamente revisadas. Reverter cada fatia conforme seu diff e plano de origem. Publicação e operações remotas requerem autorização explícita conforme `AGENTS.md`.
