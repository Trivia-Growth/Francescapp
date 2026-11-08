import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { processarBarreiraEquipeNativa } from './equipe-barreira-handler-nativo.ts';

const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
};
const reserva_id = 'd0000000-0000-4000-8000-000000000004';
const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) });
const autorizado = { estado: 'autorizado' as const, identidade };
function portas() {
  return {
    autorizar: vi.fn(async () => autorizado),
    revalidar: vi.fn(async () => autorizado),
    validarOrigem: vi.fn(async () => true),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:00:30Z',
    }),
    atestador,
    executar: vi.fn(
      async (
        _request: Request,
        transporte: { p_transporte: { entrada: { request_id: string } } },
      ) => ({
        ok: true,
        dados: { estado: 'bloqueada' },
        request_id: transporte.p_transporte.entrada.request_id,
      }),
    ),
  };
}
function pedido(corpo: unknown = { epoca: 1, reserva_id }, signal?: AbortSignal) {
  return new Request('https://exemplo.test/api/equipe/barreira/reservar', {
    method: 'POST',
    headers: {
      'x-sessao': identidade.session_id,
      origin: 'https://exemplo.test',
      'content-type': 'application/json',
    },
    body: JSON.stringify(corpo),
    signal,
  });
}
describe('handler nativo da barreira', () => {
  it('preserva estado de conflito e assina identidade autenticada', async () => {
    const deps = portas();
    const resposta = await processarBarreiraEquipeNativa(pedido(), 'reservar', deps);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ dados: { estado: 'bloqueada' } });
    expect(resposta.headers.get('cache-control')).toContain('no-store');
    expect(deps.executar.mock.calls[0]?.[1].p_transporte.entrada).toMatchObject({
      operacao: 'api.reservar_concessao_equipe',
      atestado: identidade,
    });
  });
  it('recusa origem e campos indevidos antes da RPC', async () => {
    const deps = portas();
    deps.validarOrigem.mockResolvedValue(false);
    expect((await processarBarreiraEquipeNativa(pedido(), 'reservar', deps)).status).toBe(403);
    deps.validarOrigem.mockResolvedValue(true);
    expect(
      (
        await processarBarreiraEquipeNativa(
          pedido({ epoca: 1, reserva_id, usuario_id: identidade.usuario_id }),
          'reservar',
          deps,
        )
      ).status,
    ).toBe(422);
    expect(deps.executar).not.toHaveBeenCalled();
  });
  it('recusa troca de identidade na revalidação antes da RPC', async () => {
    const deps = portas();
    deps.revalidar.mockResolvedValue({
      estado: 'autorizado',
      identidade: { ...identidade, session_id: reserva_id },
    });
    expect((await processarBarreiraEquipeNativa(pedido(), 'reservar', deps)).status).toBe(401);
    expect(deps.executar).not.toHaveBeenCalled();
  });
  it('trata resposta incorreta após mutação como pendência', async () => {
    const deps = portas();
    deps.executar.mockImplementation(async () => {
      throw new Error('detalhe privado');
    });
    const resposta = await processarBarreiraEquipeNativa(pedido(), 'reservar', deps);
    expect(await resposta.json()).toMatchObject({ erro: { codigo: 'pendencia_externa' } });
  });
  it('trata cancelamento durante RPC como pendência', async () => {
    const deps = portas();
    const controle = new AbortController();
    deps.executar.mockImplementation(async () => {
      controle.abort();
      return new Promise(() => {});
    });
    const resposta = await processarBarreiraEquipeNativa(
      pedido(undefined, controle.signal),
      'reservar',
      deps,
    );
    expect(deps.executar).toHaveBeenCalledOnce();
    expect(await resposta.json()).toMatchObject({ erro: { codigo: 'pendencia_externa' } });
  });
  it('não divulga resultado quando sessão é revogada após RPC', async () => {
    const deps = portas();
    const revalidar = vi
      .fn()
      .mockResolvedValueOnce(autorizado)
      .mockResolvedValueOnce({ estado: 'nao_autenticado' });
    const resposta = await processarBarreiraEquipeNativa(pedido(), 'reservar', {
      ...deps,
      revalidar,
    });
    expect(deps.executar).toHaveBeenCalledOnce();
    expect(await resposta.json()).toMatchObject({ erro: { codigo: 'pendencia_externa' } });
  });
  it('recusa request_id divergente após RPC', async () => {
    const deps = portas();
    deps.executar.mockResolvedValue({
      ok: true,
      dados: { estado: 'bloqueada' },
      request_id: reserva_id,
    });
    const resposta = await processarBarreiraEquipeNativa(pedido(), 'reservar', deps);
    expect(await resposta.json()).toMatchObject({ erro: { codigo: 'pendencia_externa' } });
  });
});
