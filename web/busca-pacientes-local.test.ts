// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { correspondeBuscaPacienteLocal, montarBuscaPacientesLocal } from './busca-pacientes-local';

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
  montarBuscaPacientesLocal(raiz, buscar);
  const campo = raiz.querySelector('input');
  expect(campo?.labels?.[0]?.textContent).toContain('Buscar paciente por nome ou nome preferido');
  if (!campo) throw new Error('Campo de busca ausente');
  campo.value = 'Maria';
  campo.dispatchEvent(new Event('input'));
  campo.value = '';
  campo.dispatchEvent(new Event('input'));
  expect(buscar.mock.calls).toEqual([['Maria'], ['']]);
});
