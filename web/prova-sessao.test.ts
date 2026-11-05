import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClienteFFCM } from './api.js';

beforeEach(() => {
  const itens = new Map<string, string>([
    ['modo-acesso', 'tecnica'],
    ['sessao-tecnica', '20000000-0000-4000-8000-000000000001'],
    ['fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA'],
  ]);
  vi.stubGlobal('sessionStorage', {
    getItem: (chave: string) => itens.get(chave) ?? null,
    setItem: (chave: string, valor: string) => itens.set(chave, valor),
    removeItem: (chave: string) => itens.delete(chave),
  });
});

const id = '10000000-0000-4000-8000-000000000001';
const sessao = {
  session_id: '20000000-0000-4000-8000-000000000001',
  usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
  capacidades: [],
};
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
afterEach(() => vi.unstubAllGlobals());

it.each([401, 403])('nega operações protegidas após consulta recusada com %s', async (status) => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const cliente = new ClienteFFCM();
  vi.stubGlobal('fetch', async () => envelope(sessao));
  await cliente.consultarSessao();
  vi.stubGlobal('fetch', async () => new Response(null, { status }));
  await expect(cliente.consultarSessao()).rejects.toMatchObject({ status });
  await expect(cliente.listarPacientes()).rejects.toMatchObject({ status: 401 });
});

it('recusa antiga não apaga login posterior', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const cliente = new ClienteFFCM();
  vi.stubGlobal('fetch', async () => envelope(sessao));
  await cliente.consultarSessao();
  let liberar!: (resposta: Response) => void;
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((resolve) => {
        liberar = resolve;
      }),
  );
  const antiga = cliente.consultarSessao().catch((erro: unknown) => erro);
  cliente.limpar();
  vi.stubGlobal('fetch', async (url: URL) =>
    url.pathname.endsWith('/pacientes')
      ? envelope({ itens: [], proximo_cursor: null })
      : envelope(sessao),
  );
  await cliente.consultarSessao();
  liberar(new Response(null, { status: 401 }));
  expect(await antiga).toMatchObject({ status: 401 });
  await expect(cliente.listarPacientes()).resolves.toEqual({ itens: [], proximo_cursor: null });
});

it.each(['text/plain', 'application/json'])(
  'preserva resultado incerto de cadastro com resposta inválida %s',
  async (tipo) => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    const cliente = new ClienteFFCM();
    vi.stubGlobal('fetch', async (url: URL) =>
      url.pathname.endsWith('/pacientes')
        ? new Response('inválido', { status: 401, headers: { 'content-type': tipo } })
        : envelope(sessao),
    );
    await cliente.consultarSessao();
    await expect(
      cliente.criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456', {
        reserva_id: '10000000-0000-4000-8000-000000000001',
        geracao_reserva: 1,
      }),
    ).rejects.toMatchObject({ codigo: 'servico_indisponivel', status: 0 });
  },
);
