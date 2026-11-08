# Roteiro de especificações - FFCMApp

**Base histórica: 16/10/2026. Diretriz de retomada atualizada em 01/11/2026.** O estado histórico das fatias abaixo não comprova o estado atual da implementação; consultar as tarefas e evidências da mudança ativa.

O projeto já tem 54 requisitos funcionais de referência: 45 iniciais e 9 evoluções. Este roteiro organiza a transformação da referência em mudanças implementáveis. Não é uma nova lista de features, não diminui a primeira entrega e não fixa prazo. A ordem abaixo é uma proposta de dependências, sujeita à revisão do solicitante.

## Retomada: entrega conectada antes de expansão técnica

- **Prioridade:** primeira fatia demonstrável com equipe autorizada entrando, perfil/concessão checados no servidor, listagem e cadastro mínimo de paciente fictício, com autorização no banco. Não confundir essa fatia com a entrega de todo o núcleo funcional.
- **Primeiro passo:** executar a revisão D-14 aprovada em 01/11/2026: usar Auth/SDK Supabase nativos sem custo adicional no plano vigente; manter a API first-party e autorização atual no banco. Conferir tarefas/evidências atuais; preservar cifra de campos, auditoria e os experimentos existentes, sem ampliar o protocolo de sessão dispensado.
- **Limite de trabalho:** avançar somente no necessário à jornada e seus controles aplicáveis. Não ampliar mecanismos experimentais, novas abstrações ou baterias simuladas sem bloqueador concreto da fatia. Preservar trabalho existente; separar endurecimento adiável somente após demonstrar que não compromete os requisitos de segurança da entrega.
- **Aceite observável:** persistência real, estados honestos de carregamento/erro/vazio/sucesso e roteiro “Como testar” no PR. Provar acessos permitidos e negados, incluindo outro perfil/paciente, ausência de concessão, revogação e acesso direto no servidor/banco conforme a matriz aplicável. Mocks e testes pulados não comprovam integração.
- **Ritmo:** seguir exclusivamente a política de verificação em [AGENTS.md](../../AGENTS.md#execução-enxuta), sem copiar gates para este roteiro. Uma revisão por fatia; atualizar apenas decisões, bloqueadores e evidências que mudaram. Não abrir outra rodada de planejamento para detalhes técnicos já resolvidos.
- **Ambiente:** notebook sem Docker; testes conectados somente no ambiente Supabase aprovado, com dados fictícios. Esta atualização documental não autoriza deploy, migração remota, concessões, limpeza ou uso de segredos. Registrar qualquer operação externa necessária antes de executá-la, respeitando as autorizações específicas vigentes.

As tarefas e checkpoints da change `fundar-identidade-e-seguranca-backend` permanecem preservados. Esta seção define a prioridade operacional; não marca tarefas como concluídas nem substitui a revisão de um recorte técnico material.

## Fontes e precedência

- [Requisitos funcionais](../../openspec/specs/): FR/SC e fases preservados.
- [Fundação real](../../openspec/changes/registrar-fundacao-real/proposal.md): deltas mais recentes sobre núcleo completo, perfis/acessos, OpenRouter, histórico contínuo, Drive compartilhado, ambiente único e transição conferida para uso real. Ainda não sincronizados com as specs base.
- [Fundação do backend](../../openspec/changes/fundar-identidade-e-seguranca-backend/proposal.md): complementa aqueles deltas com identidade/sessão, cadastro mínimo e respostas de 16/10/2026 sobre áudio e agenda. Desenho técnico e tarefas disponíveis; ainda não aplicado.
- [Fundação](fundacao.md), [contexto de negócio](contexto-negocio.md) e [passagem para João](especificacoes-para-joao.md): contexto e hipóteses, lidos junto aos deltas recentes.
- [Identidade visual](identidade-visual.md): nome FFCMApp, materiais recebidos e limites. Não impõe tipografia final nem cria um novo perfil de acesso.
- [Referência Atendimento](referencia-atendimento.md): padrões de código, não reutilização de dados, credenciais ou regras de CRM.

## Pacote 0 - Preparação local

Mudança: [preparar-base-ffcmapp](../../openspec/changes/preparar-base-ffcmapp/proposal.md).

**Entrega planejada:** demonstração recuperável e fora da base ativa; materiais/fontes preservados; documentação e ferramentas locais com verificações reais. Sem interface de produção ou serviços conectados. É uma mudança de ferramentas, por isso não cria delta funcional artificial.

**Aceite:** a proposta continua íntegra; imagens e licenças permanecem recuperáveis; os comandos ativos não carregam o mock; testes de preservação e detecção de contaminação falham quando a condição é violada.

## Fatias funcionais seguintes

Cada fatia deverá ter proposta, delta de requisitos, decisões técnicas, tarefas e testes proporcionais, com rastreabilidade. A fundação transversal de identidade/cadastro mínimo tem um pacote técnico proposto; as jornadas completas abaixo ainda não são mudanças prontas para execução.

| Fatia | Referência | Jornada demonstrável e bloqueios materiais |
| --- | --- | --- |
| 1. Identidade e administração | FR-035, FR-037, FR-051 a FR-054; delta de perfis; SC-007/011/012 | Conta técnica Auth criada no projeto confirmado; perfil Admin da aplicação ainda não concedido. Sessão, bootstrap restrito, concessões e testes estão no novo pacote para revisão. Domínio/configuração Google, envio de e-mails e regras de conta familiar existente ainda exigem confirmação. Convite, senha/recuperação e vínculo precisam funcionar juntos; login técnico sozinho não conclui a jornada familiar. |
| 2. Paciente, acompanhamento e vínculos | FR-001 a FR-007; SC-002/007/009 | Cadastro mínimo confirmado: nome obrigatório, preferência/nascimento/contatos opcionais, relações separadas, sem CPF obrigatório; sua fundação está no novo pacote. Casos novos passam a exigir cadastro completo a partir da entrega 2 da change `ficha-do-paciente` (decisão de 08/11/2026). Histórico contínuo confirmado. Anamnese gradual, resumo/linha do tempo, duplicidade, representação e retomada ainda precisam de detalhamento. |
| 3. Documentos institucionais | FR-011, FR-029 a FR-033, FR-050; delta de documentos; SC-010/011 | Drive compartilhado institucional confirmado; família somente app e instituição autorizada também pelo Drive. Definir identificador, raiz, categorias, alterações diretas e revogação coerente. Exportação será detalhada com as fontes reais das demais fatias. |
| 4. Diário, evolução e áudio | FR-008 a FR-014; SC-001/003/004/007/009 | Relato simples e síntese profissional; audiência; rascunho/publicação/retificação; enviado/consultado/respondido distintos. Apagar original após revisão confirmada, com pendência/falha explícita até confirmação. Definir modelos por área, transcrição/limites, abandonados/cópias e política do processador antes do uso real. Não incluir FR-044 silenciosamente. |
| 5. Plano e coordenação | FR-015 a FR-020; SC-005/006/009 | Objetivo, progresso/revisão, tarefa com responsável, encaminhamento e orientação aprovada. Definir campos e responsáveis de validação, periodicidades por caso e plano de crise com equipe habilitada. FR-021/022 continuam evoluções. |
| 6. Agenda e carteira | FR-023 a FR-028, FR-049/050; SC-002/004/006/011 | Consulta/criação/alteração/cancelamento confirmados, somente quando autorizados e com confirmação Google; carteira e pendências com motivo. Definir séries/conflitos, vínculo paciente-evento, fuso e lembretes. Consulta/edição global continuam separadas. |
| 7. Fechamento de governança e piloto | FR-036 a FR-042, FR-032/033; SC-001 a SC-012 | Direitos, exportação integrada, auditoria, recuperação, integridade e jornadas no celular. Mesmo ambiente para testes e futura produção confirmado: detalhar limpeza seletiva/conferência antes de dados reais, configuração concreta, retenção, finalidades, responsáveis e metas do piloto. Segurança não começa nesta fatia. |

**Segurança é transversal desde a primeira funcionalidade**, não uma implementação adiada para a fatia 7: autorização real, proteção de segredos, auditoria aplicável, audiência, revogação e estados honestos devem acompanhar cada fatia. A última fatia valida o conjunto e a continuidade institucional.

## Contrato de cada pacote implementável

1. Escopo e exclusões, IDs FR/SC e decisões confirmadas.
2. Jornadas com pré-condições, perfil, vínculo, audiência, dados de entrada e resultado persistido esperado.
3. Cenários positivos, negativos, revogação, duplicidade/repetição e falha/retomada pertinentes.
4. Decisões técnicas fundamentadas no Atendimento, sem importar suas regras comerciais ou seus ambientes.
5. Tarefas pequenas com dependências, arquivos permitidos, limites e evidência de aceite.
6. Verificação da integração real antes de declarar serviço conectado. Fixtures somente em testes explícitos e isolados.

As metas SC ainda são referências a validar; não viram garantia contratual numérica por constar neste roteiro. “Vazio” exige consulta real bem-sucedida; erro/configuração ausente não recebe dados de exemplo como fallback.

## Respostas incorporadas em 15/10/2026

1. **Paciente:** histórico contínuo, sem episódios independentes; preservar registros e permissões nas pausas/retomadas.
2. **Documentos:** Google Drive compartilhado institucional. Ainda faltam identificador, raiz, organização e detalhes de acesso direto.
3. **Ambiente:** utilizar o mesmo ambiente remoto nos testes e na futura produção, somente com dados fictícios antes da liberação.
4. **Limpeza:** identificar cadastros, registros, anexos e eventos de teste; remover somente esses itens com procedimento e conferência. Preservar configurações, acessos administrativos válidos e conteúdo institucional preexistente; não executar remoções agora.

Essas respostas foram confirmadas pelo solicitante e registradas nos deltas da fundação real, incluindo o novo arquivo `specs/caso-e-anamnese/spec.md`. A limpeza no ambiente remoto é uma transição operacional futura, distinta do arquivamento local do mock no pacote 0.

## Acesso e perfil confirmados em 15/10/2026

- Um único perfil por usuário, sem acúmulo.
- Cadastro prévio da equipe por Administrador antes do acesso autorizado via Google.
- Edilaine na administração de negócio inicial. Posteriormente, a conta técnica individual por senha foi criada e testada no Supabase Auth do projeto informado; perfil Admin do produto ainda não concedido. Não guardar e-mail de configuração ou senha nas specs.

## Próximas decisões para a fatia de identidade

- Projeto Supabase e exceção técnica estão confirmados. Bootstrap, sessão e autoridade local estão propostos no pacote de backend, sem execução remota.
- Domínio/Client ID/origens Workspace e identidade de Edilaine são configurações necessárias antes de conexão/publicação.
- Envio/expiração/reenvio de convites, políticas de sessão/senha e conta familiar já existente exigem definição antes da operação familiar.

Em 16/10/2026 foram confirmados também cadastro mínimo, exclusão do áudio após revisão e criação/cancelamento de agenda. Os pontos restantes de cada integração terão perguntas próprias antes das tarefas dependentes; nenhuma evolução foi promovida ao núcleo.

## Estado dos artefatos

- `registrar-fundacao-real`: proposta/deltas existentes; desenho técnico e tarefas ainda não concluídos. Não declarar essa mudança pronta por criar outro pacote.
- `preparar-base-ffcmapp`: pacote de preparação local; revisão necessária antes de aplicar. Seu aceite não entrega o núcleo funcional.
- `fundar-identidade-e-seguranca-backend`: proposta, cinco deltas, [desenho de banco/APIs e mapa do núcleo](../../openspec/changes/fundar-identidade-e-seguranca-backend/design.md) e [tarefas da fundação](../../openspec/changes/fundar-identidade-e-seguranca-backend/tasks.md) disponíveis para revisão. Dependência: aplicar/validar preparação local primeiro. Não entrega ainda áudio, agenda ou convite familiar completo.
- Demais fatias: roteiro, sem artefatos executáveis próprios. Nenhuma aprovação de migração remota/deploy/concessão adicional é inferida deste planejamento.
