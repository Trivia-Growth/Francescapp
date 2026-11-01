// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('orienta novo acesso sem afirmar revogação quando renovação falha durante saída', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'a'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let consultas = 0;
  let liberar: (resposta: Response) => void = () => {};
  let renovando = false;
  const renovacao = new Promise<Response>((resolve) => {
    liberar = resolve;
  });
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname.endsWith('/desafio-tecnico'))
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname.endsWith('/tecnica'))
      return envelope({
        sessao,
        access_token: 'ficticio',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
        csrf,
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
    if (url.pathname.endsWith('/renovar')) {
      renovando = true;
      return renovacao;
    }
    if (url.pathname.endsWith('/pacientes')) return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/sessao') {
      consultas += 1;
      return consultas === 1 ? envelope(sessao) : Response.json({}, { status: 401 });
    }
    throw new Error('Rota inesperada.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  elemento<HTMLInputElement>('email').value = 'ficticio@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(renovando).toBe(true));
  elemento('logout').click();
  liberar(Response.json({}, { status: 503 }));
  await vi.waitFor(() => expect(elemento('login-view').hidden).toBe(false));
  expect(elemento('login-feedback').textContent).toContain('Não foi possível confirmar');
  expect(elemento('login-feedback').textContent).toContain('novo acesso');
  expect(elemento('logout-view').hidden).toBe(true);
});
