// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const paciente = '10000000-0000-4000-8000-000000000001';
const usuarioB = '10000000-0000-4000-8000-000000000002';
const sessao = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: paciente });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

it('descarta resumo ao trocar profissional durante revalidação', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessao);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let usuario = paciente;
  let consultasB = 0;
  let resolverPlano!: (resposta: Response) => void;
  const planoPendente = new Promise<Response>((resolve) => {
    resolverPlano = resolve;
  });
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = typeof url === 'string' ? url.split('?')[0] : url.pathname;
    if (caminho === '/api/sessao') {
      if (usuario === usuarioB) consultasB += 1;
      return envelope({
        session_id: sessao,
        usuario: { id: usuario, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    }
    if (caminho === '/api/pacientes') {
      return envelope({
        itens: [{ id: paciente, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    }
    if (caminho === `/api/pacientes/${paciente}/plano`) return planoPendente;
    if (caminho === `/api/pacientes/${paciente}/tarefas`)
      return envelope([
        {
          tarefa_id: paciente,
          versao: 1,
          ator_usuario_id: paciente,
          data: '2026-01-01T00:00:00Z',
          tarefa: {
            descricao: 'Dado da sessão anterior',
            responsavel: 'Equipe',
            prazo: '2026-12-01',
            prioridade: 'alta',
            estado: 'pendente',
          },
        },
      ]);
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir resumo de Paciente fictício"]'),
    ).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>('[aria-label="Abrir resumo de Paciente fictício"]')
    ?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('resumo-raiz')?.textContent).toContain(
      'Dado da sessão anterior',
    ),
  );
  usuario = usuarioB;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(consultasB).toBeGreaterThan(0));
  await vi.waitFor(() => expect(document.getElementById('login-view')?.hidden).toBe(false));
  expect(document.getElementById('resumo-panel')?.hidden).toBe(true);
  expect(document.getElementById('resumo-raiz')?.textContent).toBe('');
  resolverPlano(envelope({ itens: [], proximo_cursor: null }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.getElementById('resumo-raiz')?.textContent).toBe('');
});
