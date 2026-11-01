import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { criarRenovadorAuth } from './auth-renovacao.ts';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const chave = new TextEncoder().encode('chave-ficticia-com-32-bytes-ou-mais');
const config = {
  issuer,
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: chave,
};

describe('renovação no Auth', () => {
  it.each([true, false])(
    'encerra validação pendente no prazo, mesmo com resultado tardio %s',
    async (resultadoTardio) => {
      const token = await new SignJWT({ session_id: sessao })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(usuario)
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(chave);
      const controlador = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);
      let liberar: (valor: boolean) => void = () => {};
      let verificando = false;
      const verificar = vi.spyOn(crypto.subtle, 'verify').mockImplementation(async () => {
        verificando = true;
        return new Promise<boolean>((resolver) => {
          liberar = resolver;
        });
      });
      try {
        const renovar = criarRenovadorAuth({
          projeto: 'projetoficticio',
          chavePublica: 'publica',
          configuracaoJwt: config,
          buscar: async () =>
            Response.json({
              access_token: token,
              refresh_token: 'novo-ficticio',
              token_type: 'bearer',
            }),
        });
        const operacao = renovar('refresh-ficticio', {
          usuarioId: usuario,
          sessionId: sessao,
        }).then(
          () => 'aceito',
          () => 'rejeitado',
        );
        await vi.waitFor(() => expect(verificando).toBe(true));
        controlador.abort();
        expect(
          await Promise.race([
            operacao,
            new Promise<string>((r) => setTimeout(() => r('bloqueado'), 100)),
          ]),
        ).toBe('rejeitado');
        liberar(resultadoTardio);
        expect(await operacao).toBe('rejeitado');
      } finally {
        verificar.mockRestore();
        timeout.mockRestore();
      }
    },
  );
  it('encerra chamada que ignora abort e cancela resposta tardia sem repetir', async () => {
    const controlador = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);
    let liberar: (resposta: Response) => void = () => {};
    let chamadas = 0;
    let cancelado = false;
    try {
      const renovar = criarRenovadorAuth({
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: config,
        buscar: async () => {
          chamadas += 1;
          return new Promise<Response>((resolver) => {
            liberar = resolver;
          });
        },
      });
      const operacao = renovar('refresh-ficticio', { usuarioId: usuario, sessionId: sessao }).then(
        () => 'aceito',
        () => 'rejeitado',
      );
      controlador.abort();
      expect(
        await Promise.race([
          operacao,
          new Promise<string>((r) => setTimeout(() => r('bloqueado'), 100)),
        ]),
      ).toBe('rejeitado');
      const corpo = new ReadableStream({
        cancel() {
          cancelado = true;
          return new Promise<void>(() => {});
        },
      });
      liberar(new Response(corpo));
      await vi.waitFor(() => expect(cancelado).toBe(true));
      expect(chamadas).toBe(1);
    } finally {
      timeout.mockRestore();
    }
  });

  it('encerra leitura de corpo que ignora abort sem esperar cancelamento', async () => {
    const controlador = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);
    let cancelado = false;
    try {
      const corpo = new ReadableStream({
        cancel() {
          cancelado = true;
          return new Promise<void>(() => {});
        },
      });
      const renovar = criarRenovadorAuth({
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: config,
        buscar: async () => new Response(corpo),
      });
      const operacao = renovar('refresh-ficticio', { usuarioId: usuario, sessionId: sessao }).then(
        () => 'aceito',
        () => 'rejeitado',
      );
      await vi.waitFor(() => expect(corpo.locked).toBe(true));
      controlador.abort();
      expect(
        await Promise.race([
          operacao,
          new Promise<string>((r) => setTimeout(() => r('bloqueado'), 100)),
        ]),
      ).toBe('rejeitado');
      expect(cancelado).toBe(true);
    } finally {
      timeout.mockRestore();
    }
  });
  it('mantém identidade e configuração mesmo se alteradas durante a chamada', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const chaveMutavel = Buffer.from(chave);
    const algoritmos: ('HS256' | 'HS384')[] = ['HS256'];
    const configuracao = {
      ...config,
      chaveDeVerificacao: chaveMutavel,
      algoritmosPermitidos: algoritmos,
    };
    const identidade = { usuarioId: usuario, sessionId: sessao };
    const renovar = criarRenovadorAuth({
      projeto: 'projetoficticio',
      chavePublica: 'publica',
      configuracaoJwt: configuracao,
      buscar: async () => {
        chaveMutavel.fill(0);
        algoritmos.splice(0, 1, 'HS384');
        configuracao.issuer = 'https://outro.supabase.co/auth/v1';
        identidade.usuarioId = sessao;
        identidade.sessionId = usuario;
        return Response.json({
          access_token: token,
          refresh_token: 'novo-ficticio',
          token_type: 'bearer',
        });
      },
    });
    await expect(renovar('antigo-ficticio', identidade)).resolves.toMatchObject({
      accessToken: token,
    });
  });

  it('rejeita assinatura, audience e expiração inválidas', async () => {
    const base = () =>
      new SignJWT({ session_id: sessao })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(usuario)
        .setIssuer(issuer);
    const tokens = [
      await base()
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(new Uint8Array(32).fill(7)),
      await base().setAudience('outra').setExpirationTime('5m').sign(chave),
      await base().setAudience('authenticated').setExpirationTime('1s ago').sign(chave),
    ];
    for (const accessToken of tokens) {
      const renovar = criarRenovadorAuth({
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: config,
        buscar: async () =>
          Response.json({
            access_token: accessToken,
            refresh_token: 'novo-ficticio',
            token_type: 'bearer',
          }),
      });
      await expect(
        renovar('antigo-ficticio', { usuarioId: usuario, sessionId: sessao }),
      ).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
    }
  });

  it('rejeita leitura falha ou corpo excessivo com cancelamento que não termina', async () => {
    const streams = [
      new ReadableStream({
        start(controller) {
          controller.error(new Error('refresh-antigo-ficticio'));
        },
      }),
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(65_537));
        },
        cancel() {
          return new Promise<void>(() => {});
        },
      }),
    ];
    for (const stream of streams) {
      const renovar = criarRenovadorAuth({
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: config,
        buscar: async () => new Response(stream),
      });
      const resultado = await Promise.race([
        renovar('antigo-ficticio', { usuarioId: usuario, sessionId: sessao }).then(
          () => 'aceito',
          () => 'rejeitado',
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve('bloqueado'), 100)),
      ]);
      expect(resultado).toBe('rejeitado');
    }
  });

  it('sinaliza timeout e rejeita sem expor credencial', async () => {
    const renovar = criarRenovadorAuth({
      projeto: 'projetoficticio',
      chavePublica: 'publica',
      configuracaoJwt: config,
      buscar: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('refresh-antigo-ficticio')),
            { once: true },
          );
        }),
    });
    await expect(
      renovar('refresh-antigo-ficticio', { usuarioId: usuario, sessionId: sessao }),
    ).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
  }, 12_000);
  it('nega token de outra sessão e sanitiza falha sem repetir a chamada', async () => {
    const outro = await new SignJWT({ session_id: usuario })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    let tentativas = 0;
    const renovar = criarRenovadorAuth({
      projeto: 'projetoficticio',
      chavePublica: 'publica',
      configuracaoJwt: config,
      buscar: async () => {
        tentativas++;
        return Response.json({
          access_token: outro,
          refresh_token: 'refresh-ficticio',
          token_type: 'bearer',
        });
      },
    });
    await expect(
      renovar('refresh-antigo-ficticio', { usuarioId: usuario, sessionId: sessao }),
    ).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
    expect(tentativas).toBe(1);
  });

  it('não vaza credencial em falhas de transporte ou resultado inválido', async () => {
    for (const buscar of [
      async () => {
        throw new Error('refresh-antigo-ficticio');
      },
      async () => new Response('x'.repeat(65_537)),
      async () => new Response('refresh-antigo-ficticio', { status: 401 }),
    ]) {
      const renovar = criarRenovadorAuth({
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: config,
        buscar,
      });
      await expect(
        renovar('refresh-antigo-ficticio', { usuarioId: usuario, sessionId: sessao }),
      ).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
    }
  });

  it('não aceita projeto ou issuer adulterados', () => {
    expect(() =>
      criarRenovadorAuth({
        projeto: 'fora.test/path',
        chavePublica: 'publica',
        configuracaoJwt: config,
      }),
    ).toThrow('Configuração de autenticação inválida.');
    expect(() =>
      criarRenovadorAuth({ projeto: 'outro', chavePublica: 'publica', configuracaoJwt: config }),
    ).toThrow('Configuração de autenticação inválida.');
  });
  it('troca uma credencial e verifica o JWT da mesma sessão', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const renovar = criarRenovadorAuth({
      projeto: 'projetoficticio',
      chavePublica: 'publica',
      configuracaoJwt: config,
      buscar: async (url, init) => {
        expect(String(url)).toBe(`${issuer}/token?grant_type=refresh_token`);
        expect(JSON.parse(String(init?.body))).toEqual({
          refresh_token: 'refresh-antigo-ficticio',
        });
        return Response.json({
          access_token: token,
          refresh_token: 'refresh-novo-ficticio',
          token_type: 'bearer',
        });
      },
    });
    await expect(
      renovar('refresh-antigo-ficticio', { usuarioId: usuario, sessionId: sessao }),
    ).resolves.toEqual({ accessToken: token, refreshToken: 'refresh-novo-ficticio' });
  });
});
