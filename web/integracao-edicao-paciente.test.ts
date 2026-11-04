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

it('não oferece edição enquanto as rotas de paciente não estão disponíveis', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  const fetch = vi.fn(async (url: URL) => {
    if (url.pathname === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
        capacidades: ['administrar_cadastro'],
      });
    if (url.pathname === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  await import('./main.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir anamnese de Paciente fictício"]'),
    ).not.toBeNull(),
  );
  expect(document.querySelector('[aria-label="Editar cadastro de Paciente fictício"]')).toBeNull();
  expect(document.getElementById('edicao-panel')?.hidden).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url.pathname === `/api/pacientes/${id}`)).toBe(false);
});
