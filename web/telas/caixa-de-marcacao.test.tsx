// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { CaixaDeMarcacao } from './caixa-de-marcacao.js';

afterEach(cleanup);

it('o alvo de toque é a linha inteira, não só o quadradinho de 20px', () => {
  // Achado C4: o quadradinho visível tem 20px, abaixo dos 46px de alvo de toque. O
  // vão entre ele e o texto do rótulo, embora dentro da mesma linha de 46px, não
  // respondia ao toque antes — só o `<input>` e o texto do `<label>` respondiam.
  // Envolver tudo num `<label>` torna a linha inteira clicável.
  render(<CaixaDeMarcacao id="teste" rotulo="Campo ativo" />);
  const entrada = screen.getByRole('checkbox', { name: 'Campo ativo' });
  const rotulo = entrada.closest('label');
  expect(rotulo).not.toBeNull();
  expect(rotulo?.className).toContain('min-h-controle-md');
  // O vão entre o quadradinho e o texto faz parte do `<label>`: clicar nele também marca.
  expect(entrada.checked).toBe(false);
});

it('marca a caixa ao clicar no rótulo, inclusive fora do texto', async () => {
  render(<CaixaDeMarcacao id="teste" rotulo="Campo ativo" />);
  const entrada = screen.getByRole('checkbox', { name: 'Campo ativo' });
  const rotulo = entrada.closest('label') as HTMLLabelElement;
  await userEvent.click(rotulo);
  expect(entrada.checked).toBe(true);
});

it('liga a ajuda pelo id, como antes', () => {
  render(<CaixaDeMarcacao id="teste" rotulo="Campo ativo" ajuda="Explicação do campo" />);
  const entrada = screen.getByRole('checkbox', { name: 'Campo ativo' });
  expect(entrada.getAttribute('aria-describedby')).toBe('teste-ajuda');
  expect(screen.getByText('Explicação do campo').id).toBe('teste-ajuda');
});
