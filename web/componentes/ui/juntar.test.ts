import { expect, it } from 'vitest';
import { juntar } from './juntar.js';

it('resolve conflito mantendo a última classe do mesmo grupo', () => {
  expect(juntar('p-4', 'p-6')).toBe('p-6');
});

it('não confunde degrau da escala de texto com cor de texto', () => {
  /* O defeito que a frente de controles encontrou em 25/11/2026: sem o grupo declarado,
     `text-2` era lido como cor e sumia junto com `text-contraste`. O campo perdia os
     16px, e abaixo disso o iOS dá zoom ao focar — acessibilidade quebrada em silêncio. */
  expect(juntar('text-2', 'text-contraste')).toBe('text-2 text-contraste');
  expect(juntar('text-1', 'text-sistema-texto-secundario')).toBe(
    'text-1 text-sistema-texto-secundario',
  );
  expect(juntar('text-1', 'text-3')).toBe('text-3');
});

it('troca tamanhos legados e do sistema sem substituir a cor', () => {
  expect(juntar('text-1', 'text-sistema-texto', 'text-meta')).toBe('text-sistema-texto text-meta');
  expect(juntar('text-pagina', 'lateral:text-pagina-desktop', 'text-corpo')).toBe(
    'lateral:text-pagina-desktop text-corpo',
  );
});
