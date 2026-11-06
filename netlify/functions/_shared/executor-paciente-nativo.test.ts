import { afterEach, describe, expect, it, vi } from 'vitest';
import type { prepararComandoCriarPaciente } from '../../../packages/cadastro/src/preparar-paciente.ts';
import { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { executarPacienteNativo } from './executor-paciente-nativo.ts';

const origem = 'https://app.example.test';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: origem,
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'a0000000-0000-4000-8000-000000000001', exp })).toString('base64url')}.ZmFrZQ`;
const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: 'a0000000-0000-4000-8000-000000000001' } })).toString('base64url')}`;
const request = new Request(`${origem}/api/pacientes`, { headers: { cookie } });
const transporte = { p_entrada: { entrada: { request_id: 'ficticio' } } } as unknown as Awaited<
  ReturnType<typeof prepararComandoCriarPaciente>
>;

afterEach(() => vi.unstubAllGlobals());

describe('executor nativo de paciente com transporte fictício', () => {
  it('envia transporte e JWT ao contrato previsto', async () => {
    const resposta = { ok: true };
    const rede = vi.fn(async () => Response.json(resposta));
    vi.stubGlobal('fetch', rede);
    expect(
      await executarPacienteNativo(criarContextoAuthNativo(request, fonte).cliente, transporte),
    ).toEqual(resposta);
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/rest/v1/rpc/criar_paciente');
    expect(new Headers(init.headers).get('content-profile')).toBe('api');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init.body))).toEqual({ p_transporte: transporte.p_entrada });
  });

  it('falha fechada sem expor detalhes quando a RPC não existe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ code: 'PGRST202', message: 'detalhe privado' }, { status: 404 }),
      ),
    );
    await expect(
      executarPacienteNativo(criarContextoAuthNativo(request, fonte).cliente, transporte),
    ).rejects.toThrow(/^Não foi possível executar o cadastro\.$/);
  });
});
