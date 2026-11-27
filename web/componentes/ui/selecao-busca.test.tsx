// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Dialogo } from './dialogo';
import { normalizar, SelecaoBusca } from './selecao-busca';

/*  O que estes testes guardam é o que o `<select>` nativo dava de graça e um combobox
 *  bonito perde com facilidade: rótulo associado, teclado inteiro e, acima de tudo, o
 *  valor realmente escrito — um combobox que esquece de escrever manda o cadastro vazio
 *  para o servidor. Mais o `Esc` que fecha a lista sem fechar o cadastro em volta. */

beforeAll(() => {
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

const EQUIPE = [
  { valor: 'edilaine', rotulo: 'Edilaine Francescato' },
  { valor: 'ana', rotulo: 'Ana Júlia Prado' },
  { valor: 'joao', rotulo: 'João São Paulo' },
];

function Campo({ aoMudar }: { aoMudar?: (valor: string) => void }) {
  const [valor, definirValor] = useState('');
  return (
    <form aria-label="Novo plantão">
      <SelecaoBusca
        rotulo="Profissional"
        nome="profissional"
        opcoes={EQUIPE}
        valor={valor}
        aoMudarValor={(proximo) => {
          definirValor(proximo);
          aoMudar?.(proximo);
        }}
      />
    </form>
  );
}

const gatilho = () => screen.getByRole('combobox', { name: 'Profissional' });
const busca = () => screen.getByRole('combobox', { name: 'Buscar Profissional' });

it('o rótulo da tela nomeia o controle, e o vazio é anunciado como vazio', () => {
  render(<Campo />);
  const controle = gatilho();
  expect(controle.getAttribute('aria-haspopup')).toBe('listbox');
  // Nada de rótulo duplicado só para o widget.
  expect(controle.textContent).toContain('Selecione');
  expect(controle.querySelector('[data-vazio="sim"]')).not.toBeNull();
  expect(controle.getAttribute('aria-expanded')).toBe('false');
});

it('escolher escreve o valor que o formulário envia', async () => {
  const pessoa = userEvent.setup();
  const escolhas: string[] = [];
  render(<Campo aoMudar={(valor) => escolhas.push(valor)} />);

  await pessoa.click(gatilho());
  expect(gatilho().getAttribute('aria-expanded')).toBe('true');
  await pessoa.click(screen.getByRole('option', { name: 'Ana Júlia Prado' }));

  expect(escolhas).toEqual(['ana']);
  expect(gatilho().textContent).toContain('Ana Júlia Prado');
  // Risco 13: o cadastro não pode sair vazio porque o widget esqueceu de escrever.
  const formulario = screen.getByRole('form', { name: 'Novo plantão' }) as HTMLFormElement;
  expect(new FormData(formulario).get('profissional')).toBe('ana');
});

it('a busca ignora acento e caixa, e diz o que fazer quando não encontra', async () => {
  const pessoa = userEvent.setup();
  render(<Campo />);
  await pessoa.click(gatilho());

  // "jose" precisa achar "José"; "SAO" precisa achar "São".
  await pessoa.keyboard('joao sao');
  expect(screen.getByRole('option', { name: 'João São Paulo' })).toBeTruthy();
  expect(screen.queryByRole('option', { name: 'Edilaine Francescato' })).toBeNull();

  await pessoa.clear(busca());
  await pessoa.keyboard('xyz');
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  // Estado vazio de busca diz o próximo passo; não afirma que a pessoa não existe.
  expect(screen.getByText(/Tente outro trecho do nome/)).toBeTruthy();
});

it('normalizar tira acento e caixa, como o salto por letra já fazia', () => {
  expect(normalizar('José')).toBe('jose');
  expect(normalizar('SÃO PAULO')).toBe('sao paulo');
  expect(normalizar('Ana Júlia')).toBe('ana julia');
});

it('teclado: seta e Enter escolhem sem passar pelo mouse', async () => {
  const pessoa = userEvent.setup();
  const escolhas: string[] = [];
  render(<Campo aoMudar={(valor) => escolhas.push(valor)} />);

  gatilho().focus();
  await pessoa.keyboard('{Enter}');
  await pessoa.keyboard('{ArrowDown}{Enter}');
  expect(escolhas).toEqual(['ana']);
});

it('o Esc fecha a lista sem fechar o cadastro em volta', async () => {
  // Risco 11. Na camada anterior era `stopPropagation` escrito à mão em `selecao.ts:225`;
  // aqui depende do empilhamento do Radix, e por isso é provado dentro de um diálogo.
  const pessoa = userEvent.setup();
  const fechouDialogo = vi.fn();
  render(
    <Dialogo aberto aoFechar={fechouDialogo} titulo="Novo plantão">
      <Campo />
    </Dialogo>,
  );

  await pessoa.click(gatilho());
  expect(screen.getByRole('option', { name: 'Edilaine Francescato' })).toBeTruthy();

  await pessoa.keyboard('{Escape}');
  expect(screen.queryByRole('option', { name: 'Edilaine Francescato' })).toBeNull();
  expect(fechouDialogo).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
});
