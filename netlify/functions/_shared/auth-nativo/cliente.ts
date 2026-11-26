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
  /**
   * Cookies de sessão já estabelecidos no navegador que pertencem a OUTRO fluxo.
   *
   * O nome do cookie carrega o fluxo (`ffcm-auth-<fluxo>`), então cada entrada bem-sucedida
   * grava um nome inédito e **nunca** sobrescreve o anterior. Sem expiração explícita eles
   * ficam 400 dias no navegador, somando cerca de 4,6 KB por entrada. Na quarta entrada o
   * cabeçalho `Cookie` passa do limite da plataforma e TODA requisição à origem — inclusive
   * a página estática — volta `HTTP 400` antes de chegar a esta função. O navegador fica
   * inutilizável para o aplicativo e não há como se recuperar de dentro dele: a limpeza tem
   * de ser manual, nas configurações do Chrome. Observado em 22/11/2026 com oito cookies
   * (18.920 bytes) em `ffcmapp.netlify.app`.
   *
   * O `-code-verifier` de outro fluxo é preservado: ele pertence a uma entrada ainda em
   * andamento, dura dez minutos e some sozinho. O cookie do próprio fluxo também fica de
   * fora, porque é o que está sendo gravado agora.
   */
  function sessoesDeOutrosFluxos(): string[] {
    const nomes: string[] = [];
    for (const nome of cookies.keys()) {
      const parte = /^ffcm-auth-([A-Za-z0-9_-]{22})(\.\d+)?$/.exec(nome);
      if (parte?.[1] && parte[1] !== fluxo) nomes.push(nome);
    }
    return nomes;
  }

  return {
    cliente,
    origem: config.origem,
    get cookiesAlterados(): boolean {
      return alteracoes.size > 0;
    },
    /**
     * Resposta de uma entrada recém-concluída: além dos cookies do SDK, expira as sessões
     * de fluxos anteriores deste navegador.
     *
     * Consequência deliberada: um navegador passa a guardar uma sessão por vez. Entrar de
     * novo numa segunda aba encerra a sessão da primeira *neste aparelho* — o registro no
     * banco não é afetado. Entradas concorrentes continuam intactas: o cookie de um fluxo
     * que ainda não terminou não está neste pedido, portanto não é alcançado aqui.
     */
    responderSessaoNova(resposta: Response): Response {
      const comCookies = this.responder(resposta);
      for (const nome of sessoesDeOutrosFluxos())
        comCookies.headers.append(
          'Set-Cookie',
          serializeCookieHeader(nome, '', {
            maxAge: 0,
            httpOnly: true,
            secure: config.https,
            sameSite: 'lax',
            path: '/',
          }),
        );
      return comCookies;
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
