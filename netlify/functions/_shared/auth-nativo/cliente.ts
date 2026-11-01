import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import {
  carregarConfiguracao,
  ErroConfiguracaoIndisponivel,
  type FonteDeConfiguracao,
} from '../../../../supabase/functions/_shared/configuracao.ts';

export function carregarConfiguracaoAuthNativo(fonte: FonteDeConfiguracao) {
  const cadastro = carregarConfiguracao('cadastro', fonte);
  let origem: URL;
  try {
    origem = new URL(fonte.FFCM_APP_ORIGIN ?? '');
  } catch {
    throw new ErroConfiguracaoIndisponivel();
  }
  const local = origem.hostname === 'localhost' || origem.hostname === '127.0.0.1';
  if (
    (origem.protocol !== 'https:' && !(local && origem.protocol === 'http:')) ||
    origem.username ||
    origem.password ||
    origem.pathname !== '/' ||
    origem.search ||
    origem.hash
  )
    throw new ErroConfiguracaoIndisponivel();
  return Object.freeze({ ...cadastro, origem: origem.origin, https: origem.protocol === 'https:' });
}

/** Um contexto por requisição. Auth/refresh são do SDK; autorização continua no banco.
 * O navegador usa somente a API first-party, nunca este cliente nem seus tokens. */
export function criarContextoAuthNativo(request: Request, fonte: FonteDeConfiguracao) {
  const config = carregarConfiguracaoAuthNativo(fonte);
  if (new URL(request.url).origin !== config.origem) throw new ErroConfiguracaoIndisponivel();
  const cookies = new Map(
    parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => [name, value]),
  );
  const alteracoes = new Map<string, string>();
  const cabecalhosSdk = new Headers();
  const cliente = createServerClient(config.supabaseUrl.href, config.chaveAnonSupabase, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false },
    cookieOptions: { httpOnly: true, secure: config.https, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll(novos, headers) {
        for (const [nome, valor] of Object.entries(headers)) cabecalhosSdk.set(nome, valor);
        for (const { name, value, options } of novos) {
          cookies.set(name, value);
          alteracoes.set(
            name,
            serializeCookieHeader(name, value, {
              ...options,
              httpOnly: true,
              secure: config.https,
              sameSite: 'lax',
              path: '/',
              domain: undefined,
            }),
          );
        }
      },
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(10_000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  });
  return {
    cliente,
    origem: config.origem,
    responder(resposta: Response): Response {
      const headers = new Headers(resposta.headers);
      cabecalhosSdk.forEach((valor, nome) => headers.set(nome, valor));
      for (const cookie of alteracoes.values()) headers.append('Set-Cookie', cookie);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      return new Response(resposta.body, {
        status: resposta.status,
        statusText: resposta.statusText,
        headers,
      });
    },
  };
}
