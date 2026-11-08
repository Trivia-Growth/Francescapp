// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const id = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
const abrirFicha = '[aria-label="Abrir ficha de Paciente fictício"]';

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

async function abrirAnamnese(): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector(abrirFicha)).not.toBeNull());
  document.querySelector<HTMLButtonElement>(abrirFicha)?.click();
  document.getElementById('ficha-aba-anamnese')?.click();
}

it.each([404, 401])('abre paciente real e trata falha %s sem sucesso simulado', async (status) => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  const caminhos: string[] = [];
  vi.stubGlobal('fetch', async (url: URL) => {
    caminhos.push(url.pathname);
    if (url.pathname === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (url.pathname === '/api/pacientes')
      return envelope({
        itens: [
          {
            id,
            nome: 'Paciente fictício',
            nome_preferencia: null,
            versao: 1,
          },
        ],
        proximo_cursor: null,
      });
    if (url.pathname === `/api/pacientes/${id}/anamnese`) return new Response(null, { status });
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(abrirFicha)).not.toBeNull());
  document.querySelector<HTMLButtonElement>(abrirFicha)?.click();
  expect(document.activeElement?.id).toBe('ficha-title');
  document.getElementById('ficha-aba-anamnese')?.click();
  expect(caminhos).toContain(`/api/pacientes/${id}/anamnese`);
  if (status === 401) {
    await vi.waitFor(() => expect(document.getElementById('login-view')?.hidden).toBe(false));
    expect(document.getElementById('ficha-view')?.textContent).toBe('');
    expect(document.getElementById('ficha-view')?.hidden).toBe(true);
    expect(document.activeElement?.id).toBe('login-title');
  } else {
    await vi.waitFor(() =>
      expect(document.getElementById('ficha-painel')?.textContent).not.toContain('Carregando'),
    );
    expect(document.querySelector('[data-secao="anamnese"] form')).toBeNull();
    document.getElementById('ficha-voltar')?.click();
    expect(document.activeElement).toBe(document.querySelector(abrirFicha));
    expect(document.getElementById('ficha-view')?.textContent).toBe('');
  }
});

it('protege edição não salva ao trocar de seção, fechar, sair ou recarregar', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
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
  await abrirAnamnese();
  await vi.waitFor(() =>
    expect(document.querySelector('[data-secao="anamnese"] form')).not.toBeNull(),
  );
  const campo = document.querySelector<HTMLInputElement>('[data-secao="anamnese"] input');
  if (!campo) throw new Error('Campo indisponível');
  campo.value = 'Seção fictícia';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('ficha-aba-plano')?.click();
  expect(confirmar).toHaveBeenCalledTimes(1);
  expect(document.getElementById('ficha-aba-anamnese')?.getAttribute('aria-selected')).toBe('true');
  document.getElementById('ficha-voltar')?.click();
  expect(confirmar).toHaveBeenCalledTimes(2);
  expect(document.getElementById('ficha-view')?.hidden).toBe(false);
  document.getElementById('logout')?.click();
  expect(confirmar).toHaveBeenCalledTimes(3);
  expect(document.getElementById('patients-view')?.hidden).toBe(false);
  const saida = new Event('beforeunload', { cancelable: true });
  expect(window.dispatchEvent(saida)).toBe(false);
  confirmar.mockReturnValue(true);
  document.getElementById('ficha-voltar')?.click();
  expect(document.getElementById('ficha-view')?.hidden).toBe(true);
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
  confirmar.mockRestore();
});

it.each([true, false])('exibe histórico apenas quando disponibilidade é %s', async (disponivel) => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
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
    if (url.pathname === '/api/anamnese/historico/disponibilidade') return envelope({ disponivel });
    if (url.pathname === `/api/pacientes/${id}/anamnese`) return envelope(null);
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  await abrirAnamnese();
  await vi.waitFor(() =>
    expect(document.querySelector('[data-secao="anamnese"] form')).not.toBeNull(),
  );
  expect(
    document.querySelector('[data-secao="anamnese"]')?.textContent?.includes('Consultar histórico'),
  ).toBe(disponivel);
});
