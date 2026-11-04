import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { executarAnamneseNativa } from './executor-anamnese-nativo.ts';

const origem = 'https://app.example.test';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: origem,
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'a0000000-0000-4000-8000-000000000001', exp })).toString('base64url')}.ZmFrZQ`;
const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: 'a0000000-0000-4000-8000-000000000001' } })).toString('base64url')}`;
const request = new Request(`${origem}/api/anamnese`, { headers: { cookie } });
const transporte = {
  p_transporte: {
    entrada: { request_id: 'ficticio' },
    entrada_canonica: '{}',
    dados_canonicos: '{}',
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('executor nativo de anamnese', () => {
  it('encaminha transporte e JWT da requisição à RPC privada', async () => {
    const resposta = { ok: false, erro: { codigo: 'conflito' } };
    const rede = vi.fn(async () => Response.json(resposta));
    vi.stubGlobal('fetch', rede);
    expect(
      await executarAnamneseNativa(criarContextoAuthNativo(request, fonte).cliente, transporte),
    ).toEqual(resposta);
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/rest/v1/rpc/anamnese_privada');
    expect(new Headers(init.headers).get('content-profile')).toBe('api');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init.body))).toEqual(transporte);
  });

  it('falha fechada sem expor detalhes de erro da RPC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'detalhe privado' }, { status: 403 })),
    );
    await expect(
      executarAnamneseNativa(criarContextoAuthNativo(request, fonte).cliente, transporte),
    ).rejects.toThrow(/^Não foi possível executar a anamnese\.$/);
  });
});
