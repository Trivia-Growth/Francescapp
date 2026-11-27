// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { responderConfirmacoes } from './confirmacao-prova.js';
import { VinculoAgenda, type PunhoVinculo } from './agenda-vinculo.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar(
  listar: (cursor?: string) => Promise<{
    itens: readonly { id: string; nome: string }[];
    proximo_cursor: string | null;
  }>,
  atualizado: () => void = () => {},
) {
  let punho: PunhoVinculo | null = null;
  const resultado = render(
    <VinculoAgenda
      cabecalhos={() => new Headers()}
      listar={listar}
      atualizado={atualizado}
      registrar={(recebido) => {
        punho = recebido;
      }}
    />,
  );
  const atual = () => {
    if (!punho) throw new Error('Punho não registrado.');
    return punho;
  };
  return { ...resultado, punho: atual };
}

function botao(raiz: HTMLElement, texto: string): HTMLButtonElement {
  const alvo = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!alvo) throw new Error(`Botão ausente: ${texto}`);
  return alvo;
}

it('lista pacientes da página ao abrir e pagina sem repetir o cursor atual', async () => {
  const listar = vi.fn(async (cursor?: string) => {
    if (!cursor) return { itens: [{ id: 'p1', nome: 'Paciente Um' }], proximo_cursor: 'pagina-2' };
    return { itens: [{ id: 'p2', nome: 'Paciente Dois' }], proximo_cursor: null };
  });
  const tela = montar(listar);
  act(() => {
    tela.punho().abrir('evt-a', 'quinta-feira, 10:00');
  });
  await vi.waitFor(() => expect(tela.container.textContent).toContain('Paciente Um'));
  expect(listar).toHaveBeenCalledWith(undefined);
  botao(tela.container, 'Próxima página').click();
  await vi.waitFor(() => expect(tela.container.textContent).toContain('Paciente Dois'));
  expect(listar).toHaveBeenCalledWith('pagina-2');
  expect(botao(tela.container, 'Próxima página').disabled).toBe(true);
});

it('vincula após confirmar e avisa o hospedeiro para atualizar a agenda', async () => {
  const listar = vi.fn(async () => ({
    itens: [{ id: 'p1', nome: 'Paciente Um' }],
    proximo_cursor: null,
  }));
  const atualizado = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ estado: 'vinculado' })));
  const confirmacoes = responderConfirmacoes(true);
  const tela = montar(listar, atualizado);
  act(() => {
    tela.punho().abrir('evt-a', 'quinta-feira, 10:00');
  });
  await vi.waitFor(() => expect(tela.container.textContent).toContain('Paciente Um'));
  botao(tela.container, 'Paciente Um').click();
  await vi.waitFor(() => expect(atualizado).toHaveBeenCalledOnce());
  expect(tela.container.textContent).toContain('Vínculo confirmado');
  confirmacoes.encerrar();
});

it('mantém o painel oculto quando o hospedeiro pede para ocultar', async () => {
  const listar = vi.fn(async () => ({ itens: [], proximo_cursor: null }));
  const tela = montar(listar);
  act(() => {
    tela.punho().abrir('evt-a', 'quinta-feira, 10:00');
  });
  await vi.waitFor(() => expect(tela.container.querySelector('section')?.hidden).toBe(false));
  act(() => {
    tela.punho().ocultar();
  });
  expect(tela.container.querySelector('section')?.hidden).toBe(true);
});
