import { afterEach, describe, expect, it, vi } from 'vitest';
import { encerrarSessaoNativa } from './saida.ts';

const origem = 'https://app.example.test';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: origem,
};
const sessao = '33333333-3333-4333-8333-333333333333';
const usuario = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  app_metadata: { provider: 'google' },
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuario.id, exp })).toString('base64url')}.ZmFrZQ`;
const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: usuario })).toString('base64url')}`;

function pedido(alvo = sessao, origin = origem) {
  return new Request(`${origem}/api/sessao/sair`, {
    method: 'POST',
    headers: { cookie, origin, 'x-sessao': alvo, 'content-type': 'application/json' },
    body: '{}',
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('saída nativa com SDK real e transporte fictício', () => {
  it.each([
    { resultado: true, status: 200, pendencia: false },
    { resultado: false, status: 401 },
    { resultado: null, status: 503 },
    { resultado: true, status: 200, pendencia: true },
  ])(
    'fecha apenas após confirmação e não publica cookies: %j',
    async ({ resultado, status, pendencia }) => {
      const chamadas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(String(input)).pathname;
          chamadas.push(path);
          if (path === '/auth/v1/user') return Response.json(usuario);
          if (path === '/rest/v1/rpc/encerrar_sessao_nativa') {
            expect(JSON.parse(String(init?.body))).toEqual({
              p_session_id: sessao,
              p_request_id: expect.any(String),
            });
            return Response.json(resultado);
          }
          if (path === '/auth/v1/logout')
            return pendencia
              ? Response.json({ message: 'falha' }, { status: 500 })
              : new Response(null, { status: 204 });
          throw new Error(`Rota inesperada: ${path}`);
        }),
      );
      const resposta = await encerrarSessaoNativa(pedido(), fonte);
      expect(resposta.status).toBe(status);
      expect(resposta.headers.getSetCookie()).toEqual([]);
      if (status === 200)
        expect((await resposta.json()).dados).toEqual({
          encerrada_localmente: true,
          pendencia_externa: pendencia,
        });
      expect(chamadas.includes('/auth/v1/logout')).toBe(resultado === true);
    },
  );
  it('rejeita origem ou alvo inválido sem consultar fornecedor', async () => {
    const rede = vi.fn();
    vi.stubGlobal('fetch', rede);
    for (const request of [pedido(sessao, 'https://outra.test'), pedido('invalido')]) {
      const resposta = await encerrarSessaoNativa(request, fonte);
      expect(resposta.status).toBe(422);
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(rede).not.toHaveBeenCalled();
  });
  it.each([
    { upstream: 401, esperado: 401 },
    { upstream: 503, esperado: 503 },
  ])(
    'distingue credencial rejeitada de Auth indisponível: $upstream',
    async ({ upstream, esperado }) => {
      const rede = vi.fn(async () =>
        Response.json({ message: 'falha fictícia' }, { status: upstream }),
      );
      vi.stubGlobal('fetch', rede);
      const resposta = await encerrarSessaoNativa(pedido(), fonte);
      expect(resposta.status).toBe(esperado);
      expect(resposta.headers.getSetCookie()).toEqual([]);
      expect(rede).toHaveBeenCalledTimes(1);
    },
  );
  it('retorna 503 quando conexão Auth falha', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('rede fictícia');
      }),
    );
    const resposta = await encerrarSessaoNativa(pedido(), fonte);
    expect(resposta.status).toBe(503);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    vi.restoreAllMocks();
  });
});
