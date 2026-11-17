import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import {
  carregarConfiguracao,
  ErroConfiguracaoIndisponivel,
  type FonteDeConfiguracao,
} from '../../../../supabase/functions/_shared/configuracao.ts';

/** Só rejeições de credenciais são 401; falhas desconhecidas permanecem indisponíveis. */
export function credencialAuthRejeitada(erro: { name: string; status?: number }): boolean {
  return (
    erro.name === 'AuthSessionMissingError' ||
    (erro.name === 'AuthApiError' && [400, 401, 403].includes(erro.status ?? 0))
  );
}

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

export function fluxoValido(fluxo: string | null): fluxo is string {
  return fluxo !== null && /^[A-Za-z0-9_-]{22}$/.test(fluxo);
}

/** Expira somente os verificadores PKCE da própria tentativa encerrada, para que
 * uma tentativa abandonada não ocupe o cabeçalho até o prazo de dez minutos.
 *
 * Alcance deliberadamente estreito: o cookie de sessão também se chama
 * `ffcm-auth-<fluxo>`, então apagar por prefixo permitiria encerrar a sessão de
 * alguém com um GET forjado ao callback usando um fluxo já conhecido. Só nomes
 * com sufixo de verificador são expirados; sessão, seus pedaços e outros fluxos
 * nunca são tocados. Chamar apenas com `fluxo` já validado desta requisição. */
export function cookiesDeLimpezaDaTentativa(
  request: Request,
  fonte: FonteDeConfiguracao,
  fluxo: string,
): string[] {
  if (!fluxoValido(fluxo)) return [];
  let https: boolean;
  try {
    https = carregarConfiguracaoAuthNativo(fonte).https;
  } catch {
    return [];
  }
  const verificador = new RegExp(`^ffcm-auth-${fluxo}(?:-.*)?-code-verifier(?:\\.\\d+)?$`);
  const nomes = new Set<string>();
  for (const { name } of parseCookieHeader(request.headers.get('cookie') ?? '')) {
    if (verificador.test(name)) nomes.add(name);
  }
  return Array.from(nomes, (name) =>
    serializeCookieHeader(name, '', {
      maxAge: 0,
      httpOnly: true,
      secure: https,
      sameSite: 'lax',
      path: '/',
      domain: undefined,
    }),
  );
}

/** Um contexto por requisição. Auth/refresh são do SDK; autorização continua no banco.
 * O navegador usa somente a API first-party, nunca este cliente nem seus tokens. */
export function criarContextoAuthNativo(
  request: Request,
  fonte: FonteDeConfiguracao,
  fluxoCallback?: string,
) {
  const fluxo = fluxoCallback ?? request.headers.get('x-fluxo');
  if (fluxo !== null && !fluxoValido(fluxo)) throw new ErroConfiguracaoIndisponivel();
  const config = carregarConfiguracaoAuthNativo(fonte);
  if (new URL(request.url).origin !== config.origem) throw new ErroConfiguracaoIndisponivel();
  const cookies = new Map(
    parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => [name, value]),
  );
  const alteracoes = new Map<string, string>();
  const cabecalhosSdk = new Headers();
  const cliente = createServerClient(config.supabaseUrl.href, config.chaveAnonSupabase, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false },
    cookieOptions: {
      ...(fluxo ? { name: `ffcm-auth-${fluxo}` } : {}),
      httpOnly: true,
      secure: config.https,
      sameSite: 'lax',
      path: '/',
    },
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll(novos, headers) {
        for (const [nome, valor] of Object.entries(headers)) cabecalhosSdk.set(nome, valor);
        for (const { name, value, options } of novos) {
          cookies.set(name, value);
          // Tentativas abandonadas não devem ocupar cookies por 400 dias.
          // Exclusões e cookies de sessão conservam a política do SDK.
          const verifier =
            fluxo &&
            name.startsWith(`ffcm-auth-${fluxo}`) &&
            /-code-verifier(?:\.\d+)?$/.test(name);
          alteracoes.set(
            name,
            serializeCookieHeader(name, value, {
              ...options,
              ...(verifier && options.maxAge !== 0 ? { maxAge: 600 } : {}),
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
    get cookiesAlterados(): boolean {
      return alteracoes.size > 0;
    },
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
