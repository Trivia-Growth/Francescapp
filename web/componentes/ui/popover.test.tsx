// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Dialogo } from './dialogo';
import { ConteudoPopover, GatilhoPopover, Popover } from './popover';

/*  O teste que importa aqui não é "o popover abre". É o risco 11 de `componentes.md`: um
 *  popover dentro de um diálogo faz o `Esc` fechar os dois, e quem estava preenchendo o
 *  cadastro perde tudo por ter desistido de uma lista. Na camada anterior isso era um
 *  `stopPropagation` escrito à mão; aqui depende do empilhamento de camadas do Radix —
 *  mecanismo diferente, mesma garantia, e por isso provado e não presumido. */

beforeAll(() => {
  // O Radix mede o gatilho para posicionar; o jsdom não tem nenhum dos dois.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('abre pelo gatilho, é anunciado como aberto e fecha com Esc', async () => {
  const pessoa = userEvent.setup();
  render(
    <Popover>
      <GatilhoPopover>Equipe</GatilhoPopover>
      <ConteudoPopover>
        <button type="button">Edilaine</button>
      </ConteudoPopover>
    </Popover>,
  );

  const gatilho = screen.getByRole('button', { name: 'Equipe' });
  expect(gatilho.getAttribute('aria-expanded')).toBe('false');
  await pessoa.click(gatilho);
  expect(gatilho.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('button', { name: 'Edilaine' })).toBeTruthy();

  await pessoa.keyboard('{Escape}');
  expect(screen.queryByRole('button', { name: 'Edilaine' })).toBeNull();
  // O foco volta ao gatilho, senão o teclado recomeça do topo da página.
  expect(document.activeElement).toBe(gatilho);
});

it('o Esc do popover não alcança o diálogo que o contém', async () => {
  const pessoa = userEvent.setup();
  const fechouDialogo = vi.fn();
  render(
    <Dialogo aberto aoFechar={fechouDialogo} titulo="Novo plantão">
      <Popover>
        <GatilhoPopover>Equipe</GatilhoPopover>
        <ConteudoPopover>
          <button type="button">Edilaine</button>
        </ConteudoPopover>
      </Popover>
    </Dialogo>,
  );

  await pessoa.click(screen.getByRole('button', { name: 'Equipe' }));
  expect(screen.getByRole('button', { name: 'Edilaine' })).toBeTruthy();

  await pessoa.keyboard('{Escape}');
  // Fechou a lista…
  expect(screen.queryByRole('button', { name: 'Edilaine' })).toBeNull();
  // …e NÃO o cadastro em volta. Sem isto, desistir de uma lista apagaria o formulário.
  expect(fechouDialogo).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();

  // O segundo Esc, aí sim, fecha o diálogo.
  await pessoa.keyboard('{Escape}');
  expect(fechouDialogo).toHaveBeenCalledTimes(1);
});

it('o painel flutuante usa token de sombra e de filete, sem cor literal', async () => {
  const pessoa = userEvent.setup();
  render(
    <Popover>
      <GatilhoPopover>Equipe</GatilhoPopover>
      <ConteudoPopover>
        <button type="button">Edilaine</button>
      </ConteudoPopover>
    </Popover>,
  );
  await pessoa.click(screen.getByRole('button', { name: 'Equipe' }));

  const painel = document.querySelector<HTMLElement>('[data-painel="popover"]');
  expect(painel?.className).toContain('shadow-menu');
  expect(painel?.className).toContain('border-borda');
  // Teto e rolagem contida de `ui.css:241-248`: a lista não cresce sem fim nem rola a
  // página atrás.
  expect(painel?.className).toContain('max-h-[17rem]');
  expect(painel?.className).toContain('overscroll-contain');
  expect(painel?.className).not.toMatch(/#[0-9a-fA-F]{3}|rgba?\(/);
});
