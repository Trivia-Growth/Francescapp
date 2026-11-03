import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClienteFFCM, exigeNovoAcesso, FalhaApi, mensagemFalha, resultadoIncerto } from './api.js';

const id = '10000000-0000-4000-8000-000000000001';
const sessao = {
  session_id: '20000000-0000-4000-8000-000000000001',
  usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
  capacidades: [],
};
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

it('opera as quatro rotas de barreira com sessão e respostas validadas', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const chamadas: Array<{ caminho: string; metodo: string | undefined; corpo: unknown }> = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/sessao') return envelope(sessao);
    expect(new Headers(init.headers).get('x-sessao')).toBe(sessao.session_id);
    expect(init.credentials).toBe('same-origin');
    expect(init.signal).toBeDefined();
    chamadas.push({
      caminho: url.pathname,
      metodo: init.method,
      corpo: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url.pathname.endsWith('/reservar')) return envelope({ estado: 'aberta' });
    if (url.pathname.endsWith('/encerrar')) return envelope({ estado: 'cancelada' });
    if (url.pathname.endsWith('/reconhecer')) return envelope({ estado: 'reconhecido' });
    return envelope({ epoca: 1, reserva: null, resultado_pendente: null });
  });
  const cliente = new ClienteFFCM();
  await expect(cliente.consultarBarreira()).rejects.toMatchObject({ status: 401 });
  await cliente.consultarSessao();
  await expect(cliente.consultarBarreira()).resolves.toEqual({
    epoca: 1,
    reserva: null,
    resultado_pendente: null,
  });
  await expect(cliente.reservarBarreira({ epoca: 1, reserva_id: id })).resolves.toEqual({
    estado: 'aberta',
  });
  await expect(
    cliente.encerrarBarreira({ epoca: 1, reserva_id: id, comando_id: id }),
  ).resolves.toEqual({ estado: 'cancelada' });
  await expect(cliente.reconhecerBarreira({ comando_id: id })).resolves.toEqual({
    estado: 'reconhecido',
  });
  expect(chamadas).toEqual([
    { caminho: '/api/cadastro/barreira', metodo: 'GET', corpo: undefined },
    {
      caminho: '/api/cadastro/barreira/reservar',
      metodo: 'POST',
      corpo: { epoca: 1, reserva_id: id },
    },
    {
      caminho: '/api/cadastro/barreira/encerrar',
      metodo: 'POST',
      corpo: { epoca: 1, reserva_id: id, comando_id: id },
    },
    { caminho: '/api/cadastro/barreira/reconhecer', metodo: 'POST', corpo: { comando_id: id } },
  ]);
});

it('falha fechada quando consulta da barreira falha ou devolve dados inválidos', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const cliente = new ClienteFFCM();
  vi.stubGlobal('fetch', async () => envelope(sessao));
  await cliente.consultarSessao();
  for (const resposta of [envelope({}), new Response(null, { status: 503 })]) {
    vi.stubGlobal('fetch', async () => resposta);
    await expect(cliente.consultarBarreira()).rejects.toBeInstanceOf(FalhaApi);
  }
});

beforeEach(() => {
  const itens = new Map<string, string>([
    ['modo-acesso', 'tecnica'],
    ['sessao-tecnica', '20000000-0000-4000-8000-000000000001'],
  ]);
  vi.stubGlobal('sessionStorage', {
    getItem: (chave: string) => itens.get(chave) ?? null,
    setItem: (chave: string, valor: string) => itens.set(chave, valor),
    removeItem: (chave: string) => itens.delete(chave),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('restaura sessão exclusivamente por cookie same-origin sem credenciais no JavaScript', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const fetch = vi.fn(async (_url: URL, init: RequestInit) => {
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    return envelope(sessao);
  });
  vi.stubGlobal('fetch', fetch);
  await expect(new ClienteFFCM().consultarSessao()).resolves.toEqual(sessao);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('login técnico não abre desafio e consulta autorização independente', async () => {
  const caminhos: string[] = [];
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    caminhos.push(url.pathname);
    if (url.pathname === '/api/auth/tecnica')
      expect(JSON.parse(String(init.body))).toEqual({
        email: 'a@example.test',
        senha: 'senha-ficticia',
      });
    return envelope(sessao);
  });
  await expect(new ClienteFFCM().entrar('a@example.test', 'senha-ficticia')).resolves.toEqual(
    sessao,
  );
  expect(caminhos).toEqual(['/api/auth/tecnica', '/api/sessao']);
});

it('recusa troca de cookie entre entrada técnica e confirmação independente', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const outra = {
    ...sessao,
    session_id: '30000000-0000-4000-8000-000000000001',
    usuario: { ...sessao.usuario, id: '40000000-0000-4000-8000-000000000001' },
  };
  vi.stubGlobal('fetch', async (url: URL) =>
    envelope(url.pathname === '/api/auth/tecnica' ? sessao : outra),
  );
  const cliente = new ClienteFFCM();
  await expect(cliente.entrar('a@example.test', 'senha-ficticia')).rejects.toMatchObject({
    status: 401,
  });
  await expect(cliente.listarPacientes()).rejects.toMatchObject({ status: 401 });
});

it.each([401, 403, 503])(
  'não repete consultas negadas HTTP %s nem renova no navegador',
  async (status) => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    const fetch = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal('fetch', fetch);
    await expect(new ClienteFFCM().consultarSessao()).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it.each(['session_id', 'usuario', 'inativo'])(
  'não troca autoridade silenciosamente: %s',
  async (campo) => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    const cliente = new ClienteFFCM();
    vi.stubGlobal('fetch', async () => envelope(sessao));
    await cliente.consultarSessao();
    const outra =
      campo === 'session_id'
        ? { ...sessao, session_id: '30000000-0000-4000-8000-000000000001' }
        : {
            ...sessao,
            usuario: {
              ...sessao.usuario,
              ...(campo === 'inativo'
                ? { ativo: false }
                : { id: '30000000-0000-4000-8000-000000000001' }),
            },
          };
    vi.stubGlobal('fetch', async () => envelope(outra));
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
    await expect(
      cliente.criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456', {
        reserva_id: '10000000-0000-4000-8000-000000000001',
        geracao_reserva: 1,
      }),
    ).rejects.toMatchObject({ status: 401 });
  },
);

it('descarta consulta antiga sem apagar autoridade do login posterior', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  let liberar!: (resposta: Response) => void;
  const cliente = new ClienteFFCM();
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((resolve) => {
        liberar = resolve;
      }),
  );
  const antiga = cliente.consultarSessao().catch((erro: unknown) => erro);
  cliente.limpar();
  vi.stubGlobal('fetch', async () => envelope(sessao));
  await cliente.consultarSessao();
  liberar(envelope(sessao));
  expect(await antiga).toMatchObject({ status: 401 });
  await expect(cliente.consultarSessao()).resolves.toEqual(sessao);
});

it('consulta pendente não restaura sessão depois da saída', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  let liberar!: (resposta: Response) => void;
  const cliente = new ClienteFFCM();
  vi.stubGlobal('fetch', async () => envelope(sessao));
  await cliente.consultarSessao();
  vi.stubGlobal('fetch', (url: URL) =>
    url.pathname.endsWith('/sair')
      ? Promise.resolve(envelope({ encerrada_localmente: true, pendencia_externa: false }))
      : new Promise<Response>((resolve) => {
          liberar = resolve;
        }),
  );
  const antiga = cliente.consultarSessao().catch((erro: unknown) => erro);
  await cliente.sair();
  liberar(envelope(sessao));
  expect(await antiga).toMatchObject({ status: 401 });
});

it('não repete cadastro negado automaticamente', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const cliente = new ClienteFFCM();
  vi.stubGlobal('fetch', async () => envelope(sessao));
  await cliente.consultarSessao();
  const fetch = vi.fn(async (url: URL, init: RequestInit) => {
    expect(url.pathname).toBe('/api/pacientes');
    expect(new Headers(init.headers).get('x-sessao')).toBe(sessao.session_id);
    expect(new Headers(init.headers).get('x-chave-idempotencia')).toBe('chave_ficticia_123456');
    expect(JSON.parse(String(init.body))).toEqual({
      entrada: { nome: 'Paciente fictício' },
      reserva_id: id,
      geracao_reserva: 1,
    });
    return new Response(null, { status: 401 });
  });
  vi.stubGlobal('fetch', fetch);
  const falha = await cliente
    .criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456', {
      reserva_id: '10000000-0000-4000-8000-000000000001',
      geracao_reserva: 1,
    })
    .catch((erro: unknown) => erro);
  expect(resultadoIncerto(falha)).toBe(true);
  expect(exigeNovoAcesso(falha)).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['tipo inválido', 'geração descartada'])(
  'cancela resposta de %s sem esperar o cancelamento',
  async (caso) => {
    let liberar!: (resposta: Response) => void;
    let cancelado = false;
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          liberar = resolve;
        }),
    );
    const cliente = new ClienteFFCM();
    const resultado = cliente.entrar('teste@example.test', 'senha-ficticia');
    if (caso === 'geração descartada') cliente.limpar();
    liberar(
      new Response(
        new ReadableStream({
          cancel() {
            cancelado = true;
            return new Promise<void>(() => {});
          },
        }),
        {
          headers: { 'content-type': caso === 'tipo inválido' ? 'text/plain' : 'application/json' },
        },
      ),
    );
    await expect(resultado).rejects.toBeInstanceOf(FalhaApi);
    expect(cancelado).toBe(true);
  },
);

it('interrompe leitura de resposta que não termina sem aguardar cancelamento', async () => {
  const controle = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controle.signal);
  let cancelado = false;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelado = true;
            return new Promise<void>(() => {});
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  try {
    const resultado = new ClienteFFCM().entrar('teste@example.test', 'senha-ficticia');
    await Promise.resolve();
    controle.abort();
    await expect(resultado).rejects.toBeInstanceOf(FalhaApi);
    expect(cancelado).toBe(true);
  } finally {
    timeout.mockRestore();
  }
});

it.each([200, 401, 403])(
  'limita resposta HTTP %s e preserva incerteza da criação',
  async (status) => {
    const id = '10000000-0000-4000-8000-000000000001';
    const sessao = {
      session_id: id,
      usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    };
    const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
    let cancelado = false;
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
      if (url.pathname.endsWith('/tecnica')) return envelope(sessao);
      if (url.pathname === '/api/sessao') return envelope(sessao);
      if (url.pathname === '/api/pacientes' && opcoes.method === 'POST') {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(1_048_577));
            },
            cancel() {
              cancelado = true;
              return new Promise<void>(() => {});
            },
          }),
          { status, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error('Rota inesperada.');
    });
    const cliente = new ClienteFFCM();
    await cliente.entrar('a@example.test', 'senha-ficticia');
    const erro = await cliente
      .criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456', {
        reserva_id: '10000000-0000-4000-8000-000000000001',
        geracao_reserva: 1,
      })
      .catch((falha: unknown) => falha);
    expect(resultadoIncerto(erro)).toBe(true);
    expect(exigeNovoAcesso(erro)).toBe(status === 401 || status === 403);
    expect(cancelado).toBe(true);
  },
);

it('cancela corpo 202 sem esperar cancelamento e preserva resultado incerto', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const sessao = {
    session_id: id,
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let cancelado = false;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
    if (url.pathname.endsWith('/tecnica')) return envelope(sessao);
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/pacientes' && opcoes.method === 'POST') {
      const corpo = new ReadableStream({
        cancel() {
          cancelado = true;
          return new Promise<void>(() => {});
        },
      });
      return new Response(corpo, { status: 202, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('Rota inesperada.');
  });
  const cliente = new ClienteFFCM();
  await cliente.entrar('a@example.test', 'senha-ficticia');
  const erro = await cliente
    .criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456', {
      reserva_id: '10000000-0000-4000-8000-000000000001',
      geracao_reserva: 1,
    })
    .catch((falha: unknown) => falha);
  expect(resultadoIncerto(erro)).toBe(true);
  expect(cancelado).toBe(true);
});

describe('falhas públicas do cliente', () => {
  it('não exibe mensagens arbitrárias do transporte nem códigos desconhecidos', () => {
    const segredoFicticio = 'senha-ficticia-que-nao-pode-aparecer';
    expect(mensagemFalha(new Error(segredoFicticio))).not.toContain(segredoFicticio);
    expect(mensagemFalha(new FalhaApi(segredoFicticio))).not.toContain(segredoFicticio);
    expect(mensagemFalha(new FalhaApi('sem_permissao', 403))).toBe('Operação não permitida.');
  });

  it('exige revalidação tanto para sessão inválida quanto permissão revogada', () => {
    expect(exigeNovoAcesso(new FalhaApi('nao_autenticado', 401))).toBe(true);
    expect(exigeNovoAcesso(new FalhaApi('sem_permissao', 403))).toBe(true);
    expect(exigeNovoAcesso(new FalhaApi('servico_indisponivel', 503))).toBe(false);
  });

  it('preserva pedido idempotente quando rede ou confirmação falha', () => {
    expect(resultadoIncerto(new FalhaApi('servico_indisponivel'))).toBe(true);
    expect(resultadoIncerto(new FalhaApi('pendencia_externa', 503))).toBe(true);
    expect(resultadoIncerto(new Error('Falha fictícia de transporte'))).toBe(true);
    expect(resultadoIncerto(new FalhaApi('entrada_invalida', 422))).toBe(false);
    expect(resultadoIncerto(new FalhaApi('conflito_idempotencia', 409))).toBe(false);
  });
});
