import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comporBarreiraPlanoNativa } from './compor-barreira-plano-nativa.ts';

const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica',
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('composição privada da barreira de plano', () => {
  it.each([
    [{ operacao: 'api.consultar_barreira_plano' }, 'servico_indisponivel'],
    [
      {
        operacao: 'api.reservar_plano',
        epoca: 1,
        reserva_id: '44444444-4444-4444-8444-444444444444',
        paciente_id: '55555555-5555-4555-8555-555555555555',
      },
      'pendencia_externa',
    ],
  ])('classifica timeout após início da RPC: %s', async (comando, codigo) => {
    vi.useFakeTimers();
    const usuario = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated' };
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuario.id, exp })).toString('base64url')}.ZmFrZQ`;
    const sessao = {
      access_token: token,
      refresh_token: 'ficticio',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      user: usuario,
    };
    const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify(sessao)).toString('base64url')}`;
    let sinalizarInicio!: () => void;
    const iniciada = new Promise<void>((resolver) => {
      sinalizarInicio = resolver;
    });
    const rede = vi.fn(async (input: RequestInfo | URL) => {
      const caminho = new URL(String(input)).pathname;
      if (caminho === '/auth/v1/user') return Response.json(usuario);
      if (caminho === '/rest/v1/rpc/consultar_sessao_nativa')
        return Response.json({
          session_id: sessionId,
          usuario: { id: usuario.id, perfil: 'profissional', ativo: true, versao: 1 },
          capacidades: ['consultar_pacientes_vinculados'],
        });
      if (caminho === '/rest/v1/rpc/plano_composicao_privada') {
        sinalizarInicio();
        return new Promise<Response>(() => {});
      }
      throw new Error('Rota inesperada.');
    });
    vi.stubGlobal('fetch', rede);
    const query = async (sql: string, args?: string[]) => {
      if (sql.includes('ler_chave_cifra_vault'))
        return {
          rows: [
            {
              chave: btoa(
                String.fromCharCode(
                  ...new Uint8Array(32).fill(args?.[0]?.endsWith('hmac') ? 2 : 1),
                ),
              ),
            },
          ],
        };
      if (sql.includes('ler_chave_atestado_vault'))
        return { rows: [{ chave: new Uint8Array(32).fill(3) }] };
      return { rows: [] };
    };
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      connect: async () => ({ query, release: () => {} }),
    } as unknown as Pool;
    const request = new Request(`${fonte.FFCM_APP_ORIGIN}/api/cadastro/barreira/reservar`, {
      method: 'POST',
      headers: {
        cookie,
        'x-sessao': sessionId,
        origin: fonte.FFCM_APP_ORIGIN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ epoca: 1, reserva_id: '44444444-4444-4444-8444-444444444444' }),
    });
    const resposta = comporBarreiraPlanoNativa(request, comando, { ...dependencias, pool });
    await iniciada;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await resposta).toMatchObject({ erro: { codigo } });
    expect(
      rede.mock.calls.filter(([input]) => String(input).includes('/rpc/plano_composicao_privada')),
    ).toHaveLength(1);
  });
});
