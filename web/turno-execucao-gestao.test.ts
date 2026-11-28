// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { GestaoExecucaoTurno } from './turno-execucao-gestao.js';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { FalhaApi } from './api.ts';
function renderizarTela(
  raiz: HTMLElement,
  servico: ServicoTurnoExecucao,
  opcoes: Omit<ComponentProps<typeof GestaoExecucaoTurno>, 'servico'>,
) {
  const painel = render(createElement(GestaoExecucaoTurno, { servico, ...opcoes }), {
    container: raiz,
  });
  return () => painel.rerender(null);
}

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
  const desmontar = renderizarTela(raiz, api as unknown as ServicoTurnoExecucao, {
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
  const desmontar = renderizarTela(raiz, api as unknown as ServicoTurnoExecucao, {
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
/* Concessão de medicação é ato de autorização: com resultado incerto, nenhuma alteração
 * nova é aceita até conferir, e a repetição precisa levar a MESMA chave de idempotência. */
it('concessão incerta bloqueia novas alterações e só se repete igual depois de conferida', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const pessoa = { usuario_id: id, nome: 'Profissional fictício', concedida: false };
  const api = {
    candidatosMedicacao: vi
      .fn()
      .mockResolvedValue({ itens: [pessoa], proximo_cursor: null, pode_gerir: true }),
    familiares: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null, pode_gerir: true }),
    concederMedicacao: vi
      .fn()
      .mockRejectedValueOnce(new FalhaApi('pendencia_externa', 0, true))
      .mockResolvedValue(undefined),
    catalogo: vi.fn(),
  };
  renderizarTela(raiz, api as unknown as ServicoTurnoExecucao, {
    administrador: false,
    acessoPerdido: vi.fn(),
  });
  const botao = (texto: string) => {
    const achado = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
    if (!achado) throw new Error(`Botão ausente: ${texto}`);
    return achado;
  };
  await vi.waitFor(() => expect(raiz.textContent).toContain('Profissional fictício'));
  botao('Conceder registro').click();
  await vi.waitFor(() => expect(botao('Conferir alteração pendente').hidden).toBe(false));
  expect(botao('Conceder registro').closest('fieldset')?.disabled).toBe(true);
  expect(botao('Repetir exatamente a alteração conferida').disabled).toBe(true);
  botao('Conferir alteração pendente').click();
  await vi.waitFor(() =>
    expect(botao('Repetir exatamente a alteração conferida').disabled).toBe(false),
  );
  botao('Repetir exatamente a alteração conferida').click();
  await vi.waitFor(() => expect(api.concederMedicacao).toHaveBeenCalledTimes(2));
  const [primeira, segunda] = api.concederMedicacao.mock.calls;
  expect(segunda).toEqual(primeira);
});
