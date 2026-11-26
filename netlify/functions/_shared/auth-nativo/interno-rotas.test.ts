import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import auth from '../../auth.ts';
import { criarServicoConfirmacaoInterna } from '../../../../web/servico-acessos-http.ts';

const origem = 'https://app.example.test';
const fluxo = 'AAAAAAAAAAAAAAAAAAAAAA';
const id = '11111111-1111-4111-8111-111111111111';
const usuario = {
  id,
  aud: 'authenticated',
  app_metadata: {
    provider: 'email',
    ffcm_provisionamento_id: '22222222-2222-4222-8222-222222222222',
  },
  user_metadata: {},
  email: 'ficticio@example.test',
  email_confirmed_at: '2026-11-18T10:00:00Z',
};
const sessao = {
  session_id: '33333333-3333-4333-8333-333333333333',
  usuario: { id, perfil: 'familia', ativo: true, versao: 1 },
  capacidades: [],
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp })).toString('base64url')}.ZmFrZQ`;
beforeEach(() => {
  vi.stubEnv('FFCM_AUTH_ATIVADO', 'true');
  vi.stubEnv('FFCM_AUTH_INTERNO_ATIVADO', 'true');
  vi.stubEnv('FFCM_SUPABASE_URL', 'https://projeto-ficticio.supabase.co');
  vi.stubEnv('FFCM_SUPABASE_ANON_KEY', 'chave-publica-ficticia');
  vi.stubEnv('FFCM_APP_ORIGIN', origem);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function pedido(caminho: string, corpo: unknown) {
  return new Request(`${origem}${caminho}`, {
    method: 'POST',
    headers: { origin: origem, 'content-type': 'application/json', 'x-fluxo': fluxo },
    body: JSON.stringify(corpo),
  });
}
function fornecedor(metodo: 'interno' | 'google_workspace' = 'interno') {
  const identidade = {
    ...usuario,
    app_metadata: { ...usuario.app_metadata, provider: metodo === 'interno' ? 'email' : 'google' },
  };
  const rede = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/otp') {
      expect(JSON.parse(String(init?.body))).toMatchObject({ create_user: false });
      expect(JSON.parse(String(init?.body)).code_challenge).toBeNull();
      return Response.json({});
    }
    if (url.pathname === '/auth/v1/token' || url.pathname === '/auth/v1/verify')
      return Response.json({
        access_token: token,
        refresh_token: 'refresh-ficticio',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        user: identidade,
      });
    if (url.pathname === '/auth/v1/user') return Response.json(identidade);
    if (
      url.pathname === '/rest/v1/rpc/admitir_sessao_interna_nativa' ||
      url.pathname === '/rest/v1/rpc/consultar_sessao_nativa'
    )
      return Response.json(sessao);
    if (url.pathname === '/rest/v1/rpc/confirmar_email_acesso_interno_nativo')
      return Response.json({
        ok: true,
        usuario_id: id,
        request_id: JSON.parse(String(init?.body)).p_request_id,
      });
    if (url.pathname === '/rest/v1/rpc/admitir_sessao_nativa') return Response.json(null);
    if (url.pathname === '/rest/v1/rpc/materializar_acesso_familiar_nativa')
      return Response.json(false);
    if (url.pathname === '/rest/v1/rpc/admitir_sessao_familiar_nativa') return Response.json(null);
    throw new Error('Rota fictícia inesperada.');
  });
  vi.stubGlobal('fetch', rede);
  return rede;
}
it('SDK real usa password/admissão interna e cookie de fluxo distinto; familiar lê sessão geral', async () => {
  const rede = fornecedor();
  const resposta = await auth(
    pedido('/api/auth/interno', { email: usuario.email, senha: 'senha-ficticia' }),
  );
  expect(resposta.status).toBe(200);
  const cookies = resposta.headers.getSetCookie();
  expect(cookies.length).toBeGreaterThan(0);
  expect(cookies.every((cookie) => cookie.startsWith(`ffcm-auth-${fluxo}`))).toBe(true);
  const leitura = await auth(
    new Request(`${origem}/api/sessao`, {
      headers: {
        cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
        'x-fluxo': fluxo,
        'x-sessao': sessao.session_id,
      },
    }),
  );
  expect((await leitura.json()).dados.usuario.perfil).toBe('familia');
  expect(
    rede.mock.calls.some(([url]) => String(url).includes('admitir_sessao_interna_nativa')),
  ).toBe(true);
});
it('OTP numérico com SDK real não usa PKCE/cookies e nunca admite sessão de aplicação', async () => {
  const rede = fornecedor();
  const solicitacao = await auth(
    pedido('/api/auth/interno/confirmacao/solicitar', { email: usuario.email }),
  );
  expect(solicitacao.status).toBe(200);
  expect(solicitacao.headers.getSetCookie()).toEqual([]);
  const verificacao = await auth(
    pedido('/api/auth/interno/confirmacao/verificar', { email: usuario.email, codigo: '123456' }),
  );
  expect(verificacao.headers.getSetCookie()).toEqual([]);
  expect((await verificacao.json()).dados).toEqual({ recebido: true });
  expect(rede.mock.calls.some(([url]) => String(url).includes('admitir_sessao'))).toBe(false);
  expect(
    rede.mock.calls.some(([url]) => String(url).includes('confirmar_email_acesso_interno_nativo')),
  ).toBe(true);
});
it('flag interna desabilitada não pode ser contornada pela entrada técnica legada', async () => {
  const rede = fornecedor();
  vi.stubEnv('FFCM_AUTH_INTERNO_ATIVADO', 'false');
  vi.stubEnv('FFCM_AUTH_TECNICA_ATIVADO', 'true');
  expect(
    (await auth(pedido('/api/auth/interno', { email: usuario.email, senha: 'senha-ficticia' })))
      .status,
  ).toBe(503);
  expect(rede).not.toHaveBeenCalled();
  const legado = await auth(
    pedido('/api/auth/tecnica', { email: usuario.email, senha: 'senha-ficticia' }),
  );
  expect(legado.status).toBe(401);
  expect(legado.headers.getSetCookie()).toEqual([]);
  expect(
    rede.mock.calls.some(([url]) => String(url).includes('admitir_sessao_interna_nativa')),
  ).toBe(false);
});
it.each(['interno', 'google_workspace'] as const)(
  'conta gerenciada %s não entra pela rota familiar legada quando DB recusa método',
  async (metodo) => {
    const rede = fornecedor(metodo);
    vi.stubEnv('FFCM_AUTH_FAMILIAR_ATIVADO', 'true');
    vi.stubEnv('FFCM_AUTH_INTERNO_ATIVADO', 'false');
    const resposta = await auth(
      pedido('/api/auth/familiar', { email: usuario.email, senha: 'senha-ficticia' }),
    );
    expect(resposta.status).toBe(401);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(
      rede.mock.calls.some(([url]) => String(url).includes('admitir_sessao_familiar_nativa')),
    ).toBe(true);
    expect(
      rede.mock.calls.some(([url]) => String(url).includes('admitir_sessao_interna_nativa')),
    ).toBe(false);
  },
);
it('R-01: serviço web real atravessa entrypoint/parser OTP sem x-fluxo ou cookies', async () => {
  const transporteAuth = fornecedor();
  const respostas: Response[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('/api/auth/interno/confirmacao/')) {
      const headers = new Headers(init?.headers);
      expect(headers.has('x-fluxo')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      expect(init?.credentials).toBe('omit');
      // Origin é acrescentado pelo navegador em POST same-origin.
      headers.set('origin', origem);
      const resposta = await auth(
        new Request(new URL(String(input), origem), { ...init, headers }),
      );
      respostas.push(resposta);
      return resposta;
    }
    return transporteAuth(input, init);
  });
  const servico = criarServicoConfirmacaoInterna();
  await expect(servico.solicitar(usuario.email)).resolves.toBeUndefined();
  await expect(servico.verificar(usuario.email, '123456')).resolves.toBeUndefined();
  expect(respostas).toHaveLength(2);
  expect(
    respostas.every(
      (resposta) => resposta.status === 200 && resposta.headers.getSetCookie().length === 0,
    ),
  ).toBe(true);
});
