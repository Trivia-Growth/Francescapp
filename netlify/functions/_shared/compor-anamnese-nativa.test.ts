import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comporAnamneseNativa } from './compor-anamnese-nativa.ts';

const mocks = vi.hoisted(() => ({ cofre: vi.fn(), executar: vi.fn(), operar: vi.fn() }));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./executor-anamnese-nativo.ts', () => ({ executarAnamneseNativa: mocks.executar }));
vi.mock('./anamnese-nativa.ts', () => ({ operarAnamneseNativa: mocks.operar }));

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '33333333-3333-4333-8333-333333333333';
const paciente = '44444444-4444-4444-8444-444444444444';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_APP_ORIGIN: 'https://app.example.test',
};
const dependencias = {
  fonte,
  pool: undefined as unknown as Pool,
  referencias: {
    keyIdAtiva: 'v1',
    referenciasCifra: { v1: 'ffcmapp.cifra.ativa' },
    referenciaHmac: 'ffcmapp.cifra.hmac',
  },
  keyIdAtestado: 'v1',
};

function cookie() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuario, exp })).toString('base64url')}.ZmFrZQ`;
  return `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: usuario, aud: 'authenticated' } })).toString('base64url')}`;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.cofre.mockReset();
  mocks.executar.mockReset();
  mocks.operar.mockReset();
});

describe('composição interna da anamnese', () => {
  it('recusa gravação com origem incorreta antes do cofre', async () => {
    const resultado = await comporAnamneseNativa(
      new Request('https://app.example.test/', {
        headers: { 'x-sessao': sessao, origin: 'https://outra.example.test' },
      }),
      { operacao: 'gravar', paciente_id: paciente, versao_esperada: 0, secoes: {} },
      dependencias,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
    expect(mocks.cofre).not.toHaveBeenCalled();
  });

  it('usa cliente da sessão na RPC e revalida identidade antes da resposta', async () => {
    const rede = vi.fn(async (input: RequestInfo | URL) => {
      const caminho = new URL(String(input)).pathname;
      if (caminho === '/auth/v1/user') return Response.json({ id: usuario, aud: 'authenticated' });
      if (caminho === '/rest/v1/rpc/consultar_sessao_nativa')
        return Response.json({
          session_id: sessao,
          usuario: { id: usuario, perfil: 'profissional', ativo: true, versao: 1 },
          capacidades: ['consultar_pacientes_vinculados'],
        });
      throw new Error('RPC inesperada');
    });
    vi.stubGlobal('fetch', rede);
    mocks.cofre.mockResolvedValue({ cifra: {}, atestador: {} });
    mocks.operar.mockImplementation(async (pedido, _comando, portas) => {
      expect((await portas.autorizar(pedido)).estado).toBe('autorizado');
      await portas.executar(pedido, { p_transporte: {} });
      expect((await portas.revalidar(pedido)).estado).toBe('autorizado');
      return { ok: true, dados: null, request_id: crypto.randomUUID() };
    });
    const resultado = await comporAnamneseNativa(
      new Request('https://app.example.test/', {
        headers: { cookie: cookie(), 'x-sessao': sessao },
      }),
      { operacao: 'ler', paciente_id: paciente },
      dependencias,
    );
    expect(resultado.ok).toBe(true);
    expect(mocks.executar).toHaveBeenCalledOnce();
    expect(mocks.executar.mock.calls[0]?.[0].auth).toBeDefined();
    expect(rede).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  });
});
