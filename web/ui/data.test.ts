// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { aprimorarData, doVisivel, paraVisivel } from './data.js';

/*  Data de nascimento não é um instante: é dia, mês e ano. O erro clássico de campo de
 *  data próprio é converter com `new Date(iso)` e ver o dia andar para trás conforme o
 *  fuso da máquina, o que num cadastro de paciente vira data errada no prontuário. */

function montar(): HTMLInputElement {
  document.body.replaceChildren();
  const campo = document.createElement('div');
  const rotulo = document.createElement('label');
  rotulo.htmlFor = 'nascimento';
  rotulo.textContent = 'Data de nascimento';
  const nativo = document.createElement('input');
  nativo.type = 'date';
  nativo.id = 'nascimento';
  campo.append(rotulo, nativo);
  document.body.append(campo);
  return nativo;
}

const texto = () => document.querySelector<HTMLInputElement>('.ui-data__texto');
const abrir = () => document.querySelector<HTMLButtonElement>('[data-ui="calendario"]');
const dias = () => [...document.querySelectorAll<HTMLButtonElement>('.ui-data__dia')];

let nativo: HTMLInputElement;
beforeEach(() => {
  nativo = montar();
  aprimorarData(nativo);
});

it('converte nos dois sentidos sem passar por fuso horário', () => {
  expect(paraVisivel('2000-01-31')).toBe('31/01/2000');
  expect(doVisivel('31/01/2000')).toBe('2000-01-31');
  // 29 de fevereiro só existe em ano bissexto; aceitar o inexistente é guardar data falsa.
  expect(doVisivel('29/02/2000')).toBe('2000-02-29');
  expect(doVisivel('29/02/2001')).toBeNull();
  expect(doVisivel('31/13/2000')).toBeNull();
  expect(paraVisivel('')).toBe('');
});

it('digitar dd/mm/aaaa escreve a data em ISO no campo que o formulário envia', () => {
  const visivel = texto();
  if (!visivel) throw new Error('campo visível ausente');
  visivel.value = '31012000';
  visivel.dispatchEvent(new Event('input', { bubbles: true }));

  // A máscara entra enquanto se digita, sem recusar o que ainda está incompleto.
  expect(visivel.value).toBe('31/01/2000');
  expect(nativo.value).toBe('2000-01-31');
});

it('data incompleta ou impossível não escolhe data nenhuma', () => {
  const visivel = texto();
  if (!visivel) throw new Error('campo visível ausente');
  visivel.value = '31/01';
  visivel.dispatchEvent(new Event('input', { bubbles: true }));
  expect(nativo.value).toBe('');
  expect(visivel.hasAttribute('aria-invalid')).toBe(false);

  visivel.value = '31/02/2000';
  visivel.dispatchEvent(new Event('input', { bubbles: true }));
  expect(nativo.value).toBe('');
  // Completa e impossível: aí sim o campo avisa, em vez de guardar silenciosamente nada.
  expect(visivel.getAttribute('aria-invalid')).toBe('true');
});

it('o calendário abre, anda por teclado e escolher escreve o dia certo', () => {
  nativo.value = '2000-01-31';
  abrir()?.click();
  expect(abrir()?.getAttribute('aria-expanded')).toBe('true');
  expect(dias()).toHaveLength(31);
  expect(dias().find((dia) => dia.getAttribute('aria-selected') === 'true')?.textContent).toBe(
    '31',
  );

  const calendario = document.querySelector('.ui-data__calendario');
  calendario?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
  );
  document.querySelector<HTMLButtonElement>('.ui-data__dia[tabindex="0"]')?.click();

  expect(nativo.value).toBe('2000-01-30');
  expect(texto()?.value).toBe('30/01/2000');
});

it('Esc fecha o calendário sem alcançar o diálogo em volta', () => {
  const alcancou: string[] = [];
  document.body.addEventListener('keydown', (evento) => alcancou.push(evento.key));
  abrir()?.click();
  document
    .querySelector('.ui-data__calendario')
    ?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

  expect(document.querySelector('.ui-data__calendario')?.hasAttribute('hidden')).toBe(true);
  expect(alcancou).not.toContain('Escape');
});

it('o rótulo da tela passa a apontar para o campo que a pessoa digita', () => {
  const rotulo = document.querySelector('label');
  expect(rotulo?.htmlFor).toBe(texto()?.id);
  expect(nativo.getAttribute('aria-hidden')).toBe('true');
  expect(nativo.tabIndex).toBe(-1);
});
