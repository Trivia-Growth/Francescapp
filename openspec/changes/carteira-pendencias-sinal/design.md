# Decisões técnicas — carteira filtrável, pendências e sinal operacional

## 1. Pendência é derivada, não gravada

A leitura ingênua de FR-027 ("gerar pendências") sugere um gerador que grava linhas. Isso
cria imediatamente dois problemas: a linha envelhece em relação à origem (a revisão muda
de data e o alerta continua apontando a antiga), e alguém precisa decidir quando apagá-la
— exatamente o que o requisito proíbe ("sem apagar sua origem").

A pendência é derivada da origem a cada leitura por `cadastro.sinal_operacional_caso`. O
que se grava é só a **tratativa**: um evento append-only em `cadastro.pendencia_tratativa`
com `(tipo, chave_origem, acao)`.

`chave_origem` identifica a instância exata da origem:

| tipo | chave_origem | origem real |
|---|---|---|
| `revisao_proxima` | `revisao:<data acordada>` | `acordo_acompanhamento.proxima_revisao_em` |
| `atualizacao_ausente` | `atualizacao:<instante da última>` ou `atualizacao:nunca` | as nove tabelas de versão do caso |
| `encaminhamento_sem_retorno` | `encaminhamento:<id>` | `encaminhamento_versao.etapa` |
| `tarefa_atrasada` | `<id da tarefa>` | `tarefa_cuidado_versao` (prazo cifrado) |

Daí sai uma propriedade que o requisito pede e que seria difícil garantir de outro modo:
**resolver não esconde um fato novo**. Quando a origem muda, a chave muda, a tratativa
antiga deixa de casar e a pendência reaparece aberta. A origem nunca é tocada — e isso é
estrutural, não disciplina: a função que deriva só tem `select`, e as duas tabelas novas
têm trigger que recusa UPDATE, DELETE e TRUNCATE para qualquer papel, incluindo o migrador.

## 2. Um derivador, dois chamadores, nenhum privilégio duplicado

Carteira e ficha precisam do mesmo cálculo. Duplicá-lo garantiria que um dia a lista e o
caso discordariam sobre o mesmo paciente.

`cadastro.sinal_operacional_caso(uuid)` é `security definer` com owner próprio. Esse owner
tem `select` **só de metadado operacional** — `paciente_id` e `criado_em` das tabelas de
versão, mais `etapa` do encaminhamento. Nenhum `conteudo_cifrado`, nenhum autor. Os dois
chamadores (`ffcmapp_carteira_owner`, `ffcmapp_pendencia_owner`) recebem apenas `execute`;
nenhum deles ganha acesso direto às nove tabelas. O `execute` é revogado de `public`,
`anon`, `authenticated` e `service_role`.

**A função não autoriza nada.** Ela recebe um paciente que o chamador já autorizou. Isso
está escrito na própria migration, em caixa alta, porque é a hipótese que um chamador
futuro poderia quebrar sem perceber.

## 3. Sigilo no agregado

O risco específico de um cálculo que soma várias fontes é o agregado mostrar o que a fatia
individual esconderia. Três decisões o fecham:

1. **Só metadado atravessa.** O derivador nunca lê envelope cifrado. O "motivo" que chega
   ao usuário é texto gerado a partir de datas (`'Sem atualização registrada há 45 dias'`),
   nunca conteúdo copiado do caso.
2. **A autorização é a mais estrita das fontes, não a mais frouxa.** A fatia de pendências
   exige, para o Profissional, `cadastro.acesso_paciente` vigente travado na transação —
   mais estrito que a fatia de saúde, que hoje autoriza qualquer colaborador do workspace.
   A pendência aparece a partir da carteira e não pode mostrar caso que a carteira não
   mostraria.
3. **A lista recebe resumo, não detalhe.** `identidade.resumir_sinal_carteira` corta em
   três motivos e descarta tratativa, atribuição e datas. Quem quer o detalhe abre o caso,
   onde a autorização é verificada de novo.

## 4. Filtro que o perfil não pode aplicar é recusado, não ignorado

`responsavel` e `situacao` só existem no ramo do Administrador, porque é só ali que a
policy `acompanhamento_leitura_carteira` libera `cadastro.acompanhamento_caso`.

A alternativa fácil seria ignorar esses filtros para o Profissional. Isso devolveria uma
lista que não corresponde ao que foi pedido, com a interface mostrando o filtro aplicado —
pior do que recusar. O banco levanta `ENTRADA_INVALIDA`.

Consequência aceita: `ffcmapp_carteira_owner` passa a ler `responsavel_usuario_id`, coluna
que `supabase/tests/situacao_na_lista_local.sql` afirmava estar fora do seu alcance. O
novo teste `carteira_filtros_local.sql` afirma a fronteira nova: responsável sim,
`auditoria_id`/`ator_usuario_id`/`id` continuam fora, escrita continua fora.

## 5. Custo da paginação com filtro

Sem filtro, a página é cortada antes de calcular o sinal (`limit corte`, onde `corte` é
`limite + 1`) e o custo é o de hoje. Com filtro, `corte` vira `NULL` — que em SQL é
"sem limite" — porque a página só é conhecida depois de filtrar.

É o pior caso: avaliar o sinal de todos os casos visíveis. É aceitável no volume de uma
carteira de fundação e está documentado na migration. Materializar o sinal é a saída
quando deixar de ser — e exige medição antes, não suposição.

## 6. FR-028 fica no modelo, não na cor

"Verde" não é implementável como requisito. O que é implementável:

- `estado` tem três valores, e `informacao_insuficiente` existe justamente para que a
  ausência de acordo não apareça como tranquilidade;
- `motivos` nunca é vazio — o contrato exige `min(1)`, inclusive para "em dia";
- `avisoSinalOperacional` é constante do contrato, não string de tela, e aparece na
  carteira, na tela de pendências e na visão do caso.

## 7. O que não entrou

**FR-007 (linha do tempo pesquisável por período, tipo, autor, área, objetivo e
pendência, distinguindo acontecimento, registro e retificação).** Não foi implementado.
É uma fatia inteira — RPC própria com paginação por cursor atestado, agregação das nove
fontes com a mesma disciplina de sigilo da seção 3, e uma tela com filtros. A distinção
entre acontecimento, registro e retificação depende do diário (FR-012), entregue em
paralelo por outra frente. Fazê-la pela metade aqui entregaria um mock melhorado.

**Atraso de tarefa no banco.** Ver `proposal.md`, "Fora de escopo".
