import { beforeEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { comporPacientesNativo } from './compor-pacientes-nativo.ts';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  cofre: vi.fn(),
  erroLegado: false,
  perfil: 'familia',
}));
const id = '11111111-1111-4111-8111-111111111111';
vi.mock('./auth-nativo/cliente.ts', () => ({
  credencialAuthRejeitada: () => false,
  criarContextoAuthNativo: () => ({
    origem: 'https://example.test',
    cookiesAlterados: false,
    cliente: {
      auth: {
        getUser: async () => ({
          error: null,
          data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
        }),
      },
      schema: () => ({ rpc: mocks.rpc }),
    },
  }),
}));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
const dependencias = {
  fonte: {},
  pool: {} as Pool,
  referencias: {
    keyIdAtiva: 'teste',
    referenciasCifra: { teste: 'ficticia' },
    referenciaHmac: 'ficticia',
  },
  keyIdAtestado: 'teste',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.erroLegado = false;
  mocks.perfil = 'familia';
  mocks.cofre.mockResolvedValue({ cifra: {}, cursor: {} });
  mocks.rpc.mockImplementation(async (nome: string, parametros: { p_request_id: string }) => {
    if (nome === 'consultar_sessao_familiar_nativa')
      return { error: mocks.erroLegado ? {} : null, data: null };
    if (nome === 'consultar_sessao_nativa')
      return {
        error: null,
        data: {
          session_id: id,
          usuario: { id, perfil: mocks.perfil, ativo: true, versao: 1 },
          capacidades: [],
        },
      };
    return {
      error: null,
      data: {
        ok: true,
        request_id: parametros.p_request_id,
        dados: { itens: [], proximo_cursor: null },
      },
    };
  });
});
const pedido = () =>
  new Request('https://example.test/api/familiar/pacientes', {
    headers: { 'x-sessao': id, 'x-fluxo': 'AAAAAAAAAAAAAAAAAAAAAA' },
  });
it('família interna usa sessão geral e carteira sem vínculo permanece vazia', async () => {
  const resposta = await comporPacientesNativo(pedido(), 'carteira-familiar', dependencias);
  expect(resposta.status).toBe(200);
  expect((await resposta.json()).dados).toEqual({ itens: [], proximo_cursor: null });
  expect(mocks.rpc).toHaveBeenCalledWith('consultar_sessao_nativa', expect.any(Object));
  expect(mocks.rpc).toHaveBeenCalledWith('listar_pacientes_familiar_privado', expect.any(Object));
  expect(resposta.headers.get('set-cookie')).toBeNull();
});
it('outro perfil não usa consulta familiar mesmo com sessão geral válida', async () => {
  mocks.perfil = 'profissional';
  expect((await comporPacientesNativo(pedido(), 'carteira-familiar', dependencias)).status).toBe(
    401,
  );
  expect(mocks.cofre).not.toHaveBeenCalled();
});
it('erro na consulta familiar legada não libera fallback para outro método', async () => {
  mocks.erroLegado = true;
  expect((await comporPacientesNativo(pedido(), 'carteira-familiar', dependencias)).status).toBe(
    503,
  );
  expect(mocks.rpc).not.toHaveBeenCalledWith('consultar_sessao_nativa', expect.any(Object));
  expect(mocks.cofre).not.toHaveBeenCalled();
});
