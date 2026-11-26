import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const mocks = vi.hoisted(() => ({
  cofre: vi.fn(),
  auditoria: vi.fn(),
  perfil: 'familia',
  usuario: 'a0000000-0000-4000-8000-000000000001',
}));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./auth-nativo/cliente.ts', () => ({
  credencialAuthRejeitada: () => false,
  criarContextoAuthNativo: () => ({
    origem: 'https://example.test',
    cookiesAlterados: false,
    cliente: {
      auth: { getUser: async () => ({ error: null, data: { user: { id: mocks.usuario } } }) },
      schema: () => ({
        rpc: async (nome: string, parametros: unknown) =>
          nome === 'registrar_negacao_turno'
            ? mocks.auditoria(parametros)
            : {
                error: null,
                data: {
                  session_id: mocks.usuario,
                  usuario: { id: mocks.usuario, perfil: mocks.perfil, ativo: true, versao: 1 },
                  capacidades: [],
                },
              },
      }),
    },
  }),
}));
import { comporTurnoNativo } from './turno-compor-nativo.ts';
const dependencias = {
  fonte: {},
  pool: {} as Pool,
  referencias: {
    keyIdAtiva: 'ficticia',
    referenciasCifra: { ficticia: 'chave-ficticia' },
    referenciaHmac: 'hmac-ficticio',
  },
  keyIdAtestado: 'ficticia',
};
beforeEach(() => mocks.auditoria.mockResolvedValue({ error: null, data: true }));
afterEach(() => vi.clearAllMocks());
// PREPARADO, NÃO EXECUTADO. Não comprova provedor real.
for (const perfil of ['familia', 'administrador']) {
  it(`consulta atual nega ${perfil} antes do Vault com auditoria confirmada`, async () => {
    mocks.perfil = perfil;
    const r = await comporTurnoNativo(
      new Request('https://example.test', { headers: { 'x-sessao': mocks.usuario } }),
      { operacao: 'consultar_atual', paciente_id: mocks.usuario },
      dependencias,
    );
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(mocks.auditoria).toHaveBeenCalledWith({
      p_request_id: expect.any(String),
      p_acao: 'api.consultar_turno',
      p_paciente_id: mocks.usuario,
      p_turno_id: null,
    });
    expect(mocks.cofre).not.toHaveBeenCalled();
  });
}
it('consulta atual falha fechado se auditoria antecipada não confirma', async () => {
  mocks.perfil = 'familia';
  mocks.auditoria.mockResolvedValue({ error: null, data: false });
  const r = await comporTurnoNativo(
    new Request('https://example.test', { headers: { 'x-sessao': mocks.usuario } }),
    { operacao: 'consultar_atual', paciente_id: mocks.usuario },
    dependencias,
  );
  expect(r).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  expect(mocks.cofre).not.toHaveBeenCalled();
});
