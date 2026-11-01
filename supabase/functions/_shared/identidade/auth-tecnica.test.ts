import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { criarAutenticadorTecnico, ErroAutenticacaoNegada } from './auth-tecnica.ts';

const chave = new TextEncoder().encode('chave-ficticia-com-32-bytes-ou-mais');
const usuarioId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const configuracaoJwt = {
  issuer,
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: chave,
};

async function token(issuerJwt = issuer) {
  return new SignJWT({ session_id: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuer(issuerJwt)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(chave);
}

describe('autenticação técnica Supabase', () => {
  it.each(['fetch', 'corpo', 'jwt'])(
    'respeita prazo com %s pendente e descarta resultado tardio',
    async (etapa) => {
      const accessToken = await token();
      const controlador = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);
      let liberarResposta: (valor: Response) => void = () => {};
      let liberarJwt: (valor: boolean) => void = () => {};
      let verificando = false;
      let cancelado = false;
      let chamadas = 0;
      const verificar =
        etapa === 'jwt'
          ? vi.spyOn(crypto.subtle, 'verify').mockImplementation(async () => {
              verificando = true;
              return new Promise<boolean>((resolver) => {
                liberarJwt = resolver;
              });
            })
          : undefined;
      const corpo = new ReadableStream({
        cancel() {
          cancelado = true;
          return new Promise<void>(() => {});
        },
      });
      try {
        const autenticar = criarAutenticadorTecnico({
          projeto: 'projetoficticio',
          chavePublica: 'publica-ficticia',
          configuracaoJwt,
          buscar: async () => {
            chamadas += 1;
            if (etapa === 'fetch')
              return new Promise<Response>((resolver) => {
                liberarResposta = resolver;
              });
            if (etapa === 'corpo') return new Response(corpo);
            return Response.json({
              access_token: accessToken,
              refresh_token: 'ficticio',
              token_type: 'bearer',
              user: { id: usuarioId },
            });
          },
        });
        const operacao = autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }).then(
          () => 'aceito',
          () => 'rejeitado',
        );
        if (etapa === 'corpo') await vi.waitFor(() => expect(corpo.locked).toBe(true));
        if (etapa === 'jwt') await vi.waitFor(() => expect(verificando).toBe(true));
        controlador.abort();
        expect(
          await Promise.race([
            operacao,
            new Promise<string>((r) => setTimeout(() => r('bloqueado'), 150)),
          ]),
        ).toBe('rejeitado');
        if (etapa === 'fetch') liberarResposta(new Response(corpo));
        if (etapa === 'fetch' || etapa === 'corpo')
          await vi.waitFor(() => expect(cancelado).toBe(true));
        if (etapa === 'jwt') liberarJwt(true);
        expect(await operacao).toBe('rejeitado');
        expect(chamadas).toBe(1);
      } finally {
        verificar?.mockRestore();
        timeout.mockRestore();
      }
    },
  );
  it('distingue erro de credenciais documentado de indisponibilidade sem ecoar o corpo', async () => {
    const criar = (buscar: typeof fetch) =>
      criarAutenticadorTecnico({
        projeto: 'projetoficticio',
        chavePublica: 'publica-ficticia',
        configuracaoJwt,
        buscar,
      });
    const negada = criar(async () =>
      Response.json({ error_code: 'invalid_credentials', msg: 'senha-ficticia' }, { status: 400 }),
    );
    const erro = await negada({ email: 'pessoa@example.test', senha: 'senha-ficticia' }).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ErroAutenticacaoNegada);
    expect(JSON.stringify(erro)).not.toContain('senha-ficticia');
    for (const buscar of [
      async () => new Response('senha-ficticia', { status: 401 }),
      async () => new Response('senha-ficticia', { status: 503 }),
      async () => {
        throw new Error('senha-ficticia');
      },
    ]) {
      const falha = await criar(buscar)({
        email: 'pessoa@example.test',
        senha: 'senha-ficticia',
      }).catch((e: unknown) => e);
      expect(falha).not.toBeInstanceOf(ErroAutenticacaoNegada);
      expect(JSON.stringify(falha)).not.toContain('senha-ficticia');
    }
  });
  it('preserva material de chave quando Buffer fornecido é alterado', async () => {
    const accessToken = await token();
    const chaveMutavel = Buffer.from(chave);
    const autenticar = criarAutenticadorTecnico({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      configuracaoJwt: { ...configuracaoJwt, chaveDeVerificacao: chaveMutavel },
      buscar: async () => {
        chaveMutavel.fill(0);
        return Response.json({
          access_token: accessToken,
          refresh_token: 'ficticio',
          token_type: 'bearer',
          user: { id: usuarioId },
        });
      },
    });
    await expect(
      autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
    ).resolves.toMatchObject({ usuarioId, sessionId });
  });

  it('rejeita corpo excessivo mesmo quando cancelamento não termina', async () => {
    const corpo = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65_537));
      },
      cancel() {
        return new Promise<void>(() => {});
      },
    });
    const autenticar = criarAutenticadorTecnico({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      configuracaoJwt,
      buscar: async () => new Response(corpo),
    });
    const resultado = await Promise.race([
      autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }).then(
        () => 'aceito',
        () => 'rejeitado',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('bloqueado'), 100)),
    ]);
    expect(resultado).toBe('rejeitado');
  });
  it('preserva a chave e os algoritmos configurados ao construir o adapter', async () => {
    const accessToken = await token();
    const chaveMutavel = chave.slice();
    const algoritmos: ('HS256' | 'HS384')[] = ['HS256'];
    const autenticar = criarAutenticadorTecnico({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      configuracaoJwt: {
        ...configuracaoJwt,
        chaveDeVerificacao: chaveMutavel,
        algoritmosPermitidos: algoritmos,
      },
      buscar: async () => {
        chaveMutavel.fill(0);
        algoritmos.splice(0, 1, 'HS384');
        return Response.json({
          access_token: accessToken,
          refresh_token: 'ficticio',
          token_type: 'bearer',
          user: { id: usuarioId },
        });
      },
    });
    await expect(
      autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
    ).resolves.toMatchObject({ usuarioId, sessionId });
  });
  it('não aceita troca de emissor e chave durante a resposta do provedor', async () => {
    const chaveOriginal = chave.slice();
    const chaveAtacante = new TextEncoder().encode('outra-chave-ficticia-de-32-bytes-ou-mais');
    const config = { ...configuracaoJwt, chaveDeVerificacao: chaveOriginal };
    const tokenAtacante = await new SignJWT({ session_id: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuarioId)
      .setIssuer('https://outro.supabase.co/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chaveAtacante);
    const autenticar = criarAutenticadorTecnico({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      configuracaoJwt: config,
      buscar: async () => {
        config.issuer = 'https://outro.supabase.co/auth/v1';
        config.chaveDeVerificacao = chaveAtacante;
        chaveOriginal.fill(0);
        return Response.json({
          access_token: tokenAtacante,
          refresh_token: 'ficticio',
          token_type: 'bearer',
          user: { id: usuarioId },
        });
      },
    });
    await expect(
      autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
    ).rejects.toThrow('Autenticação técnica indisponível ou inválida.');
  });
  it('autentica pelo contrato HTTP e entrega identidade verificada sem perfil', async () => {
    const accessToken = await token();
    const autenticar = criarAutenticadorTecnico({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      configuracaoJwt,
      buscar: async (url, init) => {
        expect(String(url)).toBe(`${issuer}/token?grant_type=password`);
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          email: 'pessoa@example.test',
          password: 'senha-ficticia',
        });
        return Response.json({
          access_token: accessToken,
          refresh_token: 'refresh-ficticio',
          token_type: 'bearer',
          user: { id: usuarioId },
        });
      },
    });
    await expect(
      autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
    ).resolves.toEqual({ usuarioId, sessionId, accessToken, refreshToken: 'refresh-ficticio' });
  });

  it('rejeita JWT de outro emissor, usuário divergente e resposta sem refresh', async () => {
    const valido = await token();
    for (const corpo of [
      {
        access_token: await token('https://outro.supabase.co/auth/v1'),
        refresh_token: 'ficticio',
        token_type: 'bearer',
        user: { id: usuarioId },
      },
      {
        access_token: valido,
        refresh_token: 'ficticio',
        token_type: 'bearer',
        user: { id: sessionId },
      },
      { access_token: valido, token_type: 'bearer', user: { id: usuarioId } },
    ]) {
      const autenticar = criarAutenticadorTecnico({
        projeto: 'projetoficticio',
        chavePublica: 'publica-ficticia',
        configuracaoJwt,
        buscar: async () => Response.json(corpo),
      });
      await expect(
        autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
      ).rejects.toThrow('Autenticação técnica indisponível ou inválida.');
    }
  });

  it('não repassa erro do provedor nem envia credenciais a destino configurado fora do projeto', async () => {
    expect(() =>
      criarAutenticadorTecnico({
        projeto: 'atacante.example/path',
        chavePublica: 'publica',
        configuracaoJwt,
      }),
    ).toThrow('Configuração de autenticação inválida.');
    const autenticar = criarAutenticadorTecnico({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      configuracaoJwt,
      buscar: async () => {
        throw new Error('senha-ficticia e token-ficticio');
      },
    });
    await expect(
      autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
    ).rejects.toThrow(/^Autenticação técnica indisponível ou inválida\.$/);
  });

  it('rejeita respostas não autorizadas, inválidas ou grandes', async () => {
    for (const resposta of [
      new Response('senha-ficticia', { status: 401 }),
      new Response('não é json'),
      new Response('x'.repeat(65_537)),
    ]) {
      const autenticar = criarAutenticadorTecnico({
        projeto: 'projetoficticio',
        chavePublica: 'publica-ficticia',
        configuracaoJwt,
        buscar: async () => resposta,
      });
      await expect(
        autenticar({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
      ).rejects.toThrow('Autenticação técnica indisponível ou inválida.');
    }
  });
});
