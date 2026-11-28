// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { EvolucoesLocais, type EvolucaoLocal } from './evolucoes-locais';

function renderizar(raiz: HTMLElement, dados: ComponentProps<typeof EvolucoesLocais>['dados']) {
  render(createElement(EvolucoesLocais, { dados }), { container: raiz });
}

it('preserva entrada após falha e registra publicação simulada sem interpretar texto como HTML', async () => {
  const raiz = document.createElement('div');
  const evolucoes: EvolucaoLocal[] = [];
  const salvar = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValue(undefined);
  renderizar(raiz, { evolucoes, aoSalvar: salvar });
  const texto = raiz.querySelector('textarea') as HTMLTextAreaElement;
  const campos = raiz.querySelectorAll('input');
  texto.value = '<texto fictício>';
  campos[0].value = '2026-01-01';
  campos[1].value = 'Ana fictícia';
  campos[2].value = 'Fisioterapia';
  (raiz.querySelector('select') as HTMLSelectElement).value = 'publicada';
  const form = raiz.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho foi preservado'));
  expect(evolucoes).toHaveLength(0);
  expect(texto.value).toBe('<texto fictício>');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(evolucoes).toHaveLength(1));
  expect(evolucoes[0]).toMatchObject({
    texto: '<texto fictício>',
    data: '2026-01-01',
    autor: 'Ana fictícia',
    area: 'Fisioterapia',
    estado: 'publicada',
  });
  expect(raiz.textContent).toContain('Publicada na prévia (simulação)');
  expect(raiz.querySelector('texto')).toBeNull();
});
