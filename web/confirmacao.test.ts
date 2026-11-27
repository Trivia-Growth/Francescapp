// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { confirmar, confirmarDescarte } from './confirmacao.js';

/*  O defeito que originou este arquivo não era lógico: a confirmação existia, era o
 *  `window.confirm`, e simplesmente não aparecia no conteúdo da página. Por isso o que
 *  estes testes guardam é a presença — diálogo no documento, com foco — e não o retorno.
 *
 *  Reconstruído sobre o `Dialogo` real (Radix, `componentes/ui/dialogo.tsx`) em vez do
 *  `<dialog>` nativo escrito à mão em `web/ui/dialogo.ts`: o aprisionamento de foco e o
 *  Esc já são provados em `componentes/ui/dialogo.test.tsx` — aqui a prova é que
 *  `confirmar()`/`confirmarDescarte()` continuam entregando o mesmo comportamento externo
 *  (`Promise<boolean>`, diálogo síncrono, foco preso, devolução de foco) com esse Dialogo
 *  por baixo. Por isso `userEvent.tab()` no lugar do `dispatchEvent(KeyboardEvent('Tab'))`
 *  cru de antes: aquele truque testava o manipulador de teclado escrito à mão em
 *  `web/ui/dialogo.ts:prenderFoco`, não o aprisionamento de foco do Radix — testar o que
 *  esta tela tem agora, não o que ela tinha. */

afterEach(() => {
  document.body.replaceChildren();
});

it('mostra a confirmação no documento e põe o foco na ação segura', async () => {
  document.body.innerHTML = '<button id="origem">Encerrar</button>';
  const origem = document.getElementById('origem') as HTMLButtonElement;
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
