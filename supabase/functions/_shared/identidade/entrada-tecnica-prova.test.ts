import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../cifra-autenticada.ts';
import { criarCifraRefresh } from '../sessao/cifra-refresh.ts';
import { criarEntradaTecnicaComProva } from './entrada-tecnica-prova.ts';
import { ErroAutenticacaoNegada } from './auth-tecnica.ts';
import { criarExecutorAdmissaoPostgres } from './admissao-postgres.ts';
import type { Pool } from 'pg';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const concessao = '44444444-4444-4444-8444-444444444444';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const chave = new TextEncoder().encode('chave-ficticia-com-32-bytes-ou-mais');
const cifra = criarCifraRefresh(
  criarCifraAutenticada({
    keyIdAtiva: 'v1',
    chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
    chaveHmac: new Uint8Array(32).fill(29),
  }),
);

describe('entrada técnica experimental com prova', () => {
  it('entrega JWT ao executor sem serializar credenciais nem enviá-lo ao SQL', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const parametros: unknown[] = [];
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      connect: async () => ({
        query: async (sql: string, args?: unknown[]) => {
          if (args) parametros.push(...args);
          return {
            rows: sql.startsWith('select identidade.')
              ? [
                  {
                    resultado: {
                      ok: true,
                      request_id: requestId,
                      dados: {
                        usuario_id: usuario,
                        session_id: sessao,
                        concessao_id: concessao,
                        perfil: 'administrador',
                        versao_usuario: 1,
                      },
                    },
                  },
                ]
              : [],
          };
        },
        release() {},
      }),
    } as unknown as Pool;
    const configuracaoJwt = {
      issuer,
      audience: 'authenticated',
      algoritmosPermitidos: ['HS256' as const],
      chaveDeVerificacao: chave,
    };
    const executor = criarExecutorAdmissaoPostgres(pool, configuracaoJwt);
    const entrar = criarEntradaTecnicaComProva({
      cifra,
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt,
        buscar: async () =>
          Response.json({
            access_token: jwt,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: { id: usuario },
          }),
      },
      admitir: async (entrada) => {
        expect(entrada.jwt).toBe(jwt);
        expect(JSON.stringify(entrada)).not.toContain(jwt);
        expect(JSON.stringify(entrada)).not.toContain(entrada.provaHash);
        return executor(entrada);
      },
    });
    const resultado = await entrar({
      email: 'pessoa@example.test',
      senha: 'senha-ficticia',
      requestId,
    });
    expect(resultado.accessToken).toBe(jwt);
    expect(JSON.stringify(parametros)).not.toContain(jwt);
  });
  it('usa mesma negação sanitizada para credenciais incorretas e ausência de concessão', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const auth = {
      projeto: 'projetoficticio',
      chavePublica: 'publica',
      configuracaoJwt: {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256' as const],
        chaveDeVerificacao: chave,
      },
    };
    const negacaoAuth = criarEntradaTecnicaComProva({
      cifra,
      auth: {
        ...auth,
        buscar: async () => Response.json({ error_code: 'invalid_credentials' }, { status: 400 }),
      },
      admitir: async () => {
        throw new Error('inesperado');
      },
    });
    const negacaoRpc = criarEntradaTecnicaComProva({
      cifra,
      auth: {
        ...auth,
        buscar: async () =>
          Response.json({
            access_token: jwt,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: { id: usuario },
          }),
      },
      admitir: async () => ({
        ok: false,
        request_id: requestId,
        erro: { codigo: 'sem_permissao' },
      }),
    });
    const entrada = { email: 'teste@example.test', senha: 'senha-ficticia', requestId };
    for (const entrar of [negacaoAuth, negacaoRpc]) {
      const erro = await entrar(entrada).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroAutenticacaoNegada);
      expect((erro as Error).message).toBe('Não foi possível concluir a entrada técnica.');
    }
  });
  it('não devolve prova nem tokens quando admissão nega ou fica incerta', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    for (const admitir of [
      async () => ({ ok: false, request_id: requestId, erro: { codigo: 'sem_permissao' } }),
      async () => {
        throw new Error('senha-ficticia refresh-ficticio');
      },
      async () => ({
        ok: true,
        request_id: requestId,
        dados: {
          usuario_id: concessao,
          session_id: sessao,
          concessao_id: concessao,
          perfil: 'administrador',
          versao_usuario: 1,
        },
      }),
    ]) {
      const entrar = criarEntradaTecnicaComProva({
        cifra,
        auth: {
          projeto: 'projetoficticio',
          chavePublica: 'publica',
          configuracaoJwt: {
            issuer,
            audience: 'authenticated',
            algoritmosPermitidos: ['HS256'],
            chaveDeVerificacao: chave,
          },
          buscar: async () =>
            Response.json({
              access_token: jwt,
              refresh_token: 'refresh-ficticio',
              token_type: 'bearer',
              user: { id: usuario },
            }),
        },
        admitir,
      });
      await expect(
        entrar({ email: 'pessoa@example.test', senha: 'senha-ficticia', requestId }),
      ).rejects.toThrow(/^Não foi possível concluir a entrada técnica\.$/);
    }
  });
  it('retorna prova inicial após admissão e envia apenas seu verificador', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    let hashGravado = '';
    const entrar = criarEntradaTecnicaComProva({
      cifra,
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: {
          issuer,
          audience: 'authenticated',
          algoritmosPermitidos: ['HS256'],
          chaveDeVerificacao: chave,
        },
        buscar: async () =>
          Response.json({
            access_token: jwt,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: { id: usuario },
          }),
      },
      admitir: async ({ pedido, provaHash }) => {
        hashGravado = provaHash;
        expect(pedido.identidade.usuario_id).toBe(usuario);
        return {
          ok: true,
          request_id: requestId,
          dados: {
            usuario_id: usuario,
            session_id: sessao,
            concessao_id: concessao,
            perfil: 'administrador',
            versao_usuario: 1,
          },
        };
      },
    });
    const resultado = await entrar({
      email: 'pessoa@example.test',
      senha: 'senha-ficticia',
      requestId,
    });
    expect(resultado.geracao).toBe(1);
    expect(resultado.prova).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', Buffer.from(resultado.prova, 'base64url')),
    );
    expect(hashGravado).toBe(Buffer.from(digest).toString('base64url'));
    expect(resultado.accessToken).toBe(jwt);
    expect(JSON.stringify(resultado)).not.toContain(jwt);
    expect(JSON.stringify(resultado)).not.toContain(resultado.prova);
    expect(JSON.stringify(resultado)).not.toContain('refresh-ficticio');
  });
});
