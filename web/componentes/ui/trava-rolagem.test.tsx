// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useTravaRolagem } from './trava-rolagem.js';

function Tela({ ativa }: { ativa: boolean }) {
  useTravaRolagem(ativa);
  return null;
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

it('trava a rolagem do corpo por CSSOM, que a CSP não bloqueia', () => {
  /* A trava do Radix depende de um `<style>` injetado, barrado por `style-src 'self'`.
     Medido em Chromium em 25/11/2026: o atributo era aplicado, a folha nunca, e o fundo
     rolava com o diálogo aberto. Aqui a trava é `element.style`, que é CSSOM. */
  const { rerender } = render(<Tela ativa={false} />);
  expect(document.body.style.overflow).toBe('');

  rerender(<Tela ativa />);
  expect(document.body.style.overflow).toBe('hidden');
});

it('devolve a rolagem e o espaçamento ao fechar', () => {
  document.body.style.overflow = 'auto';
  const { rerender } = render(<Tela ativa />);
  expect(document.body.style.overflow).toBe('hidden');
  rerender(<Tela ativa={false} />);
  expect(document.body.style.overflow).toBe('auto');
  expect(document.body.style.paddingRight).toBe('');
});
