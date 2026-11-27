// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { AreaTexto } from './area-texto.js';

afterEach(cleanup);

it('é um textarea com rótulo associado', () => {
  render(<AreaTexto id="relato" rotulo="Relato do turno" />);
  const controle = screen.getByLabelText('Relato do turno');
  expect(controle.tagName).toBe('TEXTAREA');
  expect(controle.id).toBe('relato');
});

it('a altura é prop, não ajuste por tela', () => {
  render(
    <>
      <AreaTexto id="curto" rotulo="Observação" />
      <AreaTexto id="longo" rotulo="Anamnese" linhas={12} />
    </>,
  );
  expect(screen.getByLabelText('Observação').getAttribute('rows')).toBe('4');
  expect(screen.getByLabelText('Anamnese').getAttribute('rows')).toBe('12');
});

it('usa as mesmas medidas do campo de texto, com 16px por causa do iOS', () => {
  render(<AreaTexto id="relato" rotulo="Relato" />);
  const classes = screen.getByLabelText('Relato').className;
  expect(classes).toContain('min-h-controle-md');
  expect(classes).toContain('px-3');
  expect(classes).toContain('rounded-campo');
  expect(classes).toContain('border-borda-forte');
  expect(classes).toContain('--texto-2');
  expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
});

it('dica e erro são descritos juntos, e o nó do erro existe sempre', () => {
  const { rerender } = render(
    <AreaTexto id="relato" rotulo="Relato" dica="O que mudou no turno." />,
  );
  const controle = screen.getByLabelText('Relato');
  expect(controle.getAttribute('aria-describedby')).toBe('relato-dica relato-erro');
  const no = document.getElementById('relato-erro');
  expect(no?.textContent).toBe('');
  rerender(
    <AreaTexto id="relato" rotulo="Relato" dica="O que mudou no turno." erro="Escreva o relato." />,
  );
  expect(document.getElementById('relato-erro')).toBe(no);
  expect(no?.textContent).toBe('Escreva o relato.');
});

it('aria-invalid anda junto com a frase do erro', () => {
  const { rerender } = render(<AreaTexto id="relato" rotulo="Relato" />);
  const controle = screen.getByLabelText('Relato');
  expect(controle.getAttribute('aria-invalid')).toBeNull();
  rerender(<AreaTexto id="relato" rotulo="Relato" erro="Escreva o relato." />);
  expect(controle.getAttribute('aria-invalid')).toBe('true');
  expect(controle.className).toContain('aria-invalid:border-erro');
});

it('desabilitado não recebe digitação e recua por token', async () => {
  render(<AreaTexto id="relato" rotulo="Relato" disabled />);
  const controle = screen.getByLabelText('Relato') as HTMLTextAreaElement;
  await usuario.type(controle, 'texto');
  expect(controle.value).toBe('');
  expect(controle.className).toContain('disabled:bg-superficie-3');
});

it('não anula o foco visível global e aceita digitação', async () => {
  render(<AreaTexto id="relato" rotulo="Relato" />);
  const controle = screen.getByLabelText('Relato') as HTMLTextAreaElement;
  expect(controle.className).not.toMatch(/outline-none|ring-0|focus:outline-0/);
  await usuario.tab();
  expect(document.activeElement).toBe(controle);
  await usuario.keyboard('passagem tranquila');
  expect(controle.value).toBe('passagem tranquila');
});
