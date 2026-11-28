// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { IndicadoresCarteiraLocal } from './indicadores-carteira-local';

function renderizar(raiz: HTMLElement, dados: ComponentProps<typeof IndicadoresCarteiraLocal>) {
  const painel = render(createElement(IndicadoresCarteiraLocal, dados), { container: raiz });
  return () => painel.rerender(null);
}

it('conta situações registradas e permite filtrar inclusive não informada', () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const filtrar = vi.fn();
  const desmontar = renderizar(raiz, {
    pacientes: [{ situacao: 'ativo' }, { situacao: 'ativo' }, { situacao: 'pausado' }, {}],
    filtrar,
  });
  const botoes = Array.from(raiz.querySelectorAll('button'));
  expect(botoes.map((botao) => botao.textContent)).toEqual([
    'Entrada: 0',
    'Ativo: 2',
    'Pausado: 1',
    'Encerrado: 0',
    'Transferido: 0',
    'Não informada: 1',
  ]);
  botoes[5]?.click();
  expect(filtrar).toHaveBeenCalledWith('');
  desmontar();
  raiz.remove();
});

it('mostra contagens sem botões quando filtro não está disponível', () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const desmontar = renderizar(raiz, { pacientes: [] });
  expect(raiz.textContent).toContain('Não informada: 0');
  expect(raiz.querySelector('button')).toBeNull();
  desmontar();
  raiz.remove();
});
