// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const id = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

/** Abaixo de 760px a barra lateral vira gaveta (ver nota em `web/styles.css` e
 * `web/main.ts`): sem o botão/backdrop/Escape, o Administrador e o Profissional não
 * teriam como sair de "Seu dia" ou da carteira no celular. */
it('abre e fecha a gaveta lateral no celular — botão, fundo, Escape e navegação', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (url.pathname === '/api/pacientes') return envelope({ itens: [], proximo_cursor: null });
    throw new Error(`Rota inesperada: ${url.pathname}`);
  });
  await import('./main.js');
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));

  const botao = document.getElementById('toggle-sidebar') as HTMLButtonElement;
  const gaveta = document.getElementById('patients-sidebar') as HTMLElement;
  const fundo = document.getElementById('sidebar-backdrop') as HTMLElement;

  expect(botao.getAttribute('aria-expanded')).toBe('false');
  expect(fundo.hidden).toBe(true);

  botao.click();
  expect(gaveta.classList.contains('open')).toBe(true);
  expect(fundo.hidden).toBe(false);
  expect(botao.getAttribute('aria-expanded')).toBe('true');

  fundo.click();
  expect(gaveta.classList.contains('open')).toBe(false);
  expect(fundo.hidden).toBe(true);
  expect(botao.getAttribute('aria-expanded')).toBe('false');

  botao.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(gaveta.classList.contains('open')).toBe(false);

  botao.click();
  expect(gaveta.classList.contains('open')).toBe(true);
  document.getElementById('nav-home')?.click();
  expect(gaveta.classList.contains('open')).toBe(false);

  // Voltar pelo navegador (gesto comum no celular) também precisa fechar a gaveta; senão
  // ela ficaria sobreposta à tela nova depois do popstate.
  botao.click();
  expect(gaveta.classList.contains('open')).toBe(true);
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(gaveta.classList.contains('open')).toBe(false);
  expect(fundo.hidden).toBe(true);
});
