// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarResumoConectado } from './resumo-conectado';

it('consulta páginas explicitamente e descarta resposta após desmontagem', async () => {
  const raiz = document.createElement('div');
  let resolver!: (pagina: { itens: []; proximo_cursor: null }) => void;
  const consultarObjetivos = vi
    .fn()
    .mockResolvedValueOnce({ itens: [], proximo_cursor: 'pagina-2' })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
  const consultarTarefas = vi.fn().mockResolvedValue([]);
  const fechar = montarResumoConectado(
    raiz,
    'paciente',
    { consultarObjetivos },
    { consultarTarefas },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Próxima página de objetivos'));
  const proximo = [...raiz.querySelectorAll('button')].find((botao) =>
    botao.textContent?.startsWith('Próxima'),
  );
  if (!proximo) throw new Error('Botão de próxima página ausente');
  proximo.click();
  expect(consultarObjetivos).toHaveBeenLastCalledWith('paciente', 'pagina-2');
  fechar();
  resolver({ itens: [], proximo_cursor: null });
  await Promise.resolve();
  expect(raiz.textContent).toBe('');
});
