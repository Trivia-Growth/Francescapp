// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.ts';
import { montarTarefasCuidado } from './tarefas-cuidado.ts';

it.each([401, 403])('remove rascunho antes de informar perda de acesso %s', async (status) => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn(() => expect(raiz.textContent).not.toContain('Dado fictício'));
  montarTarefasCuidado(
    raiz,
    'paciente',
    {
      consultarTarefas: vi.fn().mockResolvedValue([]),
      criarTarefa: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', status)),
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const inputs = raiz.querySelectorAll('form input');
  const [descricao, responsavel, prazo] = inputs;
  if (!descricao || !responsavel || !prazo) throw new Error('Campos ausentes');
  descricao.value = 'Dado fictício';
  responsavel.value = 'Equipe';
  prazo.value = '2026-12-01';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});
