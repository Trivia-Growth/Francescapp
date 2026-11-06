import { parseCookieHeader } from '@supabase/ssr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { concluirGoogleNativo } from './callback.ts';
import { iniciarGoogleNativo } from './google.ts';

const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: 'https://app.example.test',
};
const usuarioId = '11111111-1111-4111-8111-111111111111';
const outraId = '22222222-2222-4222-8222-222222222222';
const usuario = { id: usuarioId, aud: 'authenticated', app_metadata: { provider: 'google' } };
const autorizada = {
  session_id: '33333333-3333-4333-8333-333333333333',
  usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
  capacidades: ['consultar_pacientes_vinculados'],
};
const jwt = (exp: number) =>
  `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
    JSON.stringify({ sub: usuarioId, exp }),
  ).toString('base64url')}.${Buffer.from('assinatura-ficticia').toString('base64url')}`;

async function callback() {
  const inicio = await iniciarGoogleNativo(
    new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/google`, {
      method: 'POST',
      headers: {
        origin: fonte.FFCM_APP_ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'fluxo=abcdefghijklmnopqrstuv',
    }),
    fonte,
  );
  const destino = new URL(inicio.headers.get('location') ?? '');
  const url = new URL(destino.searchParams.get('redirect_to') ?? '');
  url.searchParams.set('code', 'codigo-ficticio-unico');
  const cookie = inicio.headers
    .getSetCookie()
    .map((valor) => valor.split(';')[0])
    .join('; ');
  return new Request(url, { headers: { cookie } });
}

function fornecedor(
  opcoes: {
    admissao?: unknown;
    falha?: 'troca' | 'usuario' | 'banco' | 'normalizacao' | 'rede';
    expirada?: boolean;
  } = {},
) {
  const exp = Math.floor(Date.now() / 1000) + (opcoes.expirada ? -10 : 3600);
  const accessToken = jwt(exp);
  let usuarios = 0;
  const rede = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (opcoes.falha === 'rede') throw new Error('falha ficticia sem segredo');
    if (url.pathname === '/auth/v1/token') {
      expect(url.searchParams.get('grant_type')).toBe('pkce');
      expect(JSON.parse(String(init?.body))).toMatchObject({ auth_code: 'codigo-ficticio-unico' });
      if (opcoes.falha === 'troca')
        return Response.json({ message: 'invalid code' }, { status: 400 });
      return Response.json({
        access_token: accessToken,
        refresh_token: 'refresh-auth-ficticio',
        token_type: 'bearer',
        expires_in: opcoes.expirada ? -10 : 3600,
        expires_at: exp,
        provider_token: 'google-access-ficticio',
        provider_refresh_token: 'google-refresh-ficticio',
        user: usuario,
      });
    }
    if (url.pathname === '/auth/v1/user') {
      usuarios++;
      if (opcoes.falha === 'usuario' || (opcoes.falha === 'normalizacao' && usuarios === 2))
        return Response.json({ message: 'invalid user' }, { status: 401 });
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${accessToken}`);
      return Response.json(usuario);
    }
    if (url.pathname === '/rest/v1/rpc/admitir_sessao_nativa') {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${accessToken}`);
      expect(headers.get('content-profile')).toBe('api');
      expect(JSON.parse(String(init?.body))).toEqual({ p_request_id: expect.any(String) });
      if (opcoes.falha === 'banco')
        return Response.json({ message: 'falha interna ficticia' }, { status: 500 });
      return Response.json(opcoes.admissao === undefined ? autorizada : opcoes.admissao);
    }
    throw new Error(`Rota ficticia inesperada: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', rede);
  return rede;
}

afterEach(() => vi.unstubAllGlobals());

describe('callback nativo com SDK real e transporte HTTP fictício', () => {
  it('publica somente sessão Auth autorizada, nunca tokens Google, com retorno fixo', async () => {
    const pedido = await callback();
    const rede = fornecedor();
    const resposta = await concluirGoogleNativo(pedido, fonte);
    expect(resposta.status).toBe(303);
    expect(resposta.headers.get('location')).toBe('/?fluxo=abcdefghijklmnopqrstuv#');
    expect(new URL('/#', `${pedido.url}#segredo`).href).toBe(`${fonte.FFCM_APP_ORIGIN}/#`);
    expect(await resposta.text()).toBe('');
    expect(resposta.headers.get('cache-control')).toBe('private, no-store');
    expect(resposta.headers.get('referrer-policy')).toBe('no-referrer');
    const cookies = resposta.headers.getSetCookie();
    const partes = cookies
      .flatMap((cookie) => parseCookieHeader(cookie.split(';')[0] ?? ''))
      .filter(
        ({ name, value }) =>
          name.startsWith('ffcm-auth-abcdefghijklmnopqrstuv') &&
          !name.includes('code-verifier') &&
          value,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(partes.length).toBeGreaterThan(0);
    const codificado = partes.map(({ value }) => value).join('');
    expect(codificado.startsWith('base64-')).toBe(true);
    const sessao = JSON.parse(Buffer.from(codificado.slice(7), 'base64url').toString());
    expect(sessao.refresh_token).toBe('refresh-auth-ficticio');
    expect(sessao).not.toHaveProperty('provider_token');
    expect(sessao).not.toHaveProperty('provider_refresh_token');
    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Domain=');
    }
    expect(rede).toHaveBeenCalledTimes(4);
  });

  it.each([
    { admissao: null },
    { admissao: { ...autorizada, usuario: { ...autorizada.usuario, id: outraId } } },
    { admissao: { ...autorizada, usuario: { ...autorizada.usuario, ativo: false } } },
    { admissao: { ...autorizada, access_token: 'campo-indevido' } },
  ])('não publica sessão sem admissão válida e vinculada à identidade: %j', async (opcoes) => {
    const pedido = await callback();
    fornecedor(opcoes);
    const resposta = await concluirGoogleNativo(pedido, fonte);
    expect(resposta.status).toBe(303);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(resposta.headers.get('location')).toBe('/?acesso=indisponivel#');
  });

  it.each(['troca', 'usuario', 'banco', 'normalizacao', 'rede'] as const)(
    'preserva cookies anteriores quando falha %s, sem signOut ou tokens na resposta',
    async (falha) => {
      const pedido = await callback();
      pedido.headers.append('cookie', '; sb-projeto-ficticio-auth-token=sessao-anterior-ficticia');
      const rede = fornecedor({ falha });
      const resposta = await concluirGoogleNativo(pedido, fonte);
      expect(resposta.status).toBe(303);
      expect(resposta.headers.getSetCookie()).toEqual([]);
      expect(resposta.headers.get('location')).toBe('/?acesso=indisponivel#');
      const corpo = await resposta.text();
      expect(corpo).not.toMatch(/refresh|google-|access_token|falha interna/);
      expect(rede.mock.calls.some(([url]) => String(url).includes('/logout'))).toBe(false);
    },
  );

  it('rejeita slot PKCE ausente sem pegar verifier de outro fluxo', async () => {
    const pedido = await callback();
    const url = new URL(pedido.url);
    url.searchParams.set('sb_flow_id', 'outro-fluxo-inexistente');
    const rede = fornecedor();
    const resposta = await concluirGoogleNativo(new Request(url, pedido), fonte);
    expect(resposta.status).toBe(303);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(rede).not.toHaveBeenCalled();
  });

  it('retorna à tela de acesso quando o provedor informa erro, sem refletir detalhes', async () => {
    const rede = fornecedor();
    const resposta = await concluirGoogleNativo(
      new Request(
        `${fonte.FFCM_APP_ORIGIN}/api/auth/callback?fluxo=abcdefghijklmnopqrstuv&error=access_denied&error_code=cancelado&error_description=detalhe-privado`,
      ),
      fonte,
    );
    expect(resposta.status).toBe(303);
    expect(resposta.headers.get('location')).toBe('/?acesso=indisponivel#');
    expect(
      new URL(
        resposta.headers.get('location') ?? '',
        `${fonte.FFCM_APP_ORIGIN}/api/auth/callback?fluxo=abcdefghijklmnopqrstuv&error=access_denied#segredo`,
      ).href,
    ).toBe(`${fonte.FFCM_APP_ORIGIN}/?acesso=indisponivel#`);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(await resposta.text()).toBe('');
    expect(rede).not.toHaveBeenCalled();
  });

  it('retorna cancelamento em fragmento sem herdar conteúdo externo ou alterar cookies', async () => {
    const rede = fornecedor();
    const resposta = await concluirGoogleNativo(
      new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/callback`),
      fonte,
    );
    const destino = resposta.headers.get('location') ?? '';
    expect(resposta.status).toBe(303);
    expect(destino).toBe('/?acesso=indisponivel#');
    expect(new URL(destino, `${fonte.FFCM_APP_ORIGIN}/api/auth/callback#segredo`).href).toBe(
      `${fonte.FFCM_APP_ORIGIN}/?acesso=indisponivel#`,
    );
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(await resposta.text()).toBe('');
    expect(rede).not.toHaveBeenCalled();
  });

  it('rejeita parâmetros ambíguos, redirecionamentos e métodos sem consultar fornecedor', async () => {
    const rede = fornecedor();
    for (const sufixo of [
      '?',
      '?code=',
      '?code=a&code=b',
      '?code=a&next=https://malicioso.test',
      '?code=a&sb_flow_id=',
      '?code=a&sb_flow_id=valido123&sb_flow_id=outro123',
      '?error=access_denied&error=outro',
      '?error=access_denied&code=a',
      '?error=access_denied&next=https://malicioso.test',
      '?error=&error_description=cancelado',
    ]) {
      const resposta = await concluirGoogleNativo(
        new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/callback${sufixo}`),
        fonte,
      );
      expect(resposta.status).toBe(422);
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(
      (
        await concluirGoogleNativo(
          new Request(`${fonte.FFCM_APP_ORIGIN}/api/auth/callback?code=a`, { method: 'POST' }),
          fonte,
        )
      ).status,
    ).toBe(422);
    expect(rede).not.toHaveBeenCalled();
  });
});
