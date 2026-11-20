import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./configurar-dependencias-nativas.ts', () => ({
  configurarDependenciasNativas: () => ({ pool: {} }),
}));
vi.mock('./configuracao-servidor.ts', () => ({ servicoAtivo: vi.fn(async () => false) }));
vi.mock('./turno-compor-barreira-nativa.ts', () => ({
  comporBarreiraTurnoNativa: vi.fn(async () => Response.json({ ficticio: true })),
}));
import { servicoAtivo } from './configuracao-servidor.ts';
import { comporBarreiraTurnoNativa } from './turno-compor-barreira-nativa.ts';
import turnos from '../turnos.ts';
afterEach(() => vi.clearAllMocks());
it('consulta interruptor administrado e mantém turno desativado sem variável nova', async () => {
  const resposta = await turnos(new Request('https://example.test/api/turnos/barreira'));
  expect(resposta.status).toBe(503);
  expect(servicoAtivo).toHaveBeenCalledWith(expect.anything(), 'ffcm.turno.ativo', false);
  expect(comporBarreiraTurnoNativa).not.toHaveBeenCalled();
});
it('encaminha barreira ao módulo próprio somente com interruptor ativo', async () => {
  vi.mocked(servicoAtivo).mockResolvedValueOnce(true);
  const resposta = await turnos(new Request('https://example.test/api/turnos/barreira'));
  expect(resposta.status).toBe(200);
  expect(comporBarreiraTurnoNativa).toHaveBeenCalledWith(
    expect.any(Request),
    'consultar',
    expect.anything(),
  );
});

it('responde erro público quando consulta do interruptor falha', async () => {
  vi.mocked(servicoAtivo).mockRejectedValueOnce(new Error('falha fictícia'));
  const resposta = await turnos(new Request('https://example.test/api/turnos/barreira'));
  expect(resposta.status).toBe(503);
  expect((await resposta.json()).erro.codigo).toBe('servico_indisponivel');
  expect(comporBarreiraTurnoNativa).not.toHaveBeenCalled();
});
