import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCursorCarteira } from '../../../packages/cadastro/src/cursor-carteira.ts';
import { consultarCarteiraNativa } from './carteira-handler-nativo.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const pedido = () =>
  new Request('https://exemplo.test/api/pacientes?limite=1', {
    headers: { 'x-sessao': session_id },
  });
async function portas() {
  return {
    autorizar: async () => ({
      estado: 'autorizado' as const,
      identidade: { usuario_id, session_id },
    }),
    revalidar: async () => ({
      estado: 'autorizado' as const,
      identidade: { usuario_id, session_id },
    }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:01:00Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    cursor: await criarCursorCarteira(new Uint8Array(32).fill(4)),
    executar: vi.fn(
      async (_request: Request, entrada: { p_entrada: { entrada: { request_id: string } } }) => ({
        ok: true,
        request_id: entrada.p_entrada.entrada.request_id,
        dados: { itens: [], proximo_cursor: null },
      }),
    ),
    cifra: {
      decifrar: async () => {
        throw new Error('inesperado');
      },
    },
  };
}
describe('composição interna da carteira nativa', () => {
  it('encerra por prazo quando autorização não responde', async () => {
    const dependencias = await portas();
    vi.useFakeTimers();
    try {
      const pendente = consultarCarteiraNativa(pedido(), {
        ...dependencias,
        autorizar: () => new Promise(() => {}),
      });
      await vi.advanceTimersByTimeAsync(10_000);
      const resposta = await pendente;
      expect(resposta.status).toBe(503);
      expect(dependencias.executar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([undefined, 'c0000000-0000-4000-8000-000000000003'])(
    'recusa seletor ausente ou divergente antes de consultar',
    async (seletor) => {
      const dependencias = await portas();
      const request = new Request('https://exemplo.test/api/pacientes?limite=1', {
        headers: seletor ? { 'x-sessao': seletor } : {},
      });
      const resposta = await consultarCarteiraNativa(request, dependencias);
      expect(resposta.status).toBe(401);
      expect(dependencias.executar).not.toHaveBeenCalled();
    },
  );
  it('não executa consulta após cancelamento durante autorização', async () => {
    const dependencias = await portas();
    const controle = new AbortController();
    const request = new Request('https://exemplo.test/api/pacientes?limite=1', {
      headers: { 'x-sessao': session_id },
      signal: controle.signal,
    });
    const resposta = await consultarCarteiraNativa(request, {
      ...dependencias,
      autorizar: async () => {
        controle.abort();
        return dependencias.autorizar();
      },
    });
    expect(resposta.status).toBe(503);
    expect(dependencias.executar).not.toHaveBeenCalled();
  });
  it('não divulga página após cancelamento durante consulta', async () => {
    const dependencias = await portas();
    const controle = new AbortController();
    const request = new Request('https://exemplo.test/api/pacientes?limite=1', {
      headers: { 'x-sessao': session_id },
      signal: controle.signal,
    });
    const resposta = await consultarCarteiraNativa(request, {
      ...dependencias,
      executar: async (...args) => {
        const resultado = await dependencias.executar(...args);
        controle.abort();
        return resultado;
      },
    });
    expect(resposta.status).toBe(503);
    expect(await resposta.json()).not.toHaveProperty('dados');
  });
  it.each([
    { estado: 'nao_autenticado' as const },
    {
      estado: 'autorizado' as const,
      identidade: { usuario_id, session_id: 'c0000000-0000-4000-8000-000000000003' },
    },
  ])('não divulga página após revogação ou troca de sessão', async (novaAutorizacao) => {
    const resposta = await consultarCarteiraNativa(pedido(), {
      ...(await portas()),
      revalidar: async () => novaAutorizacao,
    });
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).not.toHaveProperty('dados');
  });
  it('recusa parâmetro inválido antes da execução', async () => {
    const dependencias = await portas();
    const request = new Request('https://exemplo.test/api/pacientes?limite=0', {
      headers: { 'x-sessao': session_id },
    });
    const resposta = await consultarCarteiraNativa(request, dependencias);
    expect(resposta.status).toBe(422);
    expect(dependencias.executar).not.toHaveBeenCalled();
  });
  it('retorna somente página autorizada com resposta sem cache', async () => {
    const resposta = await consultarCarteiraNativa(pedido(), await portas());
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('cache-control')).toContain('no-store');
    expect((await resposta.json()).dados).toEqual({ itens: [], proximo_cursor: null });
  });
  it('não executa a consulta quando sessão é recusada', async () => {
    const dependencias = await portas();
    const resposta = await consultarCarteiraNativa(pedido(), {
      ...dependencias,
      autorizar: async () => ({ estado: 'nao_autenticado' }),
    });
    expect(resposta.status).toBe(401);
    expect(dependencias.executar).not.toHaveBeenCalled();
  });
  it('falha fechada quando execução devolve resposta inválida', async () => {
    const dependencias = await portas();
    const resposta = await consultarCarteiraNativa(pedido(), {
      ...dependencias,
      executar: async () => ({ segredo: 'interno' }),
    });
    expect(resposta.status).toBe(503);
    expect(JSON.stringify(await resposta.json())).not.toContain('interno');
  });
});
