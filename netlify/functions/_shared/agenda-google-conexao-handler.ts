import type { criarCookieAgenda } from './agenda-google-cookie.ts';
import {
  ErroRefreshGoogleAusente,
  iniciarConsentimentoAgenda,
  trocarCodigoAgenda,
  type ConfiguracaoOAuthAgenda,
} from '../../../supabase/functions/_shared/agenda-google-oauth.ts';
import type { ConfiguracaoValidacaoIdTokenGoogle } from '../../../supabase/functions/_shared/identidade/google-id-token.ts';
import type { criarStateAgenda } from '../../../supabase/functions/_shared/agenda-google-state.ts';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;
type State = ReturnType<typeof criarStateAgenda>;
type Portas = Readonly<{
  autorizar(request: Request): Promise<Identidade | null>;
  state: State;
  cookie: ReturnType<typeof criarCookieAgenda>;
  oauth: ConfiguracaoOAuthAgenda;
  validacao(nonce: string): ConfiguracaoValidacaoIdTokenGoogle;
  salvar(refresh: string, geracao: string, identidade: Identidade): Promise<void>;
  origem: string;
  retorno: string;
}>;

/** Composição server-only. Salvar exige executor confiável e verificação transacional da geração. */
export async function processarConexaoAgenda(request: Request, portas: Portas): Promise<Response> {
  const headers = {
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
  const indisponivel = () => new Response(null, { status: 503, headers });
  try {
    const url = new URL(request.url);
    if (url.origin !== portas.origem) return indisponivel();
    let pedidoAutorizado = request;
    if (url.pathname === '/api/agenda/google/callback' && request.method === 'GET') {
      if (url.searchParams.getAll('state').length !== 1) return indisponivel();
      const state = url.searchParams.get('state');
      if (!state) return indisponivel();
      const vinculo = await portas.cookie.abrir(request.headers.get('cookie') ?? '', state);
      const novosHeaders = new Headers(request.headers);
      novosHeaders.set('x-sessao', vinculo.sessaoId);
      if (vinculo.fluxo) novosHeaders.set('x-fluxo', vinculo.fluxo);
      else novosHeaders.delete('x-fluxo');
      pedidoAutorizado = new Request(request, { headers: novosHeaders });
    }
    const identidade = await portas.autorizar(pedidoAutorizado);
    if (!identidade) return new Response(null, { status: 401, headers });
    if (
      url.pathname === '/api/agenda/google/conectar' &&
      request.method === 'POST' &&
      !url.search &&
      request.headers.get('origin') === portas.origem
    ) {
      const consentimento = await iniciarConsentimentoAgenda(portas.oauth);
      await portas.state.registrar({
        ...consentimento,
        usuarioId: identidade.usuarioId,
        sessaoId: identidade.sessaoId,
      });
      const cookie = await portas.cookie.emitir(
        consentimento.state,
        identidade.sessaoId,
        request.headers.get('x-fluxo'),
      );
      return Response.json(
        { url: consentimento.url },
        { headers: { ...headers, 'Set-Cookie': cookie } },
      );
    }
    if (url.pathname !== '/api/agenda/google/callback' || request.method !== 'GET')
      return indisponivel();
    if (
      [...url.searchParams.keys()].some(
        (chave) => !['state', 'code', 'scope', 'authuser', 'prompt'].includes(chave),
      ) ||
      url.searchParams.getAll('state').length !== 1 ||
      url.searchParams.getAll('code').length !== 1
    )
      return indisponivel();
    const state = url.searchParams.get('state');
    const codigo = url.searchParams.get('code');
    if (!state || !codigo) return indisponivel();
    const desafio = await portas.state.consumir({
      state,
      usuarioId: identidade.usuarioId,
      sessaoId: identidade.sessaoId,
    });
    const tokens = await trocarCodigoAgenda(
      portas.oauth,
      codigo,
      desafio.verificador,
      portas.validacao(desafio.nonce),
      identidade.subjectGoogle,
    );
    const atual = await portas.autorizar(pedidoAutorizado);
    if (
      !atual ||
      atual.usuarioId !== identidade.usuarioId ||
      atual.sessaoId !== identidade.sessaoId ||
      atual.subjectGoogle !== identidade.subjectGoogle
    )
      return indisponivel();
    await portas.salvar(tokens.refreshToken, desafio.geracao, atual);
    const retorno = new URL(portas.retorno, portas.origem);
    if (retorno.origin !== portas.origem || retorno.username || retorno.password)
      return indisponivel();
    return new Response(null, {
      status: 303,
      headers: { ...headers, Location: retorno.toString(), 'Set-Cookie': portas.cookie.limpar() },
    });
  } catch (erro) {
    if (erro instanceof ErroRefreshGoogleAusente) {
      const retorno = new URL(portas.retorno, portas.origem);
      if (retorno.origin !== portas.origem || retorno.username || retorno.password)
        return indisponivel();
      retorno.searchParams.set('agenda', 'autorizar-novamente');
      return new Response(null, {
        status: 303,
        headers: { ...headers, Location: retorno.toString(), 'Set-Cookie': portas.cookie.limpar() },
      });
    }
    return indisponivel();
  }
}
