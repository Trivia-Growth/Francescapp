import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { prepararCarteiraNativa } from './carteira-nativa.ts';
import { executarCarteiraNativa } from './executor-carteira-nativo.ts';

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
const request = new Request(`${origem}/api/pacientes`, {
  headers: { 'x-sessao': identidade.session_id },
});
async function entrada() {
  return prepararCarteiraNativa(request, identidade, {
    metadados,
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    abrirCursor: async (cursor) => cursor,
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('executor nativo com transporte fictício', () => {
  it('envia transporte atestado ao contrato previsto e retorna resposta para validação posterior', async () => {
    const resposta = {
      ok: true,
      dados: { itens: [], proximo_cursor: null },
      request_id: metadados.request_id,
    };
    const rede = vi.fn(async () => Response.json(resposta));
    vi.stubGlobal('fetch', rede);
    const transporte = await entrada();
    expect(
      await executarCarteiraNativa(criarContextoAuthNativo(request, fonte).cliente, transporte),
    ).toEqual(resposta);
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/rest/v1/rpc/listar_pacientes');
    expect(new Headers(init.headers).get('content-profile')).toBe('api');
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
      executarCarteiraNativa(criarContextoAuthNativo(request, fonte).cliente, await entrada()),
    ).rejects.toThrow(/^Não foi possível consultar a carteira\.$/);
  });
});
