import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import {
  documentoContextoCuidadoSchema,
  salvarContextoCuidadoSchema,
  type ElementoContexto,
} from '../../../packages/contracts/src/contexto-cuidado.ts';
import {
  documentoRedeCuidadoSchema,
  salvarRedeCuidadoSchema,
} from '../../../packages/contracts/src/rede-cuidado.ts';
import { criarEntradaDocumentoPacienteNativa } from './entrada-documento-paciente-nativa.ts';
import {
  DOCUMENTO_CONTEXTO_CUIDADO,
  DOCUMENTO_REDE_CUIDADO,
  type comporDocumentoPacienteNativo,
} from './compor-documento-paciente-nativo.ts';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), cofre: vi.fn(), contexto: vi.fn() }));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./auth-nativo/cliente.ts', () => ({
  criarContextoAuthNativo: mocks.contexto,
  credencialAuthRejeitada: () => false,
}));

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const paciente = '33333333-3333-4333-8333-333333333333';
const objetivo = '44444444-4444-4444-8444-444444444444';
const dependencias = {
  fonte: {},
  pool: {},
  referencias: {},
  keyIdAtestado: 'teste',
} as unknown as Parameters<typeof comporDocumentoPacienteNativo>[3];

function prepararCofre() {
  mocks.cofre.mockResolvedValue({
    cifra: criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
  });
  mocks.contexto.mockReturnValue({
    origem: 'https://app.example.test',
    cookiesAlterados: false,
    cliente: {
      auth: { getUser: async () => ({ data: { user: { id: usuario } }, error: null }) },
      schema: () => ({
        rpc: async (nome: string, argumentos: unknown) => {
          if (nome === 'consultar_sessao_nativa')
            return {
              data: {
                session_id: sessao,
                usuario: { id: usuario, perfil: 'profissional', ativo: true, versao: 1 },
                capacidades: ['consultar_pacientes_vinculados'],
              },
              error: null,
            };
          return mocks.rpc(nome, argumentos);
        },
      }),
    },
  });
}

/** Devolve o que a operação privada devolveria, ecoando o envelope recebido. */
function ecoarGravacao() {
  mocks.rpc.mockImplementation(async (_nome: string, { p_transporte }: never) => {
    const entrada = (p_transporte as { entrada: Record<string, string> }).entrada;
    return {
      data: {
        ok: true,
        repeticao: false,
        request_id: entrada.request_id,
        dados: {
          registro_id: entrada.registro_id,
          paciente_id: entrada.paciente_id,
          versao: 1,
          conteudo: entrada.conteudo,
        },
      },
      error: null,
    };
  });
}

function pedido(segmento: string, corpo: unknown) {
  return new Request(`https://app.example.test/api/pacientes/${paciente}/${segmento}`, {
    method: 'PATCH',
    headers: {
      'x-sessao': sessao,
      'x-chave-idempotencia': 'chave_ficticia_123456',
      'content-type': 'application/json',
      origin: 'https://app.example.test',
    },
    body: JSON.stringify(corpo),
  });
}

const entradaContexto = () =>
  criarEntradaDocumentoPacienteNativa(
    DOCUMENTO_CONTEXTO_CUIDADO,
    'contexto-cuidado',
    salvarContextoCuidadoSchema.transform((valor) => ({
      versao_esperada: valor.versao_esperada,
      conteudo: valor.elementos,
    })),
    documentoContextoCuidadoSchema,
    dependencias,
  );

const entradaRede = () =>
  criarEntradaDocumentoPacienteNativa(
    DOCUMENTO_REDE_CUIDADO,
    'rede-cuidado',
    salvarRedeCuidadoSchema.transform((valor) => ({
      versao_esperada: valor.versao_esperada,
      conteudo: valor.pessoas,
    })),
    documentoRedeCuidadoSchema,
    dependencias,
  );

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('rotas de contexto e rede de cuidado', () => {
  it('grava contexto cifrado e devolve o conteúdo decifrado', async () => {
    prepararCofre();
    ecoarGravacao();
    const elementos: ElementoContexto[] = [
      { id: 'r1', categoria: 'rotina', descricao: 'Acorda às 6h', objetivos: [objetivo] },
      { id: 'b1', categoria: 'barreiras', descricao: 'Mora longe do posto', objetivos: [] },
    ];
    const resposta = await entradaContexto().atender(
      pedido('contexto-cuidado', { versao_esperada: 0, elementos }),
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      dados: { versao: 1, conteudo: elementos },
    });
    const [nome, argumentos] = mocks.rpc.mock.calls[0] as [string, { p_transporte: never }];
    expect(nome).toBe('contexto_cuidado_privado');
    const entrada = (argumentos.p_transporte as unknown as { entrada: Record<string, unknown> })
      .entrada;
    // O texto clínico nunca sai em claro, e a AAD amarra tabela, paciente, registro e versão.
    expect(JSON.stringify(entrada)).not.toContain('Acorda às 6h');
    expect(entrada.aad).toMatchObject({
      tabela: 'cadastro.contexto_cuidado_versao',
      paciente_id: paciente,
      versao: 1,
      campo: 'conteudo',
      formato: 1,
    });
    expect(entrada.atestado).toMatchObject({ operacao: 'api.gravar_contexto_cuidado' });
  });

  it('grava rede com vínculos múltiplos e não envia nome em claro', async () => {
    prepararCofre();
    ecoarGravacao();
    const pessoas = [
      {
        id: 'p1',
        nome: 'Pessoa Fictícia',
        vinculos: ['familiar', 'cuidador', 'responsavel_financeiro'],
        contato: null,
        observacao: null,
      },
    ];
    const resposta = await entradaRede().atender(
      pedido('rede-cuidado', { versao_esperada: 0, pessoas }),
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ dados: { versao: 1, conteudo: pessoas } });
    const [nome, argumentos] = mocks.rpc.mock.calls[0] as [string, { p_transporte: never }];
    expect(nome).toBe('rede_cuidado_privado');
    const entrada = (argumentos.p_transporte as unknown as { entrada: Record<string, unknown> })
      .entrada;
    expect(JSON.stringify(entrada)).not.toContain('Pessoa Fictícia');
    expect(entrada.aad).toMatchObject({ tabela: 'cadastro.rede_cuidado_versao' });
    expect(entrada.atestado).toMatchObject({ operacao: 'api.gravar_rede_cuidado' });
  });

  it('recusa vínculo fora da lista do requisito sem chamar o banco', async () => {
    prepararCofre();
    const resposta = await entradaRede().atender(
      pedido('rede-cuidado', {
        versao_esperada: 0,
        pessoas: [{ id: 'p1', nome: 'Pessoa Fictícia', vinculos: ['vizinho'] }],
      }),
    );
    expect(resposta.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('recusa categoria fora do FR-005 sem chamar o banco', async () => {
    prepararCofre();
    const resposta = await entradaContexto().atender(
      pedido('contexto-cuidado', {
        versao_esperada: 0,
        elementos: [{ id: 'x', categoria: 'financeiro', descricao: 'Algo', objetivos: [] }],
      }),
    );
    expect(resposta.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('traduz conflito de versão do banco em erro próprio', async () => {
    prepararCofre();
    mocks.rpc.mockImplementation(async (_nome: string, { p_transporte }: never) => ({
      data: {
        ok: false,
        erro: { codigo: 'conflito' },
        request_id: (p_transporte as { entrada: { request_id: string } }).entrada.request_id,
      },
      error: null,
    }));
    const resposta = await entradaRede().atender(
      pedido('rede-cuidado', {
        versao_esperada: 3,
        pessoas: [{ id: 'p1', nome: 'Pessoa Fictícia', vinculos: ['familiar'] }],
      }),
    );
    expect(resposta.status).toBe(409);
    expect(await resposta.json()).toMatchObject({ erro: { codigo: 'conflito_versao' } });
  });

  it('encerra leitura de corpo que não termina antes de chamar composição', async () => {
    vi.useFakeTimers();
    const cancelar = vi.fn();
    const body = new ReadableStream({ pull: () => new Promise(() => {}), cancel: cancelar });
    const request = new Request(
      `https://app.example.test/api/pacientes/${paciente}/contexto-cuidado`,
      {
        method: 'PATCH',
        headers: {
          'x-sessao': sessao,
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'content-type': 'application/json',
        },
        body,
        duplex: 'half',
      } as RequestInit,
    );
    const pendente = entradaContexto().atender(request);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pendente).status).toBe(422);
    expect(cancelar).toHaveBeenCalledOnce();
    expect(mocks.contexto).not.toHaveBeenCalled();
  });
});
