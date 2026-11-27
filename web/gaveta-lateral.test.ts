// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';
import { aguardarConfirmacao, responderConfirmacoes } from './confirmacao-prova.js';

const id = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

it('monta a gaveta modal somente enquanto o menu está aberto', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600, writable: true });
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
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(document.getElementById('toggle-sidebar')).not.toBeNull());

  const menu = document.getElementById('toggle-sidebar');
  expect(menu?.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById('patients-sidebar')).toBeNull();
  menu?.click();
  await vi.waitFor(() => expect(document.getElementById('close-sidebar')).not.toBeNull());
  expect(document.getElementById('patients-sidebar')?.getAttribute('role')).toBe('dialog');
  expect(document.getElementById('nav-home')?.getAttribute('href')).toBe('#home');
  expect(document.activeElement?.id).toBe('close-sidebar');
  expect(document.getElementById('sidebar-backdrop')).not.toBeNull();

  document.getElementById('close-sidebar')?.click();
  await vi.waitFor(() => expect(document.getElementById('patients-sidebar')).toBeNull());
  await vi.waitFor(() => expect(document.activeElement).toBe(menu));

  menu?.click();
  await vi.waitFor(() => expect(document.getElementById('patients-sidebar')).not.toBeNull());
  window.dispatchEvent(new PopStateEvent('popstate'));
  await vi.waitFor(() => expect(document.getElementById('sidebar-backdrop')).toBeNull());
});

it('mantém ficha, rascunho e gaveta quando descarte é cancelado', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600, writable: true });
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  const confirmacoes = responderConfirmacoes(false);
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (url.pathname === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (url.pathname === `/api/pacientes/${id}/anamnese`) return envelope(null);
    throw new Error('Rota inesperada');
  });
  await montarCascaParaTeste();
  const seletor = 'button[data-paciente-id]';
  await vi.waitFor(() => expect(document.querySelector(seletor)).not.toBeNull());
  await vi.waitFor(() => expect(document.getElementById('home-view')?.hidden).toBe(false));
  window.history.pushState(null, '', `#paciente/${id}/dados`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await vi.waitFor(() => expect(document.getElementById('ficha-view')?.hidden).toBe(false));
  expect(document.getElementById('home-view')?.hidden).toBe(true);
  expect(document.getElementById('home-view')?.childElementCount).toBe(0);
  document.getElementById('ficha-aba-anamnese')?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('[data-secao="anamnese"] form')).not.toBeNull(),
  );
  const campo = document.querySelector<HTMLInputElement>('[data-secao="anamnese"] input');
  if (!campo) throw new Error('Campo indisponível');
  campo.value = 'Rascunho fictício';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  const rota = window.location.hash;
  document.getElementById('toggle-sidebar')?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('nav-carteira')?.getAttribute('aria-current')).toBe('page'),
  );
  expect(document.getElementById('nav-home')?.hasAttribute('aria-current')).toBe(false);
  document.getElementById('nav-home')?.click();
  await aguardarConfirmacao();
  expect(confirmacoes.chamadas).toHaveLength(1);
  expect(confirmacoes.chamadas[0]).toContain('Sair e descartar o que ainda não foi confirmado?');
  expect(window.location.hash).toBe(rota);
  expect(document.getElementById('ficha-view')?.hidden).toBe(false);
  expect(campo.value).toBe('Rascunho fictício');
  expect(document.getElementById('patients-sidebar')?.getAttribute('data-state')).toBe('open');
  confirmacoes.encerrar();
});

/** A navegação recolhida voltava inteira na carga seguinte, e o recolher parecia não ter
 * funcionado. A preferência é de largura e nada mais: nenhum dado de pessoa ou sessão. */
it('lembra a navegação recolhida na carga seguinte', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280, writable: true });
  localStorage.setItem('navegacao-recolhida', 'sim');
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
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));

  const recolher = document.getElementById('collapse-sidebar') as HTMLButtonElement;
  expect(document.body.classList.contains('casca-recolhida')).toBe(true);
  expect(recolher.getAttribute('aria-expanded')).toBe('false');
  expect(recolher.getAttribute('aria-label')).toBe('Expandir navegação');

  recolher.click();
  await vi.waitFor(() => expect(document.body.classList.contains('casca-recolhida')).toBe(false));
  expect(recolher.getAttribute('aria-expanded')).toBe('true');
  expect(recolher.textContent).toBe('Recolher');
  expect(recolher.getAttribute('aria-label')).toBe('Recolher navegação');
  expect(localStorage.getItem('navegacao-recolhida')).toBeNull();
});
