// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgendaIndividual } from './agenda-individual.tsx';

let desmontar: (() => void) | undefined;

afterEach(() => {
  desmontar?.();
  desmontar = undefined;
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

function montar(estado: 'conectado' | 'desconectado') {
  sessionStorage.setItem('modo-acesso', 'google');
  sessionStorage.setItem('fluxo-google', 'a'.repeat(22));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (entrada: string | URL) => {
      const url = String(entrada);
      if (url.endsWith('/conexao'))
        return Response.json({
          estado,
          versao: '1',
          operacao_id: '00000000-0000-4000-8000-000000000001',
          autorizacao: 'comprovante-ficticio',
        });
      if (url.includes('/compromissos')) return Response.json({ dados: [] });
      if (url.endsWith('/pendencia')) return Response.json({ estado: 'nenhuma' });
      throw new Error('Rota inesperada');
    }),
  );
  const raiz = document.createElement('div');
  const painel = render(
    createElement(AgendaIndividual, {
      sessaoId: 'sessao-ficticia',
      usuarioId: 'usuario-ficticio',
      listarPacientes: async () => ({ itens: [], proximo_cursor: null }),
    }),
    { container: raiz },
  );
  desmontar = painel.unmount;
  return raiz;
}

it.each(['conectado', 'desconectado'] as const)(
  'preserva orientação do consentimento incompleto após consultar estado %s',
  async (estado) => {
    window.history.replaceState(null, '', '/?agenda=autorizar-novamente');
    const raiz = montar(estado);
    const conectar = [...raiz.querySelectorAll('button')].find(
      (botao) => botao.textContent === 'Conectar agenda Google',
    );
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain(
        estado === 'conectado' ? 'Nenhum compromisso' : 'Agenda desconectada',
      ),
    );
    expect(raiz.textContent).toContain('A nova autorização da agenda não foi concluída');
    expect(raiz.textContent).toContain('Uma conexão anterior, se existir, foi preservada');
    expect(raiz.querySelector('a')?.href).toBe(
      'https://support.google.com/accounts/answer/13533235?hl=pt-BR',
    );
    expect(raiz.querySelector('a')?.rel).toBe('noopener noreferrer');
    expect(raiz.textContent).toContain('não garante que uma nova autorização seja concluída');
    expect(conectar?.disabled).toBe(estado === 'conectado');
  },
);

it.each(['?agenda=outro-valor', '?agenda=autorizar-novamente&agenda=outro-valor', ''])(
  'não inventa resultado de consentimento para parâmetro desconhecido ou ambíguo: %s',
  async (parametros) => {
    window.history.replaceState(null, '', `/${parametros}`);
    const raiz = montar('desconectado');
    await vi.waitFor(() => expect(raiz.textContent).toContain('Agenda desconectada'));
    expect(raiz.textContent).not.toContain('A nova autorização da agenda não foi concluída');
  },
);
