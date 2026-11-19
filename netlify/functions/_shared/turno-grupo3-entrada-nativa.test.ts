import { expect, it, vi } from 'vitest';
import { criarEntradaTurnoGrupo3, rotaGrupo3 } from './turno-grupo3-entrada-nativa.ts';
import { criarEntradaTurnoNativa } from './turno-entrada-nativa.ts';
const id: ReturnType<typeof crypto.randomUUID> = '11111111-1111-4111-8111-111111111111';
const dependencias = {} as Parameters<typeof criarEntradaTurnoGrupo3>[0];
it('despacha escala e passagem por rotas literais distintas de consulta UUID', () => {
  expect(
    rotaGrupo3(new Request(`https://example.test/api/pacientes/${id}/turnos/escala`)),
  ).toMatchObject({ operacao: 'escala', paciente_id: id });
  expect(
    rotaGrupo3(
      new Request(`https://example.test/api/pacientes/${id}/turnos/${id}/passagem/ciencia`, {
        method: 'POST',
      }),
    ),
  ).toMatchObject({ operacao: 'ciencia', turno_id: id });
  expect(
    rotaGrupo3(new Request(`https://example.test/api/pacientes/${id}/turnos/${id}`)),
  ).toBeNull();
});
it('recusa identidade injetada e corpo excessivo antes da composição', async () => {
  const operar = vi.fn();
  const entrada = criarEntradaTurnoGrupo3(dependencias, operar);
  for (const corpo of [{ usuario_id: id }, { motivo: 'x'.repeat(33_000) }]) {
    const resposta = await entrada.atender(
      new Request(`https://example.test/api/pacientes/${id}/turnos/${id}/passagem/ciencia`, {
        method: 'POST',
        headers: {
          'x-sessao': id,
          'x-chave-idempotencia': 'chave-ficticia-123456789',
          'content-type': 'application/json',
        },
        body: JSON.stringify(corpo),
      }),
    );
    expect(resposta.status).toBe(422);
  }
  expect(operar).not.toHaveBeenCalled();
});
it('consulta último próprio usa modo específico sem interpretar literal como UUID', async () => {
  const operar = vi.fn(
    async (
      _request: Request,
      _comando: Parameters<NonNullable<Parameters<typeof criarEntradaTurnoNativa>[1]>>[1],
    ) => ({ ok: true as const, repeticao: false, dados: null, request_id: id }),
  );
  const entrada = criarEntradaTurnoNativa(
    {} as Parameters<typeof criarEntradaTurnoNativa>[0],
    operar,
  );
  const resposta = await entrada.atender(
    new Request(`https://example.test/api/pacientes/${id}/turnos/ultimo`, {
      headers: { 'x-sessao': id },
    }),
  );
  expect(resposta.status).toBe(200);
  expect(operar.mock.calls[0]?.[1]).toMatchObject({
    operacao: 'consultar_ultimo',
    paciente_id: id,
  });
});

it('aceita somente par de cursor completo na leitura de escala, sem parâmetros duplicados', async () => {
  const operar = vi.fn(async (_request: Request, _comando: { entrada: unknown }) => ({
    ok: true as const,
    dados: {
      identidades: [],
      proximo_cursor: null,
      pode_gerir: false,
      profissionais: [],
      itens: [],
    },
    request_id: id,
  }));
  const entrada = criarEntradaTurnoGrupo3(dependencias, operar);
  const pedir = (query: string) =>
    entrada.atender(
      new Request(`https://example.test/api/pacientes/${id}/turnos/escala${query}`, {
        headers: { 'x-sessao': id },
      }),
    );
  for (const query of [
    `?cursor_escala_id=${id}`,
    '?cursor_versao=1',
    `?cursor_escala_id=${id}&cursor_versao=0`,
    `?cursor_escala_id=${id}&cursor_versao=1&cursor_versao=2`,
    '?usuario_id=x',
  ])
    expect((await pedir(query)).status).toBe(422);
  expect(operar).not.toHaveBeenCalled();
  expect((await pedir(`?cursor_escala_id=${id}&cursor_versao=50`)).status).toBe(200);
  expect(operar.mock.calls[0]?.[1]).toMatchObject({
    entrada: { cursor_escala_id: id, cursor_versao: 50 },
  });
});
