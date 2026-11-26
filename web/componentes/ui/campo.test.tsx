// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { Campo } from './campo.js';

afterEach(cleanup);

it('o rótulo é do campo e a marca entra no nome anunciado, como hoje', () => {
  // A marca mora dentro do `<label>` (`basicos.ts:70-75`): quem ouve recebe
  // "Nome completo obrigatório", e não só a cor cinza à direita.
  render(<Campo id="nome" rotulo="Nome completo" marcaRotulo="obrigatório" />);
  const controle = screen.getByLabelText(/Nome completo/);
  expect(controle.tagName).toBe('INPUT');
  expect(controle.id).toBe('nome');
  expect(screen.getByLabelText(/obrigatório/)).toBe(controle);
});

it('o tipo padrão é text e o informado chega ao controle', () => {
  render(
    <>
      <Campo id="nome" rotulo="Nome" />
      <Campo id="email" rotulo="E-mail" tipo="email" />
    </>,
  );
  expect(screen.getByLabelText('Nome').getAttribute('type')).toBe('text');
  expect(screen.getByLabelText('E-mail').getAttribute('type')).toBe('email');
});

it('dica e erro são descritos juntos, nessa ordem, mesmo sem erro', () => {
  render(<Campo id="telefone" rotulo="Telefone" dica="Com DDD." />);
  expect(screen.getByLabelText('Telefone').getAttribute('aria-describedby')).toBe(
    'telefone-dica telefone-erro',
  );
});

it('sem dica, o erro continua descrito', () => {
  render(<Campo id="telefone" rotulo="Telefone" />);
  expect(screen.getByLabelText('Telefone').getAttribute('aria-describedby')).toBe('telefone-erro');
});

it('o nó do erro existe sempre e some por :empty, sem salto de layout', () => {
  const { rerender } = render(<Campo id="nome" rotulo="Nome" />);
  const no = document.getElementById('nome-erro');
  expect(no).toBeTruthy();
  expect(no?.textContent).toBe('');
  expect(no?.className).toContain('empty:hidden');
  rerender(<Campo id="nome" rotulo="Nome" erro="Informe o nome." />);
  expect(document.getElementById('nome-erro')).toBe(no);
  expect(no?.textContent).toBe('Informe o nome.');
});

it('aria-invalid anda junto com a frase do erro: nunca cor sozinha', () => {
  const { rerender } = render(<Campo id="nome" rotulo="Nome" />);
  const controle = screen.getByLabelText('Nome');
  expect(controle.getAttribute('aria-invalid')).toBeNull();
  rerender(<Campo id="nome" rotulo="Nome" erro="Informe o nome." />);
  expect(controle.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Informe o nome.')).toBeTruthy();
  rerender(<Campo id="nome" rotulo="Nome" />);
  expect(controle.getAttribute('aria-invalid')).toBeNull();
});

it('o erro muda a borda por token, sem cor literal', () => {
  render(<Campo id="nome" rotulo="Nome" erro="Informe o nome." />);
  const classes = screen.getByLabelText('Nome').className;
  expect(classes).toContain('aria-invalid:border-erro');
  expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
});

it('desabilitado não recebe digitação e recua por token', async () => {
  render(<Campo id="nome" rotulo="Nome" disabled />);
  const controle = screen.getByLabelText('Nome') as HTMLInputElement;
  await usuario.type(controle, 'Ana');
  expect(controle.value).toBe('');
  expect(controle.className).toContain('disabled:bg-superficie-3');
  expect(controle.className).toContain('disabled:text-texto-suave');
});

it('o alvo de toque é o controle padrão e a fonte é 16px por causa do iOS', () => {
  render(<Campo id="nome" rotulo="Nome" />);
  const classes = screen.getByLabelText('Nome').className;
  expect(classes).toContain('min-h-controle-md');
  expect(classes).toContain('--texto-2');
});

it('o invólucro não deixa o campo estourar a grade do diálogo', () => {
  render(<Campo id="nome" rotulo="Nome" />);
  const envelope = screen.getByLabelText('Nome').parentElement;
  expect(envelope?.className).toContain('min-w-0');
});

it('não anula o foco visível global e aceita digitação', async () => {
  render(<Campo id="nome" rotulo="Nome" />);
  const controle = screen.getByLabelText('Nome') as HTMLInputElement;
  expect(controle.className).not.toMatch(/outline-none|ring-0|focus:outline-0/);
  await usuario.tab();
  expect(document.activeElement).toBe(controle);
  await usuario.keyboard('Ana');
  expect(controle.value).toBe('Ana');
});
