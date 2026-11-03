// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', '20000000-0000-4000-8000-000000000001');
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each([true, false])(
  'mantém carteira oculta até revalidação: autorizada=%s',
  async (autorizada) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    let oculta = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => oculta);
    const id = '10000000-0000-4000-8000-000000000001';
    const sessao = {
      session_id: '20000000-0000-4000-8000-000000000001',
      usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: ['administrar_cadastro'],
    };
    const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
    let liberar!: (response: Response) => void;
    let consultas = 0;
    let listas = 0;
    let autenticada = false;
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      if (url.pathname === '/api/sessao' && !autenticada)
        return new Response(null, { status: 401 });
      if (url.pathname === '/api/auth/tecnica') {
        autenticada = true;
        return envelope(sessao);
      }

      if (url.pathname === '/api/sessao') {
        consultas++;
        if (consultas === 1)
          return new Promise<Response>((resolve) => {
            liberar = resolve;
          });
        return autorizada ? envelope(sessao) : new Response(null, { status: 403 });
      }
      if (url.pathname === '/api/pacientes' && init.method === 'GET') {
        listas++;
        return envelope({ itens: [], proximo_cursor: null });
      }
      throw new Error('Rota inesperada');
    });
    await import('./main.js');
    const el = <T extends HTMLElement>(nome: string) => document.getElementById(nome) as T;
    await vi.waitFor(() => expect(el<HTMLFieldSetElement>('login-fields').disabled).toBe(false));
    el<HTMLInputElement>('email').value = 'tecnica@example.test';
    el<HTMLInputElement>('password').value = 'senha-ficticia';
    el('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(consultas).toBe(1));
    oculta = true;
    document.dispatchEvent(new Event('visibilitychange'));
    liberar(envelope(sessao));
    await vi.waitFor(() => expect(el('login-view').hidden).toBe(true));
    expect(el('patients-view').hidden).toBe(true);
    expect(listas).toBe(0);
    oculta = false;
    document.dispatchEvent(new Event('visibilitychange'));
    if (autorizada) {
      await vi.waitFor(() => expect(el('patients-view').hidden).toBe(false));
      expect(listas).toBe(1);
      expect(document.title).toBe('FFCMApp | Pacientes');
      expect(document.activeElement).toBe(el('patients-title'));
    } else {
      await vi.waitFor(() => expect(el('login-view').hidden).toBe(false));
      expect(el('patients-view').hidden).toBe(true);
      expect(listas).toBe(0);
    }
  },
);
