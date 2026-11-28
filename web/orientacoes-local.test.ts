// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { OrientacoesLocais, type OrientacaoLocal } from './orientacoes-local.tsx';

function renderizar(raiz: HTMLElement, dados: ComponentProps<typeof OrientacoesLocais>['dados']) {
  render(createElement(OrientacoesLocais, { dados, ehFamilia: false }), { container: raiz });
}

it('preserva versões e rascunho quando gravação falha', async () => {
  const raiz = document.createElement('div');
  const orientacoes: OrientacaoLocal[] = [
    {
      id: '1',
      texto: '<orientação antiga>',
      autor: 'Ana',
      data: '2026-01-01',
      destinatarios: 'Família',
      validade: null,
      anterior: false,
    },
  ];
  const salvar = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValue(undefined);
  renderizar(raiz, { orientacoes, aoSalvar: salvar });
  expect(raiz.querySelector('orientação')).toBeNull();
  (raiz.querySelector('li button') as HTMLButtonElement).click();
  const texto = raiz.querySelector('textarea') as HTMLTextAreaElement;
  texto.value = 'Nova orientação';
  const form = raiz.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho foi preservado'));
  expect(orientacoes).toHaveLength(1);
  expect(orientacoes[0].anterior).toBe(false);
  expect(texto.value).toBe('Nova orientação');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(orientacoes).toHaveLength(2));
  expect(orientacoes[0].anterior).toBe(true);
  expect(orientacoes[1]).toMatchObject({ texto: 'Nova orientação', anterior: false });
  expect(raiz.textContent).toContain('Anterior');
});
