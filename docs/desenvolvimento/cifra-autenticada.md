# Cifra autenticada de campos

`supabase/functions/_shared/cifra-autenticada.ts` implementa a cifra de
persistência interna dos `CampoCifrado` aprovados nos contratos. A interface
`criarCifraAutenticada` recebe bytes de chaves já autorizados pelo chamador;
ela não lê variáveis de ambiente, Vault, banco, sessão ou HTTP.

## Invariantes

- Cada valor usa AES-256-GCM, nonce aleatório de 96 bits e tag de 128 bits.
- O AAD é a representação canônica de `tabela`, `registro_id`, `campo` e
  `formato`. Qualquer troca nesses metadados, no nonce, ciphertext ou tag
  impede a descriptografia.
- O envelope contém `formato` numérico (1), `key_id` textual e `nonce`,
  `ciphertext` e `tag` em base64url canônica. Ele não contém chave nem texto claro.
- A escrita usa a `keyIdAtiva`; a leitura seleciona a chave pelo `key_id`, de
  modo que uma chave anterior explicitamente fornecida continua legível na
  rotação.
- O HMAC SHA-256 usa bytes de chave independentes da chave AES e recebe um
  comando lógico canônico já validado pelo chamador. Seu resultado é
  base64url e é adequado para digests de igualdade/idempotência, não para
  substituir a cifra.
- Ausência de chave ativa, `key_id` desconhecido, envelope inválido ou falha
  de autenticação falham fechados; não há retorno de contingência em texto
  claro.

Autorização, emissão do atestado, obtenção das chaves no Vault, persistência e
projeção HTTP permanecem fora deste módulo e das responsabilidades desta
tarefa.

## Provisão, rotação e recuperação

As referências do Vault pertencem exclusivamente à configuração do runtime
confiável. Elas seguem o prefixo `ffcmapp.cifra.` e não entram em variáveis
expostas ao cliente, seeds, logs ou respostas HTTP. O adapter
`cofre-vault.ts` só aceita material base64 canônico de 32 bytes obtido pela
função interna do banco; ausência, referência inválida ou resposta inesperada
interrompem a operação sem revelar a causa.

A rotação é manual, versionada e requer checkpoint de revisão:

Uma nova chave ativa deve ter material AES distinto de todas as anteriores;
reutilizar material com outro `key_id` não constitui rotação e bloqueia novas
cifras. IDs históricos duplicados continuam disponíveis para decifração; uma
nova chave distinta permite voltar a gravar sem apagar esses IDs. A chave HMAC
deve ser distinta de todas as chaves AES. Antes de ativar em ambiente
persistente, conferir os IDs históricos e revisar a transição e a recuperação;
não remover chaves ou referências apenas para fazer a validação passar.
A comparação alcança apenas as chaves carregadas; se uma chave histórica for
omitida, não detecta reutilização de seu material. Verificar todas as versões
no processo de rotação. O `key_id` não é autenticado entre aliases que usam o
mesmo material; não usá-lo isoladamente como prova de qual versão cifrou.

1. Criar no Vault uma nova chave AES, mantendo as referências anteriores
   disponíveis e a chave HMAC existente independente da cifra.
2. Configurar o novo `key_id` como ativo no runtime, conservando as chaves AES
   anteriores para leitura. Não reutilizar a chave HMAC como chave AES.
3. Executar uma recriptografia autorizada e auditada: ler o envelope somente
   após autorização, decifrar com seu `key_id` anterior e gravar novo envelope
   com AAD idêntico e a chave ativa. Uma falha não confirma a gravação.
4. Conferir leitura de envelopes novos e antigos, contagem de pendências e
   evidência de auditoria. Só então agendar a remoção da referência antiga,
   após a janela de recuperação aprovada.

A rotação da chave HMAC requer procedimento próprio para recalcular os índices
de igualdade e preservar unicidade e consultas durante a transição. Esse
procedimento ainda não foi implementado nem aprovado; não trocar a chave HMAC
como efeito automático da rotação AES.

Um restore do banco só é recuperável se as referências e o material de chave
compatíveis ainda existirem no Vault. O Vault não torna backups de banco
autossuficientes, nem protege contra operador com poderes equivalentes de
banco. Se uma chave histórica não estiver disponível, a aplicação deve falhar
fechada; não há fallback para texto claro nem promessa de recuperação
automática.

Prova parcial em PostgreSQL descartável: um teste insere nome e contato
fictícios cifrados nas tabelas da migração, verifica ausência do texto nos
campos, lê com a chave anterior e atualiza nome e contato com chave nova.
Escritas parciais são revertidas manualmente após falha de chave e após erro
de restrição SQL; isso não prova rollback automático na futura operação. O teste usa acesso privilegiado e
chaves fictícias, e reverte toda a transação; não exercita RPC, Vault ou
autorização. Executar com `node --test scripts/test-saida-prova-experimento.mjs`:
esse runner cria um cluster descartável e chama o teste Vitest de persistência,
embora seu nome mencione saída de sessão.

Ainda falta a prova integrada da persistência: criar e recriptografar dados
fictícios em ambiente isolado, conferir que as colunas protegidas não contêm
texto claro e reverter a transação. Ela permanece pendente enquanto não houver
RPC protegida e um PostgreSQL aprovado disponível; não é inferida dos testes
puros desta biblioteca.
