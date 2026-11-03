// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

it('restaura sessão ao carregar e informa falha ao tentar entrar', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const fetch = vi.fn(async () => {
    throw new TypeError('indisponível');
  });
  vi.stubGlobal('fetch', fetch);
  await import('./main.js');
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const campos = document.getElementById('login-fields') as HTMLFieldSetElement;
  await vi.waitFor(() => expect(campos.disabled).toBe(false));
  (document.getElementById('email') as HTMLInputElement).value = 'tecnica@example.test';
  (document.getElementById('password') as HTMLInputElement).value = 'senha-ficticia';
  document.getElementById('login-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('login-feedback')?.dataset.tone).toBe('error'),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(campos.disabled).toBe(false);
});

it('orienta aguardar quando acesso encontra limite sem revelar conta', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  vi.stubGlobal('fetch', async (url: URL) =>
    url.pathname === '/api/sessao'
      ? new Response(null, { status: 401 })
      : Response.json(
          {
            erro: { codigo: 'limite_excedido', mensagem: 'Limite de solicitações excedido.' },
            request_id: '10000000-0000-4000-8000-000000000001',
          },
          { status: 429 },
        ),
  );
  await import('./main.js');
  await vi.waitFor(() =>
    expect((document.getElementById('login-fields') as HTMLFieldSetElement).disabled).toBe(false),
  );
  (document.getElementById('email') as HTMLInputElement).value = 'tecnica@example.test';
  (document.getElementById('password') as HTMLInputElement).value = 'senha-ficticia';
  document.getElementById('login-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('login-feedback')?.textContent).toBe(
      'Limite de tentativas atingido. Tente novamente em alguns minutos.',
    ),
  );
});

it('não toma foco de outro controle durante falha tardia do login', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  let responder!: (resposta: Response) => void;
  vi.stubGlobal('fetch', (url: URL) =>
    url.pathname === '/api/sessao'
      ? Promise.resolve(new Response(null, { status: 401 }))
      : new Promise<Response>((resolve) => {
          responder = resolve;
        }),
  );
  await import('./main.js');
  await vi.waitFor(() =>
    expect((document.getElementById('login-fields') as HTMLFieldSetElement).disabled).toBe(false),
  );
  const email = document.getElementById('email') as HTMLInputElement;
  const senha = document.getElementById('password') as HTMLInputElement;
  email.value = 'tecnica@example.test';
  senha.value = 'senha-ficticia';
  (document.activeElement as HTMLElement).blur();
  document.getElementById('login-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  const outro = document.createElement('button');
  document.body.append(outro);
  outro.focus();
  responder(
    Response.json(
      {
        erro: { codigo: 'limite_excedido', mensagem: 'Limite de solicitações excedido.' },
        request_id: '10000000-0000-4000-8000-000000000001',
      },
      { status: 429 },
    ),
  );
  await vi.waitFor(() =>
    expect(document.getElementById('login-feedback')?.dataset.tone).toBe('error'),
  );
  expect(document.activeElement).toBe(outro);
  expect(senha.value).toBe('');
  outro.remove();
});

it('não move foco quando a falha do login chega em aba oculta', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  let responder!: (resposta: Response) => void;
  vi.stubGlobal('fetch', (url: URL) =>
    url.pathname === '/api/sessao'
      ? Promise.resolve(new Response(null, { status: 401 }))
      : new Promise<Response>((resolve) => {
          responder = resolve;
        }),
  );
  const escondido = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  try {
    await import('./main.js');
    await vi.waitFor(() =>
      expect((document.getElementById('login-fields') as HTMLFieldSetElement).disabled).toBe(false),
    );
    const email = document.getElementById('email') as HTMLInputElement;
    email.value = 'tecnica@example.test';
    (document.getElementById('password') as HTMLInputElement).value = 'senha-ficticia';
    document.getElementById('login-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    responder(
      Response.json(
        {
          erro: { codigo: 'limite_excedido', mensagem: 'Limite de solicitações excedido.' },
          request_id: '10000000-0000-4000-8000-000000000001',
        },
        { status: 429 },
      ),
    );
    await vi.waitFor(() =>
      expect(document.getElementById('login-feedback')?.dataset.tone).toBe('error'),
    );
    expect(document.activeElement).not.toBe(email);
  } finally {
    escondido.mockRestore();
  }
});

it('permite mostrar e ocultar a senha sem perder o valor digitado', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
  await import('./main.js');
  const senha = document.getElementById('password') as HTMLInputElement;
  const botao = document.getElementById('toggle-password') as HTMLButtonElement;
  await vi.waitFor(() =>
    expect((document.getElementById('login-fields') as HTMLFieldSetElement).disabled).toBe(false),
  );
  senha.value = 'senha-ficticia';
  expect(senha.type).toBe('password');
  botao.click();
  expect(senha.type).toBe('text');
  expect(botao.textContent).toBe('Ocultar senha');
  expect(senha.value).toBe('senha-ficticia');
  botao.click();
  expect(senha.type).toBe('password');
  expect(botao.textContent).toBe('Mostrar senha');
  botao.click();
  (document.getElementById('email') as HTMLInputElement).value = 'tecnica@example.test';
  document.getElementById('login-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(senha.type).toBe('password');
  expect(senha.value).toBe('');
  expect(botao.getAttribute('aria-pressed')).toBe('false');
});

it('após recusa do login retorna o foco ao campo de e-mail habilitado', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
  await import('./main.js');
  const campos = document.getElementById('login-fields') as HTMLFieldSetElement;
  const email = document.getElementById('email') as HTMLInputElement;
  const senha = document.getElementById('password') as HTMLInputElement;
  await vi.waitFor(() => expect(campos.disabled).toBe(false));
  email.value = 'tecnica@example.test';
  senha.value = 'senha-ficticia';
  (document.activeElement as HTMLElement).blur();
  document.getElementById('login-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('login-feedback')?.dataset.tone).toBe('error'),
  );
  expect(campos.disabled).toBe(false);
  expect(document.activeElement).toBe(email);
});
