import { expect, it, vi } from 'vitest';
import { criarEntradaTurnoNativa } from './turno-entrada-nativa.ts';
const id = 'a0000000-0000-4000-8000-000000000001';
const corpo = { turno_id: id, reserva_id: id, geracao_reserva: 1 };
const dependencias = {} as Parameters<typeof criarEntradaTurnoNativa>[0];
function pedido(entrada: unknown) {
  return new Request(`https://example.test/api/pacientes/${id}/turnos/abrir`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sessao': id,
      'x-chave-idempotencia': 'ficticio-1234567890',
    },
    body: JSON.stringify(entrada),
  });
}
it('descarta relógio forjado e recusa autoria forjada antes da composição', async () => {
  const operar = vi.fn(
    async (
      _request: Request,
      _comando: import('./turno-nativo.ts').ComandoTurno,
      _dependencias: typeof dependencias,
    ) => ({ ok: false as const, erro: { codigo: 'sem_permissao' }, request_id: id }) as const,
  );
  const entrada = criarEntradaTurnoNativa(dependencias, operar);
  expect(
    (await entrada.atender(pedido({ ...corpo, aberto_em: '1900-01-01T00:00:00Z' }))).status,
  ).toBe(403);
  expect(operar.mock.calls[0]?.[1]).not.toHaveProperty('aberto_em');
  operar.mockClear();
  expect((await entrada.atender(pedido({ ...corpo, profissional_usuario_id: id }))).status).toBe(
    422,
  );
  expect(operar).not.toHaveBeenCalled();
});
it('não apresenta sucesso quando composição informa persistência incerta', async () => {
  const operar = vi.fn(
    async (
      _request: Request,
      _comando: import('./turno-nativo.ts').ComandoTurno,
      _dependencias: typeof dependencias,
    ) => ({ ok: false as const, erro: { codigo: 'pendencia_externa' }, request_id: id }) as const,
  );
  const resposta = await criarEntradaTurnoNativa(dependencias, operar).atender(pedido(corpo));
  expect((await resposta.json()).erro.codigo).toBe('pendencia_externa');
});
