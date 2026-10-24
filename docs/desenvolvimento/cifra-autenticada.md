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
- O envelope contém somente `formato`, `key_id`, `nonce`, `ciphertext` e
  `tag`, todos em base64url canônica. Ele não contém chave nem texto claro.
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
