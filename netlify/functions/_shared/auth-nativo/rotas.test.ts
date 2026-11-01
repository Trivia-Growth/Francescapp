import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import auth from '../../auth.ts';

const origem = 'https://app.example.test';
const usuarioId = '11111111-1111-4111-8111-111111111111';
const usuario = { id: usuarioId, aud: 'authenticated', app_metadata: { provider: 'google' } };
const autorizada = {
  session_id: '33333333-3333-4333-8333-333333333333',
  usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
  capacidades: ['consultar_pacientes_vinculados'],
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuarioId, exp })).toString('base64url')}.${Buffer.from('assinatura-ficticia').toString('base64url')}`;

beforeEach(() => {
  vi.stubEnv('FFCM_SUPABASE_URL', 'https://projeto-ficticio.supabase.co');
  vi.stubEnv('FFCM_SUPABASE_ANON_KEY', 'chave-publica-ficticia');
  vi.stubEnv('FFCM_APP_ORIGIN', origem);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function fornecedor() {
  let consulta: unknown = autorizada;
  let falha: 'usuario' | 'usuario_indisponivel' | 'banco' | undefined;
  const rede = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/token')
      return Response.json({
        access_token: accessToken,
        refresh_token: 'refresh-ficticio',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        user: usuario,
      });
    if (url.pathname === '/auth/v1/user') {
      if (falha === 'usuario') return Response.json({ message: 'inválido' }, { status: 401 });
      if (falha === 'usuario_indisponivel')
        return Response.json({ message: 'indisponível' }, { status: 503 });
      return Response.json(usuario);
    }
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${accessToken}`);
    expect(headers.get('content-profile')).toBe('api');
    expect(JSON.parse(String(init?.body))).toEqual({ p_request_id: expect.any(String) });
    if (url.pathname === '/rest/v1/rpc/admitir_sessao_nativa') return Response.json(autorizada);
    if (url.pathname === '/rest/v1/rpc/consultar_sessao_nativa') {
      if (falha === 'banco')
        return Response.json({ message: 'detalhe confidencial fictício' }, { status: 500 });
      return Response.json(consulta);
    }
    throw new Error('Transporte fictício recebeu rota inesperada.');
  });
  vi.stubGlobal('fetch', rede);
  return {
    rede,
    consultar: (valor: unknown) => {
      consulta = valor;
    },
    falhar: (valor: typeof falha) => {
      falha = valor;
    },
  };
}

async function entrar() {
  const inicio = await auth(
    new Request(`${origem}/api/auth/google`, {
      method: 'POST',
      headers: { origin: origem },
    }),
  );
  expect(inicio.status).toBe(303);
  const destino = new URL(inicio.headers.get('location') ?? '');
  const callback = new URL(destino.searchParams.get('redirect_to') ?? '');
  callback.searchParams.set('code', 'codigo-ficticio');
  const cookies = (resposta: Response) =>
    resposta.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  const resposta = await auth(new Request(callback, { headers: { cookie: cookies(inicio) } }));
  expect(resposta.status).toBe(303);
  return cookies(resposta);
}

describe('entrypoint Netlify com SDK Supabase real e HTTP fictício', () => {
  it('encadeia início, callback e consulta autorizada sem devolver credenciais', async () => {
    const transporte = fornecedor();
    const cookie = await entrar();
    transporte.rede.mockClear();
    const resposta = await auth(new Request(`${origem}/api/sessao`, { headers: { cookie } }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ dados: autorizada, request_id: expect.any(String) });
    expect(transporte.rede.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/auth/v1/user',
      '/rest/v1/rpc/consultar_sessao_nativa',
    ]);
    expect(resposta.headers.get('cache-control')).toBe('private, no-store');
    expect(resposta.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('não consulta banco quando falta sessão Auth ou identidade verificada', async () => {
    const transporte = fornecedor();
    expect((await auth(new Request(`${origem}/api/sessao`))).status).toBe(401);
    expect(transporte.rede).not.toHaveBeenCalled();
    const cookie = await entrar();
    transporte.rede.mockClear();
    transporte.falhar('usuario');
    const resposta = await auth(new Request(`${origem}/api/sessao`, { headers: { cookie } }));
    expect(resposta.status).toBe(401);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(transporte.rede).toHaveBeenCalledTimes(1);
  });

  it('retorna indisponibilidade quando Auth falha, sem consultar banco ou alterar cookies', async () => {
    const transporte = fornecedor();
    const cookie = await entrar();
    transporte.rede.mockClear();
    transporte.falhar('usuario_indisponivel');
    const resposta = await auth(new Request(`${origem}/api/sessao`, { headers: { cookie } }));
    expect(resposta.status).toBe(503);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(transporte.rede).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    { ...autorizada, usuario: { ...autorizada.usuario, ativo: false } },
    {
      ...autorizada,
      usuario: { ...autorizada.usuario, id: '22222222-2222-4222-8222-222222222222' },
    },
    { ...autorizada, access_token: 'campo-indevido' },
  ])(
    'não publica sessão/cookies quando banco nega ou devolve autoridade inválida: %j',
    async (consulta) => {
      const transporte = fornecedor();
      const cookie = await entrar();
      transporte.consultar(consulta);
      const resposta = await auth(new Request(`${origem}/api/sessao`, { headers: { cookie } }));
      expect(resposta.status).toBe(401);
      expect(resposta.headers.getSetCookie()).toEqual([]);
      expect((await resposta.json()).erro.codigo).toBe('nao_autenticado');
    },
  );

  it('falha fechada em erro RPC sem vazar erro interno ou publicar cookies', async () => {
    const transporte = fornecedor();
    const cookie = await entrar();
    transporte.falhar('banco');
    const resposta = await auth(new Request(`${origem}/api/sessao`, { headers: { cookie } }));
    expect(resposta.status).toBe(503);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(await resposta.text()).not.toMatch(/confidencial|refresh|access_token/);
  });

  it('não publica refresh de consulta antiga após novo login e exige novo acesso', async () => {
    const transporte = fornecedor();
    const expirada = Math.floor(Date.now() / 1000) - 60;
    const tokenAntigo = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuarioId, exp: expirada })).toString('base64url')}.ZmFrZQ`;
    const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: tokenAntigo, refresh_token: 'antigo-ficticio', token_type: 'bearer', expires_in: 3600, expires_at: expirada, user: usuario })).toString('base64url')}`;
    const resposta = await auth(new Request(`${origem}/api/sessao`, { headers: { cookie } }));
    expect(resposta.status).toBe(401);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect((await resposta.json()).erro.codigo).toBe('nao_autenticado');
    expect(transporte.rede.mock.calls.some(([url]) => String(url).includes('/auth/v1/token'))).toBe(
      true,
    );
  });

  it('nega consulta com alvo de outra sessão sem alterar cookies', async () => {
    fornecedor();
    const cookie = await entrar();
    const resposta = await auth(
      new Request(`${origem}/api/sessao`, {
        headers: { cookie, 'x-sessao': '44444444-4444-4444-8444-444444444444' },
      }),
    );
    expect(resposta.status).toBe(401);
    expect(resposta.headers.getSetCookie()).toEqual([]);
  });

  it('rejeita métodos, parâmetros e caminhos não publicados antes do SDK', async () => {
    const transporte = fornecedor();
    for (const request of [
      new Request(`${origem}/api/sessao`, { method: 'POST' }),
      new Request(`${origem}/api/sessao?perfil=administrador`),
      new Request(`${origem}/api/auth/google`),
      new Request(`${origem}/api/auth/callback`, { method: 'POST' }),
    ])
      expect((await auth(request)).status).toBe(422);
    for (const caminho of [
      '/api/sessao/renovar',
      '/api/auth/google/',
      '/.netlify/functions/auth',
    ]) {
      const resposta = await auth(new Request(`${origem}${caminho}`));
      expect(resposta.status).toBe(404);
      expect(resposta.headers.get('cache-control')).toBe('private, no-store');
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(transporte.rede).not.toHaveBeenCalled();
  });
});
