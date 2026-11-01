import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { criarTrocaGoogle } from './auth-google.ts';
import { criarDesafiosGoogle, ErroDesafioGoogleInvalido } from './desafio-google.ts';
import { criarEntradaGoogleComProva } from './entrada-google-prova.ts';
import { criarValidadorGoogleComJwks } from './google-jwks.ts';

describe('entrada Google com desafio', () => {
  it('mantém snapshot do pedido enquanto o consumo está pendente', async () => {
    let liberar!: (valor: { nonce: string; nonce_hash: string }) => void;
    const pendente = new Promise<{ nonce: string; nonce_hash: string }>((resolve) => {
      liberar = resolve;
    });
    let recebido = '';
    const entrada = criarEntradaGoogleComProva(
      {
        consumir: async (id, cookie) => {
          expect(id).toBe('desafio-original');
          expect(cookie).toBe('cookie-original');
          return pendente;
        },
      },
      async (pedido) => {
        recebido = pedido.idToken;
        return {
          usuarioId: 'usuario',
          sessionId: 'sessao',
          subjectGoogle: 'subject',
          emailGoogle: 'teste@example.test',
          accessToken: 'access',
          refreshToken: 'refresh',
        };
      },
    );
    const pedido = {
      desafioId: 'desafio-original',
      nonceSelado: 'cookie-original',
      idToken: 'token-original',
    };
    const resultado = entrada(pedido);
    pedido.desafioId = 'desafio-alterado';
    pedido.nonceSelado = 'cookie-alterado';
    pedido.idToken = 'token-alterado';
    liberar({ nonce: 'nonce', nonce_hash: 'hash-original' });
    const saida = await resultado;
    expect(recebido).toBe('token-original');
    expect(saida.desafioId).toBe('desafio-original');
    expect(saida.nonceHash).toBe('hash-original');
  });
  it('não inicia troca quando consumo termina depois do cancelamento', async () => {
    const controle = new AbortController();
    let liberar: ((prova: { nonce: string; nonce_hash: string }) => void) | undefined;
    const pendente = new Promise<{ nonce: string; nonce_hash: string }>((resolve) => {
      liberar = resolve;
    });
    let trocas = 0;
    const entrada = criarEntradaGoogleComProva({ consumir: async () => pendente }, async () => {
      trocas++;
      throw new Error('não deveria chamar');
    });
    const resultado = entrada(
      { desafioId: 'teste', nonceSelado: 'teste', idToken: 'teste' },
      controle.signal,
    );
    controle.abort();
    liberar?.({ nonce: 'ficticio', nonce_hash: 'ficticio' });
    await expect(resultado).rejects.toThrow('Entrada Google indisponível ou inválida.');
    expect(trocas).toBe(0);
  });
  it('consome antes da troca e recusa replay, sem conceder sessão local', async () => {
    const registros = new Map<string, string>();
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 300,
      repositorio: {
        async registrar(id, hash) {
          registros.set(id, hash);
        },
        async consumir(id, hash) {
          if (registros.get(id) !== hash) return false;
          registros.delete(id);
          return true;
        },
      },
    });
    const desafio = await desafios.emitir();
    const chaves = await generateKeyPair('RS256');
    const chaveSupabase = new Uint8Array(32).fill(9);
    const usuario = '11111111-1111-4111-8111-111111111111';
    const sessao = '22222222-2222-4222-8222-222222222222';
    const issuer = 'https://projetoficticio.supabase.co/auth/v1';
    const assinar = (nonce: string) =>
      new SignJWT({ nonce, email: 'teste@example.test', email_verified: true, hd: 'example.test' })
        .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
        .setSubject('subject-ficticio')
        .setIssuer('https://accounts.google.com')
        .setAudience('cliente-ficticio')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(chaves.privateKey);
    const idToken = await assinar(desafio.publico.nonce_hash);
    const accessToken = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chaveSupabase);
    let chamadas = 0;
    const jwk = {
      ...(await exportJWK(chaves.publicKey)),
      kid: 'fixture',
      alg: 'RS256',
      use: 'sig',
    };
    let buscasJwks = 0;
    const validar = criarValidadorGoogleComJwks(async (url) => {
      buscasJwks++;
      expect(String(url)).toBe('https://www.googleapis.com/oauth2/v3/certs');
      return Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=60' } });
    });
    const trocar = criarTrocaGoogle({
      projeto: 'projetoficticio',
      chavePublica: 'publica-ficticia',
      google: { audienciaEsperada: 'cliente-ficticio', dominioWorkspace: 'example.test', validar },
      configuracaoJwt: {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chaveSupabase,
      },
      buscar: async (_url, init) => {
        chamadas++;
        expect(registros.has(desafio.publico.desafio_id)).toBe(false);
        const corpo = JSON.parse(String(init?.body));
        expect(createHash('sha256').update(corpo.nonce).digest('hex')).toBe(
          desafio.publico.nonce_hash,
        );
        return Response.json({
          access_token: accessToken,
          refresh_token: 'refresh-ficticio',
          token_type: 'bearer',
          user: {
            id: usuario,
            identities: [
              {
                provider: 'google',
                id: 'subject-ficticio',
                user_id: usuario,
                identity_data: { sub: 'subject-ficticio' },
              },
            ],
          },
        });
      },
    });
    const entrada = criarEntradaGoogleComProva(desafios, trocar);
    const errado = await desafios.emitir();
    await expect(
      entrada({ desafioId: errado.publico.desafio_id, nonceSelado: errado.nonceSelado, idToken }),
    ).rejects.toThrow('ID token Google inválido.');
    const adulterado = await desafios.emitir();
    const tokenValido = await assinar(adulterado.publico.nonce_hash);
    const partes = tokenValido.split('.');
    partes[2] = `${partes[2]?.startsWith('A') ? 'B' : 'A'}${partes[2]?.slice(1)}`;
    await expect(
      entrada({
        desafioId: adulterado.publico.desafio_id,
        nonceSelado: adulterado.nonceSelado,
        idToken: partes.join('.'),
      }),
    ).rejects.toThrow('ID token Google inválido.');
    expect(chamadas).toBe(0);
    const pedido = {
      desafioId: desafio.publico.desafio_id,
      nonceSelado: desafio.nonceSelado,
      idToken,
    };
    const resultado = await entrada(pedido);
    expect(resultado.usuarioId).toBe(usuario);
    expect(resultado.accessToken).toBe(accessToken);
    expect(resultado.refreshToken).toBe('refresh-ficticio');
    expect(JSON.stringify(resultado)).not.toContain(accessToken);
    expect(JSON.stringify(resultado)).not.toContain('refresh-ficticio');
    expect(resultado.desafioId).toBe(desafio.publico.desafio_id);
    expect(resultado.nonceHash).toBe(desafio.publico.nonce_hash);
    expect(JSON.stringify(resultado)).not.toContain(resultado.desafioId);
    expect(JSON.stringify(resultado)).not.toContain(resultado.nonceHash);
    await expect(entrada(pedido)).rejects.toBeInstanceOf(ErroDesafioGoogleInvalido);
    expect(chamadas).toBe(1);
    expect(buscasJwks).toBeGreaterThan(0);
  });
});
