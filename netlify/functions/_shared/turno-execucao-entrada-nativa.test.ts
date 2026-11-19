import { describe, it, expect, vi } from 'vitest';
import { criarEntradaExecucaoTurno } from './turno-execucao-entrada-nativa.ts';
import type { DependenciasExecucaoTurno } from './turno-execucao-compor-nativo.ts';
const paciente = 'c0000000-0000-4000-8000-000000000003';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const id = 'd0000000-0000-4000-8000-000000000004';
const base = `https://exemplo.test/api/pacientes/${paciente}/execucao-turno`;
const deps = {} as DependenciasExecucaoTurno;
describe('fronteira HTTP execução', () => {
  it.each(['?limite=1&limite=2', '?atestado=forjado', '?paciente_id=outro'])(
    'rejeita parâmetros ambíguos/privados %s antes do servidor',
    async (sufixo) => {
      const operar = vi.fn();
      const r = await criarEntradaExecucaoTurno(deps, operar).atender(
        new Request(`${base}/catalogo${sufixo}`, { headers: { 'x-sessao': sessao } }),
      );
      expect(r.status).toBe(422);
      expect(operar).not.toHaveBeenCalled();
    },
  );
  it('sem sessão não chama composição', async () => {
    const operar = vi.fn();
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(`${base}/catalogo`),
    );
    expect(r.status).toBe(401);
    expect(operar).not.toHaveBeenCalled();
  });
  it('corpo excessivo não chega a cifra/SQL', async () => {
    const operar = vi.fn();
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(base, {
        method: 'POST',
        headers: {
          'x-sessao': sessao,
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ texto: 'a'.repeat(131073) }),
      }),
    );
    expect(r.status).toBe(422);
    expect(operar).not.toHaveBeenCalled();
  });
  it('GET download mantém ID da rota e envia binário privado sem URL de Storage', async () => {
    const operar = vi.fn(async () => ({
      ok: true as const,
      dados: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(16).fill(0)]),
      request_id: id,
    }));
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(`${base}/anexos/${id}`, { headers: { 'x-sessao': sessao } }),
    );
    expect(r.status).toBe(200);
    expect((operar.mock.calls as unknown as unknown[][])[0]?.[1]).toMatchObject({
      operacao: 'baixarAnexo',
      paciente_id: paciente,
      anexo_id: id,
      entrada: {},
    });
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(16).fill(0)]),
    );
  });
  it('resultado incerto conserva request_id da mutação para conferência', async () => {
    const operar = vi.fn(async () => ({
      ok: false as const,
      erro: { codigo: 'pendencia_externa' },
      request_id: id,
    }));
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(`${base}/localizacao`, {
        method: 'POST',
        headers: {
          'x-sessao': sessao,
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          turno_id: id,
          momento: 'abertura',
          motivo_ausencia: 'indisponivel',
        }),
      }),
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ request_id: id });
  });
});
