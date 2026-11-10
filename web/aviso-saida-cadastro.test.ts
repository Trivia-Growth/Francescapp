// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CAMINHO_EQUIPE, preencherCasoNovo, respostaEquipe } from './teste-caso-novo.js';

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', '20000000-0000-4000-8000-000000000001');
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['403', 'logout'])(
  'não trata cadastro confirmado como incerto durante lista: %s',
  async (situacao) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    const id = '10000000-0000-4000-8000-000000000001';
    const sessao = {
      session_id: '20000000-0000-4000-8000-000000000001',
      usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: ['administrar_cadastro', 'administrar_concessoes'],
    };
    const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
    let terminarLista: ((resposta: Response) => void) | undefined;
    let consultas = 0;
    let autenticada = false;
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      if (url.pathname === '/api/sessao' && !autenticada)
        return new Response(null, { status: 401 });
      if (url.pathname === '/api/auth/tecnica') {
        autenticada = true;
        return envelope(sessao);
      }

      if (url.pathname === '/api/sessao') return envelope(sessao);
      if (url.pathname === CAMINHO_EQUIPE) return respostaEquipe();
      if (url.pathname === '/api/cadastro/barreira')
        return envelope({ epoca: 1, reserva: null, resultado_pendente: null });
      if (url.pathname === '/api/cadastro/barreira/encerrar') return envelope({ estado: 'vazia' });
      if (url.pathname === '/api/cadastro/barreira/reservar') return envelope({ estado: 'aberta' });
      if (url.pathname === '/api/sessao/sair')
        return envelope({ encerrada_localmente: true, pendencia_externa: false });
      if (url.pathname === '/api/pacientes' && init.method === 'GET') {
        consultas += 1;
        if (consultas === 2)
          return new Promise<Response>((resolve) => {
            terminarLista = resolve;
          });
        return envelope({ itens: [], proximo_cursor: null });
      }
      if (url.pathname === '/api/pacientes' && init.method === 'POST')
        return envelope({
          id,
          nome: 'Pessoa fictícia',
          nome_preferencia: null,
          data_nascimento: null,
          contatos: [],
          versao: 1,
        });
      throw new Error('Rota inesperada.');
    });
    await import('./main.js');
    const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const entrar = async () => {
      elemento<HTMLInputElement>('email').value = 'ficticio@example.test';
      elemento<HTMLInputElement>('password').value = 'senha-ficticia';
      elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
    };
    await vi.waitFor(() =>
      expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
    );
    await entrar();
    await vi.waitFor(() => expect(document.querySelector('[data-acao="encerrar"]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('[data-acao="encerrar"]')?.click();
    await vi.waitFor(() =>
      expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(false),
    );
    await preencherCasoNovo('Pessoa fictícia');
    elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(terminarLista).toBeDefined());
    const evento = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    if (situacao === '403') terminarLista?.(Response.json({}, { status: 403 }));
    else elemento('logout').click();
    await vi.waitFor(() => expect(elemento('login-view').hidden).toBe(false));
    expect(elemento('login-feedback').textContent).not.toContain('sem confirmação');
    await entrar();
    expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
    if (situacao === 'logout') terminarLista?.(envelope({ itens: [], proximo_cursor: null }));
  },
);

it('avisa antes de sair durante cadastro sem confirmação sem persistir dados pessoais', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const id = '10000000-0000-4000-8000-000000000001';
  const sessao = {
    session_id: '20000000-0000-4000-8000-000000000001',
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: ['administrar_cadastro', 'administrar_concessoes'],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let terminar: ((resposta: Response) => void) | undefined;
  let pendente = false;
  let autenticada = false;
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/sessao' && !autenticada) return new Response(null, { status: 401 });
    if (url.pathname === '/api/auth/tecnica') {
      autenticada = true;
      return envelope(sessao);
    }
    if (url.pathname === CAMINHO_EQUIPE) return respostaEquipe();
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/cadastro/barreira')
      return envelope({
        epoca: 1,
        reserva: null,
        resultado_pendente: pendente
          ? { recibo_id: id, reserva_id: id, resultado: 'confirmada', paciente_id: id }
          : null,
      });
    if (url.pathname === '/api/cadastro/barreira/encerrar') return envelope({ estado: 'vazia' });
    if (url.pathname === '/api/cadastro/barreira/reservar') return envelope({ estado: 'aberta' });
    if (url.pathname === '/api/cadastro/barreira/reconhecer') {
      pendente = false;
      return envelope({ estado: 'reconhecido' });
    }
    if (url.pathname === '/api/sessao/sair')
      return envelope({ encerrada_localmente: true, pendencia_externa: false });
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes' && init.method === 'POST')
      return await new Promise<Response>((resolve) => {
        terminar = resolve;
      });
    throw new Error('Rota inesperada.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sair = () => {
    const evento = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evento);
    return evento.defaultPrevented;
  };
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  elemento<HTMLInputElement>('email').value = 'ficticio@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  await vi.waitFor(() => expect(document.querySelector('[data-acao="encerrar"]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('[data-acao="encerrar"]')?.click();
  await vi.waitFor(() => expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(false));
  expect(sair()).toBe(false);
  await preencherCasoNovo('Pessoa fictícia');
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(terminar).toBeDefined());
  expect(sair()).toBe(true);
  pendente = true;
  terminar?.(new Response(null, { status: 503 }));
  await vi.waitFor(() =>
    expect(elemento('create-feedback').textContent).toContain('Cadastro anterior confirmado'),
  );
  expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
  expect(JSON.stringify(window.localStorage)).not.toContain('Pessoa fictícia');
  expect(JSON.stringify(window.sessionStorage)).not.toContain('Pessoa fictícia');
  document.querySelector<HTMLButtonElement>('[data-acao="reconhecer"]')?.click();
  await vi.waitFor(() => expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(false));
  expect(sair()).toBe(false);
  terminar = undefined;
  await preencherCasoNovo('Outra pessoa fictícia');
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(terminar).toBeDefined());
  elemento('logout').click();
  await vi.waitFor(() => expect(elemento('login-view').hidden).toBe(false));
  expect(elemento('login-feedback').textContent).toContain('cadastro pode estar sem confirmação');
  expect(elemento('login-feedback').textContent).toContain('não o recrie');
  expect(elemento<HTMLInputElement>('patient-name').value).toBe('');
  terminar?.(new Response(null, { status: 503 }));
});
