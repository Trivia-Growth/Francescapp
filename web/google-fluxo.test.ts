// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('vincula cada tentativa Google à aba', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
  await import('./main.js');
  const form = document.getElementById('google-login-form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  const fluxo = new FormData(form).get('fluxo');
  expect(fluxo).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(sessionStorage.getItem('fluxo-google')).toBe(fluxo);
});

it('rejeita retorno de outra tentativa antes de consultar sessão', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('fluxo-google', 'AAAAAAAAAAAAAAAAAAAAAA');
  history.replaceState(null, '', '/?fluxo=BBBBBBBBBBBBBBBBBBBBBB');
  const fetch = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  await import('./main.js');
  expect(fetch).not.toHaveBeenCalled();
  expect(location.search).toBe('');
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
});

it('aceita retorno correspondente e usa o seletor na consulta', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const fluxo = 'AAAAAAAAAAAAAAAAAAAAAA';
  sessionStorage.setItem('fluxo-google', fluxo);
  history.replaceState(null, '', `/?fluxo=${fluxo}&outra=1`);
  const fetch = vi.fn(async (_url: URL, init: RequestInit) => {
    expect(new Headers(init.headers).get('x-fluxo')).toBe(fluxo);
    return new Response(null, { status: 401 });
  });
  vi.stubGlobal('fetch', fetch);
  await import('./main.js');
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(location.search).toBe('?outra=1');
});

it('impede início Google quando armazenamento da aba falha', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
  await import('./main.js');
  const falha = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error();
  });
  const evento = new Event('submit', { cancelable: true });
  document.getElementById('google-login-form')?.dispatchEvent(evento);
  expect(evento.defaultPrevented).toBe(true);
  falha.mockRestore();
});

it('não restaura sessão técnica após retorno divergente e recarga, mas aceita retorno posterior', async () => {
  const fluxo = 'AAAAAAAAAAAAAAAAAAAAAA';
  sessionStorage.setItem('fluxo-google', fluxo);
  sessionStorage.setItem('modo-acesso', 'tecnica');
  const fetch = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  history.replaceState(null, '', '/?fluxo=BBBBBBBBBBBBBBBBBBBBBB');
  await import('./main.js');
  expect(fetch).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('fluxo-google')).toBe(fluxo);
  vi.resetModules();
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  await import('./main.js');
  expect(fetch).not.toHaveBeenCalled();
  vi.resetModules();
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  history.replaceState(null, '', `/?fluxo=${fluxo}`);
  await import('./main.js');
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
});

it('não restaura cookie técnico sem modo estabelecido na aba', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const fetch = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  await import('./main.js');
  expect(fetch).not.toHaveBeenCalled();
});

it('preserva entrada técnica confirmada na recarga e bloqueia após saída', async () => {
  const sessao = {
    session_id: '20000000-0000-4000-8000-000000000001',
    usuario: {
      id: '10000000-0000-4000-8000-000000000001',
      perfil: 'administrador',
      ativo: true,
      versao: 1,
    },
    capacidades: ['administrar_cadastro'],
  };
  const fetch = vi.fn(async (url: URL) =>
    Response.json({
      dados:
        url.pathname === '/api/sessao/sair'
          ? { encerrada_localmente: true, pendencia_externa: false }
          : sessao,
      request_id: '10000000-0000-4000-8000-000000000001',
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const { ClienteFFCM } = await import('./api.js');
  const cliente = new ClienteFFCM();
  await cliente.entrar('teste@example.test', 'senha-ficticia');
  const outraAbaLogica = new ClienteFFCM();
  await expect(outraAbaLogica.consultarSessao()).resolves.toEqual(sessao);
  expect(sessionStorage.getItem('modo-acesso')).toBe('tecnica');
  await expect(outraAbaLogica.sair()).resolves.toMatchObject({ encerrada_localmente: true });
  const nova = new ClienteFFCM();
  const antes = fetch.mock.calls.length;
  await expect(nova.consultarSessao()).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(antes);
});

it('preserva retorno divergente se bloqueio não puder ser salvo e bloqueia na recarga', async () => {
  const fluxo = 'AAAAAAAAAAAAAAAAAAAAAA';
  sessionStorage.setItem('fluxo-google', fluxo);
  sessionStorage.setItem('modo-acesso', 'tecnica');
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  history.replaceState(null, '', '/?fluxo=BBBBBBBBBBBBBBBBBBBBBB');
  const fetch = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  const falha = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error();
  });
  await import('./main.js');
  expect(fetch).not.toHaveBeenCalled();
  expect(location.search).toBe('?fluxo=BBBBBBBBBBBBBBBBBBBBBB');
  falha.mockRestore();
  vi.resetModules();
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  await import('./main.js');
  expect(fetch).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('modo-acesso')).toBe('bloqueada');
  expect(sessionStorage.getItem('fluxo-google')).toBe(fluxo);
  expect(location.search).toBe('');
});

it('recusa na recarga técnica a sessão de outra aba que substituiu o cookie', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const sessaoA = {
    session_id: '20000000-0000-4000-8000-000000000001',
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const sessaoB = { ...sessaoA, session_id: '20000000-0000-4000-8000-000000000002' };
  let cookie = sessaoA;
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/auth/tecnica') cookie = sessaoB;
    return Response.json({ dados: cookie, request_id: id });
  });
  const { ClienteFFCM } = await import('./api.js');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', sessaoA.session_id);
  const copia = new Map(Object.entries(sessionStorage));
  sessionStorage.clear();
  for (const [chave, valor] of copia) sessionStorage.setItem(chave, valor);
  await new ClienteFFCM().entrar('outra@example.test', 'senha-ficticia');
  sessionStorage.clear();
  for (const [chave, valor] of copia) sessionStorage.setItem(chave, valor);
  await expect(new ClienteFFCM().consultarSessao()).rejects.toMatchObject({ status: 401 });
});
