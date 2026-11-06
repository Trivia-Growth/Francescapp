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

it('abre plano do paciente pela rota HTTP e trata dispatcher inativo sem simular sucesso', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  const caminhos: string[] = [];
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = new URL(String(url), 'http://localhost').pathname;
    caminhos.push(caminho);
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === `/api/pacientes/${id}/plano`) return new Response(null, { status: 404 });
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir plano de cuidado de Paciente fictício"]'),
    ).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>('[aria-label="Abrir plano de cuidado de Paciente fictício"]')
    ?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('#plano-raiz button')?.textContent).toBe('Tentar novamente'),
  );
  expect(caminhos).toContain(`/api/pacientes/${id}/plano`);
  expect(document.querySelector('#plano-raiz form')).toBeNull();
  expect(document.activeElement?.id).toBe('plano-title');
  document.getElementById('fechar-plano')?.click();
  expect(document.getElementById('plano-raiz')?.textContent).toBe('');
  expect(document.activeElement).toBe(
    document.querySelector('[aria-label="Abrir plano de cuidado de Paciente fictício"]'),
  );
});

it('encerra acesso e limpa plano quando permissão é revogada após retorno à aba', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  let consultasPlano = 0;
  let responder: ((resposta: Response) => void) | undefined;
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = new URL(String(url), 'http://localhost').pathname;
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === `/api/pacientes/${id}/plano`) {
      consultasPlano++;
      if (consultasPlano === 1) return envelope({ itens: [], proximo_cursor: null });
      return new Promise<Response>((resolve) => {
        responder = resolve;
      });
    }
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir plano de cuidado de Paciente fictício"]'),
    ).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>('[aria-label="Abrir plano de cuidado de Paciente fictício"]')
    ?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('plano-raiz')?.textContent).toContain('Nenhum objetivo'),
  );
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(responder).toBeDefined());
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  responder?.(
    Response.json(
      { erro: { codigo: 'sem_permissao', mensagem: 'Operação não permitida.' }, request_id: id },
      { status: 403 },
    ),
  );
  await vi.waitFor(() => expect(document.getElementById('login-view')?.hidden).toBe(false));
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  expect(document.getElementById('plano-panel')?.hidden).toBe(true);
  expect(document.getElementById('plano-raiz')?.textContent).toBe('');
  expect(document.getElementById('login-feedback')?.textContent).toContain(
    'Seu acesso precisa ser validado novamente',
  );
  Reflect.deleteProperty(document, 'hidden');
});
