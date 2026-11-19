import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { comporSubstituicaoCmNativo } from './compor-substituicao-cm-nativo.ts';

const mocks = vi.hoisted(() => ({ cofre: vi.fn(), usuario: vi.fn(), rpc: vi.fn() }));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./auth-nativo/cliente.ts', () => ({
  criarContextoAuthNativo: () => ({
    origem: 'https://app.example.test',
    cookiesAlterados: false,
    cliente: { auth: { getUser: mocks.usuario }, schema: () => ({ rpc: mocks.rpc }) },
  }),
  credencialAuthRejeitada: () => false,
}));

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const paciente = '40000000-0000-4000-8000-000000000001';
const substituta = '33333333-3333-4333-8333-333333333333';
const dependencias = {
  fonte: {},
  pool: {} as Pool,
  referencias: { keyIdAtiva: 'teste', referenciasCifra: {}, referenciaHmac: 'ficticio' },
  keyIdAtestado: 'teste',
};
const caminho = `https://app.example.test/api/pacientes/${paciente}/substituicao-case-manager`;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.usuario.mockResolvedValue({ data: { user: { id: usuario } }, error: null });
});
afterEach(() => vi.restoreAllMocks());

const sessaoDe = (perfil: string) => ({
  data: {
    session_id: sessao,
    usuario: { id: usuario, ativo: true, versao: 1, perfil },
    capacidades: [],
  },
  error: null,
});

it.each(['profissional', 'familia'] as const)(
  'servidor nega %s antes de tocar no Vault, mesmo consultando',
  async (perfil) => {
    mocks.rpc.mockResolvedValue(sessaoDe(perfil));
    const resultado = await comporSubstituicaoCmNativo(
      new Request(caminho, { headers: { 'x-sessao': sessao } }),
      { operacao: 'consultar', paciente_id: paciente },
      dependencias,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(mocks.cofre).not.toHaveBeenCalled();
  },
);

it('origem incorreta impede registrar antes da autorização e do Vault', async () => {
  const resultado = await comporSubstituicaoCmNativo(
    new Request(caminho, {
      headers: { 'x-sessao': sessao, origin: 'https://invasor.example.test' },
    }),
    {
      operacao: 'registrar',
      paciente_id: paciente,
      substituto_usuario_id: substituta,
      inicio: '2026-11-20T09:00:00.000Z',
      fim: '2026-11-27T09:00:00.000Z',
    },
    dependencias,
  );
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  expect(mocks.usuario).not.toHaveBeenCalled();
  expect(mocks.cofre).not.toHaveBeenCalled();
});

it('entrada HTTP recusa período invertido e caminho desconhecido sem chamar a composição', async () => {
  const { criarEntradaSubstituicaoCmNativa } = await import('./entrada-substituicao-cm-nativa.ts');
  const entrada = criarEntradaSubstituicaoCmNativa(dependencias);
  const invertido = await entrada.atender(
    new Request(caminho, {
      method: 'POST',
      headers: {
        'x-sessao': sessao,
        origin: 'https://app.example.test',
        'content-type': 'application/json',
        'x-chave-idempotencia': '44444444-4444-4444-8444-444444444444',
      },
      body: JSON.stringify({
        substituto_usuario_id: substituta,
        inicio: '2026-11-27T09:00:00.000Z',
        fim: '2026-11-20T09:00:00.000Z',
      }),
    }),
  );
  expect(invertido.status).toBe(422);
  expect(await invertido.json()).toMatchObject({ erro: { codigo: 'entrada_invalida' } });
  const desconhecido = await entrada.atender(
    new Request('https://app.example.test/api/pacientes/nao-e-uuid/substituicao-case-manager', {
      headers: { 'x-sessao': sessao },
    }),
  );
  expect(desconhecido.status).toBe(422);
  expect(mocks.usuario).not.toHaveBeenCalled();
  expect(mocks.cofre).not.toHaveBeenCalled();
});
