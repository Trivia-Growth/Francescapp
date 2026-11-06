import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { prepararBarreiraNativa } from './barreira-nativa.ts';
import { executarBarreiraNativa } from './executor-barreira-nativo.ts';

const origem = 'https://app.example.test';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: origem,
};
const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
};
const metadados = {
  key_id: 'teste',
  request_id: 'c0000000-0000-4000-8000-000000000003',
  emitido_em: '2026-10-29T12:00:00Z',
  expira_em: '2026-10-29T12:00:20Z',
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: identidade.usuario_id, exp })).toString('base64url')}.ZmFrZQ`;
const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: identidade.usuario_id } })).toString('base64url')}`;
const request = new Request(`${origem}/api/cadastro/barreira`, {
  headers: { cookie, 'x-sessao': identidade.session_id },
});
async function entrada() {
  return prepararBarreiraNativa(
    request,
    identidade,
    { operacao: 'api.consultar_barreira_cadastro' },
    {
      metadados,
      atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    },
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('executor nativo da barreira com transporte fictício', () => {
  it('envia transporte atestado com JWT da requisição e retorna resposta para validação posterior', async () => {
    const resposta = {
      ok: true,
      dados: { epoca: 1, reserva: null, resultado_pendente: null },
      request_id: metadados.request_id,
    };
    const rede = vi.fn(async () => Response.json(resposta));
    vi.stubGlobal('fetch', rede);
    const transporte = await entrada();
    expect(
      await executarBarreiraNativa(criarContextoAuthNativo(request, fonte).cliente, transporte),
    ).toEqual(resposta);
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/rest/v1/rpc/cadastro_composicao');
    expect(new Headers(init.headers).get('content-profile')).toBe('api');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init.body))).toEqual(transporte);
  });

  it('falha fechada e não expõe detalhes quando a RPC não existe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ code: 'PGRST202', message: 'detalhe privado' }, { status: 404 }),
      ),
    );
    await expect(
      executarBarreiraNativa(criarContextoAuthNativo(request, fonte).cliente, await entrada()),
    ).rejects.toThrow(/^Não foi possível executar a barreira\.$/);
  });
});
