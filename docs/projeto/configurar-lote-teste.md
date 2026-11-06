# Configuração de lote de teste privado

Este procedimento prepara a operação futura; não autoriza conexão, migração ou alteração remota. Executar somente após autorização explícita para o ambiente identificado e confirmação do responsável. Usar exclusivamente dados fictícios. Não fazer reset ou limpeza global.

1. Confirmar projeto e ambiente diretamente na conexão administrativa, migração `20261109120000_preparar_proveniencia_teste` aplicada e proprietário/função privilegiada revisados. Conferir previamente backup e recuperação aplicáveis. Não usar credenciais de aplicação ou `service_role`; a configuração é privada. Não colocar senha ou URL com segredo em comando, arquivo versionado, histórico ou registro.
2. Escolher UUID novo para o lote, UUID de um usuário responsável já existente e identificação não sensível e única entre lotes abertos. Confirmar que não há configuração ativa. O script recusa configuração existente, inclusive a do mesmo lote; não substitui, encerra nem reaproveita lote. A transação desfaz ambas as inserções em caso de falha.
3. Na sessão `psql` administrativa já conectada ao ambiente autorizado, executar (substituir valores fictícios):

```sql
\set lote_id 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set responsavel_id 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set identificacao 'teste-privado-2026'
\i scripts/configurar-lote-teste.sql
```

4. Conferir configuração e lote aberto com consulta privilegiada abaixo, sem consultar ou registrar dados clínicos. Registrar ambiente, identificador do lote, responsável, data e resultado no artefato operacional existente. Se houver erro na sessão interativa, executar `ROLLBACK` antes de investigar; não remover configuração existente para contornar a recusa.

```sql
select c.lote_teste_id, l.identificacao, l.responsavel_usuario_id, l.encerrado_em
from operacao.configuracao_lote_teste c
join operacao.lote_teste l on l.id = c.lote_teste_id
where c.singleton;
```

A consulta deve retornar exatamente uma linha, com lote e responsável esperados e `encerrado_em` nulo. A configuração não classifica registros anteriores. Antes da ativação, continuam pendentes provas de concorrência com encerramento, acesso direto negado e caminho conectado real. Limpeza seletiva e transição exigem procedimento e autorização próprios; identidades, auditoria e objetos compartilhados não são descartáveis por associação ao lote.
