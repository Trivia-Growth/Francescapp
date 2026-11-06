// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarIndicadoresCarteiraLocal } from './indicadores-carteira-local';

it('conta situações registradas e permite filtrar inclusive não informada', () => {
  const raiz = document.createElement('div');
  const filtrar = vi.fn();
  montarIndicadoresCarteiraLocal(raiz, {
    pacientes: [{ situacao: 'ativo' }, { situacao: 'ativo' }, { situacao: 'pausado' }, {}],
    filtrar,
  });
  const botoes = Array.from(raiz.querySelectorAll('button'));
  expect(botoes.map((botao) => botao.textContent)).toEqual([
    'Entrada: 0',
    'Ativo: 2',
    'Pausado: 1',
    'Encerrado: 0',
    'Transferido: 0',
    'Não informada: 1',
  ]);
  botoes[5]?.click();
  expect(filtrar).toHaveBeenCalledWith('');
});

it('mostra contagens sem botões quando filtro não está disponível', () => {
  const raiz = document.createElement('div');
  montarIndicadoresCarteiraLocal(raiz, { pacientes: [] });
  expect(raiz.textContent).toContain('Não informada: 0');
  expect(raiz.querySelector('button')).toBeNull();
});
