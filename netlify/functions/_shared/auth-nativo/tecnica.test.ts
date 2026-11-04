import { beforeEach, expect, it, vi } from 'vitest';
import { entrarTecnicaNativa } from './tecnica.ts';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  responder: vi.fn(),
}));
vi.mock('./cliente.ts', () => ({
  credencialAuthRejeitada: (erro: { status?: number }) => erro.status === 400,
  criarContextoAuthNativo: () => ({
    origem: 'https://app.example.test',
    cliente: {
      auth: { signInWithPassword: mocks.login, getUser: mocks.user },
      schema: () => ({ rpc: mocks.rpc }),
    },
    responder: mocks.responder,
  }),
}));
const id = '11111111-1111-4111-8111-111111111111';
const sessao = {
  session_id: '22222222-2222-4222-8222-222222222222',
  usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
  capacidades: [],
};
const pedido = (origem = 'https://app.example.test') =>
  new Request('https://app.example.test/api/auth/tecnica', {
    method: 'POST',
    headers: { origin: origem, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({ data: { session: {}, user: { id } }, error: null });
  mocks.user.mockResolvedValue({ data: { user: { id } }, error: null });
  mocks.rpc.mockResolvedValue({ data: sessao, error: null });
  mocks.responder.mockImplementation((resposta: Response) => resposta);
});
it('publica cookies somente após identidade e admissão válidas', async () => {
  const resposta = await entrarTecnicaNativa(pedido(), {});
  expect(resposta.status).toBe(200);
  expect((await resposta.json()).dados).toEqual(sessao);
  expect(mocks.login).toHaveBeenCalledWith({
    email: 'teste@example.test',
    password: 'senha-ficticia',
  });
  expect(mocks.responder).toHaveBeenCalledOnce();
});
it.each([
  null,
  { ...sessao, usuario: { ...sessao.usuario, ativo: false } },
  { ...sessao, usuario: { ...sessao.usuario, id: sessao.session_id } },
])('não publica cookies sem admissão válida', async (dados) => {
  mocks.rpc.mockResolvedValue({ data: dados, error: null });
  expect((await entrarTecnicaNativa(pedido(), {})).status).toBe(401);
  expect(mocks.responder).not.toHaveBeenCalled();
});
it('rejeita origem externa antes da autenticação', async () => {
  expect((await entrarTecnicaNativa(pedido('https://externo.test'), {})).status).toBe(403);
  expect(mocks.login).not.toHaveBeenCalled();
});
