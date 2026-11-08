import { beforeEach, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';

const mocks = vi.hoisted(() => ({
  contexto: vi.fn(),
  cofre: vi.fn(),
  projetar: vi.fn(),
  contato: vi.fn(),
}));
vi.mock('./auth-nativo/cliente.ts', () => ({
  criarContextoAuthNativo: mocks.contexto,
  credencialAuthRejeitada: () => false,
}));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('../../../packages/cadastro/src/projetar-paciente-experimental.ts', () => ({
  projetarPacienteAdministrativoExperimental: mocks.projetar,
}));
vi.mock('../../../packages/cadastro/src/executor-contato-privado.ts', () => ({
  executarCriacaoContatoPrivado: mocks.contato,
}));
import { comporEdicaoPacienteNativa } from './compor-edicao-paciente-nativa.ts';
import { comporContatoNativo } from './compor-contato-nativo.ts';
import { comporBarreiraContatoNativa } from './compor-barreira-contato-nativa.ts';

const id = 'a0000000-0000-4000-8000-000000000001';
const dependencias = {
  fonte: {
    FFCM_SUPABASE_URL: 'https://example.test',
    FFCM_SUPABASE_ANON_KEY: 'ficticia',
    FFCM_APP_ORIGIN: 'https://example.test',
  },
  pool: undefined as never,
  referencias: {} as never,
  keyIdAtestado: 'teste',
};
let perfil: 'administrador' | 'profissional';
let capacidade = true;
let rebaixarNaBarreira = false;
beforeEach(() => {
  perfil = 'administrador';
  capacidade = true;
  rebaixarNaBarreira = false;
  mocks.cofre.mockReset();
  mocks.projetar.mockReset();
  mocks.contato.mockReset();
  mocks.contexto.mockReset();
  const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(1) });
  mocks.cofre.mockResolvedValue({ cifra: {}, atestador });
  mocks.contexto.mockReturnValue({
    origem: 'https://example.test',
    cookiesAlterados: false,
    cliente: {
      auth: { getUser: async () => ({ data: { user: { id } }, error: null }) },
      schema: () => ({
        rpc: async (
          nome: string,
          parametros: { p_transporte?: { entrada: { request_id: string } } },
        ) => {
          if (nome === 'contato_barreira_composicao' && rebaixarNaBarreira) {
            perfil = 'profissional';
            return {
              data: {
                ok: true,
                dados: { estado: 'aberta' },
                request_id: parametros.p_transporte?.entrada.request_id,
              },
              error: null,
            };
          }
          return nome === 'consultar_sessao_nativa'
            ? {
                data: {
                  session_id: id,
                  usuario: { id, perfil, ativo: true, versao: 1 },
                  capacidades:
                    perfil === 'administrador' && capacidade ? ['administrar_cadastro'] : [],
                },
                error: null,
              }
            : {
                data: {
                  ok: true,
                  dados: {},
                  request_id: parametros.p_transporte?.entrada.request_id,
                },
                error: null,
              };
        },
      }),
    },
  });
});

it('trata rebaixamento durante reserva de contato como resultado incerto', async () => {
  rebaixarNaBarreira = true;
  const request = new Request('https://example.test/api/contatos/barreira/reservar', {
    method: 'POST',
    headers: { 'x-sessao': id, origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ epoca: 1, reserva_id: id, paciente_id: id }),
  });
  const resposta = await comporBarreiraContatoNativa(request, 'reservar', dependencias);
  expect((await resposta.json()).erro.codigo).toBe('pendencia_externa');
});

it('não retorna cadastro quando perfil perde autoridade durante projeção', async () => {
  mocks.projetar.mockImplementation(async () => {
    perfil = 'profissional';
    return { id };
  });
  const resposta = await comporEdicaoPacienteNativa(
    new Request('https://example.test/api', { headers: { 'x-sessao': id } }),
    { tipo: 'consultar', pacienteId: id },
    dependencias,
  );
  expect(resposta.ok).toBe(false);
  expect(resposta).not.toHaveProperty('dados');
});

it('classifica perda de autoridade após criação como pendência externa', async () => {
  mocks.contato.mockImplementation(async (_pedido, metadados, portas) => {
    await portas.rpc.executar({ p_entrada: { entrada: { request_id: metadados.request_id } } });
    perfil = 'profissional';
    return { ok: true, dados: {}, request_id: metadados.request_id };
  });
  const resposta = await comporContatoNativo(
    new Request('https://example.test/api', {
      method: 'POST',
      headers: { 'x-sessao': id, origin: 'https://example.test' },
    }),
    { pacienteId: id, corpo: {}, cabecalhos: {} },
    dependencias,
  );
  expect(resposta).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
});

it('nega antes do cofre quando falta capacidade de cadastro', async () => {
  capacidade = false;
  const resposta = await comporEdicaoPacienteNativa(
    new Request('https://example.test/api', { headers: { 'x-sessao': id } }),
    { tipo: 'consultar', pacienteId: id },
    dependencias,
  );
  expect(resposta).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
  expect(mocks.cofre).not.toHaveBeenCalled();
});
