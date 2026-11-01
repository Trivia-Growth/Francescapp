// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['403', 'logout'])(
  'não trata cadastro confirmado como incerto durante lista: %s',
  async (situacao) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    const id = '10000000-0000-4000-8000-000000000001';
    const csrf = 'a'.repeat(43);
    const sessao = {
      usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: ['administrar_cadastro'],
    };
    const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
    let terminarLista: ((resposta: Response) => void) | undefined;
    let consultas = 0;
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
      if (url.pathname === '/api/sessao') return envelope(sessao);
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
    elemento<HTMLInputElement>('patient-name').value = 'Pessoa fictícia';
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
    expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(false);
    if (situacao === 'logout') terminarLista?.(envelope({ itens: [], proximo_cursor: null }));
  },
);

it('avisa antes de sair durante cadastro sem confirmação sem persistir dados pessoais', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'a'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: ['administrar_cadastro'],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let terminar: ((resposta: Response) => void) | undefined;
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
    if (url.pathname === '/api/sessao') return envelope(sessao);
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
  expect(sair()).toBe(false);
  elemento<HTMLInputElement>('patient-name').value = 'Pessoa fictícia';
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(terminar).toBeDefined());
  expect(sair()).toBe(true);
  terminar?.(new Response(null, { status: 503 }));
  await vi.waitFor(() =>
    expect(elemento('create-feedback').textContent).toContain('sem confirmação'),
  );
  expect(sair()).toBe(true);
  expect(JSON.stringify(window.localStorage)).not.toContain('Pessoa fictícia');
  expect(JSON.stringify(window.sessionStorage)).not.toContain('Pessoa fictícia');
  terminar = undefined;
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(terminar).toBeDefined());
  terminar?.(
    envelope({
      id,
      nome: 'Pessoa fictícia',
      nome_preferencia: null,
      data_nascimento: null,
      contatos: [],
      versao: 1,
    }),
  );
  await vi.waitFor(() =>
    expect(elemento('create-feedback').textContent).toContain('Paciente cadastrado'),
  );
  expect(sair()).toBe(false);
  terminar = undefined;
  elemento<HTMLInputElement>('patient-name').value = 'Outra pessoa fictícia';
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(terminar).toBeDefined());
  elemento('logout').click();
  await vi.waitFor(() => expect(elemento('login-view').hidden).toBe(false));
  expect(elemento('login-feedback').textContent).toContain('cadastro pode estar sem confirmação');
  expect(elemento('login-feedback').textContent).toContain('não o recrie');
  expect(elemento<HTMLInputElement>('patient-name').value).toBe('');
  terminar?.(new Response(null, { status: 503 }));
});
