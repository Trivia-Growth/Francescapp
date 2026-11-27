// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { botao } from './botao-imperativo.js';

it('monta um <button> com a classe de componentes/ui/botao, não a do kit antigo', () => {
  const elemento = botao({ rotulo: 'Salvar' });
  expect(elemento.tagName).toBe('BUTTON');
  expect(elemento.className).not.toContain('ui-botao');
  expect(elemento.className).toContain('bg-superficie');
  expect(elemento.dataset.peso).toBe('secundario');
  expect(elemento.type).toBe('button');
  expect(elemento.textContent).toBe('Salvar');
});

it('peso principal e largo levam a classe e o atributo correspondentes', () => {
  const elemento = botao({ rotulo: 'Entrar', peso: 'principal', largo: true });
  expect(elemento.dataset.peso).toBe('principal');
  expect(elemento.className).toContain('bg-primaria');
  expect(elemento.className).toContain('w-full');
});

it('id, marca e rótulo de leitura chegam ao DOM como antes', () => {
  const elemento = botao({
    rotulo: 'Remover',
    id: 'linha-1',
    marca: 'remover-contato',
    rotuloLeitura: 'Remover contato 1',
  });
  expect(elemento.id).toBe('linha-1');
  expect(elemento.dataset.acao).toBe('remover-contato');
  expect(elemento.getAttribute('aria-label')).toBe('Remover contato 1');
});

it('tipo submit é pedido explícito; sem pedido o botão não envia formulário', () => {
  expect(botao({ rotulo: 'Enviar', tipo: 'submit' }).type).toBe('submit');
  expect(botao({ rotulo: 'Voltar' }).type).toBe('button');
});

it('aoAtivar dispara no clique, como o antigo ligava o próprio listener', () => {
  const aoAtivar = vi.fn();
  const elemento = botao({ rotulo: 'Salvar', aoAtivar });
  elemento.click();
  expect(aoAtivar).toHaveBeenCalledTimes(1);
});
