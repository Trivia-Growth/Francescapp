# Modelagem de ameaças — entrega 2A (situação do caso e case manager)

Rascunho de 08/11/2026 (tarefa 2.2), com a skill `security-threat-model`. Escopo: gravar e ler situação do caso e case manager de pacientes existentes. Fora: cadastro novo atômico (2B), mapa de pessoas, leitura por Profissional e Família, substituição temporária (FR-037). Todo controle marcado "existe" foi lido no código; "a construir" não existe e não pode ser tratado como existente.

## Sistema e fronteiras

- Navegador (ficha, perfil Administrador) → proxy Netlify (`netlify/functions`) → RPC do Postgres no Supabase. A autorização final está no banco: a RPC privada verifica atestado assinado, perfil e sessão; a interface só reflete.
- A operação de edição de paciente já é o único caminho de escrita administrativa do cadastro. Existe, em `supabase/migrations/20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql`: atestado com assinatura, `operacao` fixa e validade de 30 s; perfil Administrador ativo por Google Workspace ou exceção técnica; travas `bloqueios_auth.travar`; barreira por ator (reserva e encerramento); idempotência com digest em `operacao.requisicao`; versão esperada em `cadastro.paciente.versao`; auditoria permitido e negado (inclusive Auth sem perfil); `motivo` cifrado com AAD amarrado ao id do evento; revalidação de sessão (`PZ001`).
- Fronteira nova: tabela de acompanhamento do caso e leitura da situação vigente na consulta de edição.

## Ativos

1. Integridade de situação e case manager (decide quem acompanha e o estado do caso).
2. Histórico de mudanças (data, autor, motivo): prova de quem mudou o quê.
3. Motivo da mudança (texto livre, possivelmente clínico): confidencialidade.
4. Confidencialidade da situação e do vínculo paciente–responsável.
5. Trilha de auditoria, inclusive de tentativas negadas.

## Atacantes e não-capacidades

- Profissional com ou sem acesso ao caso, tentando gravar ou ler por chamada direta à RPC ou ao proxy.
- Familiar autenticado.
- Administrador com sessão revogada ou vencida no meio da operação, ou com concessão revogada.
- Administrador que repete requisição, usa versão antiga ou troca o motivo cifrado entre registros.
- Não-capacidades assumidas: sem acesso ao cofre de chaves, ao `service_role` nem ao banco com papel dono; sem execução no servidor.

## Caminhos de abuso priorizados

| # | Caminho | Ativo | Prob. | Impacto | Prioridade |
| --- | --- | --- | --- | --- | --- |
| T1 | Profissional/Família/anônimo chama a RPC de gravação e muda situação ou responsável | 1, 2 | média | alto | alta |
| T2 | Responsável inelegível: inexistente, perfil Família, usuário desativado ou desativado durante a gravação | 1 | média | alto | alta |
| T3 | Designar responsável passa a conceder leitura do caso (vínculo confundido com acesso) | 4 | baixa | alto | alta |
| T4 | Perda de atualização: duas gravações com a mesma versão, ou repetição com chave igual e conteúdo diferente | 1, 2 | média | médio | média |
| T5 | Sessão revogada no meio da operação conclui a gravação | 1 | baixa | alto | média |
| T6 | Adulterar o histórico (update/delete de linha) ou apagar rastro | 2 | baixa | alto | média |
| T7 | Leitura da situação, do responsável ou do motivo por perfil não administrador (lista, Visão, erro) | 3, 4 | média | médio | média |
| T8 | Troca de envelope cifrado do motivo entre registros | 3 | baixa | médio | baixa |
| T9 | Falha de auditoria deixa a mudança sem rastro ou o motivo vaza em log | 2, 3 | baixa | médio | baixa |
| T10 | Regressão na redefinição da RPC de edição (migration refaz a função inteira) | 1 | média | alto | alta |

## Mitigações

Existentes (lidas no código): para T1 e T5, a verificação de perfil e sessão da RPC de edição, `bloqueios_auth.travar` e as checagens `PZ001`; para T4, versão esperada, digest e barreira; para T8, AAD por campo; para T9, auditoria na mesma transação com `AUDITORIA_NAO_INSERIDA`. D-14 admite terminar operação já autorizada após revogação externa de Auth; a mitigação é a coordenação por `bloqueios_auth` e fica como limitação, sem prova de concorrência real.

A construir (cada uma com prova exigida):

- **Reaproveitar a operação de edição** em vez de criar barreira e RPC novas: situação e responsável entram como campos opcionais da mesma gravação, que já é só de Administrador, tem barreira, idempotência, versão e auditoria. Alternativa descartada: operação própria, que repetiria cerca de oito migrations sem lacuna que a justifique. Prova: testes SQL existentes da edição continuam verdes (T10) e há negativos de Profissional, Família, anônimo e Administrador revogado (T1, T5).
- **Tabela `cadastro.acompanhamento_caso` só de inserção**: cada linha é um retrato completo (situação e responsável vigentes após a mudança), com versão única por paciente, autor e data do servidor. Sem `update` nem `delete` para nenhum papel da aplicação, com RLS ativa e `revoke all`; o papel dono da edição recebe só `insert` e `select`. Prova: tentativa de update/delete negada (T6).
- **Elegibilidade validada dentro da transação**: o responsável precisa existir em `public.usuario`, estar ativo e ter perfil Administrador ou Profissional, com a linha travada `for share` até o fim da gravação para impedir desativação concorrente. Prova: casos de inexistente, Família, inativo e desativado concorrente (T2).
- **Responsável não concede acesso**: nenhuma regra de acesso, leitura ou concessão consulta essa coluna; designar um Profissional não cria `acesso_paciente`. Prova: Profissional designado, sem acesso, continua negado na leitura do caso (T3).
- **Leitura só do Administrador nesta fatia**: situação, responsável e motivo saem apenas da consulta de edição, que já é restrita ao Administrador. Lista, Visão do caso e rotas de Profissional e Família não recebem esses campos até a fatia de leitura por perfil. Prova: contratos de resposta de Profissional e Família sem os campos, e teste de acesso direto (T7).
- **Motivo**: continua cifrado com AAD amarrado ao evento de auditoria, que a linha de acompanhamento referencia; nunca em log nem em campo aberto (T8, T9).

## Hipóteses que movem a prioridade (aguardam confirmação do solicitante)

- H1. Situação e identificador do responsável ficam em colunas abertas, sem cifra, para filtro e junção; o motivo fica cifrado. Se for inaceitável, T4 e T7 mudam e o filtro de FR-026 passa a exigir decifrar.
- H2. Nesta fatia só o Administrador lê situação, responsável e motivo; Profissional (com acesso ao caso) passa a ler em fatia própria, com a prova de S-02. Família não lê nunca nesta mudança.
- H3. O ambiente segue com dados fictícios e sem ativação real antes de S-02; nenhuma operação remota é feita aqui.

## Provas exigidas e limitações

Positivas e negativas no banco (SQL local descartável), no contrato e na interface, conforme as tarefas 2.5 a 2.8. Limitações já conhecidas: a concorrência de revogação externa de Auth não é provada por fixture local (D-14); a prova de perfil Profissional e revogação real depende de S-02; nada disso foi executado ainda.
