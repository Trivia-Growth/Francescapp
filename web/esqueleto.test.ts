// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { iniciarAcao } from './esqueleto.js';

it('não encerra a indicação de uma operação mais recente ao finalizar a anterior', () => {
  const botao = document.createElement('button');
  botao.textContent = 'Atualizar';
  const anterior = iniciarAcao(botao);
  const atual = iniciarAcao(botao);
  anterior();
  expect(botao.getAttribute('aria-busy')).toBe('true');
  expect(botao.querySelectorAll('.loading-indicator')).toHaveLength(1);
  atual();
  expect(botao.hasAttribute('aria-busy')).toBe(false);
  expect(botao.textContent).toBe('Atualizar');
});
