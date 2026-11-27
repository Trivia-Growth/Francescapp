// @vitest-environment jsdom
/* O painel de cadastro não tinha prova nenhuma até sair de `web/ui/`. Estas quatro são as
 * que o tornam um diálogo: abre pelo botão, Tab não sai dele, "Fechar" fecha e, sem
 * permissão de cadastro, não abre. A marcação é a de `web/index.html` — a mesma que o
 * produto carrega —, não uma cópia simplificada.
 *
 * O jsdom não implementa `showModal`/`close` (nem Esc, nem o fundo inerte): as duas
 * funções abaixo só alternam `open`. O Esc nativo e o foco preso num navegador de verdade
 * estão em `scripts/prova-celular/painel-cadastro.pw.ts`. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const el = <T extends HTMLElement = HTMLElement>(id: string) => {
  const elemento = document.getElementById(id);
  if (!elemento) throw new Error(`#${id} ausente em web/index.html`);
  return elemento as T;
};

const tab = (shiftKey = false) =>
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
  );

async function carregar(podeCadastrar: boolean) {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  // A carteira só aparece depois do login; sem isto tudo no diálogo estaria sob `[hidden]`.
  el('patients-view').hidden = false;
  // O que `main.ts` faz com a permissão vinda do servidor (`registration.hidden = !podeCadastrar`).
  el('cadastro').hidden = !podeCadastrar;
  el('new-patient-link').hidden = !podeCadastrar;
  await import('./painel-cadastro.js');
  return el<HTMLDialogElement>('cadastro-dialogo');
}

beforeEach(() => {
  vi.resetModules();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  // biome-ignore lint/performance/noDelete: devolve o protótipo do jsdom como estava.
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  // biome-ignore lint/performance/noDelete: idem.
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

it('abre pelo botão e põe o foco no título do formulário', async () => {
  const dialogo = await carregar(true);
  expect(dialogo.open).toBe(false);
  el('new-patient-link').click();
  expect(dialogo.open).toBe(true);
  expect(document.activeElement).toBe(el('create-title'));
});

it('Tab e Shift+Tab circulam dentro do diálogo aberto e não voltam para a lista', async () => {
  const dialogo = await carregar(true);
  el('new-patient-link').click();
  const fechar = el('cadastro-fechar');
  fechar.focus();
  tab(true);
  // Antes do botão de fechar não há nada focável no diálogo: Shift+Tab dá a volta até o fim.
  const ultimo = document.activeElement as HTMLElement;
  expect(dialogo.contains(ultimo)).toBe(true);
  expect(ultimo).not.toBe(fechar);
  tab();
  expect(document.activeElement).toBe(fechar);
});

it('"Fechar" fecha o diálogo', async () => {
  const dialogo = await carregar(true);
  el('new-patient-link').click();
  el('cadastro-fechar').click();
  expect(dialogo.open).toBe(false);
});

it('sem permissão de cadastro o diálogo não abre, nem com o botão acionado à força', async () => {
  const dialogo = await carregar(false);
  // O botão está oculto; `click()` dispara mesmo assim — é a defesa do próprio painel.
  el('new-patient-link').click();
  expect(dialogo.open).toBe(false);
});
