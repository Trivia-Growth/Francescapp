import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarEntradaAnamneseNativa } from './entrada-anamnese-nativa.ts';
import type { comporAnamneseNativa } from './compor-anamnese-nativa.ts';

const mocks = vi.hoisted(() => ({ executar: vi.fn(), cofre: vi.fn(), contexto: vi.fn() }));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./executor-anamnese-nativo.ts', () => ({ executarAnamneseNativa: mocks.executar }));
vi.mock('./auth-nativo/cliente.ts', () => ({
  criarContextoAuthNativo: mocks.contexto,
  credencialAuthRejeitada: () => false,
}));

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const paciente = '33333333-3333-4333-8333-333333333333';
const url = `https://app.example.test/api/pacientes/${paciente}/anamnese`;
const dependencias = {
  fonte: {},
  pool: {},
  referencias: {},
  keyIdAtestado: 'teste',
} as unknown as Parameters<typeof comporAnamneseNativa>[2];
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('entrada e composição nativa', () => {
  it('grava após consumir corpo e preserva contexto autenticado', async () => {
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    });
    mocks.cofre.mockResolvedValue({
      cifra,
      atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    });
    mocks.contexto.mockReturnValue({
      origem: 'https://app.example.test',
      cookiesAlterados: false,
      cliente: {
        auth: { getUser: async () => ({ data: { user: { id: usuario } }, error: null }) },
        schema: () => ({
          rpc: async () => ({
            data: {
              session_id: sessao,
              usuario: { id: usuario, perfil: 'profissional', ativo: true, versao: 1 },
              capacidades: ['consultar_pacientes_vinculados'],
            },
            error: null,
          }),
        }),
      },
    });
    mocks.executar.mockImplementation(async (_cliente, { p_transporte }) => {
      const entrada = p_transporte.entrada;
      return {
        ok: true,
        repeticao: false,
        request_id: entrada.request_id,
        dados: {
          registro_id: entrada.registro_id,
          paciente_id: entrada.paciente_id,
          versao: 1,
          conteudo: entrada.conteudo,
        },
      };
    });
    const request = new Request(url, {
      method: 'PATCH',
      headers: {
        'x-sessao': sessao,
        'x-chave-idempotencia': 'chave_ficticia_123456',
        'content-type': 'application/json',
        origin: 'https://app.example.test',
      },
      body: JSON.stringify({ versao_esperada: 0, secoes: [] }),
    });
    const resposta = await criarEntradaAnamneseNativa(dependencias).atender(request);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ dados: { versao: 1, secoes: [] } });
    expect(mocks.executar).toHaveBeenCalledOnce();
    expect(mocks.contexto.mock.calls[0]?.[0].headers.get('origin')).toBe(
      'https://app.example.test',
    );
  });
  it('encerra leitura de corpo que não termina antes de chamar composição', async () => {
    vi.useFakeTimers();
    const cancelar = vi.fn();
    const body = new ReadableStream({ pull: () => new Promise(() => {}), cancel: cancelar });
    const request = new Request(url, {
      method: 'PATCH',
      headers: {
        'x-sessao': sessao,
        'x-chave-idempotencia': 'chave_ficticia_123456',
        'content-type': 'application/json',
      },
      body,
      duplex: 'half',
    } as RequestInit);
    const pendente = criarEntradaAnamneseNativa(dependencias).atender(request);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pendente).status).toBe(422);
    expect(cancelar).toHaveBeenCalledOnce();
    expect(mocks.contexto).not.toHaveBeenCalled();
  });
});
