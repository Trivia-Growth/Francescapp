import { afterEach, expect, it, vi } from 'vitest';
import auth from '../../auth.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([undefined, '', 'false', 'TRUE'])(
  'bloqueia todas as rotas quando ativação explícita é %s',
  async (ativacao) => {
    vi.stubEnv('FFCM_AUTH_ATIVADO', ativacao);
    const rede = vi.fn();
    vi.stubGlobal('fetch', rede);
    for (const rota of [
      '/api/auth/google',
      '/api/auth/callback',
      '/api/sessao',
      '/.netlify/functions/auth',
    ]) {
      const resposta = await auth(new Request(`https://app.example.test${rota}`));
      expect(resposta.status).toBe(503);
      expect(resposta.headers.get('cache-control')).toBe('private, no-store');
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(rede).not.toHaveBeenCalled();
  },
);

it('encaminha saída à validação nativa mesmo com entrada desativada', async () => {
  vi.stubEnv('FFCM_AUTH_ATIVADO', 'false');
  const rede = vi.fn();
  vi.stubGlobal('fetch', rede);
  const resposta = await auth(new Request('https://app.example.test/api/sessao/sair'));
  expect(resposta.status).toBe(422);
  expect(resposta.headers.getSetCookie()).toEqual([]);
  expect(rede).not.toHaveBeenCalled();
});

it('encaminha saída válida à revogação local com entrada desativada', async () => {
  const origem = 'https://app.example.test';
  const sessao = '33333333-3333-4333-8333-333333333333';
  const usuario = {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    app_metadata: { provider: 'google' },
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuario.id, exp })).toString('base64url')}.ZmFrZQ`;
  const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: usuario })).toString('base64url')}`;
  vi.stubEnv('FFCM_AUTH_ATIVADO', 'false');
  vi.stubEnv('FFCM_SUPABASE_URL', 'https://projeto-ficticio.supabase.co');
  vi.stubEnv('FFCM_SUPABASE_ANON_KEY', 'chave-publica-ficticia');
  vi.stubEnv('FFCM_APP_ORIGIN', origem);
  const caminhos: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const caminho = new URL(String(input)).pathname;
      caminhos.push(caminho);
      if (caminho === '/auth/v1/user') return Response.json(usuario);
      if (caminho === '/rest/v1/rpc/encerrar_sessao_nativa') return Response.json(true);
      if (caminho === '/auth/v1/logout') return new Response(null, { status: 204 });
      throw new Error(`Rota inesperada: ${caminho}`);
    }),
  );
  const resposta = await auth(
    new Request(`${origem}/api/sessao/sair`, {
      method: 'POST',
      headers: { cookie, origin: origem, 'x-sessao': sessao, 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  expect(resposta.status).toBe(200);
  expect((await resposta.json()).dados).toEqual({
    encerrada_localmente: true,
    pendencia_externa: false,
  });
  expect(caminhos).toEqual([
    '/auth/v1/user',
    '/rest/v1/rpc/encerrar_sessao_nativa',
    '/auth/v1/logout',
  ]);
  expect(resposta.headers.getSetCookie()).toEqual([]);
});
