# Diretrizes de engenharia — Francescapp

## Princípios

- Aplique KISS, YAGNI e DRY; não crie abstrações antecipadas.
- Decisão permanente de 01/11/2026: preferir recursos nativos do Supabase disponíveis sem custo adicional no plano vigente (Auth, OAuth, SDK, PostgreSQL/RLS e Vault quando aplicável), em vez de reimplementá-los. Conferir disponibilidade, limites e consumo antes de adotar; não contratar plano, add-on ou excedente pago sem autorização. Isso não elimina autorização da aplicação, auditoria, cifra aprovada ou integração de negócio, nem autoriza operações remotas. Desvios precisam de lacuna concreta, não de preferência por arquitetura própria.
- Preserve os padrões do Atendimento descritos em `docs/projeto/referencia-atendimento.md`. O HED é referência de processo, não de arquitetura de produção.
- Use tipagem forte, responsabilidades claras, contratos explícitos e validação nas fronteiras de confiança.
- Autorize no servidor e no banco; ocultar controles na interface não constitui autorização. Identidade, vínculo com caso, audiência e permissões de agenda são controles distintos.
- Não armazene segredos no repositório nem registre dados pessoais, áudios, tokens ou conteúdo clínico desnecessariamente. Use dados fictícios nos testes.
- Meça antes de otimizar. Evite chamadas redundantes, N+1 e cache sem necessidade demonstrada.

## Fontes de verdade

- `openspec/specs/`: requisitos funcionais de referência, com IDs FR, fases e cenários preservados. A existência de uma spec não significa implementação ou confirmação de todas as hipóteses.
- `openspec/changes/`: propostas, deltas, decisões técnicas e tarefas de cada mudança. Não mantenha uma segunda versão ativa desses artefatos no Spec Kit.
- `docs/projeto/`: contexto de negócio, decisões confirmadas, pendências, jornadas, metas e referência de código.
- `PRODUCT.md`: contexto resumido para ferramentas de produto/design. `DESIGN.md`: limites e origem da direção visual, não requisitos funcionais duplicados.
- `docs/legacy/spec-kit/`: arquivo histórico somente de consulta. Não execute seus scripts nem use suas skills como fluxo ativo.
- O mockup e a proposta comercial não são uma implementação conectada e não definem automaticamente a identidade final da aplicação.

## Especificações e execução com IA

- Use OpenSpec para mudanças relevantes: explorar → propor → revisar → implementar → validar → sincronizar/arquivar. Alterações triviais seguem entender → implementar → validar.
- O solicitante exige esclarecimento de dúvidas materiais: não escolha silenciosamente regras de negócio, permissões, fornecedores, retenção, ambientes ou escopo de entrega.
- Preserve os IDs FR/SC, fases Inicial/Evolução e hipóteses. Evoluções propostas não viram tarefas de produção sem confirmação.
- Planeje fatias verticais demonstráveis e confira a coerência entre proposta, requisitos, design e tarefas antes da implementação.
- Separe responsabilidade de decisão/revisão e execução delimitada. Uma passagem de trabalho deve informar tarefa, requisito/cenário, decisão aplicável, arquivos permitidos, limites e evidência esperada.
- Não fixe nomes de modelos copiados do HED nem troque modelos silenciosamente. Por solicitação explícita de 01/11/2026, delegue a agentes as frentes independentes sempre que isso acelerar a entrega sem duplicação ou conflito; use `gpt-6.1-terra` (Terra 6.1) na implementação. Passe contratos, arquivos exclusivos e evidência esperada. Se esse modelo não estiver disponível, informe antes de substituí-lo. A coordenação permanece responsável pela integração e pelas revisões independentes; não prometa trocar o modelo do chat principal por uma ferramenta que só configura subagentes.
- Não declare conclusão por checkboxes ou existência de arquivos: confira os critérios de aceite e registre resultados, achados e limitações.

## Qualidade e experiência

- Teste comportamentos e fronteiras relevantes, com casos positivos e negativos de autorização; use TDD quando esclarecer regras de negócio.
- Siga a política de verificação da seção “Execução enxuta”. Não execute comandos de teste copiados de outro projeto sem que existam aqui.
- A aplicação deve funcionar confortavelmente no celular, com estados de carregamento, vazio, erro e sucesso, teclado, foco visível e alternativa ao áudio.
- Use Impeccable em trabalho visual pertinente e as boas práticas React quando escrever/revisar React. O material final de marca virá do marketing da Edilaine.

## Skills como apoio ao desenvolvimento

- O solicitante determinou que as skills de segurança guiem a implementação e a revisão, não apenas uma auditoria ao final. Ao iniciar trabalho pertinente, anuncie a skill e leia suas instruções/referências aplicáveis antes de agir. Isso não amplia o escopo aprovado da tarefa.
- Use `security-best-practices` na implementação segura por padrão e revisão de código das linguagens suportadas. Considere tanto frontend quanto backend pertinentes, separe controles existentes de recomendações e não trate uma referência de outro framework como prova de segurança desta stack.
- Use `security-threat-model` para modelar ameaças nas mudanças sensíveis de identidade/sessão, autorização, arquivos, integrações e tratamento de dados: delimite a mudança, ativos, fronteiras de confiança, caminhos de abuso e mitigação verificável. Confirme hipóteses materiais com o solicitante antes do relatório final. Não refaça uma análise completa em toda alteração trivial nem declare que controles planejados já existem.
- Use `codebase-design` para interfaces e organização do código; `tdd` nas fatias test-first acordadas; `diagnosing-bugs` quando houver falha a reproduzir. Preserve o vocabulário de negócio em português e os padrões do Atendimento; não crie camadas apenas para satisfazer uma heurística. Testar pela interface não elimina testes SQL diretos de RLS, grants e revogação.
- Use `code-review` no fechamento de uma fatia relevante, com os dois eixos: padrões do projeto e aderência à especificação. Informe a revisão-base, a mudança OpenSpec e o diff exato; inclua alterações locais e arquivos novos quando forem o alvo. Não configure outro tracker ou fluxo de specs como efeito colateral da skill.
- Use `supabase-postgres-best-practices` antes de trabalho PostgreSQL pertinente, incluindo schema, migrações, SQL, RLS e seus testes; carregue as referências específicas ao trabalho, sem otimização especulativa.
- As skills complementares estão em `.agents/skills/`, com origens e revisões registradas em `docs/processo/migracao-openspec.md`. Cada executor deve conferir sua disponibilidade; se ausentes ou incompatíveis, informar a limitação e solicitar orientação, sem alegar que aplicou uma skill indisponível.
- Continue usando OpenSpec para requisitos, decisões e execução; `vercel-react-best-practices` no trabalho React pertinente; Impeccable no trabalho visual. Skills não substituem as fontes de verdade ou justificam dependências, abstrações ou mudanças de arquitetura não aprovadas.
- Para Supabase/PostgreSQL, Deno e integrações, complemente lacunas das referências com documentação primária aplicável e testes próprios. Autorizações exigem provas positivas e negativas no servidor e banco, incluindo acesso direto, outro paciente/perfil, revogação e caminhos privilegiados. Nenhuma skill ou uso de RLS é, sozinho, certificação de segurança.
- As passagens entre frentes devem carregar os controles de segurança pertinentes e sua evidência. Preserve os checkpoints de revisão independente e aviso ao solicitante definidos nas tarefas; não faça troca silenciosa de modelo nem aceite a própria implementação crítica sem a revisão prevista.
- Uma tarefa só está concluída com critérios de aceite atendidos, verificações afetadas executadas e evidências/limitações registradas. Se um gate necessário não puder executar, registrar a pendência, não sucesso presumido; não marcar integração externa comprovada por testes com adapters fictícios.

## Execução enxuta

- Priorizar uma fatia vertical conectada e testável pelo solicitante. Antes de trabalhar, identificar a próxima entrega observável e seu bloqueador concreto; não expandir infraestrutura experimental que não seja necessária para essa entrega ou para um controle de segurança aplicável. O roteiro de retomada está em `docs/projeto/roteiro-especificacoes.md`; requisitos e decisões continuam no OpenSpec, sem tracker paralelo.
- Reutilizar recursos nativos da stack antes de criar mecanismos próprios. Uma camada adicional precisa de requisito ou ameaça concreta não atendida, justificativa curta e evidência esperada. Isso não autoriza remover controles existentes, substituir arquitetura aprovada ou adiar autorização: mudanças materiais exigem revisão explícita do recorte no OpenSpec.
- Não ativar todas as skills ou criar um gate por skill. Mudanças triviais usam entender → implementar → verificar; mudanças sensíveis preservam planejamento e revisões aprovados. Carregue integralmente as instruções/referências necessárias, sem puxar material alheio à tarefa ou reescrever o mesmo plano em vários lugares.
- Uma revisão formal por fatia demonstrável, não por função/arquivo. Após correções, revisar o diff afetado e seus impactos; ampliar a revisão se mudar contrato, risco ou escopo. Reaproveitar contexto já conferido na mesma revisão, mas atualizar evidências após mudanças relevantes; nunca reutilizar autorização antiga ou teste anterior como prova do estado alterado.
- Subagentes autorizados recebem somente tarefa, contratos, decisões, arquivos e evidência pertinentes; não replicar toda a investigação em cada frente. Evitar ciclos de agentes revisando revisões e revisores duplicados sem objetivo distinto. Dúvida material ou falha crítica volta à coordenação; checkpoints existentes continuam válidos, sem troca silenciosa de modelo.
- Durante o desenvolvimento, executar somente lint e typecheck pelo `pnpm run verificar:rapido`. Ao escrever um teste novo, executar apenas esse arquivo uma vez para confirmar que passa; se falhar, corrigir e repetir apenas o arquivo afetado. Não executar suíte completa, e2e, build ou verificação Deno a cada edição ou commit.
- Na ativação da fatia (retirada do PR de draft), executar uma única vez `pnpm run verificar:ativacao` (alias de `pnpm run verificar:fundacao`) e o roteiro “Como testar” do PR. Testes positivos e negativos de autorização/RLS são obrigatórios nesse momento e nunca podem ser pulados. Se não executarem, registrar o bloqueio em `tasks.md`; não considerar a fatia ativada apenas porque a CI passou.
- Após correções solicitadas na revisão, executar somente os testes afetados pelo diff. Repetir a suíte completa apenas se mudar contrato, permissão ou migration.
- Cada teste novo deve detectar uma falha relevante não coberta pelos existentes, considerando probabilidade e impacto; falha rara de autorização, vazamento ou perda de dados pode exigir teste. Preferir comportamento observável e fronteiras reais. Evitar repetir garantias do compilador, testar detalhes internos ou congelar constantes incidentais sem risco identificado. Não criar documento por teste: registrar a justificativa no próprio teste ou na tarefa existente quando necessário.
- Testes simulados comprovam somente o comportamento local exercitado. Não multiplicar mocks para contornar uma integração bloqueada; registrar a limitação e priorizar a prova real. Na ativação, teste obrigatório de autorização/RLS pulado equivale a evidência ausente, não a aprovação. Não excluir testes de segurança existentes apenas por custo presumido.
- A saída de testes para o agente deve mostrar somente falhas, usando o reporter `minimal` e `silent: 'passed-only'` do Vitest. Preservar códigos de saída, erros de coleta e falhas de infraestrutura; saída silenciosa não comprova testes de autorização executados.
- O pre-commit usa Biome somente nos arquivos staged, com correção e reestágio. O pre-push executa lint e typecheck em paralelo; não inclui testes, build ou Deno. Não adicionar hooks de agente que executem testes a cada turno.
- Apontar gargalos observados antes de adicionar ferramentas, automações ou camadas de orquestração.
- Manter decisões vigentes, bloqueadores e evidências em resumo operacional curto no artefato existente; preservar histórico sem exigir sua releitura integral em cada retomada. Reabrir investigação somente diante de mudança relevante, contradição ou evidência nova. Resolver detalhes técnicos rotineiros dentro do escopo aprovado sem pedir nova autorização a cada função; dúvidas materiais e operações externas continuam sujeitas às regras abaixo.

## Fluxo git e ativação

- `main` deve permanecer verde e recebe alterações somente por PR aprovado pelo solicitante, com CI verde.
- Um PR corresponde a uma fatia vertical com valor testável pelo solicitante, mesmo que seja grande. Infraestrutura sem resultado testável só entra quando solicitada.
- Use branches `codex/<fatia>` ou `claude/<fatia>` e abra o PR como draft no início da fatia. Faça push ao fim de cada dia de trabalho.
- Dentro do PR, faça um commit por tarefa concluída e não deixe passar mais de um dia sem commit.
- Se uma fatia passar de aproximadamente dez dias, pare e proponha ao solicitante dividi-la em duas fatias, ambas testáveis.
- A descrição do PR inclui **Como testar**: ambiente ou URL, usuário fictício, passos numerados, resultado esperado e ao menos um caso negativo de permissão. Se ainda não for testável, registre a pendência com clareza.
- Após o teste do solicitante, faça merge por squash e apague a branch, somente com a autorização exigida abaixo.
- Estão autorizados push de branch e abertura ou atualização de PR draft. Merge, force-push, deploy, migração remota e alteração de secrets exigem autorização explícita prévia.

## Autonomia e operações externas

- Conclua o trabalho aprovado e corrija problemas encontrados na validação, preservando mudanças do usuário.
- Não faça deploy, merge, provisionamento ou migrações remotas sem autorização explícita para essas operações; push segue o fluxo git acima.
- Carregue referências sob demanda e evite duplicação de documentação e verificações sem ganho.
- Dados reais só entram após validar permissões, integração de arquivos, políticas de dados e recuperação aplicáveis.
