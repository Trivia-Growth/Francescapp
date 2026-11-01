// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  history.replaceState(null, '', '/');
});

it('mostra falha genérica e remove somente marcador de retorno após sessão não autorizada', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  history.replaceState(null, '', '/?acesso=indisponivel&outra=valor#inicio');
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
  await import('./main.js');
  await vi.waitFor(() =>
    expect(document.getElementById('login-feedback')?.textContent).toContain(
      'Não foi possível entrar com Google',
    ),
  );
  expect(location.pathname + location.search + location.hash).toBe('/?outra=valor#inicio');
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
});

it('avisa sobre falha de entrada quando a sessão anterior continua válida', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  history.replaceState(null, '', '/?acesso=indisponivel');
  const id = '10000000-0000-4000-8000-000000000001';
  const sessao = {
    session_id: '20000000-0000-4000-8000-000000000001',
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: ['administrar_cadastro'],
  };
  vi.stubGlobal('fetch', async (url: URL) =>
    Response.json({
      dados: url.pathname === '/api/sessao' ? sessao : { itens: [], proximo_cursor: null },
      request_id: id,
    }),
  );
  await import('./main.js');
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
  expect(document.getElementById('workspace-feedback')?.textContent).toContain(
    'Sua sessão anterior continua ativa',
  );
  expect(location.search).toBe('');
});
