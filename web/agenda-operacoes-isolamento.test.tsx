// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OperacoesAgenda } from './agenda-operacoes.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function montar(usuarioId: string, cabecalhos: () => Headers, atualizar: () => void) {
  return render(
    <OperacoesAgenda
      cabecalhos={cabecalhos}
      atualizar={atualizar}
      usuarioId={usuarioId}
      registrar={() => {}}
    />,
  );
}

it('reconciliação de outra conta não apaga envio incerto', async () => {
  localStorage.setItem('ffcm-agenda-operacao-incerta:usuario-a', '1');
  localStorage.setItem('ffcm-agenda-operacao-incerta:usuario-b', '1');
  let reconciliada = false;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const usuario = new Headers(init?.headers).get('x-usuario');
      if (url.endsWith('/reconciliar')) {
        reconciliada = true;
        return Response.json({ estado: 'confirmado' });
      }
      return Response.json({
        estado: usuario === 'usuario-b' && !reconciliada ? 'pendente' : 'nenhuma',
      });
    }),
  );
  const a = montar(
    'usuario-a',
    () => new Headers({ 'x-usuario': 'usuario-a' }),
    () => {},
  );
  const b = montar(
    'usuario-b',
    () => new Headers({ 'x-usuario': 'usuario-b' }),
    () => {},
  );
  let verificar: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    verificar = [...b.container.querySelectorAll('button')].find(
      (botao) => botao.textContent === 'Verificar situação no Google',
    );
    expect(verificar).toBeDefined();
  });
  verificar?.click();
  await vi.waitFor(() =>
    expect(localStorage.getItem('ffcm-agenda-operacao-incerta:usuario-b')).toBeNull(),
  );
  expect(localStorage.getItem('ffcm-agenda-operacao-incerta:usuario-a')).toBe('1');
  expect((a.container.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  a.unmount();
  b.unmount();
});

it('mantém bloqueio para marcador antigo sem autor identificável', async () => {
  localStorage.setItem('ffcm-agenda-operacao-incerta', '1');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => Response.json({ estado: 'nenhuma' })),
  );
  const tela = montar(
    'usuario-b',
    () => new Headers(),
    () => {},
  );
  await vi.waitFor(() =>
    expect(tela.container.textContent).toContain('ainda não pode ser localizada'),
  );
  expect((tela.container.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  expect(localStorage.getItem('ffcm-agenda-operacao-incerta')).toBe('1');
  tela.unmount();
});
