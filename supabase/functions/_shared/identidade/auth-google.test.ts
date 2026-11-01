import { generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { criarTrocaGoogle } from './auth-google.ts';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const chaveSupabase = new TextEncoder().encode('chave-ficticia-com-32-bytes-ou-mais');
const nonce = 'A'.repeat(43);

describe('troca Google no Supabase Auth', () => {
  it('não inicia POST quando validação pendente termina após cancelamento externo', async () => {
    const controle = new AbortController();
    let liberar:
      | ((valor: { subject: string; email: string; dominioWorkspace: string }) => void)
      | undefined;
    let iniciou = false;
    let chamadas = 0;
    const trocar = criarTrocaGoogle({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      google: {
        audienciaEsperada: 'cliente-ficticio',
        dominioWorkspace: 'example.test',
        validar: async () => {
          iniciou = true;
          return new Promise((resolve) => {
            liberar = resolve;
          });
        },
      },
      configuracaoJwt: {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chaveSupabase,
      },
      buscar: async () => {
        chamadas++;
        throw new Error();
      },
    });
    const operacao = trocar({ idToken: 'ficticio', nonce }, controle.signal);
    await vi.waitFor(() => expect(iniciou).toBe(true));
    controle.abort();
    liberar?.({
      subject: 'ficticio',
      email: 'teste@example.test',
      dominioWorkspace: 'example.test',
    });
    await expect(operacao).rejects.toThrow('Troca Google indisponível ou inválida.');
    expect(chamadas).toBe(0);
  });
  it.each(['digest', 'verificacao'])(
    'não chama Supabase quando %s inicial expira',
    async (etapa) => {
      const chaves = await generateKeyPair('RS256');
      const hash = Buffer.from(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)),
      ).toString('hex');
      const idToken = await new SignJWT({
        nonce: hash,
        email: 'teste@example.test',
        email_verified: true,
        hd: 'example.test',
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject('google-sub-ficticio')
        .setIssuer('https://accounts.google.com')
        .setAudience('cliente-ficticio')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(chaves.privateKey);
      const controlador = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);
      let liberarDigest: (valor: ArrayBuffer) => void = () => {};
      let liberarVerificacao: (valor: boolean) => void = () => {};
      let pendente = false;
      let chamadas = 0;
      const digest =
        etapa === 'digest'
          ? vi.spyOn(crypto.subtle, 'digest').mockImplementation(async () => {
              pendente = true;
              return new Promise<ArrayBuffer>((resolver) => {
                liberarDigest = resolver;
              });
            })
          : undefined;
      const verificar =
        etapa === 'verificacao'
          ? vi.spyOn(crypto.subtle, 'verify').mockImplementation(async () => {
              pendente = true;
              return new Promise<boolean>((resolver) => {
                liberarVerificacao = resolver;
              });
            })
          : undefined;
      try {
        const trocar = criarTrocaGoogle({
          projeto: 'projetoficticio',
          chavePublica: 'publica-ficticia',
          google: {
            audienciaEsperada: 'cliente-ficticio',
            dominioWorkspace: 'example.test',
            chaveDeVerificacao: chaves.publicKey,
          },
          configuracaoJwt: {
            issuer,
            audience: 'authenticated',
            algoritmosPermitidos: ['HS256'],
            chaveDeVerificacao: chaveSupabase,
          },
          buscar: async () => {
            chamadas += 1;
            throw new Error('não deveria chamar');
          },
        });
        const operacao = trocar({ idToken, nonce }).then(
          () => 'aceito',
          () => 'rejeitado',
        );
        await vi.waitFor(() => expect(pendente).toBe(true));
        controlador.abort();
        expect(
          await Promise.race([
            operacao,
            new Promise<string>((resolve) => setTimeout(() => resolve('travado'), 150)),
          ]),
        ).toBe('rejeitado');
        if (etapa === 'digest') liberarDigest(new Uint8Array(32).buffer);
        else liberarVerificacao(true);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(chamadas).toBe(0);
      } finally {
        digest?.mockRestore();
        verificar?.mockRestore();
        timeout.mockRestore();
      }
    },
  );
  it('encerra verificação JWT Supabase pendente ao expirar prazo e descarta resultado tardio', async () => {
    const chaves = await generateKeyPair('RS256');
    const hash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)),
    ).toString('hex');
    const idToken = await new SignJWT({
      nonce: hash,
      email: 'teste@example.test',
      email_verified: true,
      hd: 'example.test',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('google-sub-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(chaves.privateKey);
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chaveSupabase);
    const controlador = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);
    let liberar: (resultado: boolean) => void = () => {};
    let verificando = false;
    let verificar: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const trocar = criarTrocaGoogle({
        projeto: 'projetoficticio',
        chavePublica: 'publica-ficticia',
        google: {
          audienciaEsperada: 'cliente-ficticio',
          dominioWorkspace: 'example.test',
          chaveDeVerificacao: chaves.publicKey,
        },
        configuracaoJwt: {
          issuer,
          audience: 'authenticated',
          algoritmosPermitidos: ['HS256'],
          chaveDeVerificacao: chaveSupabase,
        },
        buscar: async () => {
          verificar = vi.spyOn(crypto.subtle, 'verify').mockImplementation(async () => {
            verificando = true;
            return new Promise<boolean>((resolver) => {
              liberar = resolver;
            });
          });
          return Response.json({
            access_token: jwt,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: {
              id: usuario,
              identities: [
                {
                  provider: 'google',
                  id: 'google-sub-ficticio',
                  user_id: usuario,
                  identity_data: { sub: 'google-sub-ficticio' },
                },
              ],
            },
          });
        },
      });
      const operacao = trocar({ idToken, nonce }).then(
        () => 'aceito',
        () => 'rejeitado',
      );
      await vi.waitFor(() => expect(verificando).toBe(true));
      controlador.abort();
      expect(
        await Promise.race([
          operacao,
          new Promise<string>((resolve) => setTimeout(() => resolve('travado'), 150)),
        ]),
      ).toBe('rejeitado');
      liberar(true);
      expect(await operacao).toBe('rejeitado');
    } finally {
      verificar?.mockRestore();
      timeout.mockRestore();
    }
  });
  it('fecha se corpo 200 não termina mesmo quando cancelamento fica pendente', async () => {
    const chaves = await generateKeyPair('RS256');
    const hash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)),
    ).toString('hex');
    const idToken = await new SignJWT({
      nonce: hash,
      email: 'teste@example.test',
      email_verified: true,
      hd: 'example.test',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('google-sub-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(chaves.privateKey);
    const trocar = criarTrocaGoogle({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      google: {
        audienciaEsperada: 'cliente-ficticio',
        dominioWorkspace: 'example.test',
        chaveDeVerificacao: chaves.publicKey,
      },
      configuracaoJwt: {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chaveSupabase,
      },
      buscar: async () =>
        new Response(new ReadableStream({ cancel: () => new Promise<void>(() => {}) })),
    });
    const resultado = await Promise.race([
      trocar({ idToken, nonce }).then(
        () => 'aceito',
        () => 'recusado',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('travado'), 11_000)),
    ]);
    expect(resultado).toBe('recusado');
  }, 12_000);
  it('fecha em timeout de transporte sem devolver token ou detalhe do provedor', async () => {
    const chaves = await generateKeyPair('RS256');
    const hash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)),
    ).toString('hex');
    const idToken = await new SignJWT({
      nonce: hash,
      email: 'teste@example.test',
      email_verified: true,
      hd: 'example.test',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('google-sub-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(chaves.privateKey);
    const trocar = criarTrocaGoogle({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      google: {
        audienciaEsperada: 'cliente-ficticio',
        dominioWorkspace: 'example.test',
        chaveDeVerificacao: chaves.publicKey,
      },
      configuracaoJwt: {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chaveSupabase,
      },
      buscar: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('token-ficticio')), {
            once: true,
          });
        }),
    });
    const erro = await trocar({ idToken, nonce }).catch((e: unknown) => e);
    expect((erro as Error).message).toBe('Troca Google indisponível ou inválida.');
    expect(JSON.stringify(erro)).not.toContain('token-ficticio');
  }, 12_000);
  it('nega subject divergente, JWT de outro usuário e erros sem ecoar tokens', async () => {
    const chaves = await generateKeyPair('RS256');
    const hash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)),
    ).toString('hex');
    const idToken = await new SignJWT({
      nonce: hash,
      email: 'teste@example.test',
      email_verified: true,
      hd: 'example.test',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('google-sub-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(chaves.privateKey);
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chaveSupabase);
    const jwtOutro = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sessao)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chaveSupabase);
    const config = {
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      google: {
        audienciaEsperada: 'cliente-ficticio',
        dominioWorkspace: 'example.test',
        chaveDeVerificacao: chaves.publicKey,
      },
      configuracaoJwt: {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256' as const],
        chaveDeVerificacao: chaveSupabase,
      },
    };
    for (const resposta of [
      Response.json({
        access_token: jwt,
        refresh_token: 'refresh-ficticio',
        token_type: 'bearer',
        user: {
          id: usuario,
          identities: [
            {
              provider: 'google',
              id: 'outro-sub',
              user_id: usuario,
              identity_data: { sub: 'outro-sub' },
            },
          ],
        },
      }),
      Response.json({
        access_token: jwt,
        refresh_token: 'refresh-ficticio',
        token_type: 'bearer',
        user: { id: sessao, identities: [] },
      }),
      Response.json({
        access_token: jwtOutro,
        refresh_token: 'refresh-ficticio',
        token_type: 'bearer',
        user: {
          id: usuario,
          identities: [
            {
              provider: 'google',
              id: 'google-sub-ficticio',
              user_id: usuario,
              identity_data: { sub: 'google-sub-ficticio' },
            },
          ],
        },
      }),
      new Response('x'.repeat(65_537)),
      new Response('refresh-ficticio', { status: 503 }),
    ]) {
      const erro = await criarTrocaGoogle({ ...config, buscar: async () => resposta })({
        idToken,
        nonce,
      }).catch((e: unknown) => e);
      expect((erro as Error).message).toBe('Troca Google indisponível ou inválida.');
      expect(JSON.stringify(erro)).not.toContain('refresh-ficticio');
    }
    let chamadas = 0;
    const trocar = criarTrocaGoogle({
      ...config,
      buscar: async () => {
        chamadas++;
        return new Response();
      },
    });
    await expect(trocar({ idToken, nonce: `${'B'.repeat(42)}A` })).rejects.toThrow(
      'ID token Google inválido.',
    );
    expect(chamadas).toBe(0);
  });
  it('valida ID token e associa subject Google ao UUID verificado do Supabase', async () => {
    const chaves = await generateKeyPair('RS256');
    const hash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)),
    ).toString('hex');
    const idToken = await new SignJWT({
      nonce: hash,
      email: 'teste@example.test',
      email_verified: true,
      hd: 'example.test',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('google-sub-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(chaves.privateKey);
    const accessToken = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chaveSupabase);
    const trocar = criarTrocaGoogle({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      google: {
        audienciaEsperada: 'cliente-ficticio',
        dominioWorkspace: 'example.test',
        chaveDeVerificacao: chaves.publicKey,
      },
      configuracaoJwt: {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chaveSupabase,
      },
      buscar: async (url, init) => {
        expect(String(url)).toBe(`${issuer}/token?grant_type=id_token`);
        expect(JSON.parse(String(init?.body))).toEqual({
          provider: 'google',
          id_token: idToken,
          nonce,
        });
        return Response.json({
          access_token: accessToken,
          refresh_token: 'refresh-ficticio',
          token_type: 'bearer',
          user: {
            id: usuario,
            identities: [
              {
                provider: 'google',
                id: 'google-sub-ficticio',
                user_id: usuario,
                identity_data: { sub: 'google-sub-ficticio' },
              },
            ],
          },
        });
      },
    });
    const resultado = await trocar({ idToken, nonce });
    expect(resultado).toMatchObject({
      usuarioId: usuario,
      sessionId: sessao,
      subjectGoogle: 'google-sub-ficticio',
      accessToken,
      refreshToken: 'refresh-ficticio',
    });
    expect(resultado.emailGoogle).toBe('teste@example.test');
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain(accessToken);
    expect(serializado).not.toContain('refresh-ficticio');
    expect(serializado).not.toContain('teste@example.test');
    expect(serializado).not.toContain('google-sub-ficticio');
  });
});
