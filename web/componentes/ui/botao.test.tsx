// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Botao } from './botao.js';

afterEach(cleanup);

it('tem os três pesos do domínio e o secundário é o padrão', () => {
  render(
    <>
      <Botao peso="principal">Salvar</Botao>
      <Botao>Voltar</Botao>
      <Botao peso="discreto">Esqueci a senha</Botao>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Salvar' }).dataset.peso).toBe('principal');
  expect(screen.getByRole('button', { name: 'Voltar' }).dataset.peso).toBe('secundario');
  expect(screen.getByRole('button', { name: 'Esqueci a senha' }).dataset.peso).toBe('discreto');
});

it('o peso muda a aparência, e só o discreto sublinha', () => {
  render(
    <>
      <Botao peso="principal">Salvar</Botao>
      <Botao peso="secundario">Voltar</Botao>
      <Botao peso="discreto">Esqueci a senha</Botao>
    </>,
  );
  const principal = screen.getByRole('button', { name: 'Salvar' }).className;
  const secundario = screen.getByRole('button', { name: 'Voltar' }).className;
  const discreto = screen.getByRole('button', { name: 'Esqueci a senha' }).className;
  expect(principal).toContain('bg-primaria');
  expect(principal).toContain('text-contraste');
  expect(secundario).toContain('border-borda-forte');
  expect(secundario).toContain('text-primaria');
  expect(discreto).toContain(' underline ');
  expect(discreto).toContain('underline-offset-[0.2em]');
  expect(principal).toContain('no-underline');
  expect(secundario).toContain('no-underline');
});

it('o tamanho de fonte sobrevive à junção com a cor', () => {
  // `text-2` ao lado de `text-contraste` era descartado pelo tailwind-merge padrão.
  render(<Botao peso="principal">Salvar</Botao>);
  const classes = screen.getByRole('button').className;
  expect(classes).toContain('--texto-2');
  expect(classes).toContain('text-contraste');
});

it('nenhuma variante escreve cor literal', () => {
  render(
    <>
      <Botao peso="principal">Salvar</Botao>
      <Botao peso="secundario">Voltar</Botao>
      <Botao peso="discreto">Sair</Botao>
    </>,
  );
  for (const botao of screen.getAllByRole('button')) {
    expect(botao.className).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  }
});

it('o alvo de toque é o controle padrão de 46px, pelo token', () => {
  render(<Botao>Salvar</Botao>);
  expect(screen.getByRole('button').className).toContain('min-h-controle-md');
});

it('largo ocupa a linha inteira; sem ele, não', () => {
  render(
    <>
      <Botao largo>Entrar</Botao>
      <Botao>Voltar</Botao>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Entrar' }).className).toContain('w-full');
  expect(screen.getByRole('button', { name: 'Voltar' }).className).not.toContain('w-full');
});

it('desabilitado por disabled não ativa a ação', async () => {
  const aoAtivar = vi.fn();
  render(
    <Botao disabled aoAtivar={aoAtivar}>
      Salvar
    </Botao>,
  );
  await usuario.click(screen.getByRole('button'));
  expect(aoAtivar).not.toHaveBeenCalled();
});

it('desabilitado por aria-disabled continua focável e anunciável, mas inerte', async () => {
  const aoAtivar = vi.fn();
  render(
    <Botao aria-disabled aoAtivar={aoAtivar}>
      Próxima página
    </Botao>,
  );
  const botao = screen.getByRole('button', { name: 'Próxima página' });
  botao.focus();
  expect(document.activeElement).toBe(botao);
  await usuario.click(botao);
  expect(aoAtivar).not.toHaveBeenCalled();
});

it('os dois caminhos de desabilitado recebem o mesmo recuo e o mesmo cursor', () => {
  render(
    <>
      <Botao disabled>Salvar</Botao>
      <Botao aria-disabled>Voltar</Botao>
    </>,
  );
  const porDisabled = screen.getByRole('button', { name: 'Salvar' }).className;
  const porAria = screen.getByRole('button', { name: 'Voltar' }).className;
  expect(porDisabled).toContain('disabled:opacity-[0.62]');
  expect(porDisabled).toContain('disabled:cursor-not-allowed');
  expect(porAria).toContain('[&[aria-disabled=true]]:opacity-[0.62]');
  expect(porAria).toContain('[&[aria-disabled=true]]:cursor-not-allowed');
});

it('o hover não acende botão desabilitado por nenhum dos dois caminhos', () => {
  render(<Botao peso="principal">Salvar</Botao>);
  const classes = screen.getByRole('button').className;
  expect(classes).toContain('[&:hover:not(:disabled):not([aria-disabled=true])]:bg-primaria-hover');
});

it('não anula o foco visível global', async () => {
  render(<Botao>Salvar</Botao>);
  const botao = screen.getByRole('button');
  expect(botao.className).not.toMatch(/outline-none|ring-0|focus:outline-0/);
  await usuario.tab();
  expect(document.activeElement).toBe(botao);
});

it('ativa a ação e leva marca e rótulo de leitura ao DOM', async () => {
  const aoAtivar = vi.fn();
  render(
    <Botao marca="salvar-cadastro" rotuloLeitura="Salvar cadastro" aoAtivar={aoAtivar}>
      Salvar
    </Botao>,
  );
  const botao = screen.getByRole('button', { name: 'Salvar cadastro' });
  expect(botao.dataset.acao).toBe('salvar-cadastro');
  await usuario.click(botao);
  expect(aoAtivar).toHaveBeenCalledTimes(1);
});

it('o tipo padrão é button; submeter é pedido explícito', () => {
  render(
    <>
      <Botao>Voltar</Botao>
      <Botao tipo="submit">Enviar</Botao>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Voltar' }).getAttribute('type')).toBe('button');
  expect(screen.getByRole('button', { name: 'Enviar' }).getAttribute('type')).toBe('submit');
});
