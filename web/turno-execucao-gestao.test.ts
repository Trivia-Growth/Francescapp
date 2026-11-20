// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarGestaoExecucaoTurno } from './turno-execucao-gestao.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
const id = '10000000-0000-4000-8000-000000000001';
it('sem capacidade de gestão não consulta familiares nem oferece concessão', async () => {
  const raiz = document.createElement('div');
  const api = {
    candidatosMedicacao: vi
      .fn()
      .mockResolvedValue({ itens: [], proximo_cursor: null, pode_gerir: false }),
    familiares: vi.fn(),
    catalogo: vi.fn(),
    concederMedicacao: vi.fn(),
  };
  const desmontar = montarGestaoExecucaoTurno(raiz, api as unknown as ServicoTurnoExecucao, {
    administrador: false,
    acessoPerdido: vi.fn(),
  });
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Gestão de fundamentos e concessões disponível'),
  );
  expect(api.familiares).not.toHaveBeenCalled();
  expect(api.catalogo).not.toHaveBeenCalled();
  expect(api.concederMedicacao).not.toHaveBeenCalled();
  desmontar();
});
it('case manager autorizado escolhe familiar por nome, sem entrada manual de identificador', async () => {
  const raiz = document.createElement('div');
  const api = {
    candidatosMedicacao: vi
      .fn()
      .mockResolvedValue({ itens: [], proximo_cursor: null, pode_gerir: true }),
    familiares: vi.fn().mockResolvedValue({
      itens: [{ usuario_id: id, nome: 'Familiar fictício' }],
      proximo_cursor: null,
      pode_gerir: true,
    }),
    consultarFundamento: vi.fn().mockResolvedValue(null),
    catalogo: vi.fn(),
  };
  const desmontar = montarGestaoExecucaoTurno(raiz, api as unknown as ServicoTurnoExecucao, {
    administrador: false,
    acessoPerdido: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Familiar fictício'));
  const seletor = raiz.querySelector('select');
  if (!seletor) throw new Error('Seletor ausente');
  seletor.value = id;
  seletor.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(api.consultarFundamento).toHaveBeenCalledWith({ familiar_usuario_id: id }),
  );
  expect(
    [...raiz.querySelectorAll('label')].some((label) =>
      label.textContent?.includes('Identificador'),
    ),
  ).toBe(false);
  expect(api.catalogo).not.toHaveBeenCalled();
  desmontar();
});
