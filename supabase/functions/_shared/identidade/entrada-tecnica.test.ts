import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../cifra-autenticada.ts';
import { criarCifraRefresh } from '../sessao/cifra-refresh.ts';
import { criarEntradaTecnica } from './entrada-tecnica.ts';

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

describe('entrada técnica', () => {
  it('não permite alterar identidade ou credencial no pedido de admissão', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const entrar = criarEntradaTecnica({
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
      cifra,
      admitir: async (pedido) => {
        const original = pedido.credencial_refresh.ciphertext;
        Reflect.set(pedido.identidade, 'usuario_id', concessao);
        Reflect.set(pedido.credencial_refresh, 'ciphertext', 'trocado');
        expect(pedido.identidade.usuario_id).toBe(usuario);
        expect(pedido.credencial_refresh.ciphertext).toBe(original);
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
    await expect(
      entrar({ email: 'pessoa@example.test', senha: 'senha-ficticia', requestId }),
    ).resolves.toMatchObject({ sessao: { usuario_id: usuario } });
  });
  it('falha fechada sem repetir admissão quando seu resultado é incerto', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    let tentativas = 0;
    const entrar = criarEntradaTecnica({
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
      cifra,
      admitir: async () => {
        tentativas++;
        throw new Error('timeout após possível commit: refresh-ficticio senha-ficticia');
      },
    });
    await expect(
      entrar({ email: 'pessoa@example.test', senha: 'senha-ficticia', requestId }),
    ).rejects.toThrow(/^Não foi possível concluir a entrada técnica\.$/);
    expect(tentativas).toBe(1);
  });
  it('não solicita admissão nem retorna token quando a cifra falha', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    let admissoes = 0;
    const entrar = criarEntradaTecnica({
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
      cifra: {
        ...cifra,
        cifrar: async () => {
          throw new Error('senha-ficticia refresh-ficticio');
        },
      },
      admitir: async () => {
        admissoes++;
        throw new Error('inesperado');
      },
    });
    await expect(
      entrar({ email: 'pessoa@example.test', senha: 'senha-ficticia', requestId }),
    ).rejects.toThrow(/^Não foi possível concluir a entrada técnica\.$/);
    expect(admissoes).toBe(0);
  });
  it('mantém cifra e admissão originais se dependências forem substituídas durante Auth', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const cifraMutavel = { ...cifra };
    const dependencias = {
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: {
          issuer,
          audience: 'authenticated',
          algoritmosPermitidos: ['HS256' as const],
          chaveDeVerificacao: chave,
        },
        buscar: async () => {
          cifraMutavel.cifrar = async () => {
            throw new Error('cifra substituída');
          };
          dependencias.admitir = async () => {
            throw new Error('admissão substituída');
          };
          return Response.json({
            access_token: jwt,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: { id: usuario },
          });
        },
      },
      cifra: cifraMutavel,
      admitir: async () => ({
        ok: true,
        request_id: requestId,
        dados: {
          usuario_id: usuario,
          session_id: sessao,
          concessao_id: concessao,
          perfil: 'administrador',
          versao_usuario: 1,
        },
      }),
    };
    const entrar = criarEntradaTecnica(dependencias);
    await expect(
      entrar({ email: 'pessoa@example.test', senha: 'senha-ficticia', requestId }),
    ).resolves.toMatchObject({ sessao: { usuario_id: usuario, session_id: sessao } });
  });
  it('nega falhas da admissão e resultados de outro usuário sem revelar credenciais', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    for (const admitir of [
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
      async () => ({
        ok: false,
        request_id: requestId,
        erro: { codigo: 'sem_permissao' },
      }),
      async () => ({
        ok: true,
        request_id: concessao,
        dados: {
          usuario_id: usuario,
          session_id: sessao,
          concessao_id: concessao,
          perfil: 'administrador',
          versao_usuario: 1,
        },
      }),
      async () => ({
        ok: true,
        request_id: requestId,
        dados: {
          usuario_id: usuario,
          session_id: concessao,
          concessao_id: concessao,
          perfil: 'administrador',
          versao_usuario: 1,
        },
      }),
    ]) {
      const entrar = criarEntradaTecnica({
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
        cifra,
        admitir,
      });
      await expect(
        entrar({ email: 'pessoa@example.test', senha: 'senha-ficticia', requestId }),
      ).rejects.toThrow(/^Não foi possível concluir a entrada técnica\.$/);
    }
  });

  it('entrega somente sessão admitida após cifrar refresh vinculado ao JWT', async () => {
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const entrar = criarEntradaTecnica({
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
      cifra,
      admitir: async (entrada) => {
        expect(entrada.identidade).toEqual({
          usuario_id: usuario,
          session_id: sessao,
          metodo: 'tecnica',
        });
        expect(JSON.stringify(entrada)).not.toContain('refresh-ficticio');
        expect(await cifra.decifrar(entrada.credencial_refresh, { usuario, sessao })).toBe(
          'refresh-ficticio',
        );
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
    expect(resultado).toMatchObject({
      accessToken: jwt,
      sessao: { usuario_id: usuario, session_id: sessao },
    });
    expect(JSON.stringify(resultado)).not.toContain('refresh-ficticio');
  });
});
