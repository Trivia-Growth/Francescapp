# Validação local do ID token Google

`supabase/functions/_shared/identidade/google-id-token.ts` é o núcleo puro que
aceita uma chave pública já resolvida pelo servidor (`JWK` ou `CryptoKey`) e
valida um ID token OIDC sem fazer chamadas de rede. Ele aceita exclusivamente
`RS256`, os emissores oficiais `https://accounts.google.com` e
`accounts.google.com`, a audiência configurada, expiração e presença de `iat`, `nonce`,
`email_verified === true` e o claim `hd` exatamente igual ao domínio Workspace
configurado.

O retorno contém apenas a prova assinada (`subject`, e-mail e domínio). Não é
perfil, concessão, vínculo com paciente ou autorização. Em particular, o
e-mail nunca é aceito como autoridade por este módulo.

O adapter futuro deverá obter e rotacionar a chave Google no servidor, escolher
a chave pelo `kid` e injetá-la neste núcleo. O módulo não contém URL de JWKS,
`fetch`, segredo, token, log nem configuração de navegador.

Ficam pendentes nesta autoria pura: emissão e consumo atômico de desafio de
uso único, cookie HttpOnly com o nonce original, troca por
`signInWithIdToken` no Supabase, conferência de UUID/identidade retornados,
pré-concessão vigente, criação/revogação da sessão local e integração Google
real. Os testes usam somente chaves, domínio, audiência e pessoas fictícias;
eles não comprovam o provedor externo.
