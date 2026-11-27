// @vitest-environment jsdom
/** O que esta prova detecta: uma tela que troca o próprio conteúdo depois de consultar o
 *  serviço voltaria a mostrar o `<select>` e o `input[type=date]` do navegador, que é
 *  exatamente o defeito que a camada de componente corrige. Os testes de `selecao.ts` e
 *  `data.ts` cobrem a troca sobre o que já está no documento, não o que chega depois. */
import { beforeEach, expect, test } from 'vitest';
import { aplicarControlesProprios } from './controles.js';

beforeEach(() => {
  document.body.replaceChildren();
});

function raizCom(html: string): HTMLElement {
  const raiz = document.createElement('div');
  raiz.innerHTML = html;
  document.body.append(raiz);
  return raiz;
}

test('aprimora o que já está na raiz', () => {
  const raiz = raizCom('<select><option value="a">A</option></select><input type="date">');
  aplicarControlesProprios(raiz);
  expect(raiz.querySelector('select')?.getAttribute('aria-hidden')).toBe('true');
  expect(raiz.querySelector('[role="combobox"]')).not.toBeNull();
  expect(raiz.querySelector('input[type="date"]')?.getAttribute('aria-hidden')).toBe('true');
});

test('aprimora o controle que chega depois da consulta', async () => {
  const raiz = raizCom('');
  aplicarControlesProprios(raiz);
  raiz.innerHTML = '<select><option value="a">A</option></select><input type="date">';
  await Promise.resolve();
  expect(raiz.querySelector('select')?.getAttribute('aria-hidden')).toBe('true');
  expect(raiz.querySelector('input[type="date"]')?.getAttribute('aria-hidden')).toBe('true');
});

test('parar de observar devolve a tela ao navegador para o que vier depois', async () => {
  const raiz = raizCom('');
  aplicarControlesProprios(raiz)();
  raiz.innerHTML = '<select><option value="a">A</option></select>';
  await Promise.resolve();
  expect(raiz.querySelector('select')?.getAttribute('aria-hidden')).toBeNull();
});
