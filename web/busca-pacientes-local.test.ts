// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { correspondeBuscaPacienteLocal, BuscaPacientesLocal } from './busca-pacientes-local';

it('busca por nome ou preferência sem distinguir acentos e maiúsculas', () => {
  const paciente = { name: 'João Silva', preferredName: 'Jô' };
  expect(correspondeBuscaPacienteLocal(paciente, ' JOAO ')).toBe(true);
  expect(correspondeBuscaPacienteLocal(paciente, 'jo')).toBe(true);
  expect(correspondeBuscaPacienteLocal(paciente, 'Maria')).toBe(false);
  expect(correspondeBuscaPacienteLocal(paciente, ' ')).toBe(true);
});

it('oferece campo rotulado e comunica alterações, inclusive limpeza', () => {
  const raiz = document.createElement('div');
  const buscar = vi.fn();
  render(createElement(BuscaPacientesLocal, { aoBuscar: buscar }), { container: raiz });
  const campo = raiz.querySelector('input');
  expect(campo?.labels?.[0]?.textContent).toContain('Buscar paciente por nome ou nome preferido');
  if (!campo) throw new Error('Campo de busca ausente');
  fireEvent.input(campo, { target: { value: 'Maria' } });
  fireEvent.input(campo, { target: { value: '' } });
  expect(buscar.mock.calls).toEqual([['Maria'], ['']]);
});
