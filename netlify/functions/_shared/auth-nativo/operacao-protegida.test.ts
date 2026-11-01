import { afterEach, describe, expect, it, vi } from 'vitest';
import { autorizarOperacaoNativa } from './operacao-protegida.ts';

const origem = 'https://app.example.test';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: origem,
};
const usuario = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  app_metadata: { provider: 'google' },
};
const sessao = {
  session_id: '33333333-3333-4333-8333-333333333333',
  usuario: { id: usuario.id, perfil: 'profissional', ativo: true, versao: 1 },
  capacidades: ['consultar_pacientes_vinculados'],
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuario.id, exp })).toString('base64url')}.ZmFrZQ`;
const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: usuario })).toString('base64url')}`;
const pedido = (headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`${origem}/api/pacientes`, {
    method,
    headers: {
      cookie,
      origin: origem,
      'content-type': 'application/json',
      'x-sessao': sessao.session_id,
      ...headers,
    },
  });
afterEach(() => vi.unstubAllGlobals());

describe('autorização nativa de operação com transporte fictício', () => {
  it('valida usuário e sessão e disponibiliza cliente apenas ao servidor', async () => {
    const rede = vi.fn(async (input: RequestInfo | URL) =>
      new URL(String(input)).pathname === '/auth/v1/user'
        ? Response.json(usuario)
        : Response.json(sessao),
    );
    vi.stubGlobal('fetch', rede);
    const resultado = await autorizarOperacaoNativa(pedido(), fonte);
    expect(resultado.estado).toBe('autorizado');
    if (resultado.estado === 'autorizado') expect(resultado.sessao).toEqual(sessao);
    expect(rede).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['origin', 'https://outra.test'],
    ['content-type', 'text/plain'],
    ['x-sessao', ''],
  ])('rejeita entrada inválida antes da rede: %j', async (nome, valor) => {
    const rede = vi.fn();
    vi.stubGlobal('fetch', rede);
    expect((await autorizarOperacaoNativa(pedido({ [nome]: valor }), fonte)).estado).toBe(
      'entrada_invalida',
    );
    expect(rede).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...sessao, session_id: '44444444-4444-4444-8444-444444444444' },
    { ...sessao, usuario: { ...sessao.usuario, ativo: false } },
    { ...sessao, usuario: { ...sessao.usuario, id: '22222222-2222-4222-8222-222222222222' } },
    { ...sessao, token: 'indevido' },
  ])('nega sessão inválida: %j', async (dados) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        new URL(String(input)).pathname === '/auth/v1/user'
          ? Response.json(usuario)
          : Response.json(dados),
      ),
    );
    expect((await autorizarOperacaoNativa(pedido(), fonte)).estado).toBe('nao_autenticado');
  });
  it('falha fechada quando RPC está indisponível', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        new URL(String(input)).pathname === '/auth/v1/user'
          ? Response.json(usuario)
          : Response.json({ message: 'privado' }, { status: 500 }),
      ),
    );
    expect(await autorizarOperacaoNativa(pedido(), fonte)).toEqual({
      estado: 'servico_indisponivel',
    });
  });
  it.each([
    { status: 401, estado: 'nao_autenticado' },
    { status: 500, estado: 'servico_indisponivel' },
    { status: 0, estado: 'servico_indisponivel' },
  ])('classifica erro do Auth: $status', async ({ status, estado }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (status === 0) throw new TypeError('falha de rede');
        return Response.json({ message: 'falha fictícia' }, { status });
      }),
    );
    expect((await autorizarOperacaoNativa(pedido(), fonte)).estado).toBe(estado);
  });
});
