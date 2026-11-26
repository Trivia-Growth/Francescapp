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
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
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
      document.querySelector('[aria-label="Abrir ficha de Paciente fictício"]'),
    ).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>('[aria-label="Abrir ficha de Paciente fictício"]')
    ?.click();
  document.getElementById('ficha-aba-cadastro')?.click();
  expect(document.getElementById('ficha-painel')?.textContent).toContain(
    'A edição do cadastro ainda não está disponível neste ambiente.',
  );
  expect(fetch.mock.calls.some(([url]) => url.pathname === `/api/pacientes/${id}`)).toBe(false);
});

it.each([
  { perfil: 'administrador', capacidades: ['administrar_cadastro'], visivel: true },
  { perfil: 'profissional', capacidades: [], visivel: false },
])(
  'oferece edição somente com disponibilidade e autorização: $perfil',
  async ({ perfil, capacidades, visivel }) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', sessionId);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        if (url.pathname === '/api/sessao')
          return envelope({
            session_id: sessionId,
            usuario: { id, perfil, ativo: true, versao: 1 },
            capacidades,
          });
        if (url.pathname === '/api/pacientes')
          return envelope({
            itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
            proximo_cursor: null,
          });
        if (url.pathname === '/api/pacientes/edicao/disponibilidade')
          return envelope({ disponivel: true });
        return new Response(null, { status: 404 });
      }),
    );
    await import('./main.js');
    await vi.waitFor(() =>
      expect(
        document.querySelector('[aria-label="Abrir ficha de Paciente fictício"]'),
      ).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>('[aria-label="Abrir ficha de Paciente fictício"]')
      ?.click();
    expect(Boolean(document.getElementById('ficha-aba-cadastro'))).toBe(visivel);
    if (visivel) {
      document.getElementById('ficha-aba-cadastro')?.click();
      expect(document.getElementById('ficha-painel')?.textContent).not.toContain(
        'A edição do cadastro ainda não está disponível neste ambiente.',
      );
    }
  },
);
