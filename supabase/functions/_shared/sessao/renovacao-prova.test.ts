import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../cifra-autenticada.ts';
import { criarCifraRefresh } from './cifra-refresh.ts';
import { criarRenovacaoComProva } from './renovacao-prova.ts';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const chave = new TextEncoder().encode('chave-ficticia-com-32-bytes-ou-mais');
const cifra = criarCifraRefresh(
  criarCifraAutenticada({
    keyIdAtiva: 'v1',
    chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
    chaveHmac: new Uint8Array(32).fill(29),
  }),
);

describe('renovação com prova de geração', () => {
  it('não chama Auth quando o bloqueio inicial não foi confirmado', async () => {
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    let chamadasAuth = 0;
    const renovar = criarRenovacaoComProva({
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
        buscar: async () => {
          chamadasAuth++;
          throw new Error('não deveria chamar');
        },
      },
      persistencia: {
        iniciar: async () => ({ envelope }),
        confirmarInicio: async () => false,
        persistir: async () => true,
        confirmarPersistencia: async () => true,
        liberar: async () => true,
        confirmar: async () => true,
      },
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
    ).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
    expect(chamadasAuth).toBe(0);
  });
  it('recupera persistência confirmada após resposta perdida, sem repetir Auth', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    let persistida = false;
    let chamadasAuth = 0;
    const renovar = criarRenovacaoComProva({
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
        buscar: async () => {
          chamadasAuth++;
          return Response.json({
            access_token: token,
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
          });
        },
      },
      persistencia: {
        iniciar: async () => ({ envelope }),
        persistir: async () => {
          persistida = true;
          throw new Error('resposta perdida');
        },
        confirmarInicio: async () => true,
        confirmarPersistencia: async () => persistida,
        liberar: async () => true,
        confirmar: async () => true,
      },
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
    ).resolves.toMatchObject({ accessToken: token, geracao: 2 });
    expect(chamadasAuth).toBe(1);
  });
  it.each(['negada', 'indisponível', 'não confirmada após sucesso'])(
    'não libera quando confirmação da persistência está %s',
    async (estado) => {
      const token = await new SignJWT({ session_id: sessao })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(usuario)
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(chave);
      const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
      let liberacoes = 0;
      const renovar = criarRenovacaoComProva({
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
              access_token: token,
              refresh_token: 'refresh-novo',
              token_type: 'bearer',
            }),
        },
        persistencia: {
          iniciar: async () => ({ envelope }),
          persistir: async () => {
            if (estado === 'não confirmada após sucesso') return true;
            throw new Error('resultado incerto');
          },
          confirmarInicio: async () => true,
          confirmarPersistencia: async () => {
            if (estado === 'indisponível') throw new Error('banco indisponível');
            return false;
          },
          liberar: async () => {
            liberacoes++;
            return true;
          },
          confirmar: async () => true,
        },
      });
      await expect(
        renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
      ).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
      expect(liberacoes).toBe(0);
    },
  );
  it('recusa identidade em objeto mesmo quando converte para UUID', async () => {
    let chamadas = 0;
    const renovar = criarRenovacaoComProva({
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
        buscar: async () => {
          throw new Error('inesperado');
        },
      },
      persistencia: {
        iniciar: async () => {
          chamadas++;
          return null;
        },
        persistir: async () => false,
        confirmarInicio: async () => true,
        confirmarPersistencia: async () => false,
        liberar: async () => false,
        confirmar: async () => false,
      },
    });
    const objeto = { toString: () => usuario };
    await expect(
      renovar({
        usuarioId: objeto as unknown as string,
        sessionId: sessao,
        geracao: 1,
        prova: 'A'.repeat(43),
      }),
    ).rejects.toThrow('Não foi possível renovar a sessão.');
    expect(chamadas).toBe(0);
  });
  it('recusa base64url não canônico antes de consultar o banco', async () => {
    let chamadas = 0;
    const renovar = criarRenovacaoComProva({
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
        buscar: async () => {
          throw new Error('não esperado');
        },
      },
      persistencia: {
        iniciar: async () => {
          chamadas++;
          return null;
        },
        persistir: async () => false,
        confirmarInicio: async () => true,
        confirmarPersistencia: async () => false,
        liberar: async () => false,
        confirmar: async () => false,
      },
    });
    for (const prova of [`${'A'.repeat(42)}B`, 'inválida', 'A'.repeat(44)]) {
      await expect(
        renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova }),
      ).rejects.toThrow('Não foi possível renovar a sessão.');
    }
    expect(chamadas).toBe(0);
  });
  it('deriva o hash do vetor conhecido de 32 bytes zero', async () => {
    let recebido = '';
    const renovar = criarRenovacaoComProva({
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
        buscar: async () => {
          throw new Error('não esperado');
        },
      },
      persistencia: {
        iniciar: async (p) => {
          recebido = p.provaAtualHash;
          return null;
        },
        persistir: async () => false,
        confirmarInicio: async () => true,
        confirmarPersistencia: async () => false,
        liberar: async () => false,
        confirmar: async () => false,
      },
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
    ).rejects.toThrow('Não foi possível renovar a sessão.');
    expect(recebido).toBe('Zmh6rfhivXdsj8GLjp-OIAiXFIVu4jOzkCpZHQ1fKSU');
  });
  it('permite adapter de persistência com métodos que usam seu próprio estado', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    const persistencia = {
      disponivel: false,
      async iniciar() {
        return { envelope };
      },
      async persistir() {
        this.disponivel = true;
        return true;
      },
      async confirmarInicio() {
        return true;
      },
      async confirmarPersistencia() {
        return this.disponivel;
      },
      async liberar() {
        return this.disponivel;
      },
      async confirmar() {
        return this.disponivel;
      },
    };
    const renovar = criarRenovacaoComProva({
      cifra,
      persistencia,
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
            access_token: token,
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
          }),
      },
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
    ).resolves.toMatchObject({ accessToken: token, geracao: 2 });
  });
  it('não troca as funções de cifra e persistência durante Auth', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    const cifraMutavel = { ...cifra };
    const persistencia = {
      iniciar: async () => ({ envelope }),
      persistir: async () => true,
      confirmarInicio: async () => true,
      confirmarPersistencia: async () => true,
      liberar: async () => true,
      confirmar: async () => true,
    };
    const renovar = criarRenovacaoComProva({
      cifra: cifraMutavel,
      persistencia,
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: {
          issuer,
          audience: 'authenticated',
          algoritmosPermitidos: ['HS256'],
          chaveDeVerificacao: chave,
        },
        buscar: async () => {
          cifraMutavel.cifrar = async () => {
            throw new Error('cifra substituída');
          };
          persistencia.persistir = async () => false;
          return Response.json({
            access_token: token,
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
          });
        },
      },
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
    ).resolves.toMatchObject({ accessToken: token, geracao: 2 });
  });
  it('mantém geração e envelope imutáveis em todas as etapas, mesmo com adapter adversarial', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    let tentativa = '';
    let hashProximo = '';
    let ciphertext = '';
    const persistencia: import('./renovacao-prova.ts').PersistenciaRenovacaoComProva = {
      iniciar: async (p) => {
        tentativa = p.tentativaId;
        Reflect.set(p, 'geracao', 77);
        return { envelope };
      },
      persistir: async (p) => {
        expect(p.geracao).toBe(1);
        hashProximo = p.proximaProvaHash;
        ciphertext = p.envelope.ciphertext;
        Reflect.set(p, 'proximaProvaHash', 'trocado');
        Reflect.set(p.envelope, 'ciphertext', 'trocado');
        return true;
      },
      confirmarInicio: async () => true,
      confirmarPersistencia: async () => true,
      liberar: async (p) => {
        expect(p.tentativaId).toBe(tentativa);
        expect(p.proximaProvaHash).toBe(hashProximo);
        expect(p.envelope.ciphertext).toBe(ciphertext);
        return true;
      },
      confirmar: async (p) => {
        expect(p.geracao).toBe(1);
        expect(p.proximaProvaHash).toBe(hashProximo);
        expect(p.envelope.ciphertext).toBe(ciphertext);
        return true;
      },
    };
    const renovar = criarRenovacaoComProva({
      cifra,
      persistencia,
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
            access_token: token,
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
          }),
      },
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
    ).resolves.toMatchObject({ accessToken: token, geracao: 2 });
  });
  it('se liberação ocorreu mas confirmação falha, não retorna credenciais e recusa prova antiga', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    let geracaoAtual = 1;
    let chamadasAuth = 0;
    const renovar = criarRenovacaoComProva({
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
        buscar: async () => {
          chamadasAuth++;
          return Response.json({
            access_token: token,
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
          });
        },
      },
      persistencia: {
        iniciar: async (p) => (p.geracao === geracaoAtual ? { envelope } : null),
        persistir: async () => true,
        confirmarInicio: async () => true,
        confirmarPersistencia: async () => true,
        liberar: async () => {
          geracaoAtual++;
          throw new Error('resposta perdida refresh-novo');
        },
        confirmar: async () => {
          throw new Error('banco indisponível');
        },
      },
    });
    const entrada = { usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) };
    await expect(renovar(entrada)).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
    await expect(renovar(entrada)).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
    expect(chamadasAuth).toBe(1);
  });

  it('não retorna token quando confirmação após logout é negativa', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    const renovar = criarRenovacaoComProva({
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
            access_token: token,
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
          }),
      },
      persistencia: {
        iniciar: async () => ({ envelope }),
        persistir: async () => true,
        confirmarInicio: async () => true,
        confirmarPersistencia: async () => true,
        liberar: async () => true,
        confirmar: async () => false,
      },
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: 'A'.repeat(43) }),
    ).rejects.toThrow(/^Não foi possível renovar a sessão\.$/);
  });
  it('somente retorna nova prova em memória após persistir e confirmar', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const envelope = await cifra.cifrar('refresh-antigo', { usuario, sessao });
    let liberada = false;
    const renovar = criarRenovacaoComProva({
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
            access_token: token,
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
          }),
      },
      persistencia: {
        iniciar: async () => ({ envelope }),
        persistir: async () => true,
        confirmarInicio: async () => true,
        confirmarPersistencia: async () => true,
        liberar: async () => {
          liberada = true;
          return true;
        },
        confirmar: async () => liberada,
      },
    });
    const resultado = await renovar({
      usuarioId: usuario,
      sessionId: sessao,
      geracao: 1,
      prova: 'A'.repeat(43),
    });
    expect(resultado).toEqual({
      accessToken: token,
      geracao: 2,
      prova: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(JSON.stringify(resultado)).not.toContain('refresh-novo');
  });
});
