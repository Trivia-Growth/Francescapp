# Decisões técnicas — transcrição de áudio (FR-010)

## Por que o áudio é cifrado em partes

`cifra-autenticada.ts` limita cada texto cifrado a 32 KiB (`tamanhoMaximoBase64Url`), e
`resultadoAtestacaoSchema` limita o snapshot canônico atestado a 1 MiB. Um áudio de um
recado de 90 segundos passa dos dois se for um envelope só.

Três saídas foram consideradas:

1. **Subir o teto da cifra compartilhada.** Recusada: o teto protege todas as fatias, e
   mexer nele para atender uma delas aumenta o alcance de qualquer defeito futuro.
2. **Guardar o áudio fora do banco (Storage/Drive).** Recusada nesta fatia: a exclusão
   verificável do original é requisito, e armazenamento externo acrescenta um segundo
   sistema que pode falhar justamente no momento em que o requisito exige certeza. Quando
   a frente de documentos/Drive existir, o estado `falha` passa a ter uso real.
3. **Cifrar em partes numeradas.** Adotada. Cada parte carrega 18 KiB do arquivo
   original, e o AAD inclui `parte`, de modo que trocar duas partes, repetir uma ou mover
   uma parte para outro áudio faz a abertura falhar.

Os tetos derivam uns dos outros e estão documentados em `packages/contracts/src/transcricao.ts`:
300 KB de áudio → ~400 KB em base64 → ~535 KB de transporte atestado, com folga para o
limite de 1 MiB.

## Por que o endereço do provedor é fixo no código

A diretriz do solicitante é "tudo que é variável deve ser preenchida no front e guardada
no banco de dados". O que é variável aqui é o **modelo**, e ele está no banco.

O **endereço** do provedor não entrou. Se entrasse, a tela de administração viraria uma
alavanca para extrair a credencial: bastaria apontar o endereço para outro servidor e a
próxima transcrição levaria a chave do Vault junto. O provedor foi decidido pelo
solicitante (OpenRouter); trocá-lo é mudança de código revisada, não ajuste de tela.

## Por que o catálogo de opções entrou na configuração

"Escolhendo na plataforma o modelo" pede uma escolha, não um campo livre: um identificador
de modelo digitado de memória só apareceria como falha em produção, e a pessoa que
administra não tem como saber quais identificadores o provedor aceita.

`identidade.configuracao_sistema.opcoes` é definido por migration, como o resto do
catálogo. O owner da operação administrativa **não tem UPDATE nessa coluna**: nem um
defeito na função conseguiria ampliar a lista. A validação é dupla — na função e num CHECK
do banco, para valer em qualquer caminho de escrita.

## Ordem da gravação: transcrever antes de persistir

`registrar` chama o provedor **antes** de gravar qualquer linha. Guardar o áudio e só
depois descobrir que o provedor não respondeu deixaria um registro sem rascunho — estado
que o requisito não prevê e que a tela não saberia apresentar. Com a ordem adotada, falha
do provedor não persiste nada, e o profissional continua com a alternativa por texto, que
nunca passa por aqui.

A autorização vem **antes** da chamada externa: áudio de quem não tem vínculo com o caso
não sai da aplicação.

## Por que `excluir` não usa o ledger de idempotência

As outras mutações usam `operacao.requisicao` porque o resultado depende do pedido. A
exclusão não: o alvo é um estado terminal determinado pela linha. Repetir converge, e
precisa convergir também com uma chave nova — é exatamente isso que um botão "tentar
excluir novamente" faz depois de uma falha. Com o ledger, essa repetição legítima viraria
`conflito_idempotencia`.

A segurança da repetição vem da linha, não do recibo: a ação só toca o registro do próprio
autor, e `exclusao_estado = 'confirmada'` é terminal por trigger.

## Por que só o autor alcança o próprio áudio

O delta diz "o autor pode ouvir o original e corrigir o texto, respeitadas suas
permissões". A policy exige `criado_por_usuario_id = uid()` **além** do vínculo com o
caso: outro profissional vinculado ao mesmo paciente lê a ficha, mas não ouve a gravação
alheia. Voz é dado biométrico e o requisito não pede compartilhamento do original — pede
compartilhamento do texto revisado, que pertence ao registro do diário.

## Audiência: o que ficou para o diário

FR-010 diz "revisar texto e audiência antes de publicar". A audiência é propriedade do
registro publicado, não do áudio: o mesmo áudio pode virar um relato restrito ou um
compartilhado, e duplicar o conceito aqui criaria duas fontes para a mesma decisão. Este
componente entrega o texto revisado a quem o montou; a revisão de audiência acontece na
tela de publicação do diário (FR-008/012), em andamento em paralelo.

## Estado `falha` da exclusão

`exclusao_estado` admite `falha`, mas nesta fatia ele não é alcançável: o áudio vive na
mesma transação do banco, então a exclusão confirma ou a transação inteira volta atrás,
deixando o estado em `pendente`. Apresentar `pendente` é o comportamento que o requisito
exige ("não informa descarte concluído"); produzir um `falha` artificial seria encenar um
estado que o sistema não observou.

O valor fica no modelo porque a frente de documentos/Drive vai precisar dele: lá o
original mora num sistema que responde "não consegui", e aí `falha` é um fato, não uma
suposição.
