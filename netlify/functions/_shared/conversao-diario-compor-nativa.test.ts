import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const mocks = vi.hoisted(() => ({
  cofre: vi.fn(),
  auditoria: vi.fn(),
  operar: vi.fn(),
  provider: 'google',
  semPerfil: false,
  perfil: 'familia',
  usuario: 'a0000000-0000-4000-8000-000000000001',
}));
vi.mock('./configuracao-servidor.ts', () => ({ listaConfigurada: async () => ['Área fictícia'] }));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./conversao-diario-nativa.ts', () => ({ operarConversaoDiarioNativa: mocks.operar }));
vi.mock('./auth-nativo/cliente.ts', () => ({
  credencialAuthRejeitada: () => false,
  criarContextoAuthNativo: () => ({
    origem: 'https://example.test',
    cookiesAlterados: false,
    cliente: {
      auth: {
        getUser: async () => ({
          error: null,
          data: {
            user: {
              id: mocks.usuario,
              app_metadata: { provider: mocks.provider },
              identities: mocks.provider === 'google' ? [{ provider: 'google' }] : [],
            },
          },
        }),
      },
      schema: () => ({
        rpc: async (nome: string, parametros: unknown) =>
          nome === 'registrar_negacao_conversao_diario_tarefa'
            ? mocks.auditoria(parametros)
            : {
                error: null,
                data: mocks.semPerfil
                  ? null
                  : {
                      session_id: mocks.usuario,
                      usuario: { id: mocks.usuario, perfil: mocks.perfil, ativo: true, versao: 1 },
                      capacidades: [],
                    },
              },
      }),
    },
  }),
}));
import { comporConversaoDiarioNativa } from './conversao-diario-compor-nativa.ts';
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
  mocks.provider = 'google';
  mocks.semPerfil = false;
  mocks.cofre.mockResolvedValue({ cifra: {}, atestador: {} });
  mocks.operar.mockResolvedValue({ ok: true, dados: null, request_id: mocks.usuario });
});
afterEach(() => vi.clearAllMocks());
for (const perfil of ['familia', 'administrador']) {
  it(`audita e nega ${perfil} antes do cofre`, async () => {
    mocks.perfil = perfil;
    const resultado = await comporConversaoDiarioNativa(
      new Request('https://example.test', { headers: { 'x-sessao': mocks.usuario } }),
      { operacao: 'consultar', paciente_id: mocks.usuario, origem_id: mocks.usuario },
      dependencias,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(mocks.auditoria).toHaveBeenCalledWith({
      p_request_id: resultado.request_id,
      p_acao: 'api.consultar_conversao_diario_tarefa',
      p_paciente_id: mocks.usuario,
      p_origem_id: mocks.usuario,
    });
    expect(mocks.auditoria.mock.calls[0]?.[0]).not.toHaveProperty('p_ator');
    expect(mocks.cofre).not.toHaveBeenCalled();
  });
}
it('aceita profissional interno já admitido sem inferir método pelo provider Google', async () => {
  mocks.perfil = 'profissional';
  mocks.provider = 'email';
  const resultado = await comporConversaoDiarioNativa(
    new Request('https://example.test', { headers: { 'x-sessao': mocks.usuario } }),
    { operacao: 'consultar', paciente_id: mocks.usuario, origem_id: mocks.usuario },
    dependencias,
  );
  expect(resultado).toMatchObject({ ok: true, dados: null });
  expect(mocks.cofre).toHaveBeenCalledOnce();
  expect(mocks.operar).toHaveBeenCalledOnce();
  expect(mocks.auditoria).not.toHaveBeenCalled();
});

it('nega interno sem admissão e falha fechado se auditoria não confirmar', async () => {
  mocks.perfil = 'profissional';
  mocks.provider = 'email';
  mocks.semPerfil = true;
  mocks.auditoria.mockResolvedValue({ error: null, data: false });
  const resultado = await comporConversaoDiarioNativa(
    new Request('https://example.test', { headers: { 'x-sessao': mocks.usuario } }),
    { operacao: 'consultar', paciente_id: mocks.usuario, origem_id: mocks.usuario },
    dependencias,
  );
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  expect(mocks.cofre).not.toHaveBeenCalled();
  expect(mocks.operar).not.toHaveBeenCalled();
});

it('recusa área não configurada antes de carregar cofre ou assinar', async () => {
  mocks.perfil = 'profissional';
  mocks.provider = 'google';
  const resultado = await comporConversaoDiarioNativa(
    new Request('https://example.test', {
      method: 'POST',
      headers: { 'x-sessao': mocks.usuario, origin: 'https://example.test' },
    }),
    {
      operacao: 'converter',
      paciente_id: mocks.usuario,
      origem_id: mocks.usuario,
      entrada: {
        origem_versao: 1,
        tarefa_id: mocks.usuario,
        reserva_id: mocks.usuario,
        geracao_reserva: 1,
        motivo: 'Fictício',
        data_atencao: '2026-11-18',
        encaminhamento: 'Fictício',
        responsavel: 'Fictício',
        prazo: '2026-11-19',
        prioridade: 'baixa',
        area: 'Área inexistente',
      },
    },
    dependencias,
  );
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  expect(mocks.cofre).not.toHaveBeenCalled();
});

it('audita identidade Auth válida sem admissão no produto antes do cofre', async () => {
  mocks.semPerfil = true;
  const resultado = await comporConversaoDiarioNativa(
    new Request('https://example.test', { headers: { 'x-sessao': mocks.usuario } }),
    { operacao: 'consultar', paciente_id: mocks.usuario, origem_id: mocks.usuario },
    dependencias,
  );
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
  expect(mocks.auditoria).toHaveBeenCalledOnce();
  expect(mocks.cofre).not.toHaveBeenCalled();
});
