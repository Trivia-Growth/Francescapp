import { SignJWT } from 'jose';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarExecutorAdmissaoGooglePostgresExperimental } from './admissao-google-postgres-experimental.ts';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const request = '33333333-3333-4333-8333-333333333333';
const concessao = '44444444-4444-4444-8444-444444444444';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const chave = new Uint8Array(32).fill(9);
const config = {
  issuer,
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: chave,
};
const pedido = {
  identidade: {
    usuario_id: usuario,
    session_id: sessao,
    metodo: 'google_workspace',
    subject_google: 'subject',
    email_hmac: 'aGFzaA',
    desafio_id: '55555555-5555-4555-8555-555555555555',
    nonce_hash: 'a'.repeat(64),
  },
  request_id: request,
  credencial_refresh: { formato: 1, key_id: 'teste', nonce: 'n', ciphertext: 'c', tag: 't' },
};
const jwt = () =>
  new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(chave);

describe('executor Google PostgreSQL experimental', () => {
  it.each(['commit', 'rollback', 'dto'])('fecha e descarta conexão em %s', async (caso) => {
    let descartada: boolean | undefined;
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      async connect() {
        return {
          async query(sql: string) {
            if (sql.startsWith('select identidade.'))
              return {
                rows: [
                  {
                    resultado:
                      caso === 'dto'
                        ? {
                            ok: true,
                            request_id: request,
                            dados: {
                              usuario_id: concessao,
                              session_id: sessao,
                              concessao_id: concessao,
                              perfil: 'profissional',
                              versao_usuario: 1,
                            },
                          }
                        : {
                            ok: true,
                            request_id: request,
                            dados: {
                              usuario_id: usuario,
                              session_id: sessao,
                              concessao_id: concessao,
                              perfil: 'profissional',
                              versao_usuario: 1,
                            },
                          },
                  },
                ],
              };
            if (sql === 'COMMIT' && caso === 'commit') throw new Error('incerto');
            return {
              rows: [],
              command: sql === 'COMMIT' ? (caso === 'rollback' ? 'ROLLBACK' : 'COMMIT') : sql,
            };
          },
          release(destruir: boolean) {
            descartada = destruir;
          },
        };
      },
    } as unknown as Pool;
    const executar = criarExecutorAdmissaoGooglePostgresExperimental(pool, config);
    await expect(executar({ jwt: await jwt(), provaHash: 'A'.repeat(43), pedido })).rejects.toThrow(
      'Admissão Google indisponível.',
    );
    expect(descartada).toBe(true);
  });
  it('valida JWT antes do banco e não expõe JWT aos parâmetros SQL', async () => {
    const parametros: unknown[] = [];
    let conexoes = 0;
    let descartada: boolean | undefined;
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      async connect() {
        conexoes++;
        return {
          async query(sql: string, args?: unknown[]) {
            if (args) parametros.push(...args);
            if (sql.startsWith('select identidade.'))
              return {
                rows: [
                  {
                    resultado: {
                      ok: true,
                      request_id: request,
                      dados: {
                        usuario_id: usuario,
                        session_id: sessao,
                        concessao_id: concessao,
                        perfil: 'profissional',
                        versao_usuario: 1,
                      },
                    },
                  },
                ],
              };
            return { rows: [], command: sql === 'COMMIT' ? 'COMMIT' : sql };
          },
          release(destruir: boolean) {
            descartada = destruir;
          },
        };
      },
    } as unknown as Pool;
    const executar = criarExecutorAdmissaoGooglePostgresExperimental(pool, config);
    const token = await jwt();
    await expect(
      executar({
        jwt: token,
        provaHash: 'A'.repeat(43),
        pedido: { ...pedido, identidade: { ...pedido.identidade, usuario_id: concessao } },
      }),
    ).rejects.toThrow('Admissão Google indisponível.');
    expect(conexoes).toBe(0);
    expect((await executar({ jwt: token, provaHash: 'A'.repeat(43), pedido })).ok).toBe(true);
    expect(JSON.stringify(parametros)).not.toContain(token);
    expect(descartada).toBe(false);
  });
});
