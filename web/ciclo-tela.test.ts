// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const id = '10000000-0000-4000-8000-000000000001';
const sessao = {
  session_id: '20000000-0000-4000-8000-000000000001',
  usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
  capacidades: ['administrar_cadastro'],
};
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('exige confirmação para liberar e envia reserva vinculada à criação', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const chamadas: { caminho: string; corpo: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    chamadas.push({
      caminho: url.pathname,
      corpo: init.body ? JSON.parse(String(init.body)) : null,
    });
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/cadastro/barreira')
      return envelope({ epoca: 1, reserva: null, resultado_pendente: null });
    if (url.pathname === '/api/cadastro/barreira/encerrar') return envelope({ estado: 'vazia' });
    if (url.pathname === '/api/cadastro/barreira/reservar') return envelope({ estado: 'aberta' });
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes')
      return envelope({
        id,
        nome: 'Fictício',
        nome_preferencia: null,
        data_nascimento: null,
        contatos: [],
        versao: 1,
      });
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  const botao = () => document.querySelector<HTMLButtonElement>('#cadastro button[data-acao]');
  const enviar = document.getElementById('create-submit') as HTMLButtonElement;
  await vi.waitFor(() => expect(botao()?.dataset.acao).toBe('encerrar'));
  expect(enviar.disabled).toBe(true);
  expect(chamadas.some((c) => c.caminho.endsWith('/encerrar'))).toBe(false);
  botao()?.focus();
  botao()?.click();
  await vi.waitFor(() => expect(enviar.disabled).toBe(false));
  expect(document.activeElement).toBe(enviar);
  (document.getElementById('patient-name') as HTMLInputElement).value = 'Fictício';
  document.getElementById('create-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(chamadas.some((c) => c.caminho.endsWith('/reservar'))).toBe(true));
  await vi.waitFor(() =>
    expect(chamadas.some((c) => c.caminho === '/api/pacientes' && c.corpo)).toBe(true),
  );
  const reserva = chamadas.find((c) => c.caminho.endsWith('/reservar'))?.corpo as {
    reserva_id: string;
    epoca: number;
  };
  const criacao = chamadas.find((c) => c.caminho === '/api/pacientes' && c.corpo)?.corpo as Record<
    string,
    unknown
  >;
  expect(criacao).toMatchObject({
    entrada: { nome: 'Fictício' },
    reserva_id: reserva.reserva_id,
    geracao_reserva: reserva.epoca,
  });
  expect(JSON.stringify(localStorage)).not.toContain('Fictício');
  expect(JSON.stringify(sessionStorage)).not.toContain('Fictício');
});

it('remove dados protegidos quando consulta da barreira recebe revogação', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/cadastro/barreira') return new Response(null, { status: 401 });
    if (url.pathname === '/api/pacientes') return envelope({ itens: [], proximo_cursor: null });
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  await vi.waitFor(() => expect(document.getElementById('login-view')?.hidden).toBe(false));
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  expect(document.getElementById('login-feedback')?.textContent).toContain('validado novamente');
});

it('mantém foco no controle ao tentar consulta e ao falhar encerramento', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  let consultas = 0;
  let concluirConsulta: ((resposta: Response) => void) | undefined;
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/cadastro/barreira') {
      consultas++;
      if (consultas === 1) return new Response(null, { status: 503 });
      return new Promise<Response>((resolve) => {
        concluirConsulta = resolve;
      });
    }
    if (url.pathname === '/api/cadastro/barreira/encerrar')
      return new Response(null, { status: 503 });
    if (url.pathname === '/api/pacientes') return envelope({ itens: [], proximo_cursor: null });
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  const botao = () => document.querySelector<HTMLButtonElement>('#cadastro button[data-acao]');
  await vi.waitFor(() => expect(botao()?.dataset.acao).toBe('consultar'));
  botao()?.focus();
  botao()?.click();
  await vi.waitFor(() => expect(concluirConsulta).toBeDefined());
  const logout = document.getElementById('logout') as HTMLButtonElement;
  logout.focus();
  concluirConsulta?.(envelope({ epoca: 1, reserva: null, resultado_pendente: null }));
  await vi.waitFor(() => expect(botao()?.dataset.acao).toBe('encerrar'));
  expect(document.activeElement).toBe(logout);
  botao()?.focus();
  botao()?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('create-feedback')?.textContent).toContain(
      'Não foi possível confirmar',
    ),
  );
  expect(document.activeElement).toBe(botao());
});
