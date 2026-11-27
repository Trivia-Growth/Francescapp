// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MarcaEstado } from './marca-estado.js';

afterEach(cleanup);

it('tem os três tons, e o padrão é `padrao`', () => {
  render(
    <>
      <MarcaEstado>Em acompanhamento</MarcaEstado>
      <MarcaEstado tom="contorno">Completar cadastro</MarcaEstado>
      <MarcaEstado tom="suave">3</MarcaEstado>
    </>,
  );
  expect(screen.getByText('Em acompanhamento').dataset.tom).toBe('padrao');
  expect(screen.getByText('Completar cadastro').dataset.tom).toBe('contorno');
  expect(screen.getByText('3').dataset.tom).toBe('suave');
});

it('cada tom muda a superfície, e o contorno é contínuo', () => {
  render(
    <>
      <MarcaEstado>Em acompanhamento</MarcaEstado>
      <MarcaEstado tom="contorno">Completar cadastro</MarcaEstado>
      <MarcaEstado tom="suave">3</MarcaEstado>
    </>,
  );
  const padrao = screen.getByText('Em acompanhamento').className;
  const contorno = screen.getByText('Completar cadastro').className;
  const suave = screen.getByText('3').className;
  expect(padrao).toContain('bg-superficie-3');
  expect(padrao).toContain('text-texto');
  expect(contorno).toContain('border-borda');
  expect(contorno).toContain('bg-superficie');
  // A borda tracejada saiu por parecer defeito de renderização.
  expect(contorno).not.toContain('border-dashed');
  expect(suave).toContain('bg-superficie-2');
  expect(suave).toContain('text-texto-suave');
});

it('mantém a pílula e o tamanho de metadado em todos os tons', () => {
  render(
    <>
      <MarcaEstado>Em acompanhamento</MarcaEstado>
      <MarcaEstado tom="contorno">Completar</MarcaEstado>
      <MarcaEstado tom="suave">3</MarcaEstado>
    </>,
  );
  for (const marca of [
    screen.getByText('Em acompanhamento'),
    screen.getByText('Completar'),
    screen.getByText('3'),
  ]) {
    expect(marca.className).toContain('rounded-[20px]');
    expect(marca.className).toContain('--texto-1');
  }
});

it('nenhum tom escreve cor literal nem usa o oliva como cor de texto', () => {
  render(
    <>
      <MarcaEstado>Em acompanhamento</MarcaEstado>
      <MarcaEstado tom="contorno">Completar</MarcaEstado>
      <MarcaEstado tom="suave">3</MarcaEstado>
    </>,
  );
  for (const marca of [
    screen.getByText('Em acompanhamento'),
    screen.getByText('Completar'),
    screen.getByText('3'),
  ]) {
    expect(marca.className).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(marca.className).not.toContain('text-marca');
    expect(marca.className).not.toContain('brand-olive');
  }
});

it('é texto, não só cor: o estado está escrito na marca', () => {
  render(<MarcaEstado tom="contorno">Completar cadastro</MarcaEstado>);
  expect(screen.getByText('Completar cadastro').textContent).toBe('Completar cadastro');
});

it('não vira controle: sem papel interativo e fora da tabulação', () => {
  render(<MarcaEstado>Em acompanhamento</MarcaEstado>);
  const marca = screen.getByText('Em acompanhamento');
  expect(marca.tagName).toBe('SPAN');
  expect(marca.getAttribute('role')).toBeNull();
  expect(marca.tabIndex).toBe(-1);
});
