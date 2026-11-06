import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { prepararBarreiraNativa } from './barreira-nativa.ts';

const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
};
const metadados = {
  key_id: 'teste',
  request_id: 'c0000000-0000-4000-8000-000000000003',
  emitido_em: '2026-10-29T12:00:00Z',
  expira_em: '2026-10-29T12:00:30Z',
};
const reserva_id = 'd0000000-0000-4000-8000-000000000004';
const comando_id = 'e0000000-0000-4000-8000-000000000005';
const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) });
const request = (sessao = identidade.session_id) =>
  new Request('https://exemplo.test', { headers: { 'x-sessao': sessao } });

describe('preparação nativa da barreira', () => {
  it.each([
    { operacao: 'api.reservar_cadastro', epoca: 1, reserva_id },
    { operacao: 'api.encerrar_cadastro', epoca: 1, reserva_id: null, comando_id },
    { operacao: 'api.consultar_barreira_cadastro' },
    { operacao: 'api.reconhecer_barreira_cadastro', comando_id },
  ])('assina operação e identidade comprovada: $operacao', async (entrada) => {
    const { p_transporte } = await prepararBarreiraNativa(request(), identidade, entrada, {
      metadados,
      atestador,
    });
    expect(JSON.parse(p_transporte.entrada_canonica)).toEqual({
      ...entrada,
      request_id: metadados.request_id,
    });
    expect(p_transporte.entrada.atestado).toMatchObject({
      ...identidade,
      request_id: metadados.request_id,
      operacao: entrada.operacao,
    });
  });
  it('recusa identidade divergente e entrada com campos indevidos antes de assinar', async () => {
    const assinar = vi.fn(atestador.atestarEntrada);
    const deps = { metadados, atestador: { atestarEntrada: assinar } };
    const entrada = { operacao: 'api.consultar_barreira_cadastro' };
    await expect(
      prepararBarreiraNativa(request(reserva_id), identidade, entrada, deps),
    ).rejects.toThrow();
    await expect(
      prepararBarreiraNativa(
        request(),
        identidade,
        { ...entrada, usuario_id: identidade.usuario_id },
        deps,
      ),
    ).rejects.toThrow();
    expect(assinar).not.toHaveBeenCalled();
  });
  it('recusa entrada alterada pelo assinador', async () => {
    const assinar = async (dados: unknown, entrada: Record<string, unknown>) =>
      atestador.atestarEntrada(dados, { ...entrada, epoca: 2 });
    await expect(
      prepararBarreiraNativa(
        request(),
        identidade,
        { operacao: 'api.reservar_cadastro', epoca: 1, reserva_id },
        { metadados, atestador: { atestarEntrada: assinar } },
      ),
    ).rejects.toThrow('Não foi possível preparar a barreira.');
  });
});
