import { expect, it, vi } from 'vitest';
import { criarEntradaTurnoNativa } from './turno-entrada-nativa.ts';

// PREPARADO, NÃO EXECUTADO. O adapter não substitui provas SQL de autorização.
const id = 'a0000000-0000-4000-8000-000000000001';
const dependencias = {} as Parameters<typeof criarEntradaTurnoNativa>[0];
const pedido = (sufixo = 'atual') =>
  new Request(`https://example.test/api/pacientes/${id}/turnos/${sufixo}`, {
    headers: { 'x-sessao': id },
  });
const operar = () =>
  vi.fn(async () => ({ ok: true as const, dados: null, repeticao: false, request_id: id }));
it('rota literal atual é leitura sem UUID e preserva envelope nulo confirmado', async () => {
  const executar = operar();
  const resposta = await criarEntradaTurnoNativa(dependencias, executar).atender(pedido());
  expect(resposta.status).toBe(200);
  expect(await resposta.json()).toEqual({ dados: null, request_id: id });
  expect(executar).toHaveBeenCalledWith(
    expect.any(Request),
    { operacao: 'consultar_atual', paciente_id: id },
    dependencias,
  );
  expect(resposta.headers.get('cache-control')).toBe('private, no-store');
});
it('consulta UUID existente permanece distinta', async () => {
  const executar = operar();
  expect((await criarEntradaTurnoNativa(dependencias, executar).atender(pedido(id))).status).toBe(
    200,
  );
  expect(executar).toHaveBeenCalledWith(
    expect.any(Request),
    { operacao: 'consultar', paciente_id: id, turno_id: id },
    dependencias,
  );
});
it('query forjada e sessão ausente são recusadas sem consultar', async () => {
  const executar = operar();
  const entrada = criarEntradaTurnoNativa(dependencias, executar);
  expect((await entrada.atender(pedido(`atual?profissional_usuario_id=${id}`))).status).toBe(400);
  expect(
    (await entrada.atender(new Request(`https://example.test/api/pacientes/${id}/turnos/atual`)))
      .status,
  ).toBe(401);
  expect(executar).not.toHaveBeenCalled();
});
it('erro de autorização e indisponibilidade nunca viram vazio', async () => {
  for (const codigo of ['sem_permissao', 'servico_indisponivel']) {
    const executar = vi.fn(async () => ({ ok: false as const, erro: { codigo }, request_id: id }));
    const r = await criarEntradaTurnoNativa(dependencias, executar).atender(pedido());
    expect(r.status).toBe(codigo === 'sem_permissao' ? 403 : 503);
    expect(await r.json()).not.toHaveProperty('dados');
  }
});
