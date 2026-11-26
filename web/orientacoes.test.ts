// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarOrientacoes } from './orientacoes';

const vigente = {
  orientacao_id: '00000000-0000-4000-8000-000000000001',
  versao: 3,
  situacao: 'vigente' as const,
  texto: 'Orientação fictícia vigente.',
  autor: 'Profissional fictício',
  data: '2026-11-01',
  destinatarios: 'Família fictícia',
  validade: null,
  registrado_em: '2026-11-01T12:00:00+00:00',
};

const preencher = (raiz: HTMLElement) => {
  const area = raiz.querySelector('textarea') as HTMLTextAreaElement;
  const entradas = raiz.querySelectorAll('input');
  area.value = 'Orientação fictícia nova.';
  entradas[0].value = 'Outro profissional fictício';
  entradas[1].value = '2026-11-11';
  entradas[2].value = 'Escola fictícia';
};

it('substituir grava a superação da anterior e a criação da nova', async () => {
  const raiz = document.createElement('div');
  const consultar = vi.fn(async () => [vigente]);
  const salvar = vi
    .fn()
    .mockResolvedValueOnce({ ...vigente, versao: 4, situacao: 'superada' })
    .mockResolvedValueOnce({
      ...vigente,
      orientacao_id: '00000000-0000-4000-8000-000000000002',
      versao: 1,
    });
  montarOrientacoes(raiz, '40000000-0000-4000-8000-000000000001', { consultar, salvar }, () => {});
  await vi.waitFor(() => expect(raiz.textContent).toContain('Orientação fictícia vigente.'));

  (raiz.querySelector('li button') as HTMLButtonElement).click();
  preencher(raiz);
  (raiz.querySelector('form') as HTMLFormElement).dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await vi.waitFor(() => expect(salvar).toHaveBeenCalledTimes(2));
  // Superar usa a versão vigente lida do servidor, não a posição na lista.
  expect(salvar.mock.calls[0]?.[1]).toMatchObject({
    orientacao_id: vigente.orientacao_id,
    versao_esperada: 3,
    situacao: 'superada',
  });
  const criada = salvar.mock.calls[1]?.[1] as Record<string, unknown>;
  expect(criada).toMatchObject({
    versao_esperada: 0,
    situacao: 'vigente',
    texto: 'Orientação fictícia nova.',
  });
  expect(criada).not.toHaveProperty('orientacao_id');
});

it('mostra a superada como anterior e não oferece substituí-la de novo', async () => {
  const raiz = document.createElement('div');
  const consultar = vi.fn(async () => [{ ...vigente, situacao: 'superada' as const }]);
  montarOrientacoes(
    raiz,
    '40000000-0000-4000-8000-000000000001',
    { consultar, salvar: async () => vigente },
    () => {},
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Anterior'));
  expect(raiz.textContent).not.toContain('Atual');
  expect(raiz.querySelector('li button')).toBeNull();
});

it('registrar a primeira orientação cria com versão esperada zero', async () => {
  const raiz = document.createElement('div');
  const salvar = vi.fn(async () => ({ ...vigente, versao: 1 }));
  montarOrientacoes(
    raiz,
    '40000000-0000-4000-8000-000000000001',
    { consultar: async () => [], salvar },
    () => {},
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  preencher(raiz);
  (raiz.querySelector('form') as HTMLFormElement).dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await vi.waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  expect(salvar.mock.calls[0]?.[1]).toMatchObject({ versao_esperada: 0, situacao: 'vigente' });
});
