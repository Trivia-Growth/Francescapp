import { beforeEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';

const mocks = vi.hoisted(() => ({ cofre: vi.fn(), executar: vi.fn(), obter: vi.fn() }));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./executor-documento-caso-nativo.ts', () => ({
  executarDocumentoCasoNativo: mocks.executar,
}));
vi.mock('./configuracao-servidor.ts', () => ({
  carregarConfiguracaoServidor: async () =>
    new Map([['ffcm.documentos.drive_pasta_raiz', { valor: 'pasta-ficticia' }]]),
}));
vi.mock('./segredo-integracao.ts', () => ({
  lerSegredoIntegracao: async () => 'segredo-ficticio-sem-credencial',
}));
vi.mock('./google-drive.ts', async (original) => ({
  ...(await original<typeof import('./google-drive.ts')>()),
  criarPortaDrive: () => ({
    obter: mocks.obter,
    enviar: async () => ({ file_id: '' }),
    remover: async () => {},
    conferir: async () => ({ disponivel: true }),
  }),
}));
vi.mock('./auth-nativo/cliente.ts', () => ({
  credencialAuthRejeitada: () => false,
  criarContextoAuthNativo: () => ({
    origem: 'https://exemplo.test',
    cookiesAlterados: false,
    cliente: {
      auth: { getUser: async () => ({ error: null, data: { user: { id: usuario } } }) },
      schema: () => ({
        rpc: async () => ({
          error: null,
          data: {
            session_id: sessao,
            usuario: { id: usuario, perfil: 'profissional', ativo: true, versao: 1 },
            capacidades: [],
          },
        }),
      }),
    },
  }),
}));
// Espião delega ao helper real: composição e operação nativa não são substituídas.
vi.mock('./documento-caso-entrega.ts', async (original) => {
  const real = await original<typeof import('./documento-caso-entrega.ts')>();
  return { ...real, entregarDocumentoCaso: vi.fn(real.entregarDocumentoCaso) };
});
import { entregarDocumentoCaso } from './documento-caso-entrega.ts';
import type { comporDocumentoCasoNativo } from './compor-documento-caso-nativo.ts';
import { criarEntradaDocumentoCasoNativa } from './entrada-documento-caso-nativa.ts';

// PREPARADO, NÃO EXECUTADO. Cifra/atestado locais e adapters sintéticos não provam Drive/Auth reais.
const usuario = 'a0000000-0000-4000-8000-000000000001';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const paciente = 'c0000000-0000-4000-8000-000000000003';
const documento = 'd0000000-0000-4000-8000-000000000004';
const registro = 'e0000000-0000-4000-8000-000000000005';
const dependencias: Parameters<typeof comporDocumentoCasoNativo>[2] = {
  fonte: {},
  pool: {} as Pool,
  keyIdAtestado: 'teste',
  referencias: {
    keyIdAtiva: 'teste',
    referenciasCifra: { teste: 'cifra-ficticia' },
    referenciaHmac: 'hmac-ficticio',
  },
};
const cifra = criarCifraAutenticada({
  keyIdAtiva: 'teste',
  chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
  chaveHmac: new Uint8Array(32).fill(4),
});
let modo: 'permitido' | 'antes' | 'depois';
let consultas = 0;
beforeEach(() => {
  vi.clearAllMocks();
  consultas = 0;
  modo = 'permitido';
  mocks.cofre.mockResolvedValue({
    cifra,
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
  });
  mocks.obter.mockResolvedValue(new Uint8Array(new ArrayBuffer(3)).fill(7));
  mocks.executar.mockImplementation(
    async (
      _cliente: unknown,
      transporte: { p_transporte: { entrada: Record<string, unknown> } },
    ) => {
      consultas += 1;
      const e = transporte.p_transporte.entrada;
      expect(e.documento_id).toBe(documento);
      expect(e.atestado).toMatchObject({
        operacao: 'api.ler_documentos',
        usuario_id: usuario,
        session_id: sessao,
      });
      if (modo === 'antes' || (modo === 'depois' && consultas === 2))
        return { ok: false, erro: { codigo: 'sem_permissao' }, request_id: e.request_id };
      return {
        ok: true,
        repeticao: false,
        request_id: e.request_id,
        dados: {
          documentos: [
            {
              documento_id: documento,
              registro_id: registro,
              paciente_id: paciente,
              versao: 1,
              categoria: 'Laudo',
              audiencia: 'equipe_e_familia',
              estado: 'disponivel',
              conteudo: await cifra.cifrar(
                JSON.stringify({
                  nome_visivel: 'laudo-ficticio.pdf',
                  drive_file_id: 'arquivo-ficticio',
                }),
                {
                  tabela: 'cadastro.documento_caso_versao',
                  paciente_id: paciente,
                  registro_id: registro,
                  versao: 1,
                  campo: 'conteudo',
                  formato: 1,
                },
              ),
            },
          ],
        },
      };
    },
  );
});
function baixar() {
  return criarEntradaDocumentoCasoNativa(dependencias).atender(
    new Request(`https://exemplo.test/api/pacientes/${paciente}/documentos/${documento}/arquivo`, {
      headers: { 'x-sessao': sessao },
    }),
  );
}
it('rota real passa entregar à composição, que faz duas leituras antes de devolver bytes', async () => {
  const resposta = await baixar();
  expect(vi.mocked(entregarDocumentoCaso).mock.calls[0]?.[1]).toEqual({
    operacao: 'entregar',
    paciente_id: paciente,
    documento_id: documento,
  });
  expect(resposta.status).toBe(200);
  expect([...new Uint8Array(await resposta.arrayBuffer())]).toEqual([7, 7, 7]);
  expect(mocks.executar).toHaveBeenCalledTimes(2);
  expect(mocks.obter).toHaveBeenCalledExactlyOnceWith('arquivo-ficticio');
  expect(mocks.executar.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.obter.mock.invocationCallOrder[0] ?? 0,
  );
  expect(mocks.obter.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.executar.mock.invocationCallOrder[1] ?? 0,
  );
});
it('recusa inicial não busca bytes na origem', async () => {
  modo = 'antes';
  const resposta = await baixar();
  expect(resposta.status).toBe(403);
  expect(mocks.obter).not.toHaveBeenCalled();
  expect(mocks.executar).toHaveBeenCalledTimes(1);
  expect(await resposta.json()).toMatchObject({ erro: { codigo: 'sem_permissao' } });
});
it('recusa após I/O descarta bytes e não emite attachment', async () => {
  modo = 'depois';
  const resposta = await baixar();
  expect(resposta.status).toBe(403);
  expect(mocks.obter).toHaveBeenCalledTimes(1);
  expect(mocks.executar).toHaveBeenCalledTimes(2);
  expect(resposta.headers.get('Content-Disposition')).toBeNull();
  expect(await resposta.json()).toMatchObject({ erro: { codigo: 'sem_permissao' } });
});
