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
import { comporBarreiraTurnoNativa } from './turno-compor-barreira-nativa.ts';
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
beforeEach(() => {
  mocks.auditoria.mockResolvedValue({ error: null, data: true });
});
afterEach(() => vi.clearAllMocks());
for (const perfil of ['familia', 'administrador']) {
  it(`nega perfil ${perfil} antes do cofre no turno e na barreira`, async () => {
    mocks.perfil = perfil;
    const pedido = () =>
      new Request('https://example.test/api/turnos/barreira', {
        headers: { 'x-sessao': mocks.usuario },
      });
    expect(
      await comporTurnoNativo(
        pedido(),
        { operacao: 'consultar', paciente_id: mocks.usuario, turno_id: mocks.usuario },
        dependencias,
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    const resposta = await comporBarreiraTurnoNativa(pedido(), 'consultar', dependencias);
    expect(resposta.status).toBe(403);
    expect((await resposta.json()).erro.codigo).toBe('sem_permissao');
    expect(mocks.auditoria).toHaveBeenNthCalledWith(1, {
      p_request_id: expect.any(String),
      p_acao: 'api.consultar_turno',
      p_paciente_id: mocks.usuario,
      p_turno_id: mocks.usuario,
    });
    expect(mocks.auditoria).toHaveBeenNthCalledWith(2, {
      p_request_id: expect.any(String),
      p_acao: 'api.consultar_barreira_turno',
      p_paciente_id: null,
      p_turno_id: null,
    });
    expect(mocks.auditoria.mock.calls[0]?.[0]).not.toHaveProperty('p_ator');
    expect(mocks.cofre).not.toHaveBeenCalled();
  });
}

for (const falha of ['erro', 'sem_confirmacao', 'excecao']) {
  it(`falha fechado sem cofre quando auditoria da recusa retorna ${falha}`, async () => {
    mocks.perfil = 'familia';
    if (falha === 'excecao') mocks.auditoria.mockRejectedValue(new Error('falha fictícia'));
    else
      mocks.auditoria.mockResolvedValue({
        error: falha === 'erro' ? { message: 'falha fictícia' } : null,
        data: false,
      });
    const pedido = () =>
      new Request('https://example.test/api/turnos/barreira', {
        headers: { 'x-sessao': mocks.usuario },
      });
    expect(
      await comporTurnoNativo(
        pedido(),
        { operacao: 'consultar', paciente_id: mocks.usuario, turno_id: mocks.usuario },
        dependencias,
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
    const resposta = await comporBarreiraTurnoNativa(pedido(), 'consultar', dependencias);
    expect(resposta.status).toBe(503);
    expect((await resposta.json()).erro.codigo).toBe('servico_indisponivel');
    expect(mocks.cofre).not.toHaveBeenCalled();
  });
}
