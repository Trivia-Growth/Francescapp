// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { confirmar, confirmarDescarte } from './confirmacao.js';

/*  O defeito que originou este arquivo não era lógico: a confirmação existia, era o
 *  `window.confirm`, e simplesmente não aparecia no conteúdo da página. Por isso o que
 *  estes testes guardam é a presença — diálogo no documento, com foco — e não o retorno. */

function dialogoAberto(): HTMLDialogElement {
  const dialogo = document.querySelector<HTMLDialogElement>('dialog[data-confirmacao]');
  if (!dialogo) throw new Error('nenhuma confirmação no documento');
  return dialogo;
}

it('mostra a confirmação no documento e põe o foco na ação segura', async () => {
  document.body.innerHTML = '<button id="origem">Encerrar</button>';
  const origem = document.getElementById('origem') as HTMLButtonElement;
  origem.focus();

  const resposta = confirmar({
    titulo: 'Encerrar a operação em andamento?',
    detalhe: 'Encerrá-la afeta todas as abas abertas.',
    acao: 'Encerrar',
    cancelar: 'Deixar como está',
  });

  const dialogo = dialogoAberto();
  expect(dialogo.hasAttribute('open')).toBe(true);
  expect(dialogo.textContent).toContain('Encerrar a operação em andamento?');
  expect(dialogo.textContent).toContain('Encerrá-la afeta todas as abas abertas.');
  const cancelar = dialogo.querySelector<HTMLButtonElement>('[data-acao="cancelar"]');
  expect(cancelar?.textContent).toBe('Deixar como está');
  expect(document.activeElement).toBe(cancelar);

  cancelar?.click();
  expect(await resposta).toBe(false);
  expect(document.querySelector('dialog[data-confirmacao]')).toBeNull();
  // Quem pediu a confirmação volta a ter o foco; sem isto o teclado recomeça do topo.
  expect(document.activeElement).toBe(origem);
});

it('Esc cancela, e cancelar é não fazer a coisa', async () => {
  const resposta = confirmarDescarte('as alterações não guardadas deste relato');
  const dialogo = dialogoAberto();
  expect(dialogo.textContent).toContain('Descartar as alterações não guardadas deste relato?');

  dialogo.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );

  expect(await resposta).toBe(false);
  expect(document.querySelector('dialog[data-confirmacao]')).toBeNull();
});

it('confirmar responde que sim, e o foco não sai do diálogo por Tab', async () => {
  const resposta = confirmar({ titulo: 'Revogar o acesso de Ana?', acao: 'Revogar' });
  const dialogo = dialogoAberto();
  const seguir = dialogo.querySelector<HTMLButtonElement>('[data-acao="confirmar"]');
  const cancelar = dialogo.querySelector<HTMLButtonElement>('[data-acao="cancelar"]');

  dialogo.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
  );
  expect(document.activeElement).toBe(seguir);
  dialogo.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
  );
  expect(document.activeElement).toBe(cancelar);

  seguir?.click();
  expect(await resposta).toBe(true);
});
