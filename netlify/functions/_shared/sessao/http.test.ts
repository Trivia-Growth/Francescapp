import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { criarCodecDeCookiesSessaoIsolada } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { criarTransporteHttpSessao, responderFalhaHttpSessao } from './http.ts';

const origem = 'https://app.example.test';
const chaveSelagem = Buffer.alloc(32, 7).toString('base64url');
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_COOKIE_SEALING_KEY: chaveSelagem,
  FFCM_ALLOWED_ORIGINS: origem,
};
const configuracaoJwt = {
  issuer: 'https://projeto.example.test/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256'] as const,
  chaveDeVerificacao: new Uint8Array(32).fill(9),
};
const seletor = '20000000-0000-4000-8000-000000000001';
const codec = criarCodecDeCookiesSessaoIsolada(
  { chaveDeSelagem: chaveSelagem, transporte: 'https' },
  seletor,
);
const transporte = criarTransporteHttpSessao(fonte, { configuracaoJwt });
const csrf = 'c'.repeat(43);
const usuarioId = '10000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000002';

function jwt(claims: Record<string, unknown> = {}, chave = configuracaoJwt.chaveDeVerificacao) {
  return new SignJWT({
    session_id: sessionId,
    sub: usuarioId,
    iss: configuracaoJwt.issuer,
    aud: configuracaoJwt.audience,
    exp: Math.floor(Date.now() / 1_000) + 300,
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(chave);
}

async function comando(alteracoes: RequestInit = {}, caminho = '/api/sessao/renovar') {
  const cookies = [
    await codec.selarSessao(JSON.stringify({ versao: 2, csrf, usuarioId, sessionId })),
    await codec.selarCsrf(csrf),
  ]
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  return new Request(`${origem}${caminho}`, {
    method: 'POST',
    body: '{}',
    ...alteracoes,
    headers: {
      origin: origem,
      'x-csrf': csrf,
      'x-sessao': seletor,
      cookie: cookies,
      'content-type': 'application/json',
      ...alteracoes.headers,
    },
  });
}

describe('Request/Response de sessão com núcleo real', () => {
  it('sinaliza erro inesperado de stream como indisponibilidade sem ecoar dados', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('senha-ficticia'));
      },
    });
    const request = await comando({ body, duplex: 'half' } as RequestInit);
    const erro = await transporte
      .lerComandoComCookie(request, 'renovarSessao')
      .catch((falha: unknown) => falha);
    const resposta = transporte.responderFalha(erro);
    expect(resposta.status).toBe(503);
    expect(await resposta.text()).not.toContain('senha-ficticia');
  });
  it('recusa corpo pendente ou grande sem aguardar cancelamento indefinido', async () => {
    const streams = [
      new ReadableStream({ cancel: () => new Promise<void>(() => {}) }),
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(4097));
        },
        cancel: () => new Promise<void>(() => {}),
      }),
    ];
    for (const body of streams) {
      const request = await comando({ body, duplex: 'half' } as RequestInit);
      const estado = await Promise.race([
        transporte.lerComandoComCookie(request, 'renovarSessao').then(
          () => 'aceita',
          () => 'recusada',
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve('travada'), 6000)),
      ]);
      expect(estado).toBe('recusada');
    }
  }, 14000);
  it('resposta atrasada de renovação não recria cookies após saída', async () => {
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: [],
    };
    const contextoRenovacao = await transporte.lerComandoComCookie(
      await comando(),
      'renovarSessao',
    );
    const contextoSaida = await transporte.lerComandoComCookie(
      await comando({}, '/api/sessao/sair'),
      'sairSessao',
    );
    const renovacao = await transporte.responderRenovacao(
      { sessao, accessToken: await jwt() },
      contextoRenovacao,
    );
    const saida = transporte.responderSaida(
      { encerrada_localmente: true, pendencia_externa: false },
      contextoSaida,
    );
    const cookies = new Map<string, string>();
    for (const resposta of [saida, renovacao]) {
      for (const cookie of resposta.headers.getSetCookie()) {
        const par = cookie.split(';')[0] ?? '';
        const posicao = par.indexOf('=');
        if (posicao < 1) throw new Error('Cookie inválido na fixture.');
        const nome = par.slice(0, posicao);
        if (cookie.includes('Max-Age=0')) cookies.delete(nome);
        else cookies.set(nome, par.slice(posicao + 1));
      }
    }
    expect(cookies.size).toBe(0);
  });

  it('renovações com respostas invertidas preservam CSRF da resposta mais recente', async () => {
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: [],
    };
    const primeiro = await transporte.lerComandoComCookie(await comando(), 'renovarSessao');
    const segundo = await transporte.lerComandoComCookie(await comando(), 'renovarSessao');
    const respostaAnterior = await transporte.responderRenovacao(
      { sessao, accessToken: await jwt() },
      primeiro,
    );
    const respostaAtual = await transporte.responderRenovacao(
      { sessao, accessToken: await jwt() },
      segundo,
    );
    const dados = await respostaAtual.json();
    const cookies = new Map<string, string>();
    for (const parte of (await comando()).headers.get('cookie')?.split('; ') ?? []) {
      const posicao = parte.indexOf('=');
      cookies.set(parte.slice(0, posicao), parte.slice(posicao + 1));
    }
    for (const resposta of [respostaAtual, respostaAnterior]) {
      for (const cookie of resposta.headers.getSetCookie()) {
        const par = cookie.split(';')[0] ?? '';
        const posicao = par.indexOf('=');
        if (posicao < 1) throw new Error('Cookie inválido na fixture.');
        cookies.set(par.slice(0, posicao), par.slice(posicao + 1));
      }
    }
    const request = await comando({
      headers: {
        'x-csrf': dados.dados.csrf,
        cookie: Array.from(cookies, ([nome, valor]) => `${nome}=${valor}`).join('; '),
      },
    });
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).resolves.toMatchObject({
      usuarioId,
      sessionId,
    });
  });

  it('renova somente a sessão validada, sem alterar cookies', async () => {
    const contexto = await transporte.lerComandoComCookie(await comando(), 'renovarSessao');
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: [],
    };
    const resposta = await transporte.responderRenovacao(
      { sessao, accessToken: await jwt() },
      contexto,
    );
    const dados = await resposta.json();
    expect(dados.dados.seletor_sessao).toBe(seletor);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    const outroContexto = await transporte.lerComandoComCookie(await comando(), 'renovarSessao');
    await expect(
      transporte.responderRenovacao(
        {
          sessao,
          accessToken: await jwt({ session_id: '10000000-0000-4000-8000-000000000003' }),
        },
        outroContexto,
      ),
    ).rejects.toThrow();
    await expect(
      transporte.responderRenovacao({ sessao, accessToken: await jwt() }, { ...contexto }),
    ).rejects.toThrow();
  });
  it.each(['entrada', 'renovação'] as const)(
    'resposta de %s mantém o token e dados da sessão verificados mesmo se o chamador os alterar',
    async (operacao) => {
      const tokenVerificado = await jwt();
      const entrada = {
        sessao: {
          usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
          capacidades: ['consultar_pacientes_vinculados'],
        },
        accessToken: tokenVerificado,
      };
      const contexto = await transporte.lerComandoComCookie(await comando(), 'renovarSessao');
      const pendente =
        operacao === 'entrada'
          ? transporte.responderEntrada(entrada)
          : transporte.responderRenovacao(entrada, contexto);
      entrada.accessToken = 'token-alterado-ficticio';
      entrada.sessao.usuario.perfil = 'administrador';
      entrada.sessao.capacidades.push('administrar_cadastro');
      const corpo = await (await pendente).json();
      expect(corpo.dados.access_token).toBe(tokenVerificado);
      expect(corpo.dados.sessao.usuario.perfil).toBe('profissional');
      expect(corpo.dados.sessao.capacidades).toEqual(['consultar_pacientes_vinculados']);
    },
  );
  it('não reutiliza o mesmo contexto validado para emitir duas renovações', async () => {
    const contexto = await transporte.lerComandoComCookie(await comando(), 'renovarSessao');
    const entrada = {
      sessao: {
        usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      },
      accessToken: await jwt(),
    };
    await transporte.responderRenovacao(entrada, contexto);
    await expect(transporte.responderRenovacao(entrada, contexto)).rejects.toMatchObject({
      codigo: 'nao_autenticado',
    });
  });
  it('preserva sessão nova quando resposta de saída anterior chega atrasada', async () => {
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: [],
    };
    const respostaEntradaAnterior = await transporte.responderEntrada({
      sessao,
      accessToken: await jwt(),
    });
    const entradaAnterior = await respostaEntradaAnterior.json();
    const comandoSaida = new Request(`${origem}/api/sessao/sair`, {
      method: 'POST',
      body: '{}',
      headers: {
        origin: origem,
        'content-type': 'application/json',
        'x-csrf': entradaAnterior.dados.csrf,
        'x-sessao': entradaAnterior.dados.seletor_sessao,
        cookie: respostaEntradaAnterior.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; '),
      },
    });
    const contextoSaida = await transporte.lerComandoComCookie(comandoSaida, 'sairSessao');
    const respostaSaidaAnterior = transporte.responderSaida(
      {
        encerrada_localmente: true,
        pendencia_externa: false,
      },
      contextoSaida,
    );
    const respostaEntradaNova = await transporte.responderEntrada({
      sessao,
      accessToken: await jwt({ session_id: '10000000-0000-4000-8000-000000000003' }),
    });
    const entradaNova = await respostaEntradaNova.json();
    const cookieAtual = new Map<string, string>();
    for (const resposta of [respostaEntradaNova, respostaSaidaAnterior]) {
      for (const cookie of resposta.headers.getSetCookie()) {
        const [nomeValor] = cookie.split(';');
        const posicao = nomeValor?.indexOf('=') ?? -1;
        if (!nomeValor || posicao < 1) throw new Error('Cookie inválido na fixture.');
        const nome = nomeValor.slice(0, posicao);
        if (cookie.includes('Max-Age=0')) cookieAtual.delete(nome);
        else cookieAtual.set(nome, nomeValor.slice(posicao + 1));
      }
    }
    const request = new Request(`${origem}/api/sessao/renovar`, {
      method: 'POST',
      body: '{}',
      headers: {
        origin: origem,
        'content-type': 'application/json',
        'x-csrf': entradaNova.dados.csrf,
        'x-sessao': entradaNova.dados.seletor_sessao,
        cookie: Array.from(cookieAtual, ([nome, valor]) => `${nome}=${valor}`).join('; '),
      },
    });
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).resolves.toMatchObject({
      sessionId: '10000000-0000-4000-8000-000000000003',
    });
  });
  it('recusa refresh token mesmo quando passado por chamador sem tipagem', async () => {
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: [],
    };
    const entradaInvalida = { sessao, accessToken: await jwt(), refreshToken: 'segredo-ficticio' };
    await expect(transporte.responderEntrada(entradaInvalida)).rejects.toThrow();
  });
  it.each([
    'refresh-legado',
    JSON.stringify({ versao: 1, refresh: 'refresh-ficticio', csrf }),
    JSON.stringify({
      versao: 1,
      refresh: 'refresh-ficticio',
      csrf,
      usuarioId: 'invalido',
      sessionId,
    }),
    JSON.stringify({
      versao: 1,
      refresh: 'refresh-ficticio',
      csrf,
      usuarioId,
      sessionId,
      extra: true,
    }),
  ])('recusa envelope de refresh sem vínculo válido', async (valor) => {
    const request = await comando();
    request.headers.set(
      'cookie',
      `${(await codec.selarSessao(valor)).split(';')[0]}; ${(await codec.selarCsrf(csrf)).split(';')[0]}`,
    );
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'nao_autenticado',
    });
  });
  it('entrega ao servidor a identidade e sessão verificadas na emissão do cookie', async () => {
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: [],
    };
    const resposta = await transporte.responderEntrada({
      sessao,
      accessToken: await jwt(),
    });
    const dados = await resposta.json();
    const cookie = resposta.headers
      .getSetCookie()
      .map((valor) => valor.split(';')[0])
      .join('; ');
    const request = new Request(`${origem}/api/sessao/renovar`, {
      method: 'POST',
      body: '{}',
      headers: {
        origin: origem,
        'content-type': 'application/json',
        'x-csrf': dados.dados.csrf,
        'x-sessao': dados.dados.seletor_sessao,
        cookie,
      },
    });
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).resolves.toEqual({
      usuarioId,
      sessionId,
    });
  });
  it.each([
    ['sairSessao', '/api/sessao/sair', usuarioId],
    ['renovarSessao', '/api/sessao/renovar', usuarioId],
    ['sairSessao', '/api/sessao/sair', '10000000-0000-4000-8000-000000000004'],
    ['renovarSessao', '/api/sessao/renovar', '10000000-0000-4000-8000-000000000004'],
  ] as const)(
    'rejeita cookies de sessões distintas em %s para identidade %s',
    async (rota, caminho, outroUsuario) => {
      const sessao = {
        usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      };
      const primeira = await transporte.responderEntrada({
        sessao,
        accessToken: await jwt(),
      });
      const segunda = await transporte.responderEntrada({
        sessao: { ...sessao, usuario: { ...sessao.usuario, id: outroUsuario } },
        accessToken: await jwt({
          sub: outroUsuario,
          session_id: '10000000-0000-4000-8000-000000000003',
        }),
      });
      const dados = await primeira.json();
      const cookieA = primeira.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('ffcm_csrf_'))
        ?.split(';')[0];
      const cookieB = segunda.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('ffcm_sessao_'))
        ?.split(';')[0];
      const request = new Request(`${origem}${caminho}`, {
        method: 'POST',
        body: '{}',
        headers: {
          origin: origem,
          'content-type': 'application/json',
          'x-csrf': dados.dados.csrf,
          'x-sessao': dados.dados.seletor_sessao,
          cookie: `${cookieA}; ${cookieB}`,
        },
      });
      await expect(transporte.lerComandoComCookie(request, rota)).rejects.toMatchObject({
        codigo: 'nao_autenticado',
      });
    },
  );
  it('abre identidade selada após validar origem, CSRF e corpo estrito', async () => {
    await expect(transporte.lerComandoComCookie(await comando(), 'renovarSessao')).resolves.toEqual(
      { usuarioId, sessionId },
    );
  });

  it('nega cookies de sessão duplicados em vez de escolher identidade por ordem', async () => {
    const request = await comando();
    request.headers.set(
      'cookie',
      `${request.headers.get('cookie')}; ${request.headers.get('cookie')}`,
    );
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'nao_autenticado',
    });
  });

  it('não aceita cookie de sessão com o nome legado de refresh', async () => {
    const request = await comando();
    request.headers.set(
      'cookie',
      (request.headers.get('cookie') ?? '').replace('ffcm_sessao_', 'ffcm_refresh_'),
    );
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'nao_autenticado',
    });
  });

  it('nega seletor ausente ou substituído e não limpa cookies com contexto fabricado', async () => {
    for (const valor of ['', '20000000-0000-4000-8000-000000000002']) {
      const request = await comando({ headers: { 'x-sessao': valor } }, '/api/sessao/sair');
      await expect(transporte.lerComandoComCookie(request, 'sairSessao')).rejects.toThrow();
    }
    expect(() =>
      transporte.responderSaida(
        { encerrada_localmente: true, pendencia_externa: false },
        { usuarioId, sessionId },
      ),
    ).toThrow();
  });

  it('nega corpo JSON acima do limite mesmo sem Content-Length', async () => {
    const request = await comando({ body: `${' '.repeat(4_096)}{}` });
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'entrada_invalida',
    });
  });

  it('não aceita JSON enviado como formulário/texto simples', async () => {
    const request = await comando({ headers: { 'content-type': 'text/plain' } });
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'entrada_invalida',
    });
  });

  it('extrai somente identidade criptograficamente verificada do Bearer de consulta', async () => {
    const request = new Request(`${origem}/api/sessao`, {
      headers: { authorization: `Bearer ${await jwt({ perfil: 'administrador' })}` },
    });
    await expect(transporte.lerIdentidadeDaConsulta(request)).resolves.toEqual({
      usuarioId,
      sessionId,
    });
  });

  it('emite envelope de entrada e dois Set-Cookie independentes sem expor refresh', async () => {
    const accessToken = await jwt();
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: ['consultar_pacientes_vinculados'],
    };
    const resposta = await transporte.responderEntrada({
      sessao,
      accessToken,
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    expect(resposta.headers.get('access-control-allow-origin')).toBeNull();
    const cookies = resposta.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/api/sessao');
      expect(cookie).not.toContain('Domain=');
      expect(cookie).not.toContain('refresh-ficticio');
    }
    const corpo = await resposta.json();
    expect(corpo.dados).toEqual({
      sessao,
      access_token: accessToken,
      csrf: expect.any(String),
      seletor_sessao: expect.any(String),
    });
    expect(corpo.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(corpo)).not.toContain('refresh-ficticio');
    const cabecalhoCookie = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
    const codecEmitido = criarCodecDeCookiesSessaoIsolada(
      { chaveDeSelagem: chaveSelagem, transporte: 'https' },
      corpo.dados.seletor_sessao,
    );
    expect(await codecEmitido.abrirCsrf(cabecalhoCookie)).toBe(corpo.dados.csrf);
    expect(JSON.parse((await codecEmitido.abrirSessao(cabecalhoCookie)) ?? '')).toEqual({
      versao: 2,
      csrf: corpo.dados.csrf,
      usuarioId,
      sessionId,
    });
  });

  it('limpa ambos cookies no mesmo caminho somente com resultado local encerrado', async () => {
    const contexto = await transporte.lerComandoComCookie(
      await comando({}, '/api/sessao/sair'),
      'sairSessao',
    );
    const resposta = transporte.responderSaida(
      {
        encerrada_localmente: true,
        pendencia_externa: true,
      },
      contexto,
    );
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    const cookies = resposta.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe(
      `ffcm_sessao_${seletor}=; Path=/api/sessao; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
    );
    expect(cookies[1]).toBe(
      `ffcm_csrf_${seletor}=; Path=/api/sessao; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
    );
    expect((await resposta.json()).dados).toEqual({
      encerrada_localmente: true,
      pendencia_externa: true,
    });
    expect(() =>
      transporte.responderSaida(
        { encerrada_localmente: false, pendencia_externa: false },
        contexto,
      ),
    ).toThrow();
  });

  it('não reutiliza o mesmo contexto para emitir respostas de saída contraditórias', async () => {
    const contexto = await transporte.lerComandoComCookie(
      await comando({}, '/api/sessao/sair'),
      'sairSessao',
    );
    transporte.responderSaida({ encerrada_localmente: true, pendencia_externa: true }, contexto);
    expect(() =>
      transporte.responderSaida({ encerrada_localmente: true, pendencia_externa: false }, contexto),
    ).toThrow();
  });

  it('não reutiliza contexto de saída após resultado inválido', async () => {
    const contexto = await transporte.lerComandoComCookie(
      await comando({}, '/api/sessao/sair'),
      'sairSessao',
    );
    expect(() =>
      transporte.responderSaida(
        { encerrada_localmente: false, pendencia_externa: false },
        contexto,
      ),
    ).toThrow();
    expect(() =>
      transporte.responderSaida({ encerrada_localmente: true, pendencia_externa: false }, contexto),
    ).toThrow();
  });

  it('recusa configuração JWT de outro projeto antes de produzir cookies', () => {
    expect(() =>
      criarTransporteHttpSessao(fonte, {
        configuracaoJwt: { ...configuracaoJwt, issuer: 'https://outro.example.test/auth/v1' },
      }),
    ).toThrow();
  });

  it('limita cookie recebido antes de abrir conteúdo cifrado', async () => {
    const request = await comando();
    request.headers.set('cookie', `${request.headers.get('cookie')}; extra=${'x'.repeat(8_192)}`);
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'nao_autenticado',
    });
  });

  it.each([
    ['origem externa', { origin: 'https://maliciosa.example.test' }],
    ['origem com sufixo enganoso', { origin: `${origem}.maliciosa.test` }],
    ['origem ausente', { origin: '' }],
    ['origem null', { origin: 'null' }],
    ['origem com caminho', { origin: `${origem}/` }],
    ['CSRF ausente', { 'x-csrf': '' }],
    ['CSRF divergente', { 'x-csrf': 'd'.repeat(43) }],
    ['cookie ausente', { cookie: '' }],
  ])('nega comando com %s', async (_nome, headers) => {
    const request = await comando({ headers });
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'sem_permissao',
    });
  });

  it.each([
    '{',
    '[]',
    'null',
    '{"perfil":"administrador"}',
    '{"usuario_id":"outro"}',
    '{"refresh_token":"texto"}',
  ])('nega corpo não contratual sem eco: %s', async (body) => {
    const request = await comando({ body });
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'entrada_invalida',
    });
  });

  it('nega refresh alterado mesmo com CSRF válido', async () => {
    const request = await comando();
    request.headers.set(
      'cookie',
      `ffcm_sessao_${seletor}=v1.alterado.alterado; ${(await codec.selarCsrf(csrf)).split(';')[0]}`,
    );
    await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
      codigo: 'nao_autenticado',
    });
  });

  it('nega método/caminho/query fora do contrato em vez de transportar tokens pela URL', async () => {
    for (const request of [
      await comando({ method: 'PUT' }),
      await comando({}, '/api/sessao/sair'),
      await comando({}, '/api/sessao/renovar?refresh_token=ficticio'),
    ]) {
      await expect(transporte.lerComandoComCookie(request, 'renovarSessao')).rejects.toMatchObject({
        codigo: 'entrada_invalida',
      });
    }
  });

  it.each([
    ['issuer de outro projeto', { iss: 'https://outro.example.test/auth/v1' }],
    ['audience divergente', { aud: 'outra' }],
    ['session_id ausente', { session_id: undefined }],
    ['session_id inválido', { session_id: 'identificador-invalido' }],
    ['subject inválido', { sub: 'identificador-invalido' }],
    ['expiração ausente', { exp: undefined }],
    ['expirado', { exp: 1 }],
  ])('nega JWT com %s e retorna 401 sanitizado', async (_nome, claims) => {
    const token = await jwt(claims);
    const request = new Request(`${origem}/api/sessao`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const erro = await transporte.lerIdentidadeDaConsulta(request).catch((falha: unknown) => falha);
    const resposta = transporte.responderFalha(erro);
    expect(resposta.status).toBe(401);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    expect(await resposta.json()).toEqual({
      erro: { codigo: 'nao_autenticado', mensagem: 'Sessão inválida.' },
      request_id: expect.any(String),
    });
  });

  it('nega JWT assinado por outra chave', async () => {
    const request = new Request(`${origem}/api/sessao`, {
      headers: { authorization: `Bearer ${await jwt({}, new Uint8Array(32).fill(8))}` },
    });
    await expect(transporte.lerIdentidadeDaConsulta(request)).rejects.toThrow(
      'JWT de sessão inválido.',
    );
  });

  it('não extrai identidade de cookie, query ou cabeçalho Bearer ambíguo', async () => {
    const token = await jwt();
    for (const request of [
      new Request(`${origem}/api/sessao`, { headers: { cookie: `access_token=${token}` } }),
      new Request(`${origem}/api/sessao?access_token=${token}`),
      new Request(`${origem}/api/sessao`, {
        headers: { authorization: `Bearer ${token}, Bearer ${token}` },
      }),
    ]) {
      await expect(transporte.lerIdentidadeDaConsulta(request)).rejects.toThrow();
    }
  });

  it('não emite cookies para DTO de outro usuário ou inativo', async () => {
    for (const usuario of [
      { id: sessionId, perfil: 'administrador', ativo: true, versao: 1 },
      { id: usuarioId, perfil: 'profissional', ativo: false, versao: 1 },
    ]) {
      const erro = await transporte
        .responderEntrada({
          sessao: { usuario, capacidades: [] },
          accessToken: await jwt(),
        })
        .catch((falha: unknown) => falha);
      const resposta = transporte.responderFalha(erro);
      expect(resposta.status).toBe(401);
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
  });

  it('sanitiza falhas desconhecidas e configuração ausente sem cookies ou CORS', async () => {
    let falhaConfiguracao: unknown;
    try {
      criarTransporteHttpSessao({}, { configuracaoJwt });
    } catch (erro) {
      falhaConfiguracao = erro;
    }
    for (const [erro, codigo] of [
      [new Error('senha-ficticia; token-ficticio; corpo-do-provedor'), 'servico_indisponivel'],
      [falhaConfiguracao, 'configuracao_indisponivel'],
    ] as const) {
      const resposta = responderFalhaHttpSessao(erro);
      expect(resposta.status).toBe(503);
      expect(resposta.headers.get('cache-control')).toBe('no-store');
      expect(resposta.headers.get('access-control-allow-origin')).toBeNull();
      expect(resposta.headers.getSetCookie()).toEqual([]);
      const corpo = await resposta.json();
      expect(corpo.erro.codigo).toBe(codigo);
      expect(JSON.stringify(corpo)).not.toMatch(/senha|token|provedor|stack|FFCM/);
    }
  });
});
