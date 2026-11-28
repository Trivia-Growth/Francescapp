import { beforeEach, expect, it, vi } from 'vitest';
import { clienteConsultas, esquecerConsultas, leituraPorSessao } from './consultas.js';

/* Revisão do #85: a troca de identidade é conferida a cada consulta, não só quando a
 * leitura é criada; e esquecer a leitura de uma identidade antiga não apaga a atual. */
const contaA = { usuario_id: 'a', session_id: 'a1' };
const contaB = { usuario_id: 'b', session_id: 'b1' };
const chaves = () =>
  clienteConsultas
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey);

beforeEach(() => esquecerConsultas());

it('consultar depois de outra identidade passar pelo cache apaga o que é dela', async () => {
  const deA = leituraPorSessao(contaA, ['recurso'], vi.fn().mockResolvedValue('de A'));
  const deB = leituraPorSessao(contaB, ['recurso'], vi.fn().mockResolvedValue('de B'));
  await deB.consultar();
  expect(chaves()).toEqual([['sessao', 'b', 'b1', 'recurso']]);
  await deA.consultar();
  expect(chaves()).toEqual([['sessao', 'a', 'a1', 'recurso']]);
  expect(deB.leitura.retida()).toBeUndefined();
});

it('descartar a leitura de uma identidade antiga não apaga a da atual', async () => {
  const deA = leituraPorSessao(contaA, ['recurso'], vi.fn().mockResolvedValue('de A'));
  const deB = leituraPorSessao(contaB, ['recurso'], vi.fn().mockResolvedValue('de B'));
  await deB.consultar();
  deA.leitura.descartar();
  expect(deB.leitura.retida()).toBe('de B');
});
