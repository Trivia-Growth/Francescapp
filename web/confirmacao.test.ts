// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Confirmacoes, confirmar, confirmarDescarte } from './confirmacao.js';

let desmontar: () => void;

beforeEach(() => {
  desmontar = render(createElement(Confirmacoes)).unmount;
});

afterEach(() => {
  desmontar();
  document.body.replaceChildren();
});

it('mostra a confirmação no documento e põe o foco na ação segura', async () => {
  const origem = document.createElement('button');
  origem.textContent = 'Encerrar';
  document.body.append(origem);
  origem.focus();
  const pessoa = userEvent.setup();

  const resposta = confirmar({
    titulo: 'Encerrar a operação em andamento?',
    detalhe: 'Encerrá-la afeta todas as abas abertas.',
    acao: 'Encerrar',
    cancelar: 'Deixar como está',
  });

  const dialogo = screen.getByRole('dialog');
  expect(dialogo.textContent).toContain('Encerrar a operação em andamento?');
  expect(dialogo.textContent).toContain('Encerrá-la afeta todas as abas abertas.');
  const cancelar = dialogo.querySelector<HTMLButtonElement>('[data-acao="cancelar"]');
  expect(cancelar?.textContent).toBe('Deixar como está');
  expect(document.activeElement).toBe(cancelar);

  await pessoa.click(cancelar as HTMLButtonElement);
  expect(await resposta).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
  // Quem pediu a confirmação volta a ter o foco; sem isto o teclado recomeça do topo.
  expect(document.activeElement).toBe(origem);
});

it('Esc cancela, e cancelar é não fazer a coisa', async () => {
  const pessoa = userEvent.setup();
  const resposta = confirmarDescarte('as alterações não guardadas deste relato');
  const dialogo = screen.getByRole('dialog');
  expect(dialogo.textContent).toContain('Descartar as alterações não guardadas deste relato?');

  await pessoa.keyboard('{Escape}');

  expect(await resposta).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('confirmar responde que sim, e o foco não sai do diálogo por Tab', async () => {
  const pessoa = userEvent.setup();
  const resposta = confirmar({ titulo: 'Revogar o acesso de Ana?', acao: 'Revogar' });
  const dialogo = screen.getByRole('dialog');
  const seguir = dialogo.querySelector<HTMLButtonElement>('[data-acao="confirmar"]');
  const cancelar = dialogo.querySelector<HTMLButtonElement>('[data-acao="cancelar"]');

  // O foco inicial é o botão seguro: confirmar por engano é o erro caro.
  expect(document.activeElement).toBe(cancelar);
  // Só dois controles focáveis no diálogo: Tab de um ponto a outro, e de volta — o
  // aprisionamento de foco nunca deixa sair.
  await pessoa.tab();
  expect(document.activeElement).toBe(seguir);
  await pessoa.tab();
  expect(document.activeElement).toBe(cancelar);

  await pessoa.click(seguir as HTMLButtonElement);
  expect(await resposta).toBe(true);
});

it('desmontar a raiz cancela a confirmação pendente e remove o portal', async () => {
  const resposta = confirmar({ titulo: 'Revogar o acesso?', acao: 'Revogar' });
  expect(screen.getByRole('dialog')).not.toBeNull();
  desmontar();

  expect(await Promise.race([resposta, Promise.resolve('pendente')])).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
});
