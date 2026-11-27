// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Botao } from './botao.js';
import { Esqueleto } from './esqueleto.js';

afterEach(cleanup);

it('a espera é anunciada por aria-busy, não por um indicador novo', () => {
  const { rerender } = render(
    <Esqueleto ocupado data-testid="regiao">
      {null}
    </Esqueleto>,
  );
  const regiao = screen.getByTestId('regiao');
  expect(regiao.getAttribute('aria-busy')).toBe('true');
  rerender(<Esqueleto ocupado={false} data-testid="regiao" />);
  expect(screen.getByTestId('regiao').getAttribute('aria-busy')).toBe('false');
});

it('sem conteúdo, a região fica vazia para a folha lhe dar a forma', () => {
  render(<Esqueleto ocupado data-testid="regiao" />);
  const regiao = screen.getByTestId('regiao');
  expect(regiao.dataset.forma).toBe('vazio');
  // `:empty` é a condição da forma e do atraso de 300ms: pintar barra aqui a perderia.
  expect(regiao.childNodes.length).toBe(0);
});

it('com conteúdo anterior, a região apenas recua e não é desmontada', () => {
  render(
    <Esqueleto ocupado data-testid="regiao">
      <ul>
        <li>Ana</li>
        <li>Bruno</li>
      </ul>
    </Esqueleto>,
  );
  const regiao = screen.getByTestId('regiao');
  expect(regiao.dataset.forma).toBe('recuo');
  expect(screen.getByText('Ana')).toBeTruthy();
  expect(screen.getByText('Bruno')).toBeTruthy();
});

it('a lista não some entre uma consulta e outra', () => {
  const lista = (
    <ul>
      <li>Ana</li>
    </ul>
  );
  const { rerender } = render(
    <Esqueleto ocupado={false} data-testid="regiao">
      {lista}
    </Esqueleto>,
  );
  const item = screen.getByText('Ana');
  rerender(
    <Esqueleto ocupado data-testid="regiao">
      {lista}
    </Esqueleto>,
  );
  expect(screen.getByText('Ana')).toBe(item);
  expect(screen.getByTestId('regiao').dataset.forma).toBe('recuo');
});

it('fora da espera não há forma declarada', () => {
  render(
    <Esqueleto ocupado={false} data-testid="regiao">
      <p>Ana</p>
    </Esqueleto>,
  );
  expect(screen.getByTestId('regiao').dataset.forma).toBeUndefined();
});

it('o recuo não desliga o controle: quem espera ainda pode cancelar', async () => {
  const aoAtivar = vi.fn();
  render(
    <Esqueleto ocupado>
      <Botao aoAtivar={aoAtivar}>Cancelar</Botao>
    </Esqueleto>,
  );
  const botao = screen.getByRole('button', { name: 'Cancelar' });
  await usuario.tab();
  expect(document.activeElement).toBe(botao);
  await usuario.click(botao);
  expect(aoAtivar).toHaveBeenCalledTimes(1);
});

it('não escreve cor, animação nem altura própria: a forma é da folha', () => {
  render(<Esqueleto ocupado data-testid="regiao" />);
  const classes = screen.getByTestId('regiao').className;
  expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  expect(classes).not.toMatch(/animate-|min-h-\[/);
});

it('encolhe dentro de grade ou flex, em vez de forçar rolagem horizontal', () => {
  /* Medido a 390px em 25/11/2026: sem `min-w-0` o envelope não encolhia e a tela de
     Equipe passava a ter rolagem horizontal de página (`scrollWidth 578`), que não
     existia na versão imperativa. */
  const { container } = render(
    <Esqueleto ocupado={false}>
      <p>Conteúdo</p>
    </Esqueleto>,
  );
  expect(container.firstElementChild?.className).toContain('min-w-0');
});
