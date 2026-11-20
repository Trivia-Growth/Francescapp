import { beforeEach, expect, it, vi } from 'vitest';
import { entrarInternoNativo } from './interno.ts';
import { confirmarEmailInternoNativo } from './confirmar-email-interno.ts';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  responder: vi.fn(),
  otp: vi.fn(),
  verificar: vi.fn(),
}));
vi.mock('./cliente.ts', () => ({
  fluxoValido: (valor: string | null) => valor !== null && /^[A-Za-z0-9_-]{22}$/.test(valor),
  credencialAuthRejeitada: (erro: { status?: number }) => erro.status === 400,
  criarContextoAuthNativo: () => ({
    origem: 'https://app.example.test',
    cliente: {
      auth: {
        signInWithPassword: mocks.login,
        getUser: mocks.user,
        signInWithOtp: mocks.otp,
        verifyOtp: mocks.verificar,
      },
      schema: () => ({ rpc: mocks.rpc }),
    },
    responder: mocks.responder,
  }),
}));
vi.mock('./cliente-otp.ts', () => ({
  criarClienteOtpNativo: () => ({
    origem: 'https://app.example.test',
    cliente: {
      auth: { signInWithOtp: mocks.otp, verifyOtp: mocks.verificar, getUser: mocks.user },
      schema: () => ({ rpc: mocks.rpc }),
    },
  }),
}));
const id = '11111111-1111-4111-8111-111111111111';
const usuario = { id, email: 'ficticio@example.test', email_confirmed_at: '2026-11-18T10:00:00Z' };
const sessao = {
  session_id: '22222222-2222-4222-8222-222222222222',
  usuario: { id, perfil: 'familia', ativo: true, versao: 1 },
  capacidades: [],
};
function pedido(
  caminho = '/api/auth/interno',
  entrada: unknown = { email: usuario.email, senha: 'senha-ficticia' },
) {
  return new Request(`https://app.example.test${caminho}`, {
    method: 'POST',
    headers: {
      origin: 'https://app.example.test',
      'content-type': 'application/json',
      'x-fluxo': 'AAAAAAAAAAAAAAAAAAAAAA',
    },
    body: JSON.stringify(entrada),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({ error: null, data: { user: usuario, session: {} } });
  mocks.user.mockResolvedValue({ error: null, data: { user: usuario } });
  mocks.rpc.mockImplementation(async (nome: string, entrada: { p_request_id: string }) => ({
    error: null,
    data:
      nome === 'confirmar_email_acesso_interno_nativo'
        ? { ok: true, usuario_id: id, request_id: entrada.p_request_id }
        : sessao,
  }));
  mocks.otp.mockResolvedValue({ error: null, data: { user: null, session: null } });
  mocks.verificar.mockResolvedValue({ error: null, data: { user: usuario, session: {} } });
  mocks.responder.mockImplementation((resposta: Response) => resposta);
});
it('admite familiar interno sem vínculo pela RPC normal e publica somente cookies de password', async () => {
  const resposta = await entrarInternoNativo(pedido(), {});
  expect(resposta.status).toBe(200);
  expect((await resposta.json()).dados).toEqual(sessao);
  expect(mocks.rpc).toHaveBeenCalledWith('admitir_sessao_interna_nativa', expect.any(Object));
  expect(mocks.responder).toHaveBeenCalledOnce();
});
it.each([null, { ...sessao, usuario: { ...sessao.usuario, ativo: false } }])(
  'não publica cookies quando DB recusa método/cadastro/revogação',
  async (dados) => {
    mocks.rpc.mockResolvedValue({ error: null, data: dados });
    expect((await entrarInternoNativo(pedido(), {})).status).toBe(401);
    expect(mocks.responder).not.toHaveBeenCalled();
  },
);
it('não admite email não confirmado nem devolve detalhe do provedor', async () => {
  mocks.user.mockResolvedValue({
    error: null,
    data: { user: { ...usuario, email_confirmed_at: null } },
  });
  const resposta = await entrarInternoNativo(pedido(), {});
  expect(resposta.status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.responder).not.toHaveBeenCalled();
});
it('recusa origem externa antes de encaminhar senha', async () => {
  const request = pedido();
  request.headers.set('origin', 'https://externo.example.test');
  expect((await entrarInternoNativo(request, {})).status).toBe(422);
  expect(mocks.login).not.toHaveBeenCalled();
});
it('solicita OTP somente de conta existente e responde sem afirmar entrega ou publicar cookies', async () => {
  const request = pedido('/api/auth/interno/confirmacao/solicitar', { email: usuario.email });
  request.headers.delete('x-fluxo');
  const resposta = await confirmarEmailInternoNativo(request, {}, 'solicitar');
  expect((await resposta.json()).dados).toEqual({ recebido: true });
  expect(mocks.otp).toHaveBeenCalledWith({
    email: usuario.email,
    options: { shouldCreateUser: false },
  });
  expect(resposta.headers.get('set-cookie')).toBeNull();
  expect(mocks.responder).not.toHaveBeenCalled();
});
it('login password exige fluxo mesmo quando OTP não exige', async () => {
  const request = pedido();
  request.headers.delete('x-fluxo');
  expect((await entrarInternoNativo(request, {})).status).toBe(422);
  expect(mocks.login).not.toHaveBeenCalled();
});
it.each([true, false])(
  'OTP válido e inválido não criam sessão da aplicação nem expõem existência: %s',
  async (valido) => {
    if (!valido)
      mocks.verificar.mockResolvedValue({
        error: { message: 'erro privado' },
        data: { user: null, session: null },
      });
    const resposta = await confirmarEmailInternoNativo(
      pedido('/api/auth/interno/confirmacao/verificar', { email: usuario.email, codigo: '123456' }),
      {},
      'verificar',
    );
    expect((await resposta.json()).dados).toEqual({ recebido: true });
    expect(mocks.verificar).toHaveBeenCalledWith({
      email: usuario.email,
      token: '123456',
      type: 'email',
    });
    expect(
      mocks.rpc.mock.calls.every(([nome]) => nome === 'confirmar_email_acesso_interno_nativo'),
    ).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(valido ? 1 : 0);
    expect(mocks.responder).not.toHaveBeenCalled();
    expect(resposta.headers.get('set-cookie')).toBeNull();
  },
);
it('prova OTP de outro email não confirma cadastro gerenciado', async () => {
  mocks.user.mockResolvedValue({
    error: null,
    data: { user: { ...usuario, email: 'outro@example.test' } },
  });
  await confirmarEmailInternoNativo(
    pedido('/api/auth/interno/confirmacao/verificar', { email: usuario.email, codigo: '123456' }),
    {},
    'verificar',
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.responder).not.toHaveBeenCalled();
});
it('UUID divergente entre verifyOtp e getUser não chega à confirmação SQL', async () => {
  mocks.user.mockResolvedValue({
    error: null,
    data: { user: { ...usuario, id: sessao.session_id } },
  });
  await confirmarEmailInternoNativo(
    pedido('/api/auth/interno/confirmacao/verificar', { email: usuario.email, codigo: '123456' }),
    {},
    'verificar',
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.responder).not.toHaveBeenCalled();
});
it('erro de transporte OTP não afirma entrega nem expõe erro privado', async () => {
  mocks.otp.mockResolvedValue({
    error: { name: 'AuthRetryableFetchError', status: 503, message: 'detalhe privado' },
    data: { user: null, session: null },
  });
  const resposta = await confirmarEmailInternoNativo(
    pedido('/api/auth/interno/confirmacao/solicitar', { email: usuario.email }),
    {},
    'solicitar',
  );
  expect(resposta.status).toBe(503);
  expect(await resposta.text()).not.toContain('detalhe privado');
  expect(mocks.responder).not.toHaveBeenCalled();
});
