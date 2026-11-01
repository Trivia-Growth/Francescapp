import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClienteFFCM, exigeNovoAcesso, FalhaApi, mensagemFalha, resultadoIncerto } from './api.js';

function comProva(dados: unknown): unknown {
  if (!dados || typeof dados !== 'object' || !('access_token' in dados)) return dados;
  const renovada =
    dados.access_token === 'token-novo' || dados.access_token === 'token-velho-renovado';
  return {
    ...dados,
    prova_sessao: renovada ? `${'B'.repeat(42)}A` : 'A'.repeat(43),
    geracao_sessao: renovada ? 2 : 1,
  };
}

afterEach(() => vi.unstubAllGlobals());

it('encaminha nonce ao provedor e credencial ao servidor antes de consultar a sessão', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'a'.repeat(43);
  const nonce = 'n'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados: comProva(dados), request_id: id });
  const caminhos: string[] = [];
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
    caminhos.push(url.pathname);
    if (url.pathname === '/api/sessao/desafio-google')
      return envelope({
        desafio_id: id,
        nonce_hash: nonce,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        csrf,
        expira_em: '2099-01-01T00:00:00Z',
      });
    if (url.pathname === '/api/sessao/google') {
      expect(JSON.parse(String(opcoes.body))).toEqual({
        desafio_id: id,
        credencial: 'id-token-ficticio',
      });
      expect(new Headers(opcoes.headers).get('x-csrf')).toBe(csrf);
      return envelope({ sessao, access_token: 'token-ficticio', csrf, seletor_sessao: id });
    }
    if (url.pathname === '/api/sessao') return envelope(sessao);
    throw new Error('Rota inesperada.');
  });
  const obterCredencial = vi.fn(async (valor: string) => {
    expect(valor).toBe(nonce);
    return 'id-token-ficticio';
  });
  await expect(new ClienteFFCM().entrarGoogle(obterCredencial)).resolves.toEqual(sessao);
  expect(caminhos).toEqual(['/api/sessao/desafio-google', '/api/sessao/google', '/api/sessao']);
});

it('descarta credencial Google recebida depois de limpar a sessão', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  let entregar!: (credencial: string) => void;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const fetch = vi.fn(async () =>
    Response.json({
      dados: {
        desafio_id: id,
        nonce_hash: 'n'.repeat(43),
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        csrf: 'a'.repeat(43),
        expira_em: '2099-01-01T00:00:00Z',
      },
      request_id: id,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const cliente = new ClienteFFCM();
  const pendente = cliente.entrarGoogle(
    () =>
      new Promise((resolve) => {
        entregar = resolve;
      }),
  );
  await vi.waitFor(() => expect(entregar).toBeTypeOf('function'));
  cliente.limpar();
  entregar('id-token-ficticio');
  await expect(pendente).rejects.toBeInstanceOf(FalhaApi);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('não envia entrada Google se o provedor falhar ou for cancelado', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  const fetch = vi.fn(async () =>
    Response.json({
      dados: {
        desafio_id: id,
        nonce_hash: 'n'.repeat(43),
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        csrf: 'a'.repeat(43),
        expira_em: '2099-01-01T00:00:00Z',
      },
      request_id: id,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const cliente = new ClienteFFCM();
  const falha = await cliente
    .entrarGoogle(async () => {
      throw new Error('credencial-ficticia-na-falha');
    })
    .catch((erro: unknown) => erro);
  expect(falha).toBeInstanceOf(FalhaApi);
  expect(String(falha)).not.toContain('credencial-ficticia-na-falha');
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(cliente.consultarSessao()).rejects.toBeInstanceOf(FalhaApi);
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
    const csrf = 'a'.repeat(43);
    const sessao = {
      usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    };
    const envelope = (dados: unknown) => Response.json({ dados: comProva(dados), request_id: id });
    let cancelado = false;
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
      if (url.pathname.endsWith('/desafio-tecnico'))
        return envelope({ csrf, seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
      if (url.pathname.endsWith('/tecnica'))
        return envelope({
          sessao,
          access_token: 'token-antigo',
          csrf,
          seletor_sessao: '20000000-0000-4000-8000-000000000001',
        });
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
      .criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456')
      .catch((falha: unknown) => falha);
    expect(resultadoIncerto(erro)).toBe(true);
    expect(exigeNovoAcesso(erro)).toBe(status === 401 || status === 403);
    expect(cancelado).toBe(true);
  },
);

it('cancela corpo 202 sem esperar cancelamento e preserva resultado incerto', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'a'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados: comProva(dados), request_id: id });
  let cancelado = false;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
    if (url.pathname.endsWith('/desafio-tecnico'))
      return envelope({
        csrf,
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname.endsWith('/tecnica'))
      return envelope({
        sessao,
        access_token: 'token-antigo',
        csrf,
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
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
    .criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456')
    .catch((falha: unknown) => falha);
  expect(resultadoIncerto(erro)).toBe(true);
  expect(cancelado).toBe(true);
});

it('renova uma consulta expirada e repete a leitura com a credencial nova', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const seletor = '20000000-0000-4000-8000-000000000001';
  const csrf = 'b'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados: comProva(dados), request_id: id });
  let expirada = false;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
    if (url.pathname.endsWith('/desafio-tecnico'))
      return envelope({
        csrf: 'a'.repeat(43),
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname.endsWith('/tecnica'))
      return envelope({ sessao, access_token: 'token-antigo', csrf, seletor_sessao: seletor });
    if (url.pathname.endsWith('/renovar')) {
      const headers = new Headers(opcoes.headers);
      expect(headers.get('x-csrf')).toBe(csrf);
      expect(headers.get('x-sessao')).toBe(seletor);
      return envelope({ sessao, access_token: 'token-novo', csrf, seletor_sessao: seletor });
    }
    const token = new Headers(opcoes.headers).get('authorization');
    if (expirada && token === 'Bearer token-antigo') return Response.json({}, { status: 401 });
    if (expirada) expect(token).toBe('Bearer token-novo');
    return envelope(sessao);
  });
  const cliente = new ClienteFFCM();
  await cliente.entrar('a@example.test', 'senha-ficticia');
  expirada = true;
  await expect(cliente.consultarSessao()).resolves.toEqual(sessao);
});

describe('renovação da sessão', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const seletor = '20000000-0000-4000-8000-000000000001';
  const csrf = 'b'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados: comProva(dados), request_id: id });

  function preparar(responderRenovacao: () => Promise<Response>, statusConsulta = 401) {
    let conectado = false;
    let renovacoes = 0;
    let saidas = 0;
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
      if (url.pathname.endsWith('/desafio-tecnico'))
        return envelope({
          csrf: 'a'.repeat(43),
          seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        });
      if (url.pathname.endsWith('/tecnica'))
        return envelope({ sessao, access_token: 'token-antigo', csrf, seletor_sessao: seletor });
      if (url.pathname.endsWith('/renovar')) {
        renovacoes += 1;
        return responderRenovacao();
      }
      if (url.pathname.endsWith('/sair')) {
        saidas += 1;
        expect(new Headers(opcoes.headers).get('x-ffcm-geracao-sessao')).toBe('2');
        expect(new Headers(opcoes.headers).get('x-ffcm-prova-sessao')).toBe(`${'B'.repeat(42)}A`);
        return envelope({ encerrada_localmente: true, pendencia_externa: false });
      }
      if (!conectado) {
        conectado = true;
        return envelope(sessao);
      }
      return new Headers(opcoes.headers).get('authorization') === 'Bearer token-novo'
        ? envelope(sessao)
        : Response.json({}, { status: statusConsulta });
    });
    return { cliente: new ClienteFFCM(), renovacoes: () => renovacoes, saidas: () => saidas };
  }

  it('compartilha renovação entre consultas simultâneas', async () => {
    let liberar: (resposta: Response) => void = () => {};
    const resposta = new Promise<Response>((resolve) => {
      liberar = resolve;
    });
    const { cliente, renovacoes } = preparar(() => resposta);
    await cliente.entrar('a@example.test', 'senha-ficticia');
    const primeira = cliente.consultarSessao();
    const segunda = cliente.consultarSessao();
    await vi.waitFor(() => expect(renovacoes()).toBe(1));
    liberar(envelope({ sessao, access_token: 'token-novo', csrf, seletor_sessao: seletor }));
    await expect(Promise.all([primeira, segunda])).resolves.toEqual([sessao, sessao]);
    expect(renovacoes()).toBe(1);
  });

  it('não renova quando acesso é proibido', async () => {
    const { cliente, renovacoes } = preparar(async () => {
      throw new Error('não deve renovar');
    }, 403);
    await cliente.entrar('a@example.test', 'senha-ficticia');
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 403 });
    expect(renovacoes()).toBe(0);
  });

  it('rejeita resposta de renovação com CSRF trocado', async () => {
    const { cliente } = preparar(async () =>
      envelope({
        sessao,
        access_token: 'token-novo',
        csrf: 'c'.repeat(43),
        seletor_sessao: seletor,
      }),
    );
    await cliente.entrar('a@example.test', 'senha-ficticia');
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita renovação que retorna outro usuário', async () => {
    const outraSessao = {
      ...sessao,
      usuario: { ...sessao.usuario, id: '30000000-0000-4000-8000-000000000001' },
    };
    const { cliente } = preparar(async () =>
      envelope({ sessao: outraSessao, access_token: 'token-novo', csrf, seletor_sessao: seletor }),
    );
    await cliente.entrar('a@example.test', 'senha-ficticia');
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  });

  it('exige novo acesso quando a renovação falha com resultado incerto', async () => {
    const { cliente } = preparar(async () => Response.json({}, { status: 503 }));
    await cliente.entrar('a@example.test', 'senha-ficticia');
    const erro = await cliente.consultarSessao().catch((falha: unknown) => falha);
    expect(exigeNovoAcesso(erro)).toBe(true);
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  });

  it('não restaura credenciais quando a renovação chega após limpar a sessão', async () => {
    let liberar: (resposta: Response) => void = () => {};
    const resposta = new Promise<Response>((resolve) => {
      liberar = resolve;
    });
    const { cliente, renovacoes } = preparar(() => resposta);
    await cliente.entrar('a@example.test', 'senha-ficticia');
    const consulta = cliente.consultarSessao();
    await vi.waitFor(() => expect(renovacoes()).toBe(1));
    cliente.limpar();
    liberar(envelope({ sessao, access_token: 'token-novo', csrf, seletor_sessao: seletor }));
    await expect(consulta).rejects.toMatchObject({ status: 401 });
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  });

  it('aguarda renovação em andamento antes de enviar a saída', async () => {
    let liberar: (resposta: Response) => void = () => {};
    const resposta = new Promise<Response>((resolve) => {
      liberar = resolve;
    });
    const { cliente, renovacoes } = preparar(() => resposta);
    await cliente.entrar('a@example.test', 'senha-ficticia');
    const consulta = cliente.consultarSessao();
    await vi.waitFor(() => expect(renovacoes()).toBe(1));
    const saida = cliente.sair();
    liberar(envelope({ sessao, access_token: 'token-novo', csrf, seletor_sessao: seletor }));
    await expect(saida).resolves.toMatchObject({ encerrada_localmente: true });
    await expect(consulta).rejects.toMatchObject({ status: 401 });
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  });

  it('não declara saída confirmada quando a renovação em andamento falha', async () => {
    let liberar: (resposta: Response) => void = () => {};
    const resposta = new Promise<Response>((resolve) => {
      liberar = resolve;
    });
    const { cliente, renovacoes, saidas } = preparar(() => resposta);
    await cliente.entrar('a@example.test', 'senha-ficticia');
    const consulta = cliente.consultarSessao().catch((erro: unknown) => erro);
    await vi.waitFor(() => expect(renovacoes()).toBe(1));
    const saida = cliente.sair();
    liberar(Response.json({}, { status: 503 }));
    await expect(saida).rejects.toMatchObject({ codigo: 'renovacao_incerta', status: 0 });
    expect(saidas()).toBe(0);
    await consulta;
    await expect(cliente.consultarSessao()).rejects.toMatchObject({ status: 401 });
  });

  it('descarta renovação antiga sem apagar credenciais de um novo login', async () => {
    let liberar: (resposta: Response) => void = () => {};
    const resposta = new Promise<Response>((resolve) => {
      liberar = resolve;
    });
    let renovacoes = 0;
    let entradas = 0;
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
      if (url.pathname.endsWith('/desafio-tecnico'))
        return envelope({
          csrf: 'a'.repeat(43),
          seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        });
      if (url.pathname.endsWith('/tecnica')) {
        entradas += 1;
        return envelope({
          sessao,
          access_token: `token-${entradas}`,
          csrf,
          seletor_sessao: seletor,
        });
      }
      if (url.pathname.endsWith('/renovar')) {
        renovacoes += 1;
        return resposta;
      }
      const token = new Headers(opcoes.headers).get('authorization');
      if (token === 'Bearer token-1' && renovacoes === 0 && entradas === 1) {
        // A primeira consulta fecha o login; a seguinte simula expiração.
        renovacoes = -1;
        return envelope(sessao);
      }
      if (token === 'Bearer token-1') return Response.json({}, { status: 401 });
      expect(token).toBe('Bearer token-2');
      return envelope(sessao);
    });
    const cliente = new ClienteFFCM();
    await cliente.entrar('a@example.test', 'senha-ficticia');
    const consultaAntiga = cliente.consultarSessao();
    await vi.waitFor(() => expect(renovacoes).toBe(0));
    await cliente.entrar('b@example.test', 'senha-ficticia');
    liberar(
      envelope({ sessao, access_token: 'token-velho-renovado', csrf, seletor_sessao: seletor }),
    );
    await expect(consultaAntiga).rejects.toMatchObject({ status: 401 });
    await expect(cliente.consultarSessao()).resolves.toEqual(sessao);
  });

  it('não repete automaticamente cadastro que recebe 401', async () => {
    const { cliente, renovacoes } = preparar(async () =>
      envelope({ sessao, access_token: 'token-novo', csrf, seletor_sessao: seletor }),
    );
    await cliente.entrar('a@example.test', 'senha-ficticia');
    await expect(
      cliente.criarPaciente({ nome: 'Paciente fictício' }, 'chave_ficticia_123456'),
    ).rejects.toMatchObject({ codigo: 'servico_indisponivel', status: 0 });
    expect(renovacoes()).toBe(0);
  });
});

it('consulta atrasada de login antigo não apaga sessão de login posterior', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados: comProva(dados), request_id: id });
  let liberarConsulta: (resposta: Response) => void = () => {};
  let sinalizarConsulta: () => void = () => {};
  const consultaIniciada = new Promise<void>((resolve) => {
    sinalizarConsulta = resolve;
  });
  const consultaAntiga = new Promise<Response>((resolve) => {
    liberarConsulta = resolve;
  });
  let entradas = 0;
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname.endsWith('/desafio-tecnico'))
      return envelope({
        csrf: 'a'.repeat(43),
        seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
    if (url.pathname.endsWith('/tecnica')) {
      entradas += 1;
      return envelope({
        sessao,
        access_token: `token-${entradas}`,
        csrf: 'b'.repeat(43),
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
    }
    if (entradas === 1) {
      sinalizarConsulta();
      return consultaAntiga;
    }
    return envelope(sessao);
  });
  const cliente = new ClienteFFCM();
  const anterior = cliente
    .entrar('a@example.test', 'senha-ficticia')
    .catch((erro: unknown) => erro);
  await consultaIniciada;
  await cliente.entrar('b@example.test', 'senha-ficticia');
  liberarConsulta(envelope(sessao));
  await anterior;
  await expect(cliente.consultarSessao()).resolves.toEqual(sessao);
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
