import { afterEach, describe, expect, it, vi } from 'vitest';
import concessoesEquipe from '../concessoes-equipe.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';

const auth = vi.hoisted(() => ({
  falha: true,
  cofreResultado: undefined as unknown,
  rpcIniciada: () => {},
  cofre: vi.fn(async () => {
    if (!auth.cofreResultado) throw new Error();
    return auth.cofreResultado;
  }),
}));
vi.mock('./configurar-dependencias-nativas.ts', () => ({
  configurarDependenciasNativas: () => ({ fonte: {}, keyIdAtestado: 'v1' }),
}));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: auth.cofre }));
vi.mock('./auth-nativo/cliente.ts', () => ({
  criarContextoAuthNativo: (pedido: Request) => ({
    origem: 'https://example.test',
    cookiesAlterados: false,
    cliente: {
      auth: {
        getUser: async () =>
          auth.falha
            ? { error: { name: 'NetworkError' }, data: { user: null } }
            : { error: null, data: { user: { id: '22222222-2222-4222-8222-222222222222' } } },
      },
      schema: () => ({
        rpc: async (nome: string) =>
          nome === 'criar_concessao_equipe_privado'
            ? await new Promise((_, rejeitar) => {
                auth.rpcIniciada();
                pedido.signal.addEventListener('abort', () => rejeitar(new Error()), {
                  once: true,
                });
              })
            : {
                error: null,
                data: {
                  session_id: '11111111-1111-4111-8111-111111111111',
                  usuario: {
                    id: '22222222-2222-4222-8222-222222222222',
                    perfil: 'profissional',
                    ativo: true,
                    versao: 1,
                  },
                  capacidades: [],
                },
              },
      }),
    },
  }),
  credencialAuthRejeitada: () => false,
}));

afterEach(() => {
  auth.falha = true;
  auth.cofreResultado = undefined;
  auth.cofre.mockClear();
  vi.unstubAllEnvs();
});

describe('rota de criação de concessão', () => {
  it('permanece indisponível quando a flag não está ativa', async () => {
    vi.stubEnv('FFCM_CRIACAO_EQUIPE_ATIVA', 'false');
    const resposta = await concessoesEquipe(
      new Request('https://example.test/api/admin/concessoes-equipe', { method: 'POST' }),
    );
    expect(resposta.status).toBe(503);
    expect((await resposta.json()).erro.codigo).toBe('servico_indisponivel');
  });

  it('rejeita entrada inválida antes de acessar dependências', async () => {
    vi.stubEnv('FFCM_CRIACAO_EQUIPE_ATIVA', 'true');
    const resposta = await concessoesEquipe(
      new Request('https://example.test/api/admin/concessoes-equipe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(resposta.status).toBe(422);
    expect((await resposta.json()).erro.codigo).toBe('entrada_invalida');
  });
  it('informa indisponibilidade quando Auth falha', async () => {
    vi.stubEnv('FFCM_CRIACAO_EQUIPE_ATIVA', 'true');
    const resposta = await concessoesEquipe(
      new Request('https://example.test/api/admin/concessoes-equipe', {
        method: 'POST',
        headers: {
          origin: 'https://example.test',
          'content-type': 'application/json',
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'x-sessao': '11111111-1111-4111-8111-111111111111',
        },
        body: JSON.stringify({
          email: 'pessoa@example.test',
          perfil: 'profissional',
          metodo: 'google_workspace',
          motivo: 'Motivo de teste válido',
        }),
      }),
    );
    expect(resposta.status).toBe(503);
    expect((await resposta.json()).erro.codigo).toBe('servico_indisponivel');
  });

  it('interrompe leitura de corpo pendente quando requisição é cancelada', async () => {
    vi.stubEnv('FFCM_CRIACAO_EQUIPE_ATIVA', 'true');
    const controle = new AbortController();
    const corpo = new ReadableStream({
      pull() {
        return new Promise<void>(() => {});
      },
    });
    const pedido = new Request('https://example.test/api/admin/concessoes-equipe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chave-idempotencia': 'chave_ficticia_123456',
      },
      body: corpo,
      signal: controle.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const resposta = concessoesEquipe(pedido);
    controle.abort();
    expect((await resposta).status).toBe(503);
  });
  it('não presume negativa de perfil antes da autorização transacional', async () => {
    auth.falha = false;
    vi.stubEnv('FFCM_CRIACAO_EQUIPE_ATIVA', 'true');
    const resposta = await concessoesEquipe(
      new Request('https://example.test/api/admin/concessoes-equipe', {
        method: 'POST',
        headers: {
          origin: 'https://example.test',
          'content-type': 'application/json',
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'x-sessao': '11111111-1111-4111-8111-111111111111',
        },
        body: JSON.stringify({
          email: 'pessoa@example.test',
          perfil: 'profissional',
          metodo: 'google_workspace',
          motivo: 'Motivo de teste válido',
        }),
      }),
    );
    // Cofre ausente neste teste: não é prova da negativa transacional.
    expect(resposta.status).toBe(503);
    expect(auth.cofre).toHaveBeenCalledOnce();
  });
  it('cancela a RPC em andamento e informa pendência externa', async () => {
    auth.falha = false;
    auth.cofreResultado = {
      cifra: criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(1) },
        chaveHmac: new Uint8Array(32).fill(2),
      }),
      atestador: criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(3) }),
    };
    vi.stubEnv('FFCM_CRIACAO_EQUIPE_ATIVA', 'true');
    const controle = new AbortController();
    const iniciada = new Promise<void>((resolve) => {
      auth.rpcIniciada = resolve;
    });
    const resposta = concessoesEquipe(
      new Request('https://example.test/api/admin/concessoes-equipe', {
        method: 'POST',
        signal: controle.signal,
        headers: {
          origin: 'https://example.test',
          'content-type': 'application/json',
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'x-sessao': '11111111-1111-4111-8111-111111111111',
        },
        body: JSON.stringify({
          email: 'pessoa@example.test',
          perfil: 'profissional',
          metodo: 'google_workspace',
          motivo: 'Motivo de teste válido',
        }),
      }),
    );
    await iniciada;
    controle.abort();
    const resultado = await resposta;
    expect(resultado.status).toBe(503);
    expect((await resultado.json()).erro.codigo).toBe('pendencia_externa');
  });
});
