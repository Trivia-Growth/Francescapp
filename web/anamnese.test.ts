// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { montarAnamnese } from './anamnese.js';

it('mostra pendências e respostas recebidas sem interpretar conteúdo como HTML', async () => {
  const raiz = document.createElement('div');
  const servico = {
    consultarAnamnese: vi.fn().mockResolvedValue({
      versao: 1,
      secoes: [
        {
          id: 'História',
          camposEsperados: ['Relato', 'Outra'],
          respostas: [
            {
              campo: 'Relato',
              estado: 'informado',
              valor: '<img src=x>',
              fonte: 'Família',
              data: '2026-01-01',
            },
          ],
        },
      ],
    }),
  };
  montarAnamnese(raiz, 'paciente', servico);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Seções com pendências: História'));
  expect(raiz.textContent).toContain('<img src=x>');
  expect(raiz.querySelector('img')).toBeNull();
  expect(raiz.textContent).toContain('Pendente');
});

it('não apresenta dados ou sucesso quando consulta falha', async () => {
  const raiz = document.createElement('div');
  montarAnamnese(raiz, 'paciente', { consultarAnamnese: vi.fn().mockRejectedValue(new Error()) });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Serviço indisponível'));
  expect(raiz.querySelector('form')).toBeNull();
});
