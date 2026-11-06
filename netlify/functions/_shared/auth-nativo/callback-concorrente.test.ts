import { afterEach, expect, it, vi } from 'vitest';
import { concluirGoogleNativo } from './callback.ts';

const controles = vi.hoisted(() => ({ liberarAntigo: () => {}, antigoAguardando: () => {} }));

vi.mock('./cliente.ts', () => ({
  fluxoValido: (fluxo: string | null) => fluxo !== null && /^[A-Za-z0-9_-]{22}$/.test(fluxo),
  criarContextoAuthNativo(request: Request, _fonte: unknown, fluxo: string) {
    const codigo = new URL(request.url).searchParams.get('code');
    const antigo = codigo === 'antigo';
    const id = antigo
      ? '11111111-1111-4111-8111-111111111111'
      : '22222222-2222-4222-8222-222222222222';
    const session = {
      access_token: `access-${codigo}`,
      refresh_token: `refresh-${codigo}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    return {
      cliente: {
        auth: {
          exchangeCodeForSession: async () => ({ data: { session }, error: null }),
          getUser: async () => ({ data: { user: { id } }, error: null }),
          setSession: async () => {
            if (antigo) {
              controles.antigoAguardando();
              await new Promise<void>((resolve) => {
                controles.liberarAntigo = resolve;
              });
            }
            return { data: { session, user: { id } }, error: null };
          },
        },
        schema: () => ({
          rpc: async () => ({
            data: {
              session_id: '33333333-3333-4333-8333-333333333333',
              usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
              capacidades: ['consultar_pacientes_vinculados'],
            },
            error: null,
          }),
        }),
      },
      responder(response: Response) {
        response.headers.append('Set-Cookie', `ffcm-auth-${fluxo}=${codigo}; HttpOnly; Secure`);
        return response;
      },
    };
  },
}));

afterEach(() => vi.restoreAllMocks());

// O mock comprova encaminhamento por fluxo; não simula armazenamento do SDK ou navegador.
it('mantém cookies de fluxos distintos quando callbacks terminam em ordem inversa', async () => {
  const esperando = new Promise<void>((resolve) => {
    controles.antigoAguardando = resolve;
  });
  const fluxoAntigo = 'aaaaaaaaaaaaaaaaaaaaaa';
  const fluxoRecente = 'bbbbbbbbbbbbbbbbbbbbbb';
  const pedido = (codigo: string, fluxo: string) =>
    new Request(`https://app.example.test/api/auth/callback?code=${codigo}&fluxo=${fluxo}`);
  const antigo = concluirGoogleNativo(pedido('antigo', fluxoAntigo), {});
  await Promise.race([
    esperando,
    antigo.then(() => {
      throw new Error('Callback antigo terminou antes de alcançar o ponto de concorrência.');
    }),
  ]);
  try {
    const recente = await concluirGoogleNativo(pedido('recente', fluxoRecente), {});
    expect(recente.status).toBe(303);
    expect(recente.headers.get('location')).toBe(`/?fluxo=${fluxoRecente}#`);
    expect(recente.headers.getSetCookie()).toEqual([
      `ffcm-auth-${fluxoRecente}=recente; HttpOnly; Secure`,
    ]);
  } finally {
    controles.liberarAntigo();
  }
  const respostaAntiga = await antigo;
  expect(respostaAntiga.status).toBe(303);
  expect(respostaAntiga.headers.get('location')).toBe(`/?fluxo=${fluxoAntigo}#`);
  expect(respostaAntiga.headers.getSetCookie()).toEqual([
    `ffcm-auth-${fluxoAntigo}=antigo; HttpOnly; Secure`,
  ]);
});
