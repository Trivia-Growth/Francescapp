// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const requestId = '10000000-0000-4000-8000-000000000001';
const sessaoOriginal = {
  usuario: { id: requestId, perfil: 'administrador', ativo: true, versao: 1 },
  capacidades: ['administrar_cadastro'],
};
const csrf = 'a'.repeat(43);
const envelope = (dados: unknown) => Response.json({ dados, request_id: requestId });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('mantém pedido incerto após negativa em repetição sem criar nova chave', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const chaves: string[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/sessao/desafio-tecnico')
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname === '/api/sessao/tecnica')
      return envelope({
        sessao: sessaoOriginal,
        access_token: 'token-ficticio',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
        csrf,
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
    if (url.pathname === '/api/sessao') return envelope(sessaoOriginal);
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes' && init.method === 'POST') {
      chaves.push(new Headers(init.headers).get('x-chave-idempotencia') ?? '');
      if (chaves.length === 1) return new Response(null, { status: 503 });
      return Response.json(
        {
          erro: { codigo: 'entrada_invalida', mensagem: 'Dados inválidos.' },
          request_id: requestId,
        },
        { status: 422 },
      );
    }
    throw new Error('Rota inesperada.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(elemento('create-feedback').textContent).toContain('sem confirmação'),
  );
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(chaves).toHaveLength(2));
  await vi.waitFor(() => expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(false));
  expect(elemento('create-feedback').textContent).toContain('sem confirmação');
  expect(elemento<HTMLFieldSetElement>('create-fields').disabled).toBe(true);
  expect(chaves[1]).toBe(chaves[0]);
  expect(JSON.stringify(localStorage)).not.toContain('Paciente fictício');
  expect(JSON.stringify(sessionStorage)).not.toContain('Paciente fictício');
});

it.each([
  [401, 'invalido'],
  [403, 'invalido'],
  [401, 'divergente'],
  [403, 'divergente'],
])('oculta acesso e mantém incerteza após HTTP %s %s', async (status, formato) => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  let pedidos = 0;
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/sessao/desafio-tecnico')
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname === '/api/sessao/tecnica')
      return envelope({
        sessao: sessaoOriginal,
        access_token: 'token-ficticio',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
        csrf,
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
    if (url.pathname === '/api/sessao') return envelope(sessaoOriginal);
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes' && init.method === 'POST') {
      pedidos += 1;
      if (formato === 'invalido') return new Response(null, { status });
      return Response.json(
        {
          erro: {
            codigo: 'servico_indisponivel',
            mensagem: 'Serviço temporariamente indisponível.',
          },
          request_id: requestId,
        },
        { status },
      );
    }
    throw new Error('Rota inesperada no teste.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const entrar = async () => {
    elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
    elemento<HTMLInputElement>('password').value = 'senha-ficticia';
    elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  };
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  await entrar();
  elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('login-view').hidden).toBe(false));
  expect(elemento('patients-view').hidden).toBe(true);
  expect(elemento('login-feedback').textContent).toContain('cadastro ficou sem confirmação');
  expect(elemento('login-feedback').textContent).not.toContain('Paciente fictício');
  expect(elemento<HTMLInputElement>('patient-name').value).toBe('');
  await entrar();
  expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
  expect(elemento('create-feedback').textContent).toContain('sem confirmação');
  expect(pedidos).toBe(1);
  expect(JSON.stringify(localStorage)).not.toContain('Paciente fictício');
  expect(JSON.stringify(sessionStorage)).not.toContain('Paciente fictício');
});

it.each([408, 429, 422, 202])(
  'preserva pedido e chave após resposta HTTP %s incerta',
  async (status) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    const chaves: string[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      if (url.pathname === '/api/sessao/desafio-tecnico')
        return envelope({
          csrf,
          seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        });
      if (url.pathname === '/api/sessao/tecnica')
        return envelope({
          sessao: sessaoOriginal,
          access_token: 'token-ficticio',
          prova_sessao: 'A'.repeat(43),
          geracao_sessao: 1,
          csrf,
          seletor_sessao: '20000000-0000-4000-8000-000000000001',
        });
      if (url.pathname === '/api/sessao') return envelope(sessaoOriginal);
      if (url.pathname === '/api/pacientes' && init.method === 'GET')
        return envelope({ itens: [], proximo_cursor: null });
      if (url.pathname === '/api/pacientes' && init.method === 'POST') {
        chaves.push(new Headers(init.headers).get('x-chave-idempotencia') ?? '');
        if (status === 202)
          return Response.json(
            {
              dados: {
                id: requestId,
                nome: 'Paciente fictício',
                nome_preferencia: null,
                data_nascimento: null,
                contatos: [],
                versao: 1,
              },
              request_id: requestId,
            },
            { status },
          );
        return Response.json(
          {
            erro: {
              codigo: status === 429 ? 'limite_excedido' : 'servico_indisponivel',
              mensagem:
                status === 429
                  ? 'Limite de solicitações excedido.'
                  : 'Serviço temporariamente indisponível.',
            },
            request_id: requestId,
          },
          { status },
        );
      }
      throw new Error('Rota inesperada no teste.');
    });
    await import('./main.js');
    const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    await vi.waitFor(() =>
      expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
    );
    elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
    elemento<HTMLInputElement>('password').value = 'senha-ficticia';
    elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
    elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
    elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(elemento('create-feedback').textContent).toContain('sem confirmação'),
    );
    expect(chaves).toHaveLength(1);
    elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[1]).toBe(chaves[0]);
  },
);

it.each([true, false])(
  'revalidação indisponível: mesma identidade = %s',
  async (mesmaIdentidade) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    const chaves: string[] = [];
    let falharRevalidacao = false;
    let sessao = sessaoOriginal;
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      if (url.pathname === '/api/sessao/desafio-tecnico') {
        return envelope({
          csrf,
          seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        });
      }
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
        if (falharRevalidacao) return new Response(null, { status: 503 });
        return envelope(sessao);
      }
      if (url.pathname === '/api/pacientes' && init.method === 'GET')
        return envelope({ itens: [], proximo_cursor: null });
      if (url.pathname === '/api/pacientes' && init.method === 'POST') {
        chaves.push(new Headers(init.headers).get('x-chave-idempotencia') ?? '');
        return new Response(null, { status: 503 });
      }
      throw new Error('Rota inesperada no teste.');
    });
    await import('./main.js');
    const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const entrar = async () => {
      elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
      elemento<HTMLInputElement>('password').value = 'senha-ficticia';
      elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
    };
    await vi.waitFor(() =>
      expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
    );
    await entrar();
    elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
    elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(elemento('create-feedback').textContent).toContain('sem confirmação'),
    );
    falharRevalidacao = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(elemento('login-view').hidden).toBe(false));
    falharRevalidacao = false;
    if (!mesmaIdentidade) {
      sessao = {
        ...sessaoOriginal,
        usuario: { ...sessaoOriginal.usuario, id: '10000000-0000-4000-8000-000000000002' },
      };
    }
    await entrar();
    expect(elemento<HTMLInputElement>('patient-name').value).toBe(
      mesmaIdentidade ? 'Paciente fictício' : '',
    );
    elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
    elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(chaves).toHaveLength(2));
    if (mesmaIdentidade) expect(chaves[1]).toBe(chaves[0]);
    else {
      expect(chaves[1]).not.toBe(chaves[0]);
      window.dispatchEvent(new Event('pagehide'));
      sessao = sessaoOriginal;
      await entrar();
      expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
      expect(elemento<HTMLInputElement>('patient-name').value).toBe('');
      expect(elemento('create-feedback').textContent).toContain('sem confirmação');
    }
  },
);
