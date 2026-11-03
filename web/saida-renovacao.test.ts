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
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('permite repetir saída sem afirmar revogação quando rede falha', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const id = '10000000-0000-4000-8000-000000000001';
  const sessao = {
    session_id: '20000000-0000-4000-8000-000000000001',
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/pacientes') return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/sessao/sair') throw new TypeError('rede indisponível');
    throw new Error('Rota inesperada.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  elemento('logout').click();
  await vi.waitFor(() => expect(elemento('retry-logout').hidden).toBe(false));
  expect(elemento('logout-feedback').textContent).toContain('Não foi possível confirmar');
  expect(elemento('login-view').hidden).toBe(true);
});
