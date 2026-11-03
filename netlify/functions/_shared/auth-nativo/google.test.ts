import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCookieHeader } from '@supabase/ssr';
import { criarContextoAuthNativo } from './cliente.ts';
import { iniciarGoogleNativo } from './google.ts';

const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: 'https://app.example.test',
};
const pedido = (origin = fonte.FFCM_APP_ORIGIN) =>
  new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/google`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'fluxo=abcdefghijklmnopqrstuv',
  });

afterEach(() => vi.unstubAllGlobals());

describe('Google nativo: SDK real, sem chamadas a fornecedor', () => {
  it('gera PKCE nativo e callback fixo, com cookie HttpOnly e sem tokens no corpo', async () => {
    const rede = vi.fn(() => {
      throw new Error('Não deve consultar fornecedor ao iniciar OAuth.');
    });
    vi.stubGlobal('fetch', rede);
    const resposta = await iniciarGoogleNativo(pedido(), fonte);
    expect(resposta.status).toBe(303);
    const destino = new URL(resposta.headers.get('location') ?? '');
    expect(destino.origin).toBe(fonte.FFCM_SUPABASE_URL);
    expect(destino.pathname).toBe('/auth/v1/authorize');
    expect(destino.searchParams.get('provider')).toBe('google');
    expect(destino.searchParams.get('redirect_to')).toBe(
      `${fonte.FFCM_APP_ORIGIN}/api/auth/callback?fluxo=abcdefghijklmnopqrstuv`,
    );
    expect(destino.searchParams.get('code_challenge_method')).toBe('s256');
    expect(destino.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookies = resposta.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).toContain('code-verifier=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');
    }
    expect(resposta.headers.get('cache-control')).toBe('private, no-store');
    expect(resposta.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await resposta.text()).toBe('');
    expect(rede).not.toHaveBeenCalled();
  });

  it('isola o verifier por requisição, sem substituir a sessão ativa', async () => {
    const comSessao = pedido();
    comSessao.headers.set('cookie', 'sb-projeto-ficticio-auth-token=sessao-ficticia');
    const [primeira, segunda] = await Promise.all([
      iniciarGoogleNativo(comSessao, fonte),
      iniciarGoogleNativo(pedido(), fonte),
    ]);
    const cookieA = primeira.headers.getSetCookie()[0] ?? '';
    const cookieB = segunda.headers.getSetCookie()[0] ?? '';
    expect(cookieA).not.toBe(cookieB);
    expect(parseCookieHeader(cookieA.split(';')[0] ?? '')[0]?.name).toContain('code-verifier');
    // Os slots PKCE e seu índice pertencem ao SDK. Não congelar quantidade ou
    // nomes internos; isto não comprova concorrência de callback/refresh/logout.
    expect(primeira.headers.getSetCookie().every((valor) => valor.includes('code-verifier='))).toBe(
      true,
    );
  });

  it('separa cookies por tentativa e recusa formulários ambíguos', async () => {
    const primeiro = await iniciarGoogleNativo(pedido(), fonte);
    const segundoPedido = new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/google`, {
      method: 'POST',
      headers: {
        origin: fonte.FFCM_APP_ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'fluxo=zyxwvutsrqponmlkjihgfe',
    });
    const segundo = await iniciarGoogleNativo(segundoPedido, fonte);
    expect(primeiro.headers.getSetCookie()[0]).toContain('ffcm-auth-abcdefghijklmnopqrstuv');
    expect(segundo.headers.getSetCookie()[0]).toContain('ffcm-auth-zyxwvutsrqponmlkjihgfe');
    for (const body of [
      'fluxo=inválido',
      'fluxo=abcdefghijklmnopqrstuv&fluxo=zyxwvutsrqponmlkjihgfe',
      'fluxo=abcdefghijklmnopqrstuv&next=externo',
    ]) {
      const invalido = new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/google`, {
        method: 'POST',
        headers: {
          origin: fonte.FFCM_APP_ORIGIN,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      expect((await iniciarGoogleNativo(invalido, fonte)).status).toBe(422);
    }
  });

  it('recusa corpo excessivo durante leitura e falha de stream sem iniciar OAuth', async () => {
    let cancelado = false;
    const excessivo = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(129));
      },
      cancel() {
        cancelado = true;
      },
    });
    const quebrado = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('detalhe privado'));
      },
    });
    for (const body of [excessivo, quebrado]) {
      const request = new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/google`, {
        method: 'POST',
        headers: {
          origin: fonte.FFCM_APP_ORIGIN,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        duplex: 'half',
      } as RequestInit);
      const resposta = await iniciarGoogleNativo(request, fonte);
      expect(resposta.status).toBe(422);
      expect(await resposta.text()).not.toContain('detalhe privado');
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(cancelado).toBe(true);
  });

  it('nega origem externa/ausente e não escreve cookies nem inicia login', async () => {
    for (const origin of ['https://malicioso.example', '']) {
      const resposta = await iniciarGoogleNativo(pedido(origin), fonte);
      expect(resposta.status).toBe(403);
      expect(resposta.headers.getSetCookie()).toEqual([]);
      expect(resposta.headers.get('location')).toBeNull();
    }
  });

  it('nega retorno arbitrário, método errado e configuração ausente sem expor valores', async () => {
    for (const request of [
      new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/google`),
      new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/google?next=https://malicioso.example`, {
        method: 'POST',
      }),
    ])
      expect((await iniciarGoogleNativo(request, fonte)).status).toBe(422);
    const resposta = await iniciarGoogleNativo(pedido(), { ...fonte, FFCM_SUPABASE_ANON_KEY: '' });
    expect(resposta.status).toBe(503);
    const corpo = await resposta.text();
    expect(corpo).not.toContain('FFCM_');
    expect(corpo).not.toContain(fonte.FFCM_SUPABASE_URL);
  });

  it('recusa origem de implantação divergente e HTTP fora do loopback', () => {
    expect(() =>
      criarContextoAuthNativo(new Request('https://outro.example.test'), fonte),
    ).toThrow();
    expect(() =>
      criarContextoAuthNativo(new Request('http://app.example.test'), {
        ...fonte,
        FFCM_APP_ORIGIN: 'http://app.example.test',
      }),
    ).toThrow();
  });
});
