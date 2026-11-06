// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { montarOperacoesAgenda } from './agenda-operacoes.ts';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('mantém envio incerto isolado por usuário no mesmo navegador', async () => {
  localStorage.setItem('ffcm-agenda-operacao-incerta:usuario-a', '1');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => Response.json({ estado: 'nenhuma' })),
  );
  const raizA = document.createElement('div');
  const raizB = document.createElement('div');
  const a = montarOperacoesAgenda(
    raizA,
    () => new Headers(),
    () => {},
    'usuario-a',
  );
  const b = montarOperacoesAgenda(
    raizB,
    () => new Headers(),
    () => {},
    'usuario-b',
  );
  const botao = (raiz: HTMLElement) => raiz.querySelector('button') as HTMLButtonElement;
  await vi.waitFor(() => expect(botao(raizB).disabled).toBe(false));
  expect(botao(raizA).disabled).toBe(true);
  expect(localStorage.getItem('ffcm-agenda-operacao-incerta:usuario-a')).toBe('1');
  a.desmontar();
  b.desmontar();
});

it('mantém bloqueio para marcador antigo sem autor identificável', async () => {
  localStorage.setItem('ffcm-agenda-operacao-incerta', '1');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => Response.json({ estado: 'nenhuma' })),
  );
  const raiz = document.createElement('div');
  const tela = montarOperacoesAgenda(
    raiz,
    () => new Headers(),
    () => {},
    'usuario-b',
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('ainda não pode ser localizada'));
  expect((raiz.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  expect(localStorage.getItem('ffcm-agenda-operacao-incerta')).toBe('1');
  tela.desmontar();
});
