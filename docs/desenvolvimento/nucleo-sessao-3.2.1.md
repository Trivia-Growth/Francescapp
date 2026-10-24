# Núcleo de sessão — tarefa 3.2.1

## Escopo e seam

`supabase/functions/_shared/sessao/nucleo.ts` oferece o núcleo puro de
transporte da sessão, sem rota HTTP executável. Seus seams públicos são:

- `criarCodecDeCookiesSessao`, que recebe a chave de selagem já validada pela
  configuração 1.3 e cria/abre cookies autenticados;
- `verificarProtecaoDeComando`, que recebe `Origin`, `x-csrf`, o cookie CSRF e
  as origens permitidas já carregadas pela configuração;
- `validarJwtDeSessao`, que recebe issuer, audience, algoritmos permitidos e
  chave de verificação por injeção;
- `admitirSessaoNoServidor`, que só entrega `usuario_id`, `session_id` e
  método comprovados ao adapter server-side.

O núcleo não lê ambiente, não cria clientes Supabase, não chama Google, não
acessa banco/RPC e não declara endpoint. Também não registra token, cookie ou
conteúdo de sessão. Isso é deliberado: nenhum fake de adapter representa
autorização ou integração externa.

## Transporte e cookies

Refresh e CSRF são selados com AES-GCM e AAD vinculado ao nome do cookie. Os
cookies `ffcm_refresh` e `ffcm_csrf` usam `HttpOnly`, `SameSite=Lax`, caminho
`/api/sessao` e não possuem `Domain`. Em HTTPS recebem `Secure`; a única
exceção é `transporte: 'http-local'`, que deve ser selecionada explicitamente
no adaptador de desenvolvimento local. A limpeza preserva nome e caminho e
envia `Max-Age=0`.

O token CSRF aleatório é devolvido para memória pelo handler futuro, enquanto
o valor de comparação permanece no cookie selado HttpOnly. Todo comando que
usa cookie deve exigir origem exata configurada e `x-csrf`; o comparador percorre
o limite inteiro aceito antes de decidir. `SameSite` e origem são defesas
adicionais, não substitutos do CSRF.

Nenhum valor de refresh entra em `localStorage`, `sessionStorage`, URL ou
registro. A camada HTTP futura deve preservar cada `Set-Cookie` separadamente,
usar resposta `no-store` para entrada/refresh e manter access token somente em
memória, como definido no contrato S-01.

## JWT e admissão

O núcleo usa `jose` para verificar criptograficamente JWTs. Não há decodificação
aceita como validação. A configuração injetada precisa fornecer issuer,
audience, lista não vazia de algoritmos sem `none` e chave. Além da assinatura,
o JWT deve ter `exp`, `sub` UUID e `session_id` UUID. Issuer/audience/algoritmo
divergentes e claims ausentes são negados pela mesma falha sanitizada.

O seam de admissão não aceita `perfil`, concessão, vínculo, `ativo` nem
`usuario_id` vindo do corpo HTTP. Após validar o JWT, só encaminha os UUIDs
extraídos e o método fixado pela rota server-side ao `AdaptadorDeAdmissaoSessao`.
A tarefa 3.2.2 deve conectar esse adapter à RPC interna auditada e conferir a
autoridade local vigente; até lá, este módulo não prova admissão, revogação,
RLS ou autorização no banco.

## Verificação local

```bash
pnpm exec vitest run supabase/functions/_shared/sessao/nucleo.test.ts
pnpm run typecheck:funcoes
```

Os testes usam chaves, UUIDs e tokens inteiramente fictícios. Eles cobrem
cookie selado/atributos, origem e CSRF positivos e negativos, issuer/audience/
algoritmo divergentes, `session_id` ausente e o objeto de admissão sem perfil.
Não constituem prova de uma Edge Function Deno, de Supabase Auth, Google ou
banco real; essa integração continua explicitamente pendente.
