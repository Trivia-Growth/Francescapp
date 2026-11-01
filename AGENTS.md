# Diretrizes de engenharia — Francescapp

## Princípios

- Aplique KISS, YAGNI e DRY; não crie abstrações antecipadas.
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
- Não fixe nomes de modelos copiados do HED, não troque modelos silenciosamente e não delegue por padrão. Só use agentes quando o solicitante ou as instruções superiores autorizarem.
- Não declare conclusão por checkboxes ou existência de arquivos: confira os critérios de aceite e registre resultados, achados e limitações.

## Qualidade e experiência

- Teste comportamentos e fronteiras relevantes, com casos positivos e negativos de autorização; use TDD quando esclarecer regras de negócio.
- Execute verificações afetadas durante a implementação, gates da stack ao concluir uma feature e validação integrada antes de release. Não execute comandos de teste copiados de outro projeto sem que existam aqui.
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

## Execução enxuta e proporcional ao risco

- Não ativar todas as skills ou criar um gate por skill. Mudanças triviais usam entender → implementar → verificar; mudanças sensíveis preservam planejamento e revisões aprovados. Carregue integralmente as instruções/referências necessárias, sem puxar material alheio à tarefa ou reescrever o mesmo plano em vários lugares.
- Uma revisão formal por fatia demonstrável, não por função/arquivo. Após correções, revisar o diff afetado e seus impactos; ampliar a revisão se mudar contrato, risco ou escopo. Reaproveitar contexto já conferido na mesma revisão, mas atualizar evidências após mudanças relevantes; nunca reutilizar autorização antiga ou teste anterior como prova do estado alterado.
- Subagentes autorizados recebem somente tarefa, contratos, decisões, arquivos e evidência pertinentes; não replicar toda a investigação em cada frente. Evitar ciclos de agentes revisando revisões e revisores duplicados sem objetivo distinto. Dúvida material ou falha crítica volta à coordenação; checkpoints existentes continuam válidos, sem troca silenciosa de modelo.
- Executar testes afetados durante a implementação e gates integrados no fechamento pertinente, sem repetir suítes inteiras por edições sem impacto. Não reduzir testes de permissão, segurança ou integridade para economizar tokens. Apontar gargalos observados antes de adicionar ferramentas, automações ou camadas de orquestração.

## Autonomia e operações externas

- Conclua o trabalho aprovado e corrija problemas encontrados na validação, preservando mudanças do usuário.
- Não faça deploy, push, merge, provisionamento ou migrações remotas sem autorização explícita para essas operações.
- Carregue referências sob demanda e evite duplicação de documentação e verificações sem ganho.
- Dados reais só entram após validar permissões, integração de arquivos, políticas de dados e recuperação aplicáveis.
