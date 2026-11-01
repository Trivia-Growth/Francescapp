import { afterEach, expect, it, vi } from 'vitest';
import { concluirGoogleNativo } from './callback.ts';

const controles = vi.hoisted(() => ({ liberarAntigo: () => {}, antigoAguardando: () => {} }));

vi.mock('./cliente.ts', () => ({
  criarContextoAuthNativo(request: Request) {
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
        response.headers.append('Set-Cookie', `sessao=${codigo}; HttpOnly; Secure`);
        return response;
      },
    };
  },
}));

afterEach(() => vi.restoreAllMocks());

// Falha conhecida: remover `.fails` somente depois de corrigir e provar a corrida.
it.fails('não publica sessão antiga após conclusão de login mais recente', async () => {
  const esperando = new Promise<void>((resolve) => {
    controles.antigoAguardando = resolve;
  });
  const pedido = (codigo: string) =>
    new Request(`https://app.example.test/api/auth/callback?code=${codigo}`);
  const antigo = concluirGoogleNativo(pedido('antigo'), {});
  await esperando;
  const recente = await concluirGoogleNativo(pedido('recente'), {});
  expect(recente.status).toBe(303);
  expect(recente.headers.getSetCookie()).toContain('sessao=recente; HttpOnly; Secure');
  controles.liberarAntigo();
  const respostaAntiga = await antigo;
  expect(respostaAntiga.headers.getSetCookie()).toEqual([]);
});
