// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
/* O módulo não tinha prova. Localização é dado sensível com audiência própria, então as
 * duas fronteiras provadas aqui são as de autorização: sem `pode_gerir` nada é consultado
 * nem oferecido; com ela, perder o acesso no meio esvazia a tela. */
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { LocalizacaoCoordenacao } from './turno-execucao-localizacao-coordenacao.js';

function renderizarTela(
  raiz: HTMLElement,
  servico: ServicoTurnoExecucao,
  opcoes: Omit<ComponentProps<typeof LocalizacaoCoordenacao>, 'servico'>,
) {
  render(createElement(LocalizacaoCoordenacao, { servico, ...opcoes }), { container: raiz });
}

const turnoId = '30000000-0000-4000-8000-000000000001';
const botao = (raiz: HTMLElement, texto: string) => {
  const achado = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!achado) throw new Error(`Botão ausente: ${texto}`);
  return achado;
};

it('sem permissão vigente, o corpo fica oculto e nenhum turno é consultado', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = {
    candidatosMedicacao: vi
      .fn()
      .mockResolvedValue({ itens: [], proximo_cursor: null, pode_gerir: false }),
    relatorio: vi.fn(),
    consultarLocalizacao: vi.fn(),
  };
  renderizarTela(raiz, api as unknown as ServicoTurnoExecucao, {
    acessoPerdido: vi.fn(),
  });
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('não possui permissão vigente para consultar localização'),
  );
  expect(botao(raiz, 'Consultar turnos autorizados').closest('[hidden]')).not.toBeNull();
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  botao(raiz, 'Consultar localização declarada').click();
  expect(api.relatorio).not.toHaveBeenCalled();
  expect(api.consultarLocalizacao).not.toHaveBeenCalled();
});

it('perda de acesso ao consultar a localização esvazia a tela e avisa o hospedeiro', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const perdido = vi.fn();
  const api = {
    candidatosMedicacao: vi
      .fn()
      .mockResolvedValue({ itens: [], proximo_cursor: null, pode_gerir: true }),
    relatorio: vi.fn().mockResolvedValue({
      consulta_id: turnoId,
      itens: [
        { dados: { turno_id: turnoId, aberto_em: '2026-11-19T12:00:00Z', situacao: 'aberto' } },
      ],
      proximo_cursor: null,
    }),
    consultarLocalizacao: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)),
  };
  renderizarTela(raiz, api as unknown as ServicoTurnoExecucao, {
    acessoPerdido: perdido,
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Operação restrita disponível'));
  botao(raiz, 'Consultar turnos autorizados').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Turnos consultados'));
  const seletor = raiz.querySelector<HTMLSelectElement>('select[name="turno"]');
  if (!seletor) throw new Error('Seletor ausente');
  seletor.value = turnoId;
  seletor.dispatchEvent(new Event('change', { bubbles: true }));
  botao(raiz, 'Consultar localização declarada').click();
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(api.consultarLocalizacao).toHaveBeenCalledWith({ turno_id: turnoId });
  expect(raiz.textContent).toBe('');
});
