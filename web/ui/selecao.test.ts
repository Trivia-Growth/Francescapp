// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { aprimorarSelecao } from './selecao.js';

/*  O que estes testes guardam é o que o `<select>` nativo dava de graça e um widget
 *  próprio perde com facilidade: rótulo associado, teclado inteiro e, acima de tudo, o
 *  valor continuar sendo o do controle que o formulário envia. Um combobox bonito que
 *  esquece de escrever no `<select>` manda o cadastro vazio para o servidor. */

function montar(): HTMLSelectElement {
  document.body.replaceChildren();
  const campo = document.createElement('div');
  const rotulo = document.createElement('label');
  rotulo.htmlFor = 'situacao';
  rotulo.textContent = 'Situação';
  const selecao = document.createElement('select');
  selecao.id = 'situacao';
  selecao.append(new Option('Selecione a situação', ''), new Option('Ativo', 'ativo'));
  selecao.append(new Option('Pausado', 'pausado'));
  campo.append(rotulo, selecao);
  document.body.append(campo);
  return selecao;
}

const gatilho = () => document.querySelector<HTMLButtonElement>('.ui-selecao__gatilho');
const opcoes = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const teclar = (chave: string) =>
  gatilho()?.dispatchEvent(
    new KeyboardEvent('keydown', { key: chave, bubbles: true, cancelable: true }),
  );

let nativa: HTMLSelectElement;
beforeEach(() => {
  nativa = montar();
  aprimorarSelecao(nativa);
});

it('mantém o `<select>` como dono do valor e o tira da ordem de tabulação', () => {
  expect(nativa.isConnected).toBe(true);
  expect(nativa.tabIndex).toBe(-1);
  expect(nativa.getAttribute('aria-hidden')).toBe('true');
  expect(gatilho()?.getAttribute('role')).toBe('combobox');
  // O rótulo da tela continua sendo o rótulo: nada de rótulo duplicado só para o widget.
  const nomeado = gatilho()?.getAttribute('aria-labelledby')?.split(' ') ?? [];
  expect(document.getElementById(nomeado[0] ?? '')?.textContent).toBe('Situação');
});

it('escolher pelo teclado escreve no `<select>` e avisa quem escuta', () => {
  const mudancas: string[] = [];
  nativa.addEventListener('change', () => mudancas.push(nativa.value));
  gatilho()?.focus();
  teclar('ArrowDown');
  expect(gatilho()?.getAttribute('aria-expanded')).toBe('true');
  teclar('ArrowDown');
  teclar('Enter');

  expect(nativa.value).toBe('ativo');
  expect(mudancas).toEqual(['ativo']);
  expect(gatilho()?.textContent).toContain('Ativo');
  expect(gatilho()?.getAttribute('aria-expanded')).toBe('false');
});

it('Esc fecha a lista sem mudar o valor e sem alcançar o diálogo em volta', () => {
  const alcancou: string[] = [];
  document.body.addEventListener('keydown', (evento) => alcancou.push(evento.key));
  gatilho()?.focus();
  teclar('ArrowDown');
  teclar('Escape');

  expect(nativa.value).toBe('');
  expect(document.querySelector('.ui-selecao__lista')?.hasAttribute('hidden')).toBe(true);
  // Sem isto, fechar a lista fecharia junto o diálogo de cadastro que a contém.
  expect(alcancou).not.toContain('Escape');
});

it('acompanha o que o resto da tela faz com o controle: opções, desligar e erro', async () => {
  nativa.append(new Option('Encerrado', 'encerrado'));
  nativa.dispatchEvent(new Event('change'));
  expect(opcoes().map((item) => item.textContent)).toContain('Encerrado');

  // A equipe só chega depois da consulta, e o erro só depois do envio: quem observa o
  // controle nativo precisa alcançar as duas coisas sem que a tela reaprimore o campo.
  nativa.setAttribute('aria-invalid', 'true');
  nativa.disabled = true;
  await vi.waitFor(() => expect(gatilho()?.getAttribute('aria-invalid')).toBe('true'));
  expect(gatilho()?.disabled).toBe(true);
});

it('foco dirigido ao controle nativo termina no controle que a pessoa vê', () => {
  nativa.focus();
  expect(document.activeElement).toBe(gatilho());
});
