import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { criarDesafiosGoogle } from '../../../../supabase/functions/_shared/identidade/desafio-google.ts';
import { criarCodecDeCookiesDesafioIsolado } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { criarHandlerDesafio, criarHandlerDesafioTecnico } from './desafio-http.ts';
import { criarTransporteHttpSessao } from './http.ts';
import { criarLeitorEntradaTecnica } from './entrada-tecnica-http.ts';
import { criarLeitorEntradaGoogle } from './entrada-google-http.ts';
import { limparCookiesDesafio } from './limpar-desafio.ts';

const origem = 'https://app.example.test';
const chave = Buffer.alloc(32, 7).toString('base64url');
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_COOKIE_SEALING_KEY: chave,
  FFCM_ALLOWED_ORIGINS: origem,
};

describe('emissão HTTP de desafio', () => {
  it('recusa nova emissão quando há três tentativas pendentes, sem alterar cookies existentes', async () => {
    let registros = 0;
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(9),
      ttlSegundos: 300,
      repositorio: {
        registrar: async () => {
          registros += 1;
        },
        consumir: async () => false,
      },
    });
    const tecnico = criarHandlerDesafioTecnico({ fonte });
    const google = criarHandlerDesafio({ fonte, desafios });
    const cookies: string[] = ['ffcm_sessao=existente'];
    const pedir = (tipo: 'tecnico' | 'google') =>
      (tipo === 'tecnico' ? tecnico : google)(
        new Request(`${origem}/api/sessao/desafio-${tipo}`, {
          method: 'POST',
          headers: {
            origin: origem,
            'content-type': 'application/json',
            cookie: cookies.join('; '),
          },
          body: '{}',
        }),
      );
    for (const tipo of ['tecnico', 'google', 'tecnico'] as const) {
      const resposta = await pedir(tipo);
      expect(resposta.status).toBe(200);
      cookies.push(...resposta.headers.getSetCookie().map((item) => item.split(';')[0] ?? ''));
    }
    for (const tipo of ['tecnico', 'google'] as const) {
      const resposta = await pedir(tipo);
      expect(resposta.status).toBe(429);
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(registros).toBe(1);
    cookies.splice(1, 1); // Simula o navegador descartando o cookie expirado de uma tentativa técnica.
    const retomada = await pedir('tecnico');
    expect(retomada.status).toBe(200);
    expect(cookies[0]).toBe('ffcm_sessao=existente');
  });

  it('recusa cabeçalho grande sem emitir nem apagar cookies', async () => {
    const resposta = await criarHandlerDesafioTecnico({ fonte })(
      new Request(`${origem}/api/sessao/desafio-tecnico`, {
        method: 'POST',
        headers: {
          origin: origem,
          'content-type': 'application/json',
          cookie: `outro=${'a'.repeat(4096)}`,
        },
        body: '{}',
      }),
    );
    expect(resposta.status).toBe(429);
    expect(resposta.headers.getSetCookie()).toEqual([]);
  });
  it('emite apenas proteção técnica, aceita pelo leitor e sem nonce Google', async () => {
    const handler = criarHandlerDesafioTecnico({ fonte });
    const requisicao = (origin = origem) =>
      new Request(`${origem}/api/sessao/desafio-tecnico`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: '{}',
      });
    expect((await handler(requisicao('https://atacante.example.test'))).status).toBe(403);
    const resposta = await handler(requisicao());
    expect(resposta.status).toBe(200);
    const { dados } = await resposta.json();
    expect(Object.keys(dados)).toEqual(['csrf', 'seletor_desafio']);
    const cookies = resposta.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(
      /^ffcm_csrf_desafio_[0-9a-f-]+=.*; Path=\/api\/sessao; HttpOnly; SameSite=Lax; Secure/,
    );
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    const login = new Request(`${origem}/api/sessao/tecnica`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie: cookies[0]?.split(';')[0] ?? '',
        'x-csrf': dados.csrf,
        'x-desafio': dados.seletor_desafio,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
    });
    await expect(criarLeitorEntradaTecnica(fonte)(login)).resolves.toBeDefined();
  });
  it.each([
    ['tecnico', 'tecnico', false],
    ['tecnico', 'tecnico', true],
    ['tecnico', 'google', false],
    ['tecnico', 'google', true],
    ['google', 'tecnico', false],
    ['google', 'tecnico', true],
    ['google', 'google', false],
    ['google', 'google', true],
  ])(
    'desafios %s e %s (inversão: %s) isolam tentativas e preservam sessão',
    async (tipoAnterior, tipoAtual, inverter) => {
      const registros = new Map<string, { hash: string; expira: number }>();
      const desafios = criarDesafiosGoogle({
        chave: new Uint8Array(32).fill(9),
        ttlSegundos: 300,
        repositorio: {
          registrar: async (id, hash, expira) => {
            registros.set(id, { hash, expira });
          },
          consumir: async (id, hash, agora) => {
            const v = registros.get(id);
            if (!v || v.hash !== hash || v.expira <= agora) return false;
            registros.delete(id);
            return true;
          },
        },
      });
      const usuario = '11111111-1111-4111-8111-111111111111';
      const sessionId = '22222222-2222-4222-8222-222222222222';
      const chaveJwt = new Uint8Array(32).fill(9);
      const configuracaoJwt = {
        issuer: 'https://projeto.example.test/auth/v1',
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256' as const],
        chaveDeVerificacao: chaveJwt,
      };
      const jwt = await new SignJWT({ session_id: sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(usuario)
        .setIssuer(configuracaoJwt.issuer)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(chaveJwt);
      const transporte = criarTransporteHttpSessao(fonte, { configuracaoJwt });
      const sessao = await transporte.responderEntrada({
        sessao: {
          usuario: { id: usuario, perfil: 'profissional', ativo: true, versao: 1 },
          capacidades: [],
        },
        accessToken: jwt,
      });
      const dadosSessao = (await sessao.clone().json()).dados;
      const google = criarHandlerDesafio({ fonte, desafios });
      const tecnico = criarHandlerDesafioTecnico({ fonte });
      const emitir = (tipo: string) =>
        (tipo === 'google' ? google : tecnico)(
          new Request(`${origem}/api/sessao/desafio-${tipo}`, {
            method: 'POST',
            headers: { origin: origem, 'content-type': 'application/json' },
            body: '{}',
          }),
        );
      const anterior = await emitir(tipoAnterior);
      const atual = await emitir(tipoAtual);
      const dadosAnterior = (await anterior.clone().json()).dados;
      const dadosAtual = (await atual.clone().json()).dados;
      const jar = new Map<string, string>();
      for (const resposta of [sessao, ...(inverter ? [atual, anterior] : [anterior, atual])])
        for (const cookie of resposta.headers.getSetCookie()) {
          const par = cookie.split(';')[0] ?? '';
          const posicao = par.indexOf('=');
          jar.set(par.slice(0, posicao), par.slice(posicao + 1));
        }
      const cookie = Array.from(jar, ([nome, valor]) => `${nome}=${valor}`).join('; ');
      const reqLogin = (csrf: string, seletor: string) =>
        new Request(`${origem}/api/sessao/tecnica`, {
          method: 'POST',
          headers: {
            origin: origem,
            cookie,
            'x-csrf': csrf,
            'x-desafio': seletor,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
        });
      const deslocado = inverter ? dadosAtual : dadosAnterior;
      const vigente = inverter ? dadosAnterior : dadosAtual;
      await expect(
        criarLeitorEntradaTecnica(fonte)(reqLogin(deslocado.csrf, deslocado.seletor_desafio)),
      ).resolves.toBeDefined();
      await expect(
        criarLeitorEntradaTecnica(fonte)(reqLogin(vigente.csrf, vigente.seletor_desafio)),
      ).resolves.toBeDefined();
      await expect(
        criarLeitorEntradaTecnica(fonte)(reqLogin(deslocado.csrf, vigente.seletor_desafio)),
      ).rejects.toThrow();
      const limpeza = limparCookiesDesafio(
        new Response(),
        deslocado.seletor_desafio,
        Boolean(deslocado.desafio_id),
      );
      const jarRestante = new Map(jar);
      for (const item of limpeza.headers.getSetCookie())
        jarRestante.delete(item.split('=')[0] ?? '');
      const restante = Array.from(jarRestante, ([nome, valor]) => `${nome}=${valor}`).join('; ');
      const reqRestante = new Request(`${origem}/api/sessao/tecnica`, {
        method: 'POST',
        headers: {
          origin: origem,
          cookie: restante,
          'x-csrf': vigente.csrf,
          'x-desafio': vigente.seletor_desafio,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
      });
      await expect(criarLeitorEntradaTecnica(fonte)(reqRestante)).resolves.toBeDefined();
      if (tipoAnterior === 'google' && tipoAtual === 'google') {
        const leitorGoogle = criarLeitorEntradaGoogle(fonte);
        const entradaGoogle = (dados: typeof deslocado, seletor: string) =>
          new Request(`${origem}/api/sessao/google`, {
            method: 'POST',
            headers: {
              origin: origem,
              cookie,
              'x-csrf': dados.csrf,
              'x-desafio': seletor,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ desafio_id: dados.desafio_id, credencial: 'token-ficticio' }),
          });
        await expect(
          leitorGoogle(entradaGoogle(deslocado, deslocado.seletor_desafio)),
        ).resolves.toBeDefined();
        await expect(
          leitorGoogle(entradaGoogle(vigente, vigente.seletor_desafio)),
        ).resolves.toBeDefined();
        await expect(
          leitorGoogle(entradaGoogle(deslocado, vigente.seletor_desafio)),
        ).rejects.toThrow();
        await expect(
          desafios.consumir(
            deslocado.desafio_id,
            jar.get(`ffcm_nonce_${vigente.seletor_desafio}`) ?? '',
          ),
        ).rejects.toThrow();
        await expect(
          desafios.consumir(
            deslocado.desafio_id,
            jar.get(`ffcm_nonce_${deslocado.seletor_desafio}`) ?? '',
          ),
        ).resolves.toBeDefined();
        await expect(
          desafios.consumir(
            vigente.desafio_id,
            jar.get(`ffcm_nonce_${vigente.seletor_desafio}`) ?? '',
          ),
        ).resolves.toBeDefined();
      }
      const comando = new Request(`${origem}/api/sessao/renovar`, {
        method: 'POST',
        headers: {
          origin: origem,
          cookie: restante,
          'x-csrf': dadosSessao.csrf,
          'x-sessao': dadosSessao.seletor_sessao,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      await expect(transporte.lerComandoComCookie(comando, 'renovarSessao')).resolves.toEqual({
        usuarioId: usuario,
        sessionId,
      });
    },
  );
  it('não envia cookie se registro terminar depois do prazo', async () => {
    let liberar: (() => void) | undefined;
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(9),
      ttlSegundos: 300,
      repositorio: {
        registrar: async () =>
          new Promise<void>((resolve) => {
            liberar = resolve;
          }),
        consumir: async () => false,
      },
    });
    const handler = criarHandlerDesafio({ fonte, desafios });
    const request = new Request(`${origem}/api/sessao/desafio-google`, {
      method: 'POST',
      headers: { origin: origem, 'content-type': 'application/json' },
      body: '{}',
    });
    const resultado = await Promise.race([
      handler(request),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    expect(resultado).not.toBeNull();
    expect(resultado?.status).toBe(503);
    expect(resultado?.headers.getSetCookie()).toEqual([]);
    liberar?.();
    await Promise.resolve();
    expect(resultado?.headers.getSetCookie()).toEqual([]);
  }, 7000);
  it('recusa corpo interminável mesmo com cancelamento pendente', async () => {
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(9),
      ttlSegundos: 300,
      repositorio: { registrar: async () => {}, consumir: async () => false },
    });
    const stream = new ReadableStream({ cancel: () => new Promise<void>(() => {}) });
    const request = new Request(`${origem}/api/sessao/desafio-google`, {
      method: 'POST',
      headers: { origin: origem, 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const resultado = await Promise.race([
      criarHandlerDesafio({ fonte, desafios })(request).then((r) => r.status),
      new Promise<number>((resolve) => setTimeout(() => resolve(0), 6000)),
    ]);
    expect(resultado).toBe(422);
  }, 7000);
  it('rejeita origem, caminho e corpo indevidos sem chamar repositório', async () => {
    let chamadas = 0;
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(9),
      ttlSegundos: 300,
      repositorio: {
        registrar: async () => {
          chamadas++;
        },
        consumir: async () => false,
      },
    });
    const handler = criarHandlerDesafio({ fonte, desafios });
    for (const [url, origin, body, esperado] of [
      [`${origem}/api/sessao/desafio-google`, 'https://atacante.example.test', '{}', 403],
      [`${origem}/api/sessao/desafio-google?x=1`, origem, '{}', 422],
      [`${origem}/api/sessao/desafio-google`, origem, '{"nome":"ficticio"}', 422],
    ] as const) {
      const resposta = await handler(
        new Request(url, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body,
        }),
      );
      expect(resposta.status).toBe(esperado);
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(chamadas).toBe(0);
  });

  it('não emite cookies nem detalhe se registro do desafio falhar', async () => {
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(9),
      ttlSegundos: 300,
      repositorio: {
        registrar: async () => {
          throw new Error('segredo-ficticio');
        },
        consumir: async () => false,
      },
    });
    const resposta = await criarHandlerDesafio({ fonte, desafios })(
      new Request(`${origem}/api/sessao/desafio-google`, {
        method: 'POST',
        headers: { origin: origem, 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(resposta.status).toBe(503);
    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(await resposta.text()).not.toContain('segredo-ficticio');
  });
  it('retorna CSRF e desafio, com nonce apenas em cookie selado', async () => {
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(9),
      ttlSegundos: 300,
      repositorio: { registrar: async () => {}, consumir: async () => false },
    });
    const handler = criarHandlerDesafio({ fonte, desafios });
    const response = await handler(
      new Request(`${origem}/api/sessao/desafio-google`, {
        method: 'POST',
        headers: { origin: origem, 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const dados = (await response.json()).dados;
    expect(
      cookies.some((cookie) => cookie.startsWith(`ffcm_nonce_${dados.seletor_desafio}=`)),
    ).toBe(true);
    expect(dados.desafio_id).toBeDefined();
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      dados.seletor_desafio,
    );
    expect(await codec.abrirCsrfDesafio(cookies.map((item) => item.split(';')[0]).join('; '))).toBe(
      dados.csrf,
    );
    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/api/sessao');
      expect(cookie).not.toContain('Domain=');
    }
    expect(JSON.stringify(dados)).not.toContain('nonceSelado');
  });
});
