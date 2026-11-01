import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comporPacientesNativo, metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';

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

describe('composição nativa de pacientes', () => {
  it('nega acesso sem sessão antes de consultar cofre e sem publicar cookies', async () => {
    const resposta = await comporPacientesNativo(
      new Request('https://app.example.test/api/pacientes', { headers: { 'x-sessao': 'x' } }),
      'carteira',
      {
        fonte: {
          FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
          FFCM_SUPABASE_ANON_KEY: 'chave-publica',
          FFCM_APP_ORIGIN: 'https://app.example.test',
        },
        pool: undefined as unknown as Pool,
        referencias: {
          keyIdAtiva: 'v1',
          referenciasCifra: { v1: 'cifra' },
          referenciaHmac: 'hmac',
        },
        keyIdAtestado: 'v1',
      },
    );
    expect(resposta.status).toBe(401);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(await resposta.text()).not.toContain('Chave criptográfica');
  });

  it('limita validade do atestado a 30 segundos, conforme verificador SQL', () => {
    const dados = metadadosAtestadoNativo('v1', 'request', Date.UTC(2026, 0, 1));
    expect(Date.parse(dados.expira_em) - Date.parse(dados.emitido_em)).toBeLessThanOrEqual(30_000);
    expect(Date.parse(dados.expira_em)).toBeGreaterThan(Date.parse(dados.emitido_em));
  });

  it('encerra preparação quando Auth trava e não inicia operação protegida', async () => {
    vi.useFakeTimers();
    const usuario = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated' };
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
    const rede = vi.fn((_input: RequestInfo | URL) => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', rede);
    const resposta = comporPacientesNativo(
      new Request(`${fonte.FFCM_APP_ORIGIN}/api/pacientes`, {
        headers: { cookie, 'x-sessao': '33333333-3333-4333-8333-333333333333' },
      }),
      'carteira',
      dependencias,
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await resposta).status).toBe(503);
    expect(rede).toHaveBeenCalledTimes(1);
    expect(String(rede.mock.calls[0]?.[0])).toContain('/auth/v1/user');
  });

  it('recusa pedido já cancelado antes de Auth e cofre', async () => {
    const rede = vi.fn();
    vi.stubGlobal('fetch', rede);
    const controle = new AbortController();
    controle.abort();
    const resposta = await comporPacientesNativo(
      new Request(`${fonte.FFCM_APP_ORIGIN}/api/pacientes`, { signal: controle.signal }),
      'carteira',
      dependencias,
    );
    expect(resposta.status).toBe(503);
    expect(rede).not.toHaveBeenCalled();
  });

  it('encerra preparação quando pool do cofre trava, sem iniciar operação protegida', async () => {
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
    const rede = vi.fn(async (input: RequestInfo | URL) => {
      const caminho = new URL(String(input)).pathname;
      if (caminho === '/auth/v1/user') return Response.json(usuario);
      if (caminho === '/rest/v1/rpc/consultar_sessao_nativa')
        return Response.json({
          session_id: sessionId,
          usuario: { id: usuario.id, perfil: 'profissional', ativo: true, versao: 1 },
          capacidades: ['consultar_pacientes_vinculados'],
        });
      throw new Error('Operação protegida inesperada.');
    });
    vi.stubGlobal('fetch', rede);
    let liberarConexao!: (cliente: unknown) => void;
    const conectar = vi.fn(
      () =>
        new Promise((resolver) => {
          liberarConexao = resolver;
        }),
    );
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      connect: conectar,
    } as unknown as Pool;
    const resposta = comporPacientesNativo(
      new Request(`${fonte.FFCM_APP_ORIGIN}/api/pacientes`, {
        headers: { cookie, 'x-sessao': sessionId },
      }),
      'carteira',
      { ...dependencias, pool },
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await resposta).status).toBe(503);
    expect(conectar).toHaveBeenCalledTimes(1);
    expect(rede).toHaveBeenCalledTimes(2);
    const query = vi.fn();
    const release = vi.fn();
    liberarConexao({ query, release });
    await vi.advanceTimersByTimeAsync(0);
    expect(query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(true);
  });

  it('retorna pendência quando prazo termina após início de RPC de mutação', async () => {
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
      if (caminho === '/rest/v1/rpc/cadastro_composicao') {
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
    const resposta = comporPacientesNativo(request, 'reservar', { ...dependencias, pool });
    await iniciada;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await (await resposta).json()).toMatchObject({ erro: { codigo: 'pendencia_externa' } });
    expect(
      rede.mock.calls.filter(([input]) => String(input).includes('/rpc/cadastro_composicao')),
    ).toHaveLength(1);
  });
});
