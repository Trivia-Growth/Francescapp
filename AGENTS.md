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

## Autonomia e operações externas

- Conclua o trabalho aprovado e corrija problemas encontrados na validação, preservando mudanças do usuário.
- Não faça deploy, push, merge, provisionamento ou migrações remotas sem autorização explícita para essas operações.
- Carregue referências sob demanda e evite duplicação de documentação e verificações sem ganho.
- Dados reais só entram após validar permissões, integração de arquivos, políticas de dados e recuperação aplicáveis.
