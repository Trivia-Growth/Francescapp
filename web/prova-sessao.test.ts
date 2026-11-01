import { afterEach, expect, it, vi } from 'vitest';
import { ClienteFFCM } from './api.js';

afterEach(() => vi.unstubAllGlobals());

it('envia a prova somente nas operações autenticadas e troca a geração ao renovar', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const seletor = '20000000-0000-4000-8000-000000000001';
  const csrf = 'b'.repeat(43);
  const provaInicial = 'A'.repeat(43);
  const provaNova = `${'B'.repeat(42)}A`;
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let expirada = false;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
    const headers = new Headers(opcoes.headers);
    if (url.pathname.endsWith('/desafio-tecnico')) {
      expect(headers.has('x-ffcm-prova-sessao')).toBe(false);
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    }
    if (url.pathname.endsWith('/tecnica')) {
      expect(headers.has('x-ffcm-prova-sessao')).toBe(false);
      return envelope({
        sessao,
        access_token: 'antigo',
        csrf,
        seletor_sessao: seletor,
        prova_sessao: provaInicial,
        geracao_sessao: 1,
      });
    }
    if (url.pathname.endsWith('/renovar')) {
      expect(headers.get('x-ffcm-prova-sessao')).toBe(provaInicial);
      expect(headers.get('x-ffcm-geracao-sessao')).toBe('1');
      return envelope({
        sessao,
        access_token: 'novo',
        csrf,
        seletor_sessao: seletor,
        prova_sessao: provaNova,
        geracao_sessao: 2,
      });
    }
    if (url.pathname.endsWith('/sair')) {
      expect(headers.get('x-ffcm-prova-sessao')).toBe(provaNova);
      expect(headers.get('x-ffcm-geracao-sessao')).toBe('2');
      expect(headers.get('authorization')).toBeNull();
      return envelope({ encerrada_localmente: true, pendencia_externa: false });
    }
    if (expirada && headers.get('authorization') === 'Bearer antigo')
      return Response.json({}, { status: 401 });
    expect(headers.get('x-ffcm-prova-sessao')).toBe(expirada ? provaNova : provaInicial);
    expect(headers.get('x-ffcm-geracao-sessao')).toBe(expirada ? '2' : '1');
    return envelope(sessao);
  });
  const cliente = new ClienteFFCM();
  await cliente.entrar('a@example.test', 'senha-ficticia');
  expirada = true;
  await expect(cliente.consultarSessao()).resolves.toEqual(sessao);
  await cliente.sair();
  await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
});

it('não continua quando a renovação repete a prova ou a geração', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'b'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const entrada = {
    sessao,
    access_token: 'ficticio',
    csrf,
    seletor_sessao: '20000000-0000-4000-8000-000000000001',
    prova_sessao: 'A'.repeat(43),
    geracao_sessao: 1,
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let consultas = 0;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname.endsWith('/desafio-tecnico'))
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname.endsWith('/tecnica') || url.pathname.endsWith('/renovar'))
      return envelope(entrada);
    consultas += 1;
    return consultas === 1 ? envelope(sessao) : Response.json({}, { status: 401 });
  });
  const cliente = new ClienteFFCM();
  await cliente.entrar('a@example.test', 'senha-ficticia');
  await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  expect(consultas).toBe(2);
});

it('não renova duas vezes quando respostas antigas chegam com o mesmo access token', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'b'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  const entrada = {
    sessao,
    access_token: 'mesmo-token',
    csrf,
    seletor_sessao: '20000000-0000-4000-8000-000000000001',
    prova_sessao: 'A'.repeat(43),
    geracao_sessao: 1,
  };
  let consultas = 0;
  let renovacoes = 0;
  let liberar: (resposta: Response) => void = () => {};
  const atrasada = new Promise<Response>((resolve) => {
    liberar = resolve;
  });
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname.endsWith('/desafio-tecnico'))
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname.endsWith('/tecnica')) return envelope(entrada);
    if (url.pathname.endsWith('/renovar')) {
      renovacoes += 1;
      return envelope({ ...entrada, prova_sessao: `${'B'.repeat(42)}A`, geracao_sessao: 2 });
    }
    consultas += 1;
    if (consultas === 2) return atrasada;
    if (consultas === 3) return Response.json({}, { status: 401 });
    return envelope(sessao);
  });
  const cliente = new ClienteFFCM();
  await cliente.entrar('a@example.test', 'senha-ficticia');
  const primeira = cliente.consultarSessao();
  await cliente.consultarSessao();
  liberar(Response.json({}, { status: 401 }));
  await expect(primeira).resolves.toEqual(sessao);
  expect(renovacoes).toBe(1);
});

it.each([
  ['texto', true],
  ['json inválido', true],
  ['texto', false],
  ['json inválido', false],
])('preserva resultado incerto de cadastro com %s e renovação %s', async (tipo, renovar) => {
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'b'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  const entrada = {
    sessao,
    access_token: 'antigo',
    csrf,
    seletor_sessao: '20000000-0000-4000-8000-000000000001',
    prova_sessao: 'A'.repeat(43),
    geracao_sessao: 1,
  };
  let liberar: (resposta: Response) => void = () => {};
  const cadastro = new Promise<Response>((resolve) => {
    liberar = resolve;
  });
  let consultas = 0;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname.endsWith('/desafio-tecnico'))
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname.endsWith('/tecnica')) return envelope(entrada);
    if (url.pathname.endsWith('/renovar'))
      return envelope({
        ...entrada,
        access_token: 'novo',
        prova_sessao: `${'B'.repeat(42)}A`,
        geracao_sessao: 2,
      });
    if (url.pathname.endsWith('/pacientes')) return cadastro;
    consultas += 1;
    return consultas === 2 ? Response.json({}, { status: 401 }) : envelope(sessao);
  });
  const cliente = new ClienteFFCM();
  await cliente.entrar('a@example.test', 'senha-ficticia');
  const pendente = cliente.criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456');
  if (renovar) await cliente.consultarSessao();
  liberar(
    new Response('inválido', {
      status: 401,
      headers: { 'content-type': tipo === 'texto' ? 'text/plain' : 'application/json' },
    }),
  );
  await expect(pendente).rejects.toMatchObject({ codigo: 'servico_indisponivel', status: 0 });
});
