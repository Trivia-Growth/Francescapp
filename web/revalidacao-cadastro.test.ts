// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('revalida acesso ao retornar à aba durante cadastro ainda em andamento', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'a'.repeat(43);
  let sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: ['administrar_cadastro'],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let concluir!: (resposta: Response) => void;
  let cadastroIniciado = false;
  let cadastrosEnviados = 0;
  let consultasSessao = 0;
  let revogada = false;
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/sessao/desafio-tecnico')
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname === '/api/sessao/tecnica')
      return envelope({
        sessao,
        access_token: 'token-ficticio',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
        csrf,
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
    if (url.pathname === '/api/sessao') {
      consultasSessao++;
      return revogada ? new Response(null, { status: 401 }) : envelope(sessao);
    }
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes' && init.method === 'POST') {
      cadastrosEnviados++;
      cadastroIniciado = true;
      return new Promise<Response>((resolver) => {
        concluir = resolver;
      });
    }
    throw new Error('Rota inesperada no teste.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(nome: string) => document.getElementById(nome) as T;
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(cadastroIniciado).toBe(true));
  consultasSessao = 0;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(elemento('patients-view').hidden).toBe(true);
  expect(elemento('revalidacao-status').hidden).toBe(false);
  concluir(new Response(null, { status: 503 }));
  await vi.waitFor(() => expect(consultasSessao).toBeGreaterThan(0));
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  expect(elemento('revalidacao-status').hidden).toBe(true);
  sessao = { ...sessao, capacidades: [] };
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(elemento('cadastro').hidden).toBe(true));
  sessao = { ...sessao, capacidades: ['administrar_cadastro'] };
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(elemento('cadastro').hidden).toBe(false));
  expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
  revogada = true;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(elemento('login-view').hidden).toBe(false));
  expect(elemento('login-feedback').textContent).toContain('cadastro ficou sem confirmação');
  expect(elemento('login-feedback').textContent).not.toContain('Paciente fictício');
  revogada = false;
  elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
  expect(elemento('create-feedback').textContent).toContain('sem confirmação');
  expect(elemento<HTMLInputElement>('patient-name').value).toBe('');
  elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  expect(cadastrosEnviados).toBe(1);
});
