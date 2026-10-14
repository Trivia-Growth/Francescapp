# Checklist de qualidade: Diário integrado do cuidado

**Finalidade**: Revisar clareza e completude da especificação funcional e distinguir aprovação do projeto de prontidão para implementação.

**Criado**: 2026-10-06

**Especificação**: [spec.md](../spec.md)

## Qualidade do conteúdo

- [x] Sem definição de arquitetura, linguagem, serviços de implementação ou estrutura de código.
- [x] Foco em valor para a pessoa acompanhada, família, equipe e case manager.
- [x] Linguagem voltada à discussão com responsáveis de negócio.
- [x] Seções obrigatórias do template preenchidas.
- [x] Fatos do site separados de inferências e propostas de produto.

## Completude dos requisitos

- [ ] Sem marcadores pendentes de esclarecimento obrigatório; escolhas provisórias estão identificadas como hipóteses.
- [x] Requisitos identificáveis, com condições de aceite verificáveis.
- [x] Critérios de sucesso mensuráveis e sem dependência de tecnologia.
- [x] Doze jornadas com exemplos de aceite e demonstração independente.
- [x] Exceções cobrem autoria, conflito familiar, áudio, permissões, documentos, agenda conectada e ausência de retorno.
- [x] Núcleo inicial, evoluções e exclusões delimitados.
- [x] Dependências de negócio, hipóteses e pauta de validação registradas.

## Preparação para validação

- [x] Requisitos FR-001 a FR-054 têm condição de aceite e fase proposta.
- [x] Jornadas cobrem cadastro, diário, síntese profissional, plano, agenda Google, carteira, documentos no Drive, identidade Workspace e governança.
- [x] Metas SC-001 a SC-012 indicam método de verificação e condição de piloto.
- [x] Proteção e auditoria pertencem ao núcleo; acesso familiar e financeiro não se confundem.
- [x] IA é assistência revisada e não decisão clínica.
- [x] Google Drive institucional, Google Agenda e identidade individual do Google Workspace pertencem ao núcleo validado; a conta responsável e as permissões serão confirmadas antes do piloto.

## Notas de revisão

Revisão editorial e de consistência concluída para a proposta v0.2, incorporando a validação de anexos no Google Drive, agenda Google e acesso via Workspace. Os itens marcados indicam qualidade documental, não validação de campo, conformidade jurídica certificada ou aprovação da Edilaine.

A constituição existente ainda é o template do Spec Kit e não contém princípios ratificados. Nenhuma decisão técnica foi inferida a partir de seus exemplos.

O documento está pronto para descoberta e revisão de negócio. Antes do piloto com dados reais, permanecem as validações de público, modelos, permissões, horários de resposta, guarda e responsabilidades listadas na especificação. Planejamento técnico não foi iniciado.

### Revisão de 2026-10-10

O solicitante informou a aprovação do projeto por Edilaine e definiu os serviços de infraestrutura, a referência de código e a origem do design final. A especificação v0.3 registra essa mudança de etapa, preservando hipóteses e evoluções não confirmadas. As restrições técnicas estão em [fundacao.md](../fundacao.md).

O item de esclarecimentos passou de completo para pendente porque há decisões fundamentais ainda não respondidas. Qualidade funcional: 17/18 itens marcados; isso não certifica prontidão técnica. O projeto de atendimento já foi identificado e inspecionado. O plano depende da resolução dos pontos restantes de fundação. A constituição continua sem ratificação.

O acesso familiar foi esclarecido: cadastro por Edilaine, convite inicial, definição de senha, login posterior com e-mail/senha e recuperação por e-mail. A jornada 12, FR-051 a FR-054 e SC-012 cobrem o fluxo e suas exceções, sem alterar o login Google Workspace da equipe. Políticas técnicas de envio, expiração, senha, sessão e conta já existente permanecem para o planejamento.
