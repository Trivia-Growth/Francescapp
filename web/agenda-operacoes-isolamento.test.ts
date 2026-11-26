// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { montarOperacoesAgenda } from './agenda-operacoes.ts';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('reconciliação de outra conta não apaga envio incerto', async () => {
  localStorage.setItem('ffcm-agenda-operacao-incerta:usuario-a', '1');
  localStorage.setItem('ffcm-agenda-operacao-incerta:usuario-b', '1');
  let reconciliada = false;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const usuario = new Headers(init.headers).get('x-usuario');
      if (url.endsWith('/reconciliar')) {
        reconciliada = true;
        return Response.json({ estado: 'confirmado' });
      }
      return Response.json({
        estado: usuario === 'usuario-b' && !reconciliada ? 'pendente' : 'nenhuma',
      });
    }),
  );
  const raizA = document.createElement('div');
  const raizB = document.createElement('div');
  const a = montarOperacoesAgenda(
    raizA,
    () => new Headers({ 'x-usuario': 'usuario-a' }),
    () => {},
    'usuario-a',
  );
  const b = montarOperacoesAgenda(
    raizB,
    () => new Headers({ 'x-usuario': 'usuario-b' }),
    () => {},
    'usuario-b',
  );
  const verificar = [...raizB.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Verificar situação no Google',
  );
  if (!verificar) throw new Error('Botão de verificação ausente');
  await vi.waitFor(() => expect(verificar.hidden).toBe(false));
  verificar.click();
  await vi.waitFor(() =>
    expect(localStorage.getItem('ffcm-agenda-operacao-incerta:usuario-b')).toBeNull(),
  );
  expect(localStorage.getItem('ffcm-agenda-operacao-incerta:usuario-a')).toBe('1');
  expect((raizA.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
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
