import { SignJWT } from 'jose';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarAtestadorOperacao } from './atestado-operacao.ts';
import { prepararCarteiraExperimental } from '../../../packages/cadastro/src/preparar-carteira-experimental.ts';
import { criarExecutorCarteiraPostgresExperimental } from './carteira-postgres-experimental.ts';

const usuario = 'a0000000-0000-4000-8000-000000000001';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const request = 'c0000000-0000-4000-8000-000000000003';
const chave = new TextEncoder().encode('k'.repeat(64));
const config = {
  issuer: 'https://ficticio.supabase.co/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256'],
  chaveDeVerificacao: chave,
};
async function token(sub = usuario) {
  return new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
}
async function transporte() {
  return prepararCarteiraExperimental(
    {
      contexto: {
        key_id: 'teste',
        usuario_id: usuario,
        session_id: sessao,
        request_id: request,
        emitido_em: '2026-10-29T12:00:00Z',
        expira_em: '2026-10-29T12:01:00Z',
      },
      consulta: { limite: 10 },
    },
    criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
  );
}
function poolFixture(falharEm?: string, comandoCommit = 'COMMIT') {
  const consultas: Array<{ sql: string; params?: unknown[] }> = [];
  let destruida: boolean | undefined;
  const pool = {
    options: { connectionTimeoutMillis: 2000, query_timeout: 15000 },
    connect: async () => ({
      query: async (sql: string, params?: unknown[]) => {
        consultas.push({ sql, params });
        if (sql === falharEm) throw new Error('erro interno fictício');
        return {
          command: sql === 'COMMIT' ? comandoCommit : '',
          rows: sql.startsWith('select experimento_atestado.')
            ? [
                {
                  resultado: {
                    ok: true,
                    request_id: request,
                    dados: { itens: [], proximo_cursor: null },
                  },
                },
              ]
            : [],
        };
      },
      release: (destruir: boolean) => {
        destruida = destruir;
      },
    }),
  } as unknown as Pool;
  return { pool, consultas, destruida: () => destruida };
}
describe('executor experimental de carteira', () => {
  it('usa claims verificados e SQL parametrizado antes de confirmar resultado', async () => {
    const f = poolFixture();
    const resultado = await criarExecutorCarteiraPostgresExperimental(
      f.pool,
      config,
    )({ jwt: await token(), prova: 'A'.repeat(43), geracao: 1, transporte: await transporte() });
    expect(resultado.ok).toBe(true);
    expect(f.consultas.map((x) => x.sql)).toEqual([
      'BEGIN',
      "SET LOCAL statement_timeout = '10s'",
      'SET LOCAL ROLE ffcm_carteira_executor_fixture',
      "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      'select experimento_atestado.listar_carteira_fixture($1::jsonb,$2::bigint,$3::bytea) as resultado',
      'COMMIT',
    ]);
    expect(f.consultas[3]?.params?.[0]).toBe(usuario);
    expect(JSON.parse(f.consultas[3]?.params?.[1] as string)).toEqual({
      sub: usuario,
      session_id: sessao,
    });
    expect(f.destruida()).toBe(false);
  });
  it('nega JWT de outro ator sem conectar', async () => {
    const f = poolFixture();
    await expect(
      criarExecutorCarteiraPostgresExperimental(
        f.pool,
        config,
      )({
        jwt: await token('d0000000-0000-4000-8000-000000000004'),
        prova: 'A'.repeat(43),
        geracao: 1,
        transporte: await transporte(),
      }),
    ).rejects.toThrow('Carteira indisponível.');
    expect(f.consultas).toHaveLength(0);
  });
  it('nega assinatura JWT inválida sem conectar', async () => {
    const f = poolFixture();
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setExpirationTime('5m')
      .sign(new Uint8Array(64).fill(4));
    await expect(
      criarExecutorCarteiraPostgresExperimental(
        f.pool,
        config,
      )({ jwt, prova: 'A'.repeat(43), geracao: 1, transporte: await transporte() }),
    ).rejects.toThrow('Carteira indisponível.');
    expect(f.consultas).toHaveLength(0);
  });
  it('não retorna dados se o commit falhar e descarta a conexão', async () => {
    const f = poolFixture('COMMIT');
    await expect(
      criarExecutorCarteiraPostgresExperimental(
        f.pool,
        config,
      )({ jwt: await token(), prova: 'A'.repeat(43), geracao: 1, transporte: await transporte() }),
    ).rejects.toThrow('Carteira indisponível.');
    expect(f.destruida()).toBe(true);
  });
  it('não retorna dados quando COMMIT resulta em ROLLBACK', async () => {
    const f = poolFixture(undefined, 'ROLLBACK');
    await expect(
      criarExecutorCarteiraPostgresExperimental(
        f.pool,
        config,
      )({
        jwt: await token(),
        prova: 'A'.repeat(43),
        geracao: 1,
        transporte: await transporte(),
      }),
    ).rejects.toThrow('Carteira indisponível.');
    expect(f.destruida()).toBe(true);
  });
});
