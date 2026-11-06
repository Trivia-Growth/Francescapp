// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const id = '10000000-0000-4000-8000-000000000001';
const sessao = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('abre tarefas da carteira em modo somente leitura', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessao);
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = typeof url === 'string' ? url : url.pathname;
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessao,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === `/api/pacientes/${id}/tarefas`)
      return envelope([
        {
          tarefa_id: id,
          versao: 1,
          ator_usuario_id: id,
          data: '2026-01-01T00:00:00Z',
          tarefa: {
            descricao: 'Ligar para família',
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
      document.querySelector('#patients-body button[aria-label="Tarefas de Paciente fictício"]'),
    ).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>(
      '#patients-body button[aria-label="Tarefas de Paciente fictício"]',
    )
    ?.click();
  const raiz = document.getElementById('tarefas-raiz');
  await vi.waitFor(() => expect(raiz?.textContent).toContain('Ligar para família'));
  expect(raiz?.textContent).toContain('Criação e edição ainda indisponíveis');
  expect(raiz?.querySelector('form')).toBeNull();
  expect(raiz?.querySelectorAll('select')).toHaveLength(2);
});
