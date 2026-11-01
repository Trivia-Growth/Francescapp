import { describe, expect, it, vi } from 'vitest';
import { criarCifraAutenticada } from '../cifra-autenticada.ts';
import { criarCifraRefresh } from '../sessao/cifra-refresh.ts';
import { criarEntradaGoogleAdmissao, ErroEntradaGoogleNegada } from './entrada-google-admissao.ts';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const concessao = '44444444-4444-4444-8444-444444444444';
const desafioId = '55555555-5555-4555-8555-555555555555';
const cifra = criarCifraRefresh(
  criarCifraAutenticada({
    keyIdAtiva: 'v1',
    chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
    chaveHmac: new Uint8Array(32).fill(29),
  }),
);

describe('composição server-only Google experimental', () => {
  it('respeita sinal original quando chamador altera entrada durante HMAC', async () => {
    const controle = new AbortController();
    let liberar: ((valor: string) => void) | undefined;
    let iniciou = false;
    let chamadas = 0;
    const entrar = criarEntradaGoogleAdmissao({
      entradaGoogle: async () => ({
        usuarioId: usuario,
        sessionId: sessao,
        subjectGoogle: 'subject-ficticio',
        emailGoogle: 'pessoa@example.test',
        accessToken: 'access-ficticio',
        refreshToken: 'refresh-ficticio',
        desafioId,
        nonceHash: 'a'.repeat(64),
      }),
      cifra,
      hmacEmail: async () => {
        iniciou = true;
        return new Promise<string>((resolve) => {
          liberar = resolve;
        });
      },
      admitir: async () => {
        chamadas++;
        throw new Error();
      },
    });
    const entrada: {
      desafioId: string;
      nonceSelado: string;
      idToken: string;
      requestId: string;
      signal?: AbortSignal;
    } = {
      desafioId,
      nonceSelado: 'selado',
      idToken: 'token-ficticio',
      requestId,
      signal: controle.signal,
    };
    const pendente = entrar(entrada);
    await vi.waitFor(() => expect(iniciou).toBe(true));
    entrada.signal = undefined;
    controle.abort();
    liberar?.('aGFzaA');
    await expect(pendente).rejects.toThrow('Não foi possível concluir a entrada Google.');
    expect(chamadas).toBe(0);
  });
  it('não entrega credenciais quando admissão nega ou responde por outra sessão', async () => {
    for (const negar of [true, false]) {
      const entrar = criarEntradaGoogleAdmissao({
        entradaGoogle: async () => ({
          usuarioId: usuario,
          sessionId: sessao,
          subjectGoogle: 'subject-ficticio',
          emailGoogle: 'pessoa@example.test',
          accessToken: 'access-ficticio',
          refreshToken: 'refresh-ficticio',
          desafioId,
          nonceHash: 'a'.repeat(64),
        }),
        cifra,
        hmacEmail: async () => 'aGFzaA',
        admitir: async () =>
          negar
            ? { ok: false, request_id: requestId, erro: { codigo: 'sem_permissao' } }
            : {
                ok: true,
                request_id: requestId,
                dados: {
                  usuario_id: usuario,
                  session_id: concessao,
                  concessao_id: concessao,
                  perfil: 'profissional',
                  versao_usuario: 1,
                },
              },
      });
      const erro = await entrar({
        desafioId,
        nonceSelado: 'selado',
        idToken: 'token-ficticio',
        requestId,
      }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(Error);
      expect(String(erro)).toBe('Error: Não foi possível concluir a entrada Google.');
      expect(erro instanceof ErroEntradaGoogleNegada).toBe(negar);
    }
  });
  it('fecha sem chamar admissão com desafio divergente ou HMAC indisponível', async () => {
    for (const caso of ['desafio', 'hmac']) {
      let chamadas = 0;
      const entrar = criarEntradaGoogleAdmissao({
        entradaGoogle: async () => ({
          usuarioId: usuario,
          sessionId: sessao,
          subjectGoogle: 'subject-ficticio',
          emailGoogle: 'pessoa@example.test',
          accessToken: 'access-ficticio',
          refreshToken: 'refresh-ficticio',
          desafioId: caso === 'desafio' ? concessao : desafioId,
          nonceHash: 'a'.repeat(64),
        }),
        cifra,
        hmacEmail: async () => {
          if (caso === 'hmac') throw new Error('segredo interno');
          return 'aGFzaA';
        },
        admitir: async () => {
          chamadas++;
          throw new Error();
        },
      });
      await expect(
        entrar({ desafioId, nonceSelado: 'selado', idToken: 'token-ficticio', requestId }),
      ).rejects.toThrow('Não foi possível concluir a entrada Google.');
      expect(chamadas).toBe(0);
    }
  });
  it('cifra refresh, vincula desafio e entrega JWT ao executor sem serializá-lo', async () => {
    let chamado = false;
    const entrar = criarEntradaGoogleAdmissao({
      entradaGoogle: async () => ({
        usuarioId: usuario,
        sessionId: sessao,
        subjectGoogle: 'subject-ficticio',
        emailGoogle: 'pessoa@example.test',
        accessToken: 'access-ficticio',
        refreshToken: 'refresh-ficticio',
        desafioId,
        nonceHash: 'a'.repeat(64),
      }),
      cifra,
      hmacEmail: async (email) => {
        expect(email).toBe('pessoa@example.test');
        return 'aGFzaA';
      },
      admitir: async (contexto) => {
        chamado = true;
        expect(contexto.jwt).toBe('access-ficticio');
        expect(JSON.stringify(contexto)).not.toContain('access-ficticio');
        expect(JSON.stringify(contexto)).not.toContain('refresh-ficticio');
        expect(JSON.stringify(contexto)).not.toContain(contexto.provaHash);
        expect(contexto.pedido.identidade).toMatchObject({
          usuario_id: usuario,
          session_id: sessao,
          subject_google: 'subject-ficticio',
          email_hmac: 'aGFzaA',
          desafio_id: desafioId,
          nonce_hash: 'a'.repeat(64),
        });
        expect(await cifra.decifrar(contexto.pedido.credencial_refresh, { usuario, sessao })).toBe(
          'refresh-ficticio',
        );
        return {
          ok: true,
          request_id: requestId,
          dados: {
            usuario_id: usuario,
            session_id: sessao,
            concessao_id: concessao,
            perfil: 'profissional',
            versao_usuario: 1,
          },
        };
      },
    });
    const resultado = await entrar({
      desafioId,
      nonceSelado: 'selado',
      idToken: 'token-ficticio',
      requestId,
    });
    expect(chamado).toBe(true);
    expect(resultado.accessToken).toBe('access-ficticio');
    expect(resultado.prova).toBeTruthy();
    expect(JSON.stringify(resultado)).not.toContain('access-ficticio');
    expect(JSON.stringify(resultado)).not.toContain(resultado.prova);
  });
});
