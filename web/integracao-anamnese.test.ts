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
});

it.each([404, 401])('abre paciente real e trata falha %s sem sucesso simulado', async (status) => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
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
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('#patients-body button')?.click();
  expect(caminhos).toContain(`/api/pacientes/${id}/anamnese`);
  if (status === 401) {
    await vi.waitFor(() => expect(document.getElementById('login-view')?.hidden).toBe(false));
    expect(document.getElementById('anamnese-raiz')?.textContent).toBe('');
    expect(document.activeElement?.id).toBe('login-title');
  } else {
    await vi.waitFor(() =>
      expect(document.getElementById('anamnese-raiz')?.textContent).not.toContain('Carregando'),
    );
    expect(document.getElementById('anamnese-raiz')?.querySelector('form')).toBeNull();
    expect(document.activeElement?.id).toBe('anamnese-title');
    document.getElementById('fechar-anamnese')?.click();
    expect(document.activeElement?.id).toBe('patients-title');
    expect(document.getElementById('anamnese-raiz')?.textContent).toBe('');
  }
});

it('protege edição não salva ao fechar, sair ou recarregar', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
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
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('#patients-body button')?.click();
  await vi.waitFor(() => expect(document.querySelector('#anamnese-raiz form')).not.toBeNull());
  const campo = document.querySelector<HTMLInputElement>('#anamnese-raiz input');
  if (!campo) throw new Error('Campo indisponível');
  campo.value = 'Seção fictícia';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('fechar-anamnese')?.click();
  expect(confirmar).toHaveBeenCalled();
  expect(document.getElementById('anamnese-panel')?.hidden).toBe(false);
  document.getElementById('logout')?.click();
  expect(confirmar).toHaveBeenCalledTimes(2);
  expect(document.getElementById('patients-view')?.hidden).toBe(false);
  const saida = new Event('beforeunload', { cancelable: true });
  expect(window.dispatchEvent(saida)).toBe(false);
  confirmar.mockReturnValue(true);
  document.getElementById('fechar-anamnese')?.click();
  expect(document.getElementById('anamnese-panel')?.hidden).toBe(true);
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
  confirmar.mockRestore();
});
