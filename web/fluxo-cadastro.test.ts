// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const id = '10000000-0000-4000-8000-000000000001';
const sessaoOriginal = {
  session_id: '20000000-0000-4000-8000-000000000001',
  usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
  capacidades: ['administrar_cadastro'],
};
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
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

async function preparar(status: number, formato: 'invalido' | 'divergente' = 'invalido') {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  let autenticada = false;
  let enviado = false;
  let sessao = sessaoOriginal;
  let falharSessao = false;
  const chaves: string[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/auth/tecnica') {
      autenticada = true;
      return envelope(sessao);
    }
    if (url.pathname === '/api/sessao/sair')
      return envelope({ encerrada_localmente: true, pendencia_externa: false });
    if (url.pathname === '/api/sessao') {
      if (!autenticada) return new Response(null, { status: 401 });
      return falharSessao ? new Response(null, { status: 503 }) : envelope(sessao);
    }
    if (url.pathname === '/api/cadastro/barreira')
      return envelope({
        epoca: 1,
        reserva: null,
        resultado_pendente: enviado
          ? { recibo_id: id, reserva_id: id, resultado: 'confirmada', paciente_id: id }
          : null,
      });
    if (url.pathname === '/api/cadastro/barreira/encerrar') return envelope({ estado: 'vazia' });
    if (url.pathname === '/api/cadastro/barreira/reservar') return envelope({ estado: 'aberta' });
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes' && init.method === 'POST') {
      enviado = true;
      chaves.push(new Headers(init.headers).get('x-chave-idempotencia') ?? '');
      if (formato === 'divergente')
        return Response.json(
          {
            erro: {
              codigo: 'servico_indisponivel',
              mensagem: 'Serviço temporariamente indisponível.',
            },
            request_id: id,
          },
          { status },
        );
      return new Response(null, { status });
    }
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(nome: string) => document.getElementById(nome) as T;
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
  await vi.waitFor(() => expect(document.querySelector('[data-acao="encerrar"]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('[data-acao="encerrar"]')?.click();
  await vi.waitFor(() => expect(elemento<HTMLButtonElement>('create-submit').disabled).toBe(false));
  const enviar = () => {
    elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
    elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  };
  return {
    elemento,
    entrar,
    enviar,
    chaves,
    falhar: (v: boolean) => {
      falharSessao = v;
    },
    trocar: () => {
      sessao = {
        ...sessaoOriginal,
        usuario: { ...sessaoOriginal.usuario, id: '10000000-0000-4000-8000-000000000002' },
      };
    },
  };
}

it('não repete pedido incerto antes de reconhecer resultado', async () => {
  const tela = await preparar(503);
  tela.enviar();
  await vi.waitFor(() =>
    expect(tela.elemento('create-feedback').textContent).toContain('Cadastro anterior confirmado'),
  );
  tela.enviar();
  expect(tela.chaves).toHaveLength(1);
  expect(tela.elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
  expect(JSON.stringify(localStorage)).not.toContain('Paciente fictício');
  expect(JSON.stringify(sessionStorage)).not.toContain('Paciente fictício');
  tela.elemento('logout').click();
  await vi.waitFor(() => expect(tela.elemento('login-view').hidden).toBe(false));
  expect(tela.elemento('login-feedback').textContent).toContain(
    'cadastro pode estar sem confirmação',
  );
  expect(tela.elemento('login-feedback').textContent).not.toContain(
    'consulta ainda não está disponível',
  );
  tela.trocar();
  await tela.entrar();
  tela.elemento('logout').click();
  await vi.waitFor(() => expect(tela.elemento('login-view').hidden).toBe(false));
  expect(tela.elemento('login-feedback').textContent).not.toContain(
    'cadastro pode estar sem confirmação',
  );
});

it.each([
  [401, 'invalido'],
  [403, 'invalido'],
  [401, 'divergente'],
  [403, 'divergente'],
] as const)(
  'oculta acesso após HTTP %s %s e exige consulta ao retornar',
  async (status, formato) => {
    const tela = await preparar(status, formato);
    tela.enviar();
    await vi.waitFor(() => expect(tela.elemento('login-view').hidden).toBe(false));
    expect(tela.elemento('patients-view').hidden).toBe(true);
    expect(tela.elemento<HTMLInputElement>('patient-name').value).toBe('');
    await tela.entrar();
    await vi.waitFor(() =>
      expect(tela.elemento('create-feedback').textContent).toContain(
        'Cadastro anterior confirmado',
      ),
    );
    tela.enviar();
    expect(tela.chaves).toHaveLength(1);
  },
);

it.each([408, 429, 422, 202])('HTTP %s não libera repetição sem reconciliação', async (status) => {
  const tela = await preparar(status);
  tela.enviar();
  await vi.waitFor(() =>
    expect(tela.elemento('create-feedback').textContent).toContain('Cadastro anterior confirmado'),
  );
  tela.enviar();
  expect(tela.chaves).toHaveLength(1);
  expect(tela.elemento<HTMLButtonElement>('create-submit').disabled).toBe(true);
});

it.each([true, false])(
  'revalidação indisponível não restaura dados; mesma identidade = %s',
  async (mesmaIdentidade) => {
    const tela = await preparar(503);
    tela.enviar();
    await vi.waitFor(() =>
      expect(tela.elemento('create-feedback').textContent).toContain(
        'Cadastro anterior confirmado',
      ),
    );
    tela.falhar(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(tela.elemento('login-view').hidden).toBe(false));
    tela.falhar(false);
    if (!mesmaIdentidade) tela.trocar();
    await tela.entrar();
    expect(tela.elemento<HTMLInputElement>('patient-name').value).toBe('');
    await vi.waitFor(() =>
      expect(tela.elemento('create-feedback').textContent).toContain(
        'Cadastro anterior confirmado',
      ),
    );
    tela.enviar();
    expect(tela.chaves).toHaveLength(1);
  },
);
