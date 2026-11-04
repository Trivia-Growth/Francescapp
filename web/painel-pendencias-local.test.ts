// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarPainelPendenciasLocal } from './painel-pendencias-local';

it('mostra tarefas abertas por paciente e identifica prazo vencido sem interpretar texto como HTML', () => {
  const raiz = document.createElement('div');
  const abrir = vi.fn();
  montarPainelPendenciasLocal(raiz, {
    hoje: '2026-11-04',
    pacientes: [
      {
        id: 'paciente-1',
        nome: '<img src=x>',
        tarefas: [
          { descricao: 'Contato', responsavel: 'Equipe', prazo: '2026-11-03', estado: 'pendente' },
          {
            descricao: 'Retorno',
            responsavel: 'Equipe',
            prazo: '2026-11-04',
            estado: 'em_andamento',
          },
          {
            descricao: 'Concluída',
            responsavel: 'Equipe',
            prazo: '2026-11-01',
            estado: 'concluida',
          },
        ],
      },
    ],
    abrirTarefas: abrir,
  });
  expect(raiz.textContent).toContain('<img src=x>');
  expect(raiz.querySelector('img')).toBeNull();
  expect(raiz.textContent).toContain('Contato');
  expect(raiz.textContent).toContain('Vencida');
  expect(raiz.textContent).toContain('Retorno');
  expect(raiz.textContent).not.toContain('Concluída');
  raiz.querySelector('button')?.click();
  expect(abrir).toHaveBeenCalledWith('paciente-1');
});

it('informa quando não há tarefas abertas', () => {
  const raiz = document.createElement('div');
  montarPainelPendenciasLocal(raiz, { hoje: '2026-11-04', pacientes: [] });
  expect(raiz.textContent).toContain('Nenhuma tarefa em aberto');
});
