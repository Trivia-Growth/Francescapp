// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
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

/** Abaixo de 760px a barra lateral vira gaveta (ver nota em `web/styles.css` e
 * `web/main.ts`): sem o botão/backdrop/Escape, o Administrador e o Profissional não
 * teriam como sair de "Seu dia" ou da carteira no celular. */
it('abre e fecha a gaveta lateral no celular — botão, fundo, Escape e navegação', async () => {
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
  await import('./main.js');
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));

  const botao = document.getElementById('toggle-sidebar') as HTMLButtonElement;
  const gaveta = document.getElementById('patients-sidebar') as HTMLElement;
  const fundo = document.getElementById('sidebar-backdrop') as HTMLElement;

  expect(botao.getAttribute('aria-expanded')).toBe('false');
  expect(fundo.hidden).toBe(true);
  expect(gaveta.inert).toBe(true);
  const fechar = document.getElementById('close-sidebar') as HTMLButtonElement;
  const home = document.getElementById('nav-home') as HTMLAnchorElement;
  const administracao = document.getElementById('nav-administracao') as HTMLAnchorElement;
  const href = home.getAttribute('href');

  botao.click();
  expect(gaveta.classList.contains('open')).toBe(true);
  expect(fundo.hidden).toBe(false);
  expect(botao.getAttribute('aria-expanded')).toBe('true');
  expect(gaveta.inert).toBe(false);
  expect(document.activeElement).toBe(fechar);
  expect(document.querySelector('header')?.inert).toBe(true);
  expect(document.body.classList.contains('sidebar-open')).toBe(true);
  const ultimo = document.getElementById('nav-regras') as HTMLElement;
  ultimo.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(fechar);
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
  );
  expect(document.activeElement).toBe(ultimo);

  fundo.click();
  expect(gaveta.classList.contains('open')).toBe(false);
  expect(fundo.hidden).toBe(true);
  expect(botao.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(botao);
  expect(document.querySelector('header')?.inert).toBeFalsy();
  expect(document.body.classList.contains('sidebar-open')).toBe(false);

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

  botao.click();
  window.innerWidth = 1000;
  window.dispatchEvent(new Event('resize'));
  expect(gaveta.inert).toBe(false);
  expect(document.body.classList.contains('sidebar-open')).toBe(false);
  const collapse = document.getElementById('collapse-sidebar') as HTMLButtonElement;
  expect(document.activeElement).toBe(collapse);
  collapse.click();
  expect(collapse.textContent).toContain('›');
  expect(home.getAttribute('aria-label')).toBe('Seu dia');
  expect(document.body.classList.contains('sidebar-collapsed')).toBe(true);
  expect(collapse.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById('nav-home')).toBe(home);
  expect(home.getAttribute('href')).toBe(href);
  expect(administracao.hidden).toBe(false);
  home.focus();
  const tooltip = home.querySelector<HTMLElement>('.sidebar-tooltip');
  expect(tooltip?.hidden).toBe(false);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(tooltip?.hidden).toBe(true);
  window.innerWidth = 600;
  window.dispatchEvent(new Event('resize'));
  expect(document.activeElement).toBe(botao);
  botao.click();
  expect(document.activeElement).toBe(fechar);
  window.dispatchEvent(new Event('resize'));
  expect(document.activeElement).toBe(botao);
  botao.click();
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(gaveta.classList.contains('open')).toBe(false);
  expect(gaveta.inert).toBe(true);
  expect(document.body.classList.contains('sidebar-open')).toBe(false);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
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
  await import('./main.js');
  const seletor = '[aria-label="Abrir ficha de Paciente fictício"]';
  await vi.waitFor(() => expect(document.querySelector(seletor)).not.toBeNull());
  document.getElementById('nav-home')?.click();
  expect(document.getElementById('home-view')?.hidden).toBe(false);
  window.history.pushState(null, '', `#paciente/${id}/dados`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await vi.waitFor(() => expect(document.getElementById('ficha-view')?.hidden).toBe(false));
  expect(document.getElementById('home-view')?.hidden).toBe(true);
  expect(document.getElementById('home-view')?.childElementCount).toBe(0);
  expect(document.getElementById('nav-carteira')?.getAttribute('aria-current')).toBe('page');
  expect(document.getElementById('nav-home')?.hasAttribute('aria-current')).toBe(false);
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
  document.getElementById('nav-home')?.click();
  await aguardarConfirmacao();
  expect(confirmacoes.chamadas).toHaveLength(1);
  expect(confirmacoes.chamadas[0]).toContain('Sair e descartar o que ainda não foi confirmado?');
  expect(window.location.hash).toBe(rota);
  expect(document.getElementById('ficha-view')?.hidden).toBe(false);
  expect(campo.value).toBe('Rascunho fictício');
  expect(document.getElementById('patients-sidebar')?.classList.contains('open')).toBe(true);
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
  await import('./main.js');
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));

  const recolher = document.getElementById('collapse-sidebar') as HTMLButtonElement;
  expect(document.body.classList.contains('sidebar-collapsed')).toBe(true);
  expect(recolher.getAttribute('aria-expanded')).toBe('false');
  expect(recolher.getAttribute('aria-label')).toBe('Expandir navegação');

  recolher.click();
  expect(document.body.classList.contains('sidebar-collapsed')).toBe(false);
  expect(recolher.getAttribute('aria-expanded')).toBe('true');
  expect(localStorage.getItem('navegacao-recolhida')).toBeNull();
});

it('oferece o controle de recolher com moldura e rótulo visíveis', () => {
  /* Conferido em navegador em 25/11/2026: o recolhimento sempre funcionou nas três
     larguras, mas o controle era um `‹` solto no branco — sem borda, sem fundo, sem
     texto — e a única pista de que era clicável só aparecia no `:hover`. O solicitante
     relatou que "a sidebar não recolhe"; o que faltava era encontrar o botão.
     Então a prova aqui não é de comportamento, é de descoberta: existe rótulo visível, e
     ele acompanha o estado. */
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const botao = document.getElementById('collapse-sidebar') as HTMLButtonElement;
  const rotulo = botao.querySelector('.sidebar-collapse-rotulo');
  expect(rotulo?.textContent).toBe('Recolher');
  expect(botao.getAttribute('aria-label')).toBe('Recolher navegação');
  // O rótulo é decorativo para quem ouve: `aria-label` já diz a mesma coisa por extenso,
  // e sem isto o nome acessível sairia duplicado.
  expect(rotulo?.getAttribute('aria-hidden')).toBe('true');
});
